# AI Crew Capability Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show current messaging and issue data, expose the ai-crew skill's supported operations in the local console, and remove unrelated Mattermost navigation.

**Architecture:** Retain Mattermost v11.1.1 as the conversation client and the Node BFF as the credential boundary. Add validated BFF command routes, extend the maintained React overlay, and patch upstream menus through the reproducible customization script. Diagnose stale data at each boundary before changing refresh behavior.

**Tech Stack:** Node.js 22, TypeScript, Fastify, React, Jest, Python ai-crew CLI, Mattermost v11.1.1.

**Spec:** `docs/superpowers/specs/2026-09-19-ai-crew-capability-refresh-design.md`

## Global Constraints

- The installed ai-crew CLI is the reference for all control-plane and Multica operations; do not place upstream tokens in browser responses.
- Keep the pinned Mattermost v11.1.1 submodule commit and maintained changes in `customizations/mattermost/` plus `scripts/apply-mattermost-customizations.mjs`.
- The BFF binds to `127.0.0.1` by default. User-provided tickets enter only a localhost BFF endpoint and are not stored in browser storage.
- No production messages, tickets, deletions, team changes, or credential rotations during verification. Use fakes for mutations.
- Each behavior change follows red, green, refactor; preserve focused regression tests.

---

### Task 1: Reproduce and locate stale data

**Files:**
- Modify: `scripts/smoke.mjs`
- Test: `apps/bff/test/bff.test.ts`

**Interfaces:**
- Consumes: existing `/api/ai-crew/workspaces`, `/api/ai-crew/issues`, `/api/v4/channels/:id/posts`, `/api/v4/websocket`.
- Produces: a read-only smoke result containing issue count, latest issue identifier/time, and selected channel post count/time, without message bodies or tickets.

- [ ] **Step 1: Capture the current CLI and BFF records.** Run `verify`, `workspaces`, `issues --workspace synapse-os`, `channels`, and `posts` through the installed CLI, then compare BFF records and GET `/ai-crew` headers. Record only counts, identifiers, and timestamps.
- [ ] **Step 2: Write a failing regression test.** In `apps/bff/test/bff.test.ts`, assert that a fresh GET for issues returns the injected upstream list and does not cache a prior list; in `scripts/smoke.mjs`, add a deterministic metadata comparison that rejects an older BFF latest timestamp.
- [ ] **Step 3: Run the focused test and inspect the failure.** Use `npm run test --workspace=@ai-crew/bff`; if the issue API already passes, write the UI regression in Task 3 rather than forcing a false BFF failure.
- [ ] **Step 4: Apply the smallest fix at the evidenced boundary.** If the browser serves an old asset, correct asset delivery and rebuild. If a page retains old state, make the state transition re-fetch and replace it. If the socket misses events, add reconnect refresh for the active channel.
- [ ] **Step 5: Run `npm test`, `npm run build`, and `npm run smoke`; record the observed latest metadata.**

### Task 2: Add a safe typed BFF command boundary

**Files:**
- Modify: `apps/bff/src/ai-crew-client.ts`
- Modify: `apps/bff/src/server.ts`
- Create: `apps/bff/src/crew-commands.ts`
- Test: `apps/bff/test/bff.test.ts`

**Interfaces:**
- Consumes: `runAiCrew(command, args)`; the CLI JSON result format for each command.
- Produces: `GET /api/ai-crew/commands/:name` for safe reads and `POST /api/ai-crew/commands/:name` for writes, with command-specific JSON bodies, validation, and redacted errors.

- [ ] **Step 1: Write failing route tests.** Assert that `GET .../commands/agents?workspace=synapse-os` returns the CLI agent list; `POST .../commands/issue-new` sends title/description/project/workspace as separate CLI args; unknown commands, invalid slugs/ids, and malformed bodies return 400; `rotate` requires `confirm: true`; no response contains a ticket.
- [ ] **Step 2: Run `npm run test --workspace=@ai-crew/bff` and confirm each test fails for the absent route or validation.**
- [ ] **Step 3: Implement command definitions and argument encoders.** Define per-command methods and fields for `login`, `fetch`, `rotate`, `whoami`, `verify`, `teams`, `channels`, `posts`, `digest`, `find-user`, `say`, `join`, `create-team`, `create-channel`, `team-add`, `post-delete`, `channel-delete`, `overview`, `workspaces`, `agents`, `projects`, `issues`, `issue-new`, `mm-get`. Reject unknown fields and path traversal; use the CLI `--scrub` option for `mm-get`.
- [ ] **Step 4: Normalize output and failures.** Return only safe status and data; redact the CLI's ticket-bearing fields and exception text. Handle command timeout and malformed JSON with a generic 502 plus a request identifier.
- [ ] **Step 5: Run focused tests and `npm run build`; refactor duplicated validation after green.**

### Task 3: Make Multica current and actionable

