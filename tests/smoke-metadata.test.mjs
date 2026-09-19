import assert from 'node:assert/strict';
import test from 'node:test';

import {assertMatchingIssues, assertMatchingPosts, issueSnapshot, postSnapshot} from '../scripts/smoke-metadata.mjs';

test('issue snapshot keeps identifiers and update times without issue text', () => {
  const snapshot = issueSnapshot([
    {id: 'i1', identifier: 'SYNA-78', updated_at: '2026-09-17T10:00:00Z', title: 'Private title'},
    {id: 'i2', identifier: 'SYNA-79', updated_at: '2026-09-18T11:00:00Z', description: 'Private description'},
  ]);

  assert.deepEqual(snapshot, {
    count: 2,
    latest: {id: 'i2', identifier: 'SYNA-79', updatedAt: '2026-09-18T11:00:00Z'},
    items: [
      {id: 'i1', identifier: 'SYNA-78', updatedAt: '2026-09-17T10:00:00Z'},
      {id: 'i2', identifier: 'SYNA-79', updatedAt: '2026-09-18T11:00:00Z'},
    ],
  });
  assert.equal(JSON.stringify(snapshot).includes('Private'), false);
});

test('post snapshot rejects a BFF result with an older latest post', () => {
  const cli = postSnapshot([{id: 'new', create_at: 2000}, {id: 'old', create_at: 1000}]);
  const bff = postSnapshot([{id: 'old', create_at: 1000}]);

  assert.deepEqual(cli.latest, {id: 'new', createdAt: 2000});
  assert.throws(() => assertMatchingPosts(cli, bff), /latest post/);
});

test('issue comparison rejects an older BFF record even with the same issue count', () => {
  const cli = issueSnapshot([{id: 'i1', identifier: 'SYNA-79', updated_at: '2026-09-18T11:00:00Z'}]);
  const bff = issueSnapshot([{id: 'i1', identifier: 'SYNA-79', updated_at: '2026-09-17T11:00:00Z'}]);

  assert.throws(() => assertMatchingIssues(cli, bff), /issue metadata/);
});
