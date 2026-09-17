# Mattermost AI Crew Console Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a locally runnable ai-crew console based on Mattermost Web App v11.1.1 with a secure Multica integration.

**Architecture:** Keep the upstream Mattermost web application as the collaboration shell. Add a loopback-only TypeScript BFF that owns credentials, proxies the existing gateway, and presents a narrow `/api/ai-crew` contract; add the Multica UI as an isolated Mattermost module consuming that contract.

**Tech Stack:** Mattermost Web App v11.1.1, React, TypeScript, Node.js 22, Fastify, Node Test Runner, Codex Browser.

**Spec:** `docs/specs/ai-crew-console.md`

## Global Constraints

- Pin upstream source to Mattermost `v11.1.1`.
- Never expose Mattermost, Multica, or `fh_u_` credentials to browser code or logs.
- Bind development services to `127.0.0.1` by default.
- Write a failing behavioral test before each new production behavior.

---

### Task 1: Repository and upstream baseline

**Files:**
- Create: `.gitignore`
- Create: `package.json`
- Create: `upstream/mattermost/` (Git submodule)
- Create: `upstream/mattermost.version`
- Create: `scripts/sync-mattermost.sh`
- Test: `tests/upstream-baseline.test.ts`

**Interfaces:**
- Consumes: upstream Git tag `v11.1.1`.
- Produces: a reproducible `upstream/mattermost/webapp` source tree and root workspace commands.

- [x] Initialize the repository and commit the specification and plan.
- [x] Add a failing test that verifies the recorded upstream revision and required webapp files.
- [x] Run the test and confirm it fails because the baseline is absent.
- [x] Add the pinned upstream source and sync script.
- [x] Run the test and confirm it passes.
- [x] Commit the upstream baseline.

### Task 2: Secure BFF foundation

**Files:**
- Create: `apps/bff/package.json`
- Create: `apps/bff/src/config.ts`
- Create: `apps/bff/src/server.ts`
- Create: `apps/bff/src/redaction.ts`
- Test: `apps/bff/test/health.test.ts`
- Test: `apps/bff/test/redaction.test.ts`

**Interfaces:**
- Consumes: ai-crew runtime credential files and environment overrides.
- Produces: `buildServer(options): FastifyInstance`, `GET /api/ai-crew/health`, and secret-safe logs/responses.

- [x] Add failing tests for loopback defaults, health output, and token redaction.
- [x] Run the tests and confirm behavior is missing.
- [x] Implement the smallest configuration, server, and redaction modules that pass.
- [x] Run BFF tests and confirm they pass.
- [x] Commit the BFF foundation.

### Task 3: Identity and Multica read API

**Files:**
- Create: `apps/bff/src/ai-crew-client.ts`
- Create: `apps/bff/src/routes/identity.ts`
- Create: `apps/bff/src/routes/multica.ts`
- Test: `apps/bff/test/identity.test.ts`
- Test: `apps/bff/test/multica.test.ts`

**Interfaces:**
- Consumes: the installed ai-crew CLI and its JSON output.
- Produces: `GET /api/ai-crew/me`, `/workspaces`, `/projects`, and `/issues` with normalized JSON.

- [x] Add failing route tests using a process-boundary fake with realistic CLI JSON fixtures.
- [x] Run the tests and confirm the routes are absent.
- [x] Implement validated CLI invocation and normalized route responses.
- [x] Run route and BFF tests and confirm they pass.
- [x] Commit the read API.

### Task 4: Mattermost gateway boundary

**Files:**
- Create: `apps/bff/src/routes/mattermost.ts`
- Create: `apps/bff/src/mattermost-proxy.ts`
- Test: `apps/bff/test/mattermost-proxy.test.ts`

**Interfaces:**
- Consumes: browser HTTP/WebSocket traffic and server-side Mattermost credentials.
- Produces: same-origin `/api/v4` and WebSocket proxy behavior with credential injection.

- [x] Add failing integration tests for header injection, response streaming, and secret stripping.
- [x] Run the tests and confirm the proxy is absent.
- [x] Implement the HTTP and WebSocket proxy boundary.
- [x] Run all BFF tests and confirm they pass.
- [x] Commit the gateway boundary.

### Task 5: Multica module in the Mattermost shell

**Files:**
- Create: `upstream/mattermost/webapp/channels/src/components/ai_crew/`
- Modify: Mattermost navigation and route registration files identified in v11.1.1.
- Test: colocated React tests under `components/ai_crew/`.

**Interfaces:**
- Consumes: BFF identity, workspace, project, and issue endpoints.
- Produces: a navigation entry plus project list, issue list, loading, empty, and error states.

- [x] Add failing component tests for navigation and all visible states.
- [x] Run focused tests and confirm the module is absent.
- [x] Implement the route, navigation item, API client, and accessible views.
- [x] Run focused tests and the Mattermost webapp build for affected packages.
- [x] Commit the Multica module.

### Task 6: Developer workflow and end-to-end verification

**Files:**
- Create: `.env.example`
- Create: `scripts/smoke.mjs`
- Create: `README.md`

**Interfaces:**
- Consumes: root workspace commands and local credentials.
- Produces: `npm run dev`, `npm test`, `npm run build`, and a browser smoke test.

- [x] Add a live smoke command for identity, Mattermost, Multica, and WebSocket paths.
- [x] Verify desktop and mobile project rendering in the Codex Browser.
- [x] Add orchestration scripts and concise setup documentation.
- [x] Run unit tests, builds, and the smoke test.
- [x] Review the implementation against every acceptance criterion.
- [x] Commit the complete developer workflow.
