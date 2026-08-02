#!/usr/bin/env bash
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
cd "$repo_root"

if ! command -v git-filter-repo >/dev/null 2>&1; then
  echo "git-filter-repo is required but was not found in PATH." >&2
  exit 1
fi

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Working tree must be clean before rewriting history." >&2
  exit 1
fi

git_filter_repo_cmd=(
  git-filter-repo
  --force
  --commit-callback
  '
targets = {
    b"258900d3892c874a3b42746c58c2496a94c906de",
    b"5b241cfa2b757f89a7cb08333792d5ab529365d2",
}

if commit.original_id not in targets:
    return

message = commit.message.decode("utf-8")
filtered_lines = [
    line
    for line in message.splitlines(keepends=True)
    if line.rstrip("\r\n") != "https://claude.ai/code/session_01WwDbRBa8Z9dx3daZzA8LHh"
    and line.rstrip("\r\n") != "https://claude.ai/code/session_01KwrzoBarcWQfwB6Y3CZrKi"
    and line.rstrip("\r\n") != "Co-authored-by: Claude <noreply@anthropic.com>"
]
commit.message = "".join(filtered_lines).encode("utf-8")
  '
)

"${git_filter_repo_cmd[@]}"

echo "Rewrote commit messages for the two target SHAs."
