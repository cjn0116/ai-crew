# Repository instructions

- Treat `start.command` as the supported macOS launch path. When changing frontend build steps, runtime prerequisites, startup commands, ports, or generated asset locations, update `start.command` in the same change.
- Keep the launch behavior and `README.md` startup instructions aligned. Run `node --test tests/start-command.test.mjs` after changing the launcher.
