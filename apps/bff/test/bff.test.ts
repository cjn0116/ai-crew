import assert from 'node:assert/strict';
import {mkdtemp, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';

import {loadConfig} from '../src/config.ts';
import {redactSecrets} from '../src/redaction.ts';
import {buildServer} from '../src/server.ts';
import {buildMattermostWebSocketTarget} from '../src/websocket-proxy.ts';

test('defaults to a loopback-only listener', () => {
  assert.deepEqual(loadConfig({}), {host: '127.0.0.1', port: 4174});
});

test('redacts credential-shaped values recursively', () => {
  const result = redactSecrets({token: 'secret', nested: {authorization: 'Bearer secret', title: 'visible'}});
  assert.deepEqual(result, {token: '[REDACTED]', nested: {authorization: '[REDACTED]', title: 'visible'}});
});

test('preserves credential status while redacting credential values', () => {
  const result = redactSecrets({
    credential_status: 'expired',
    mm_token: false,
    multica_token: true,
    credential: {token: 'server-secret'},
  });

  assert.deepEqual(result, {
    credential_status: 'expired',
    mm_token: false,
    multica_token: true,
    credential: '[REDACTED]',
  });
});

test('serves health, identity, and Multica workspaces without running the full overview', async () => {
  const app = buildServer({
    runAiCrew: async (command) => {
      if (command === 'whoami') {
        return {ok: true, credential: {uid: 'caojn', mattermost: {email: 'caojn@sanywind.net', token: '(有)'}}};
      }
      if (command === 'workspaces') {
        return {ok: true, workspaces: [
          {id: 'w1', name: 'synapse-os', slug: 'synapse-os', issue_prefix: 'SYNA', token: 'must-not-leak'},
          {id: 'w2', name: '解决方案作战中心', slug: 'solution-ops', issue_prefix: 'SOLC'},
        ]};
      }
      throw new Error(`unexpected command: ${command}`);
    },
  });

  const health = await app.inject({method: 'GET', url: '/api/ai-crew/health'});
  assert.deepEqual(health.json(), {ok: true, service: 'ai-crew-bff'});

  const identity = await app.inject({method: 'GET', url: '/api/ai-crew/me'});
  assert.deepEqual(identity.json(), {ok: true, user: {username: 'caojn', email: 'caojn@sanywind.net'}});
  assert.equal(identity.body.includes('token'), false);

  const workspaces = await app.inject({method: 'GET', url: '/api/ai-crew/workspaces'});
  assert.deepEqual(workspaces.json(), {ok: true, workspaces: [
    {workspace: 'synapse-os', slug: 'synapse-os', issue_prefix: 'SYNA'},
    {workspace: '解决方案作战中心', slug: 'solution-ops', issue_prefix: 'SOLC'},
  ]});
  assert.equal(workspaces.body.includes('must-not-leak'), false);

  await app.close();
});

test('workspace CLI failure returns a controlled gateway error', async () => {
  const app = buildServer({runAiCrew: async () => { throw new Error('private upstream failure'); }});
  const response = await app.inject({method: 'GET', url: '/api/ai-crew/workspaces'});
  assert.equal(response.statusCode, 502);
  assert.deepEqual(response.json(), {ok: false, error: 'Multica workspaces are unavailable'});
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

test('lists the active Multica status catalog without exposing its token', async () => {
  const calls: Array<{url: string; authorization: string}> = [];
  const app = buildServer({
    credentials: async () => ({base: 'https://gateway.example/root', mattermostToken: 'mm-secret', multicaToken: 'mc-secret'}),
    fetchImpl: async (input, init) => {
      calls.push({url: String(input), authorization: new Headers(init?.headers).get('authorization') ?? ''});
      return new Response(JSON.stringify({statuses: [
        {key: 'todo', name: 'Todo', category: 'unstarted'},
        {key: 'qa', name: 'QA', category: 'started', token: 'upstream-secret'},
      ]}), {status: 200, headers: {'content-type': 'application/json'}});
    },
  });

  const response = await app.inject({method: 'GET', url: '/api/ai-crew/issue-statuses?workspace=synapse-os'});

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), {ok: true, workspace: 'synapse-os', statuses: [
    {key: 'todo', name: 'Todo', category: 'unstarted'},
    {key: 'qa', name: 'QA', category: 'started'},
  ]});
  assert.deepEqual(calls, [{url: 'https://gateway.example/root/multica/api/issue-statuses?workspace_slug=synapse-os', authorization: 'Bearer mc-secret'}]);
  assert.equal(response.body.includes('secret'), false);
  await app.close();
});

test('updates only one confirmed issue status with the server-side Multica token', async () => {
  const calls: Array<{url: string; method: string; authorization: string; body: unknown}> = [];
  const app = buildServer({
    credentials: async () => ({base: 'https://gateway.example/root', mattermostToken: 'mm-secret', multicaToken: 'mc-secret'}),
    fetchImpl: async (input, init) => {
      calls.push({
        url: String(input),
        method: init?.method ?? 'GET',
        authorization: new Headers(init?.headers).get('authorization') ?? '',
        body: JSON.parse(String(init?.body)),
      });
      return new Response(JSON.stringify({id: 'i1', status: 'qa'}), {status: 200, headers: {'content-type': 'application/json'}});
    },
  });

  const response = await app.inject({
    method: 'PUT',
    url: '/api/ai-crew/issues/i1/status',
    headers: {authorization: 'Bearer attacker-token'},
    payload: {workspace: 'synapse-os', status: 'qa', confirm: true},
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), {ok: true});
  assert.deepEqual(calls, [{
    url: 'https://gateway.example/root/multica/api/issues/i1?workspace_slug=synapse-os',
    method: 'PUT',
    authorization: 'Bearer mc-secret',
    body: {status: 'qa'},
  }]);
  assert.equal(response.body.includes('secret'), false);
  await app.close();
});

test('serves agents through the typed command route for a valid workspace', async () => {
  const calls: Array<[string, string[]]> = [];
  const app = buildServer({
    runAiCrew: async (command, args = []) => {
      calls.push([command, args]);
      return {ok: true, workspace: 'synapse-os', data: [{id: 'agent-1', name: 'triage'}]};
    },
  });

  const response = await app.inject({method: 'GET', url: '/api/ai-crew/commands/agents?workspace=synapse-os'});

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), {
    ok: true,
    command: 'agents',
    data: {ok: true, workspace: 'synapse-os', data: [{id: 'agent-1', name: 'triage'}]},
  });
  assert.deepEqual(calls, [['agents', ['--workspace', 'synapse-os']]]);
  await app.close();
});

