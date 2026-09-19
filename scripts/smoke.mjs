import assert from 'node:assert/strict';

import WebSocket from 'ws';

import {runAiCrew} from '../apps/bff/src/ai-crew-client.ts';
import {assertMatchingIssues, assertMatchingPosts, issueSnapshot, postSnapshot} from './smoke-metadata.mjs';

const base = process.env.AI_CREW_SMOKE_URL ?? 'http://127.0.0.1:4174';

async function readJson(path) {
  const response = await fetch(`${base}${path}`, {cache: 'no-store'});
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

const workspace = workspaces.workspaces[0].slug;
const cliIssues = await runAiCrew('issues', ['--workspace', workspace]);
assert.equal(cliIssues.ok, true, 'ai-crew CLI issues query failed');
const cliIssueList = Array.isArray(cliIssues.data) ? cliIssues.data : cliIssues.data?.issues;
assert.ok(Array.isArray(cliIssueList), 'ai-crew CLI issues result is malformed');
const bffIssues = await readJson(`/api/ai-crew/issues?workspace=${encodeURIComponent(workspace)}`);
assert.ok(Array.isArray(bffIssues.issues), 'BFF issues result is malformed');
const cliIssueMeta = issueSnapshot(cliIssueList);
const bffIssueMeta = issueSnapshot(bffIssues.issues);
assertMatchingIssues(cliIssueMeta, bffIssueMeta);

const cliChannels = await runAiCrew('channels');
assert.equal(cliChannels.ok, true, 'ai-crew CLI channels query failed');
assert.ok(Array.isArray(cliChannels.channels), 'ai-crew CLI channels result is malformed');
const channel = cliChannels.channels.find((item) => item.team_id && Number(item.total_msg_count) > 0);
let postMeta = null;
if (channel) {
  const cliPosts = await runAiCrew('posts', [channel.id, '--limit', '1', '--pages', '1', '--per-page', '1', '--system']);
  assert.equal(cliPosts.ok, true, 'ai-crew CLI posts query failed');
  assert.ok(Array.isArray(cliPosts.posts), 'ai-crew CLI posts result is malformed');
  const bffPosts = await readJson(`/api/v4/channels/${encodeURIComponent(channel.id)}/posts?per_page=1&page=0`);
  assert.ok(Array.isArray(bffPosts.order) && bffPosts.posts, 'BFF posts result is malformed');
  const cliPostMeta = postSnapshot(cliPosts.posts);
  const bffPostMeta = postSnapshot(bffPosts.order.map((id) => bffPosts.posts[id]));
  assertMatchingPosts(cliPostMeta, bffPostMeta);
  postMeta = {channelId: channel.id, latestId: bffPostMeta.latest?.id ?? null, latestAt: bffPostMeta.latest?.createdAt ?? null};
}

const multicaPage = await fetch(`${base}/ai-crew`, {cache: 'no-store'});
assert.equal(multicaPage.ok, true, '/ai-crew page is unavailable');
assert.match(multicaPage.headers.get('content-type') ?? '', /text\/html/);

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
  issues: {workspace, count: bffIssueMeta.count, latest: bffIssueMeta.latest},
  posts: postMeta,
  mattermostVersion: hello.data?.server_version ?? null,
}));
