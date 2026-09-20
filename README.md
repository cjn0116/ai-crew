# AI Crew Console

A local console combining Mattermost v11.1.1 messaging and Multica projects and
issues through a Node.js BFF. Switch between the two products from the top-left
product menu. Multica uses Mattermost typography and component styles with the
Glacier palette, while its route and Shadow DOM keep the two interfaces isolated.

## Requirements

- Git with submodule support
- Node.js 22.18+ (22 LTS recommended) and npm 10
- Python 3 and an installed, authenticated `ai-crew` skill
- Network access to the ai-crew gateway used by the credential cache

The BFF runs TypeScript directly in Node, so older Node.js 22 releases without
default type stripping are insufficient. The CLI defaults to
`~/.codex/skills/ai-crew/scripts/ai_crew.py`; authenticate through that skill before
starting the application. This repository does not distribute credentials.

## First-time setup

```bash
git clone --recurse-submodules https://github.com/cjn0116/ai-crew.git
cd ai-crew

# Also works when the repository was cloned without --recurse-submodules.
git submodule update --init upstream/mattermost

python3 -m venv .venv
npm ci
npm ci --prefix upstream/mattermost/webapp
npm run build:mattermost
```

`build:mattermost` applies the customization overlay and builds the frontend.
Both dependency installations are required: the root installs the BFF dependencies,
while the submodule installs Mattermost's frontend packages, Sass and test tools.

The build sets `AI_CREW_SKIP_IMAGE_OPTIMIZATION=1` to bypass an upstream native
image optimizer that is unavailable on some Apple Silicon environments. This
changes build-time optimization, not runtime image delivery.

## Start and stop

```bash
npm start
```

On macOS, after completing setup, double-click **`start.command`** in Finder.
It rebuilds the Mattermost and Multica browser assets from the current source
before starting the service in Terminal. A failed build stops the launch so an
older page is not served by a new process. Keep that window open while using the
app; press **Control+C** to stop the service. Close an older service window
before launching again on the same port, then reload the browser tab. The
launcher reports the process ID immediately if that port is already occupied.

- Multica: <http://127.0.0.1:4174/ai-crew>
- Mattermost: <http://127.0.0.1:4174/>

The product menu contains exactly two destinations, with the current product
highlighted and no checkboxes. Multica supports workspace switching, project
filtering, agent and issue views, and issue creation. Issue data refreshes when
the page gains focus, when it becomes visible, every 60 seconds while visible,
and when you press the refresh button. The page shows the last successful
update time and marks older data when a refresh fails.

The **班组操作** view exposes the remaining ai-crew commands: connection status
and diagnostics, teams and channels, message records and summaries, member
lookup, sending and replying, team and channel management, and confirmed
deletion. Mattermost remains the primary conversation view. The native menus
show the collaboration controls supported by ai-crew and omit unrelated
marketplace, admin, cloud, and plugin entry points. This is a UI reduction;
Mattermost server permissions still control access to direct API requests.

## Configuration

Settings are read from the process environment. **`.env` is not loaded automatically**;
`.env.example` documents the available names and defaults. For example:

```bash
AI_CREW_BFF_PORT=4175 npm start
```

| Variable | Default |
| --- | --- |
| `AI_CREW_BFF_HOST` | `127.0.0.1` |
| `AI_CREW_BFF_PORT` | `4174` |
| `AI_CREW_PYTHON` | `<repository>/.venv/bin/python` |
| `AI_CREW_CLI` | `~/.codex/skills/ai-crew/scripts/ai_crew.py` |
| `AI_CREW_CREDENTIALS` | `~/.codex/skills/ai-crew/.runtime/credentials_cache.json` |

Use absolute filesystem paths for path overrides. Credentials are read server-side;
the browser receives only a non-sensitive Mattermost session marker. Local
credentials, virtual environments and environment files are excluded from Git.

## Development and verification

```bash
# Root and BFF tests, followed by BFF TypeScript checking
npm test
npm run build

# Apply overlays before running the focused frontend tests
npm run customize:mattermost
npm test --prefix upstream/mattermost/webapp/channels -- --runInBand \
  ai_crew_console.test.tsx crew_operations.test.tsx \
  ai_crew_page.test.tsx product_switcher.test.tsx \
  global_header/left_controls/product_menu/product_menu.test.tsx

# Build browser assets after changing the UI, then reload the browser
npm run build:mattermost
```

`npm run dev` watches BFF source changes; it does not rebuild the frontend.
`npm run build` type-checks the BFF only. Optional dependency checking is available
with `npm audit --omit=dev`.

With the service running and valid credentials, run `npm run smoke` to check the
live identity, Multica workspace and issue metadata, selected Mattermost channel
post metadata, the `/ai-crew` page, and the Mattermost WebSocket. The smoke test
compares current ai-crew CLI records with BFF responses and prints identifiers,
counts and timestamps only. It does not send messages or create, change, or
delete production records. Mutation flows are covered by tests with fakes.
Unit tests do not require a live account.

## Repository layout and upstream changes

| Path | Purpose |
| --- | --- |
| `apps/bff/` | Local API, credential handling and Mattermost proxy |
| `customizations/mattermost/` | Maintained UI source and replacement tests |
| `scripts/apply-mattermost-customizations.mjs` | Reproducible overlay, route/menu patches and shadow stylesheet compilation |
| `upstream/mattermost/` | Git submodule pinned to Mattermost v11.1.1 |
| `docs/multica-ui.md` | Typography, component, palette and layout contract |
| `start.command` | macOS double-click launcher |

Edit the customization source, then apply it using the commands above. Changes
under `upstream/mattermost` are expected after applying the overlay; Git may show
the submodule as modified even when the parent repository is clean. Commit the
maintained sources and patch scripts in this repository, not generated overlay
files or a new submodule commit. Root `.gitignore` rules do not hide tracked changes
inside a submodule. Review any upstream version change separately.

See [the UI contract](docs/multica-ui.md) and [the original architecture](docs/specs/ai-crew-console.md)
for additional context.

## Troubleshooting

- **Port already in use:** use the existing service, stop it in its Terminal window,
  or select another port with `AI_CREW_BFF_PORT`.
- **Missing Node/npm or dependencies:** complete the requirements and both `npm ci`
  steps before using the launcher.
- **Missing `.venv/bin/python`:** create the virtual environment or set
  `AI_CREW_PYTHON` to an existing Python 3 executable.
- **Multica fails to load or Mattermost authentication fails:** refresh the ai-crew
  skill login and check the CLI/credential paths and gateway connectivity.
- **UI changes are not visible:** rebuild with `npm run build:mattermost`, then reload
  the browser. Applying the overlay alone does not update the served assets.
- **Messages or issues look unchanged:** press the Multica refresh button or
  reload Mattermost, then run `npm run smoke`. The smoke output includes the
  latest issue and selected channel post IDs and times; unchanged IDs with a
  passing comparison mean the current CLI and BFF also have no newer records.
  A failed comparison identifies a stale BFF or an unavailable upstream read.
