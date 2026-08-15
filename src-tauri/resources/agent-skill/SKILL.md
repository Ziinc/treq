---
name: treq
description: >-
  Work inside a Treq agent terminal: use the treq CLI to create and inspect
  workspaces, send files or text to the user in the Treq UI, and create
  commits with treq commit. Use this skill for every Treq agent session,
  whenever you need another workspace, should show the user a file or preview,
  need to record a commit, or are finishing inplace conflict resolution.
---

# Treq

You are running inside Treq. The session system prompt names your working
directory and the home repository. Stay inside that filesystem scope for
direct file reads and writes. Use the `treq` CLI when you need to create or
manage other workspaces; those commands may write under `.treq/workspaces/`
outside the current working directory.

Run `treq --help` if a flag is unclear. Prefer `treq` over raw `git` or `jj`
for workspace, commit, send, and resolve operations.

## Workspaces

A workspace is a separate working copy of the same repository. Files live
under `.treq/workspaces/` in the home repo. Uncommitted work in one workspace
does not appear in another.

```bash
treq st
treq st <workspace_name>
treq add <branch_name> [-d <description>] [-l <title>] [-s <source_branch>] [-p <sparse_path>]... [-k <symlink_path>]...
treq set <workspace_name> [-d <description>] [-l <title>] [-t <target_branch>]
treq mv <source> <destination> -f <file> [-f <file> ...]
treq mv <source> <destination> -c <commit> [-c <commit> ...]
```

Use `.` as a workspace name when a command needs the home repository. Create a
new workspace when the task should stay isolated from the current working copy.
Do not edit sibling workspace directories by hand.

## Send files to the user

Use `treq send` when the user should see a file, screenshot, or text preview
in the Treq UI. Do not ask them to open the path themselves when send can
show it.

```bash
treq send <path>
treq send -
echo "notes" | treq send
```

- Pass an existing file path, or omit the path / use `-` to read stdin.
- Images (`png`, `jpg`, `jpeg`, `gif`, `webp`, `bmp`, `svg`) show as
  thumbnails in the terminal that ran the command.
- Everything else opens as selectable text.
- Piped stdin is staged under `.treq/send/` (gitignored).
- Treq must already have this repository open.

## Commits

When the task needs a commit, use Treq. Do not use `git commit` or `jj commit`
for this flow.

```bash
treq commit <workspace_name> -m <message> [--push]
```

- `workspace_name` is the workspace branch name (the current workspace if you
  are already inside one).
- `-m` is required. Keep the message to a single clear subject, at most 500
  characters.
- `--push` pushes that workspace to the remote after a successful commit.
- This records the pending working-copy changes in that workspace. It does
  not merge the workspace into its target.

Create a commit when the user asked for one, when the work is a complete
reviewable slice, or when leaving uncommitted changes would block a rebase or
sync. Do not create empty or placeholder commits.

## Conflict resolution

To finish inplace conflict resolution, work under
`.treq/resolve/<workspace-slug>/`. Each change-id subdirectory is one
conflicted commit.

```bash
treq resolve <change-id> [1|2|base|both]
echo '{"path/to/file": "replacement\n"}' | treq resolve <change-id>
```

Your work is complete when no change-id directories remain.
