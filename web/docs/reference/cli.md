---
sidebar_position: 6
---

# CLI

_Reference for Treq's command-line interface._

The `treq` command lets you create and inspect workspaces from a terminal. Run commands from inside a Git repository so Treq can detect the repository context.

## Commands

### `treq add`

Create a new workspace.

```bash
treq add <branch_name> [-d <description>] [-l <title>] [-s <source_branch>]
```

- `branch_name`: branch name for the workspace.
- `-d, --description`: optional workspace description.
- `-l, --title`: optional workspace title.
- `-s, --source-branch`: branch to stack the new workspace on.

### `treq set`

Update workspace metadata.

```bash
treq set <workspace_name> [-d <description>] [-l <title>] [-t <target_branch>]
```

- `workspace_name`: workspace branch name.
- `-d, --description`: set the workspace description.
- `-l, --title`: set the workspace title.
- `-t, --target-branch`: set the target branch.

### `treq st`

Show workspace status.

```bash
treq st [workspace_name]
```

Omit `workspace_name` to list all workspaces.

### `treq mv`

Move selected changes from one workspace to another.

```bash
treq mv <source> <destination> -f <file> [-f <file> ...]
treq mv <source> <destination> -c <commit> [-c <commit> ...]
```

- `source`: source workspace branch name.
- `destination`: destination workspace branch name.
- `-f`: file path to move.
- `-c`: commit ID to move.

### `treq agent`

Start an agent session in a workspace.

```bash
treq agent <branch> <prompt> [-m <edit|plan>]
```

- `branch`: workspace branch name.
- `prompt`: prompt to send to the agent.
- `-m, --mode`: permission mode. Use `edit` or `plan`.
