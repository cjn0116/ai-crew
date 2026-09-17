import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {readFile, stat} from 'node:fs/promises';
import test from 'node:test';
import {promisify} from 'node:util';

const root = new URL('../', import.meta.url);
const execFileAsync = promisify(execFile);

test('pins the Mattermost web app to v11.1.1 with its build manifest', async () => {
  const version = JSON.parse(
    await readFile(new URL('upstream/mattermost.version', root), 'utf8'),
  );
  assert.deepEqual(version, {
    repository: 'https://github.com/mattermost/mattermost.git',
    tag: 'v11.1.1',
    commit: '317025c411ec8c34381fdd4f137a17c63895a4f2',
  });

  const {stdout: checkedOutCommit} = await execFileAsync(
    'git',
    ['-C', 'upstream/mattermost', 'rev-parse', 'HEAD'],
    {cwd: root},
  );
  assert.equal(checkedOutCommit.trim(), version.commit);

  const manifest = new URL('upstream/mattermost/webapp/package.json', root);
  const manifestStat = await stat(manifest);
  assert.equal(manifestStat.isFile(), true);
});
