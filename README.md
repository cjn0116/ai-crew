# AI Crew Console

Mattermost v11.1.1 with a local BFF and a Multica project/issue console. The
Mattermost source is pinned as a Git submodule; local product changes live in
`customizations/` and are applied reproducibly.

## Prerequisites

- Git with submodule support
- Node.js 22 and npm 10
- A working `ai-crew` skill login in the current user's credential cache

## Setup

```bash
git submodule update --init upstream/mattermost
npm ci
npm run customize:mattermost
npm run build:mattermost
```

The Mattermost build intentionally sets `AI_CREW_SKIP_IMAGE_OPTIMIZATION=1`.
This bypasses an upstream native image optimizer that is unavailable on some
Apple Silicon environments; it does not alter runtime image delivery.

## Run

```bash
npm start
```

Open <http://127.0.0.1:4174/ai-crew>. Set `AI_CREW_BFF_HOST` or
`AI_CREW_BFF_PORT` to use another bind address. Optional path overrides are
listed in `.env.example`.

The browser receives only a non-sensitive Mattermost session marker. The BFF
loads the real ai-crew and Mattermost credentials from the local cache and
keeps those tokens server-side.

## Verify

```bash
npm test
npm run build
npm audit --omit=dev
npm run smoke
```

`npm run smoke` expects `npm start` to be running and verifies the live
identity, Multica workspace, Mattermost user, and WebSocket paths.

The focused Mattermost component test lives at
`webapp/channels/src/components/ai_crew/ai_crew_console.test.tsx` after the
customization overlay is applied.
