# AI Crew Capability Refresh Design

## Goal

Make the local console show current Mattermost and Multica data, expose every supported ai-crew skill operation, and limit Mattermost navigation to those operations.

## Architecture

Keep Mattermost v11.1.1 for conversations. The BFF remains the only credential holder and proxies Mattermost traffic. Add typed BFF routes for skill commands that the native interface does not cover, with explicit request validation and redacted errors. Extend the Multica route into a capability console with sections for workspaces, agents, projects, issues, messages summary, people, teams, channels, and connection diagnostics. Use the existing customization overlay for all upstream UI changes.

## Freshness diagnosis and behavior

Compare the same workspaces, issue identifiers, and channel post timestamps at the CLI, BFF, and browser boundaries. Preserve the exact failed boundary as a regression test before fixing it. Multica data reloads on page entry, workspace change, focus or visibility return, a 60-second interval while visible, and manual refresh. Show the last successful update time and an error state if refresh fails; keep the last good data visible with a stale label. Mattermost retains its WebSocket updates and refetches the active channel after reconnect. Rebuilding frontend assets and restarting BFF are part of browser verification.

## Capability coverage

| Skill commands | Browser surface |
| --- | --- |
| `login`, `fetch`, `rotate`, `whoami`, `verify` | Connection panel with credential state, diagnostic results, and explicit rotation confirmation |
| `teams`, `channels`, `posts`, `say`, `join`, `create-team`, `create-channel`, `team-add`, `post-delete`, `channel-delete` | Mattermost conversation UI plus missing explicit management actions; deletions identify the target and require confirmation |
| `digest`, `find-user`, `overview`, `mm-get` | Summary, people, overview, and scrubbed read-only diagnostics |
| `workspaces`, `agents`, `projects`, `issues`, `issue-new` | Multica workspace/project/agent/issue views and issue creation form |

The browser never receives upstream tickets. It may submit a user-provided `fh_u_` ticket to localhost for `login`; it is not persisted in browser storage. The BFF uses the skill CLI for all skill operations and keeps credentials on the server. Scope `mm-get` to `/api/v4/` paths and scrub its response. Mutations require validated targets and inputs. Production acceptance checks are read-only; mutation tests use controlled fakes.

## Mattermost reduction

Keep navigation and actions needed for team and channel browsing, direct messages, posts, replies, member lookup, membership, creation, and deletion. Remove unsupported native entry points from menus and routes, including marketplace/plugins, integrations, admin console, cloud upgrade, calls, playbooks, and unrelated account or team settings. Do this through maintained overlay patches with assertions against the pinned upstream version; avoid CSS-only hiding.

## Verification

Add BFF route tests, UI interaction tests, customization tests, and a read-only live smoke test that compares CLI, BFF, and browser-visible latest identifiers and timestamps. Confirm no tickets appear in responses or logs. Run root tests, TypeScript checking, focused Mattermost tests, frontend build, and the live smoke test. Review the final overlay diff and preserve upstream submodule pin.