**Files:**
- Modify: `customizations/mattermost/components/ai_crew/ai_crew_console.tsx`
- Modify: `customizations/mattermost/components/ai_crew/ai_crew_console.scss`
- Test: `customizations/mattermost/components/ai_crew/ai_crew_console.test.tsx`

**Interfaces:**
- Consumes: existing workspaces/projects/issues routes and Task 2 command routes for `agents` and `issue-new`.
- Produces: workspace, project, agent and issue views; manual/focus refresh, last success time, stale error state, and issue creation form.

- [ ] **Step 1: Write failing UI tests.** Assert that a visible page refetches issues on focus, a refresh button gets the latest issue, an unsuccessful refresh preserves the prior list with a stale indicator, agents appear for the selected workspace, and submitting a valid issue form renders the new issue from the refreshed list.
- [ ] **Step 2: Run focused Jest tests and verify the expected missing behavior failures.** Use `npm test --prefix upstream/mattermost/webapp/channels -- --runInBand ai_crew_console.test.tsx` after `npm run customize:mattermost`.
- [ ] **Step 3: Implement the UI states and requests.** Keep request sequence protection; use `cache: 'no-store'` for live JSON, a visible refresh control, focus/visibility listeners with cleanup, and a last-success timestamp. Create issues through the typed BFF command and re-fetch the selected workspace after success.
- [ ] **Step 4: Run focused tests; verify all status, empty, loading, and stale states.**

### Task 4: Expose the remaining skill capabilities

**Files:**
- Create: `customizations/mattermost/components/ai_crew/crew_operations.tsx`
- Create: `customizations/mattermost/components/ai_crew/crew_operations.test.tsx`
- Modify: `customizations/mattermost/components/ai_crew/ai_crew_console.tsx`
- Modify: `customizations/mattermost/components/ai_crew/ai_crew_console.scss`

**Interfaces:**
- Consumes: Task 2 typed command routes.
- Produces: connection diagnostics, overview, digest, people search, team/channel management, message operations, and scrubbed read-only diagnostics. Existing Mattermost chat remains the primary conversation reader.

- [ ] **Step 1: Write failing tests by user workflow.** Cover connection verification and rotation confirmation, people search and DM target selection, digest including DM option, posting/replying with target/content preview, joining and creating teams/channels, team member addition, post/channel deletion confirmations, and read-only diagnostic path validation.
- [ ] **Step 2: Run focused Jest tests and confirm the missing controls fail.**
- [ ] **Step 3: Implement small focused panels.** Use the same typed command client throughout; show action result and re-fetch relevant lists. Ensure destructive actions name the target and require a second action in the UI; never put token values in rendered state.
- [ ] **Step 4: Run focused Jest tests; check keyboard and accessible labels for dialogs, forms, and status messages.**

### Task 5: Reduce native Mattermost capabilities

**Files:**
- Modify: `scripts/apply-mattermost-customizations.mjs`
- Modify: `tests/mattermost-customizations.test.mjs`
- Create: maintained replacement components under `customizations/mattermost/` as needed.

**Interfaces:**
- Consumes: pinned Mattermost v11.1.1 source anchors.
- Produces: a reproducible overlay that shows only ai-crew supported navigation and actions.

- [ ] **Step 1: Inventory native menus and routes.** Record the exact source components for marketplace, integrations, system console, cloud upgrade, calls, playbooks, and unrelated settings; identify the core chat/DM/team/channel controls to preserve.
- [ ] **Step 2: Write failing customization tests.** Apply the patcher to representative source strings and assert unsupported entries are absent while the product switcher and core controls remain; assert a second apply is byte-identical.
- [ ] **Step 3: Run `npm run test:root` and verify the expected failure.**
- [ ] **Step 4: Add guarded patch operations.** Prefer component replacement or explicit source transforms; throw on changed anchors, avoid stylesheet hiding, and update maintained tests.
- [ ] **Step 5: Apply the overlay twice, compare the output, run root and focused Mattermost tests.**

### Task 6: Browser and release verification

**Files:**
- Modify: `README.md`
- Modify: `scripts/smoke.mjs`
- Test: all suites above.

**Interfaces:**
- Consumes: completed BFF and frontend.
- Produces: reproducible build/start instructions and evidence that the displayed records match the current CLI/BFF records.

- [ ] **Step 1: Write a read-only browser smoke check** for issue identifier/time and Mattermost channel metadata, and document which production write flows were verified with fakes.
- [ ] **Step 2: Run `npm test`, `npm run build`, focused frontend Jest tests, and `npm run build:mattermost`.**
- [ ] **Step 3: Start the BFF from the worktree, run `npm run smoke`, load `/` and `/ai-crew`, and compare latest identifiers/times across CLI, BFF, and browser.**
- [ ] **Step 4: Review `git diff`, `git status`, and the command inventory.** Confirm every skill command has a browser path, no secret appears in responses, the upstream submodule pointer is unchanged, and no generated overlay files are committed.
- [ ] **Step 5: Update README with connection, refresh, supported capabilities, and rebuild/start instructions.**
