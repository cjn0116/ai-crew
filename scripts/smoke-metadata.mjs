const issueTime = (issue) => issue.updated_at ?? issue.updatedAt ?? issue.update_at ?? null;

export function issueSnapshot(issues) {
  const items = issues.map((issue) => ({
    id: issue.id ?? null,
    identifier: issue.identifier ?? null,
    updatedAt: issueTime(issue),
  })).sort((left, right) => String(left.id).localeCompare(String(right.id)));
  const latest = [...items].sort((left, right) => String(right.updatedAt ?? '').localeCompare(String(left.updatedAt ?? '')))[0] ?? null;
  return {count: items.length, latest, items};
}

export function postSnapshot(posts) {
  const items = posts.map((post) => ({id: post.id ?? null, createdAt: post.create_at ?? post.time ?? null}));
  const ordered = [...items].sort((left, right) => {
    if (typeof left.createdAt === 'number' && typeof right.createdAt === 'number') {
      return left.createdAt - right.createdAt;
    }
    return String(left.createdAt ?? '').localeCompare(String(right.createdAt ?? ''));
  });
  return {count: items.length, latest: ordered.at(-1) ?? null};
}

export function assertMatchingIssues(cli, bff) {
  if (JSON.stringify(cli.items) !== JSON.stringify(bff.items)) {
    throw new Error('BFF issue metadata differs from the current ai-crew CLI result');
  }
}

export function assertMatchingPosts(cli, bff) {
  if (cli.latest?.id !== bff.latest?.id) {
    throw new Error('BFF latest post differs from the current ai-crew CLI result');
  }
}
