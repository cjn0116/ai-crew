import assert from 'node:assert/strict';
import test from 'node:test';

import {loadConfig} from '../src/config.ts';
import {redactSecrets} from '../src/redaction.ts';
import {buildServer} from '../src/server.ts';

const overview = {
  ok: true,
  mattermost: [{team: 'synapse-os', name: 'synapse-os', member_count: 21, channels: []}],
  multica: [{workspace: 'synapse-os', slug: 'synapse-os', issue_prefix: 'SYNA', agents: [], projects: [{title: '应用治理', status: 'in_progress', issue_count: 7}]}],
};

test('defaults to a loopback-only listener', () => {
  assert.deepEqual(loadConfig({}), {host: '127.0.0.1', port: 4174});
});

test('redacts credential-shaped values recursively', () => {
  const result = redactSecrets({token: 'secret', nested: {authorization: 'Bearer secret', title: 'visible'}});
  assert.deepEqual(result, {token: '[REDACTED]', nested: {authorization: '[REDACTED]', title: 'visible'}});
});

test('serves health, identity, and normalized Multica overview without credentials', async () => {
  const app = buildServer({
    runAiCrew: async (command) => {
      if (command === 'whoami') {
        return {ok: true, credential: {uid: 'caojn', mattermost: {email: 'caojn@sanywind.net', token: '(有)'}}};
      }
      return overview;
    },
  });

  const health = await app.inject({method: 'GET', url: '/api/ai-crew/health'});
  assert.deepEqual(health.json(), {ok: true, service: 'ai-crew-bff'});

  const identity = await app.inject({method: 'GET', url: '/api/ai-crew/me'});
  assert.deepEqual(identity.json(), {ok: true, user: {username: 'caojn', email: 'caojn@sanywind.net'}});
  assert.equal(identity.body.includes('token'), false);

  const workspaces = await app.inject({method: 'GET', url: '/api/ai-crew/workspaces'});
  assert.deepEqual(workspaces.json(), {ok: true, workspaces: overview.multica});

  await app.close();
});

test('serves projects and issues for a validated workspace slug', async () => {
  const calls: Array<[string, string[]]> = [];
  const app = buildServer({
    runAiCrew: async (command, args = []) => {
      calls.push([command, args]);
      if (command === 'projects') {
        return {ok: true, workspace: 'synapse-os', data: {projects: [{id: 'p1', title: '应用治理'}]}};
      }
      return {ok: true, workspace: 'synapse-os', data: {issues: [{id: 'i1', title: '示例工单'}]}};
    },
  });

  const projects = await app.inject({method: 'GET', url: '/api/ai-crew/projects?workspace=synapse-os'});
  assert.deepEqual(projects.json(), {ok: true, workspace: 'synapse-os', projects: [{id: 'p1', title: '应用治理'}]});

  const issues = await app.inject({method: 'GET', url: '/api/ai-crew/issues?workspace=synapse-os'});
  assert.deepEqual(issues.json(), {ok: true, workspace: 'synapse-os', issues: [{id: 'i1', title: '示例工单'}]});
  assert.deepEqual(calls, [
    ['projects', ['--workspace', 'synapse-os']],
    ['issues', ['--workspace', 'synapse-os']],
  ]);

  const invalid = await app.inject({method: 'GET', url: '/api/ai-crew/projects?workspace=../secret'});
  assert.equal(invalid.statusCode, 400);
  await app.close();
});
