import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {copyFileSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';

const launcher = new URL('../start.command', import.meta.url);

function runLauncher(buildExitCode, occupiedPid = '', pythonVersion = 'Python 3.14.0', cliPresent = true) {
  const directory = mkdtempSync(join(tmpdir(), 'ai-crew-launch-'));
  try {
    mkdirSync(join(directory, 'node_modules'));
    mkdirSync(join(directory, 'bin'));
    mkdirSync(join(directory, '.venv', 'bin'), {recursive: true});
    if (pythonVersion !== null) {
      writeFileSync(join(directory, '.venv', 'bin', 'python'), `#!/bin/sh\nprintf '%s\\n' '${pythonVersion}'\n`, {mode: 0o755});
    }
    const cli = join(directory, 'ai_crew.py');
    if (cliPresent) writeFileSync(cli, '# CLI fixture\n');
    copyFileSync(launcher, join(directory, 'start.command'));
    writeFileSync(join(directory, 'bin', 'npm'), `#!/bin/sh\nprintf '%s\\n' "$*" >> "$CALL_LOG"\nif [ "$1 $2" = 'run build:mattermost' ]; then exit "$BUILD_EXIT_CODE"; fi\nexit 0\n`, {mode: 0o755});
    writeFileSync(join(directory, 'bin', 'lsof'), '#!/bin/sh\nif [ -n "$OCCUPIED_PID" ]; then printf "%s\\n" "$OCCUPIED_PID"; fi\n', {mode: 0o755});
    const calls = join(directory, 'calls.txt');
    writeFileSync(calls, '');
    const result = spawnSync('/bin/zsh', [join(directory, 'start.command')], {
      env: {...process.env, PATH: `${join(directory, 'bin')}:${process.env.PATH}`, AI_CREW_BFF_PORT: '45678', AI_CREW_CLI: cli, CALL_LOG: calls, BUILD_EXIT_CODE: String(buildExitCode), OCCUPIED_PID: occupiedPid},
      encoding: 'utf8',
    });
    return {result, calls: readFileSync(calls, 'utf8').trim().split('\n').filter(Boolean)};
  } finally {
    rmSync(directory, {recursive: true, force: true});
  }
}

test('launcher rebuilds the current Mattermost UI before starting the service', () => {
  const {result, calls} = runLauncher(0);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(calls, ['run build:mattermost', 'start']);
});

test('launcher does not start with stale assets when the build fails', () => {
  const {result, calls} = runLauncher(9);
  assert.notEqual(result.status, 0);
  assert.deepEqual(calls, ['run build:mattermost']);
});

test('launcher reports the occupied port before rebuilding or starting', () => {
  const {result, calls} = runLauncher(0, '12345');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /45678.*12345/);
  assert.deepEqual(calls, []);
});

test('launcher rejects a project virtual environment using Python 3.13', () => {
  const {result, calls} = runLauncher(0, '', 'Python 3.13.7');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Python 3\.14/);
  assert.deepEqual(calls, []);
});

test('launcher requires a virtual environment in its own project folder', () => {
  const {result, calls} = runLauncher(0, '', null);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /\.venv\/bin\/python/);
  assert.deepEqual(calls, []);
});

test('launcher reports a missing ai-crew CLI before the frontend build', () => {
  const {result, calls} = runLauncher(0, '', 'Python 3.14.0', false);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /ai-crew.*CLI/i);
  assert.deepEqual(calls, []);
});
