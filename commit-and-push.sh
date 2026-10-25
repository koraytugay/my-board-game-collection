#!/usr/bin/env bash
# Commits the given generated files and pushes them, rebasing onto any newer upstream commits.
# Usage: ./commit-and-push.sh "commit message" path [path ...]
#
# The files are committed *before* pulling, so a push that lands during a pipeline run can't
# leave merge markers in them. If the rebase conflicts, this run's freshly generated version wins.
set -euo pipefail

message="$1"
shift
branch="${GITHUB_REF_NAME:-$(git rev-parse --abbrev-ref HEAD)}"

git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"

git add -- "$@"
if git diff --quiet --staged; then
    echo "No changes to commit for: $*"
    exit 0
fi
git commit -m "$message"

for attempt in 1 2 3; do
    git fetch origin "$branch"
    # In a rebase, "theirs" is the commit being replayed: this run's data.
    git rebase --autostash -X theirs "origin/$branch"

    if git grep -InE '^(<<<<<<<|>>>>>>>)( |$)' HEAD -- "$@"; then
        echo "::error::Merge conflict markers found in committed files; refusing to push."
        exit 1
    fi

    if git push origin "HEAD:$branch"; then
        exit 0
    fi
    echo "Push rejected (attempt $attempt); upstream moved, retrying..."
    sleep $((attempt * 5))
done

echo "::error::Could not push after 3 attempts."
exit 1
