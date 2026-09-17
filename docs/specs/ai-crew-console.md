# AI Crew Console Specification

## Goal

Build an internal collaboration console that keeps Mattermost's proven messaging experience and adds Multica workspace, project, and issue workflows behind a small backend-for-frontend (BFF).

## Baseline

- Mattermost Web App source is pinned to the upstream `v11.1.1` tag.
- The existing Synapse OS Mattermost gateway remains the source of messaging data and WebSocket events.
- The existing ai-crew CLI remains the reference integration for credential discovery and Multica behavior.
- Browser clients never receive the upstream Mattermost or Multica credentials.

## First Deliverable

1. A reproducible repository with pinned upstream metadata and local development commands.
2. A TypeScript BFF exposing health, session identity, and Multica project/issue endpoints.
3. Mattermost Web App running against the BFF/gateway boundary.
4. A Multica navigation entry and project/issue views integrated into the Mattermost shell.
5. Automated unit/integration tests and a browser smoke test for the primary workflows.

## Security

- Read credentials from local environment files at process start.
- Redact secrets from logs and API responses.
- Keep mutating endpoints explicit and validate their inputs.
- Bind local development services to loopback by default.

## Acceptance Criteria

- `npm test` passes from the repository root.
- `npm run build` succeeds from the repository root.
- The BFF health endpoint reports readiness without exposing credentials.
- The identity endpoint returns the connected ai-crew user.
- The browser can load Mattermost messaging and the Multica project view through one local origin.