test('accepts Mattermost display names while rejecting traversal in command targets', async () => {
  const calls: Array<[string, string[]]> = [];
  const app = buildServer({
    runAiCrew: async (command, args = []) => {
      calls.push([command, args]);
      return {ok: true, channels: []};
    },
  });

  const response = await app.inject({method: 'GET', url: '/api/ai-crew/commands/channels?team=Town%20Square'});
  assert.equal(response.statusCode, 200);
  assert.deepEqual(calls, [['channels', ['--team', 'Town Square']]]);

  const traversal = await app.inject({method: 'GET', url: '/api/ai-crew/commands/channels?team=..%2Fprivate'});
  assert.equal(traversal.statusCode, 400);
  await app.close();
});

test('creates an issue with independently encoded CLI arguments', async () => {
  const calls: Array<[string, string[]]> = [];
  const app = buildServer({
    runAiCrew: async (command, args = []) => {
      calls.push([command, args]);
      return {ok: true, workspace: 'synapse-os', issue: {id: 'SYNA-9', title: 'Repair the queue'}};
    },
  });

  const response = await app.inject({
    method: 'POST',
    url: '/api/ai-crew/commands/issue-new',
    payload: {title: 'Repair the queue', description: 'The queue is stuck', project: 'project-7', workspace: 'synapse-os'},
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(calls, [[
    'issue-new',
    ['--description', 'The queue is stuck', '--project', 'project-7', '--workspace', 'synapse-os', '--', 'Repair the queue'],
  ]]);
  await app.close();
});

test('rejects unknown commands, malformed command bodies, and unsafe identifiers', async () => {
  const app = buildServer();

  const unknown = await app.inject({method: 'GET', url: '/api/ai-crew/commands/not-a-command'});
  assert.equal(unknown.statusCode, 400);

  const traversal = await app.inject({method: 'GET', url: '/api/ai-crew/commands/agents?workspace=../secret'});
  assert.equal(traversal.statusCode, 400);

  const unknownField = await app.inject({
    method: 'POST',
    url: '/api/ai-crew/commands/issue-new',
    payload: {title: 'Repair the queue', workspace: 'synapse-os', unexpected: true},
  });
  assert.equal(unknownField.statusCode, 400);

  const badTitle = await app.inject({
    method: 'POST',
    url: '/api/ai-crew/commands/issue-new',
    payload: {title: '', workspace: 'synapse-os'},
  });
  assert.equal(badTitle.statusCode, 400);
  await app.close();
});

test('requires explicit rotate confirmation and redacts tickets from command results', async () => {
  let rotateCalls = 0;
  const app = buildServer({
    runAiCrew: async () => {
      rotateCalls += 1;
      return {ok: true, mattermost_token: 'mm-secret', nested: {ticket: 'fh_u_secret'}};
    },
  });

  const unconfirmed = await app.inject({method: 'POST', url: '/api/ai-crew/commands/rotate', payload: {}});
  assert.equal(unconfirmed.statusCode, 400);
  assert.equal(rotateCalls, 0);

  const confirmed = await app.inject({method: 'POST', url: '/api/ai-crew/commands/rotate', payload: {confirm: true}});
  assert.equal(confirmed.statusCode, 200);
  assert.equal(confirmed.body.includes('mm-secret'), false);
  assert.equal(confirmed.body.includes('fh_u_secret'), false);
  await app.close();
});

test('accepts login tickets only in a POST JSON body', async () => {
  let calls = 0;
  const app = buildServer({
    runAiCrew: async () => {
      calls += 1;
      return {ok: true};
    },
  });

  const leakedQuery = await app.inject({method: 'GET', url: '/api/ai-crew/commands/login?token=fh_u_should_not_run'});
  assert.equal(leakedQuery.statusCode, 400);
  assert.equal(leakedQuery.body.includes('fh_u_should_not_run'), false);
  assert.equal(calls, 0);

  const submitted = await app.inject({
    method: 'POST',
    url: '/api/ai-crew/commands/login',
    payload: {token: 'fh_u_submitted_ticket'},
  });
  assert.equal(submitted.statusCode, 200);
  assert.equal(calls, 1);
  await app.close();
});

test('requires explicit confirmation before deleting a post', async () => {
  let calls = 0;
  const app = buildServer({
    runAiCrew: async () => {
      calls += 1;
      return {ok: true};
    },
  });

  const unconfirmed = await app.inject({
    method: 'POST',
    url: '/api/ai-crew/commands/post-delete',
    payload: {postId: 'post-1'},
  });
  assert.equal(unconfirmed.statusCode, 400);
  assert.equal(calls, 0);

  const confirmed = await app.inject({
    method: 'POST',
    url: '/api/ai-crew/commands/post-delete',
    payload: {postId: 'post-1', confirm: true},
  });
  assert.equal(confirmed.statusCode, 200);
  assert.equal(calls, 1);
  await app.close();
});

test('rejects option-shaped strings in write command arguments', async () => {
  let calls = 0;
  const app = buildServer({
    runAiCrew: async () => {
      calls += 1;
      return {ok: true};
    },
  });

  for (const request of [
    {url: '/api/ai-crew/commands/say', payload: {channel: '--dm=alice', text: 'hello'}},
    {url: '/api/ai-crew/commands/create-team', payload: {name: 'platform', display: '--private'}},
  ]) {
    const response = await app.inject({method: 'POST', ...request});
    assert.equal(response.statusCode, 400);
  }
  assert.equal(calls, 0);
  await app.close();
});

test('preserves leading hyphens in message bodies and issue descriptions', async () => {
  const calls: Array<[string, string[]]> = [];
  const app = buildServer({
    runAiCrew: async (command, args = []) => {
      calls.push([command, args]);
      return {ok: true};
    },
  });

  const message = await app.inject({
    method: 'POST',
    url: '/api/ai-crew/commands/say',
    payload: {channel: 'general', text: '- item'},
  });
  assert.equal(message.statusCode, 200);

  const issue = await app.inject({
    method: 'POST',
    url: '/api/ai-crew/commands/issue-new',
    payload: {title: 'Document the release', description: '- add migration steps'},
  });
  assert.equal(issue.statusCode, 200);
  assert.deepEqual(calls, [
    ['say', ['--', 'general', '- item']],
    ['issue-new', ['--description=- add migration steps', '--workspace', 'synapse-os', '--', 'Document the release']],
  ]);
  await app.close();
});

test('scopes mm-get to API v4 and translates the path for the CLI', async () => {
  const calls: Array<[string, string[]]> = [];
  const app = buildServer({
    runAiCrew: async (command, args = []) => {
      calls.push([command, args]);
      return {ok: true, http: 200, data: {id: 'current-user'}};
    },
  });

  const valid = await app.inject({method: 'GET', url: '/api/ai-crew/commands/mm-get?path=/api/v4/users/me?per_page=10'});
  assert.equal(valid.statusCode, 200);
  assert.deepEqual(calls, [['mm-get', ['/users/me?per_page=10', '--scrub']]]);

  const invalid = await app.inject({method: 'GET', url: '/api/ai-crew/commands/mm-get?path=%2Fusers%2Fme'});
  assert.equal(invalid.statusCode, 400);
  await app.close();
});

test('accepts URLSearchParams-encoded mm-get query values', async () => {
  const calls: Array<[string, string[]]> = [];
  const app = buildServer({
    runAiCrew: async (command, args = []) => {
      calls.push([command, args]);
      return {ok: true, http: 200, data: {id: 'current-user'}};
    },
  });

  const query = new URLSearchParams({path: '/api/v4/users/autocomplete?name=Jane%20Doe'});
  const response = await app.inject({method: 'GET', url: `/api/ai-crew/commands/mm-get?${query}`});

  assert.equal(response.statusCode, 200);
  assert.deepEqual(calls, [['mm-get', ['/users/autocomplete?name=Jane%20Doe', '--scrub']]]);
  await app.close();
});

test('rejects encoded traversal in mm-get paths before invoking the CLI', async () => {
  let calls = 0;
  const app = buildServer({
    runAiCrew: async () => {
      calls += 1;
      return {ok: true};
    },
  });

  for (const path of [
    '%2Fapi%2Fv4%2Fusers%2F%2e%2e%2Fteams',
    '%2Fapi%2Fv4%2Fusers%2F%252e%252e%2Fteams',
    '%2Fapi%2Fv4%2Fusers%252Fme',
    '%2Fapi%2Fv4%2Fusers%255Cme',
  ]) {
    const response = await app.inject({method: 'GET', url: `/api/ai-crew/commands/mm-get?path=${path}`});
    assert.equal(response.statusCode, 400);
  }
  assert.equal(calls, 0);
  await app.close();
});

test('redacts tickets in ordinary fields and validation errors', async () => {
  const app = buildServer({
    runAiCrew: async () => ({
      ok: true,
      detail: 'fh_u_top_level_ticket',
      items: [{message: 'Bearer fh_u_nested_ticket'}],
    }),
  });

  const response = await app.inject({method: 'GET', url: '/api/ai-crew/commands/verify'});
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.includes('fh_u_top_level_ticket'), false);
  assert.equal(response.body.includes('fh_u_nested_ticket'), false);

  const invalid = await app.inject({
    method: 'POST',
    url: '/api/ai-crew/commands/login',
    payload: {token: 'fh_u_ticket_in_validation_error', unexpected: true},
  });
  assert.equal(invalid.statusCode, 400);
  assert.equal(invalid.body.includes('fh_u_ticket_in_validation_error'), false);
  await app.close();
});

test('does not reflect ticket-shaped unknown field names in validation errors', async () => {
  const app = buildServer();
  const response = await app.inject({
    method: 'GET',
    url: '/api/ai-crew/commands/agents?fh_u_fake_ticket=ignored',
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.body.includes('fh_u_fake_ticket'), false);
  await app.close();
});

test('rejects prototype command names as invalid commands', async () => {
  const app = buildServer();
  const response = await app.inject({method: 'GET', url: '/api/ai-crew/commands/__proto__'});

  assert.equal(response.statusCode, 400);
  await app.close();
});

test('returns safe verify diagnostics when the CLI reports a failed connection', async () => {
  const app = buildServer({
    runAiCrew: async () => ({
      ok: false,
      credential_status: 'expired',
      mm_users_me: false,
      mm_teams: null,
      multica_me: null,
      multica_workspaces: null,
      mattermost_token: 'server-secret',
    }),
  });

  const response = await app.inject({method: 'GET', url: '/api/ai-crew/commands/verify'});

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), {
    ok: true,
    command: 'verify',
    data: {
      ok: false,
      credential_status: 'expired',
      mm_users_me: false,
      mm_teams: null,
      multica_me: null,
      multica_workspaces: null,
      mattermost_token: '[REDACTED]',
    },
  });
  assert.equal(response.body.includes('server-secret'), false);
  await app.close();
});

