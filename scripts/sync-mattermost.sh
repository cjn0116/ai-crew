#!/bin/sh
set -eu

repo_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
mattermost_dir="$repo_root/upstream/mattermost"
expected_commit=317025c411ec8c34381fdd4f137a17c63895a4f2

git -C "$repo_root" submodule update --init upstream/mattermost
git -C "$mattermost_dir" fetch --depth 1 origin refs/tags/v11.1.1
git -C "$mattermost_dir" checkout --detach "$expected_commit"

actual_commit=$(git -C "$mattermost_dir" rev-parse HEAD)
if [ "$actual_commit" != "$expected_commit" ]; then
  printf 'Expected Mattermost %s, got %s\n' "$expected_commit" "$actual_commit" >&2
  exit 1
fi

printf 'Mattermost v11.1.1 ready at %s\n' "$actual_commit"
