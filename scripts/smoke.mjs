import assert from 'node:assert/strict';

import WebSocket from 'ws';

const base = process.env.AI_CREW_SMOKE_URL ?? 'http://127.0.0.1:4174';

async function readJson(path) {
  const response = await fetch(`${base}${path}`);
  assert.equal(response.ok, true, `${path} returned HTTP ${response.status}`);
  return response.json();
}

const health = await readJson('/api/ai-crew/health');
assert.equal(health.ok, true);

const identity = await readJson('/api/ai-crew/me');
assert.equal(typeof identity.user?.username, 'string');
assert.ok(identity.user.username.length > 0);

const workspaces = await readJson('/api/ai-crew/workspaces');
assert.ok(Array.isArray(workspaces.workspaces));
assert.ok(workspaces.workspaces.length > 0);

const mattermostUser = await readJson('/api/v4/users/me');
assert.equal(mattermostUser.username, identity.user.username);

const websocketUrl = new URL('/api/v4/websocket', base);
websocketUrl.protocol = websocketUrl.protocol === 'https:' ? 'wss:' : 'ws:';
const hello = await new Promise((resolve, reject) => {
  const socket = new WebSocket(websocketUrl);
  const timer = setTimeout(() => {
    socket.terminate();
    reject(new Error('Mattermost WebSocket hello timed out'));
  }, 10_000);
  socket.on('message', (raw) => {
    const message = JSON.parse(raw.toString());
    if (message.event === 'hello') {
      clearTimeout(timer);
      socket.close();
      resolve(message);
    }
  });
  socket.on('error', reject);
});

console.log(JSON.stringify({
  ok: true,
  user: identity.user.username,
  workspaces: workspaces.workspaces.length,
  mattermostVersion: hello.data?.server_version ?? null,
}));