test('proxies Mattermost requests with only the server-side credential', async () => {
  const received: Array<{url: string; authorization: string}> = [];

  const app = buildServer({
    credentials: async () => ({base: 'https://gateway.example/root', mattermostToken: 'server-secret'}),
    fetchImpl: async (input, init) => {
      received.push({url: String(input), authorization: new Headers(init?.headers).get('authorization') ?? ''});
      return new Response(JSON.stringify({id: 'caojn'}), {
        status: 200,
        headers: {'content-type': 'application/json', 'set-cookie': 'unsafe=secret'},
      });
    },
  });
  const response = await app.inject({
    method: 'GET',
    url: '/api/v4/users/me?active=true',
    headers: {authorization: 'Bearer attacker-token'},
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), {id: 'caojn'});
  const config = await app.inject({method: 'GET', url: '/config/client?format=old'});
  assert.equal(config.statusCode, 200);
  const plugin = await app.inject({method: 'GET', url: '/static/plugins/example/bundle.js'});
  assert.equal(plugin.statusCode, 200);
  assert.deepEqual(received, [
    {url: 'https://gateway.example/root/mattermost/api/v4/users/me?active=true', authorization: 'Bearer server-secret'},
    {url: 'https://gateway.example/root/mattermost/config/client?format=old', authorization: 'Bearer server-secret'},
    {url: 'https://gateway.example/root/mattermost/static/plugins/example/bundle.js', authorization: 'Bearer server-secret'},
  ]);
  assert.match(String(response.headers['set-cookie']), /MMUSERID=ai-crew/);
  assert.equal(String(response.headers['set-cookie']).includes('unsafe=secret'), false);

  await app.close();
});

test('serves Mattermost assets and falls back to root.html for client routes', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ai-crew-static-'));
  await writeFile(join(directory, 'root.html'), '<!doctype html><title>AI Crew</title>');
  await writeFile(join(directory, 'app.js'), 'window.ready = true;');
  const app = buildServer({staticRoot: directory});

  const asset = await app.inject({method: 'GET', url: '/static/app.js'});
  assert.equal(asset.body, 'window.ready = true;');
  const route = await app.inject({method: 'GET', url: '/ai-crew'});
  assert.match(route.body, /<title>AI Crew<\/title>/);
  assert.match(String(route.headers['set-cookie']), /MMUSERID=ai-crew/);
  await app.close();
});

test('builds a secure Mattermost WebSocket target from the server credential', () => {
  assert.deepEqual(
    buildMattermostWebSocketTarget(
      {base: 'https://gateway.example/root/', mattermostToken: 'server-secret'},
      '/api/v4/websocket?connection_id=abc',
    ),
    {
      url: 'wss://gateway.example/root/mattermost/api/v4/websocket?connection_id=abc',
      headers: {authorization: 'Bearer server-secret'},
    },
  );
});
