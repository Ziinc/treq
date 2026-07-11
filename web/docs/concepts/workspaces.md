---
sidebar_position: 1
---

# Workspaces

_Technical overview of Treq's workspace management system._

Treq enhances Git's native workspace functionality with visual management, metadata storage, and integrated tooling for working across multiple branches simultaneously. Treq uses the `.treq` directory to store and manage local state.

## Git Fundamentals

A Git workspace is an additional working directory linked to the same repository:

```
.git/               # Shared git directory
.treq/workspaces/
  ├── treq-feature-1/  # Workspace 1 (branch: treq/feature-1)
  ├── treq-bugfix-2/   # Workspace 2 (branch: treq/bugfix-2)
  └── ...
```

All workspaces share the same `.git` directory, with each workspace checking out a different branch. Changes in one workspace don't affect others, while Git objects (commits, refs) are shared across all workspaces. Treq extends this by abstracting away some of the Git complexity and overhead of managing and working with these workspaces.

## Visual Management

Treq provides a dashboard interface showing all workspaces in use, branch names and status, commit divergence (ahead/behind), uncommitted changes indicator, and quick actions (open, merge, delete).

## Automated Workflows

**Branch naming patterns**: You can customize branch naming patterns to maintain consistency across your team. For instance, use a pattern like `treq/{name}` to prefix all branches created through Treq. The system automatically sanitizes branch names to ensure they comply with Git's naming requirements.

**Parallel agent terminals**: Each workspace can have multiple terminal sessions with independent shell environments, persistent session history, and associated plans and metadata.

## Storage Structure

```
{repo}/
├── .git/                    # Shared git data
├── .treq/
│   ├── workspaces/
│   │   └── {branch-name}/   # Workspace directories
│   ├── plans/               # Implementation plans
│   └── .gitignore           # Ignore .treq folder
├── src/                     # Main repo files
└── ...
```

## Lifecycle Management

**Creation flow**: The user initiates creation from the UI or CLI. Treq validates the branch name and path, creates the workspace, optionally opens a terminal session, and updates the dashboard.

**Update flow**: Treq polls for changes, checks for uncommitted changes, calculates divergence from base, and updates UI indicators.

**Deletion flow**: The user initiates deletion. Treq checks for uncommitted changes, warns if work might be lost, removes the workspace directory, closes associated sessions, and updates the dashboard.

## Stacks and Rebasing

Stacked workspaces model dependent branches. `PR #2` can build on `PR #1`, and `PR #3` can build on `PR #2`. Treq tracks the target branch for each workspace and uses that relationship when it refreshes or rebases the stack.

When a lower workspace changes, dependent workspaces can become stale. Treq rebases dependents so each branch continues to apply on top of its target. Conflict state is surfaced in the UI as a workspace problem, not hidden as terminal output.

Rebase behavior has two important quirks:

| Behavior | Detail |
|---|---|
| Dirty workspaces block some operations | Uncommitted changes can prevent safe rebases or merges. Commit, move, or discard those changes first. |
| Stack order matters | Updating a lower branch affects every workspace above it. Resolve lower conflicts before reviewing higher workspaces. |

## Performance Optimizations

Treq caches expensive git operations, including file status (staged/unstaged), commit divergence, branch information, and file diffs. The cache invalidates after git operations, on user-triggered refresh, after configuration changes, or after a maximum age of 5 minutes.

Workspace data loads on-demand, diffs generate only when viewed, and terminal sessions start only when opened. Long-running operations like repository scanning and divergence calculation run in the background.

## Settings and Configuration

**Repository settings** are scoped by repository path: branch naming pattern, default base branch, and ignored file patterns.

**Global settings** are application preferences: terminal preferences, UI theme and layout, keyboard shortcuts, and update preferences.

## Limitations and Constraints

Git limits Treq to one branch checked out per workspace, unique workspace paths, and Git 2.35+ for full features. Treq itself supports one repository at a time and requires workspaces to live in `.treq/workspaces/`.

## Best Practices

Delete unused workspaces regularly. Use consistent branch naming patterns. Commit often to preserve work before operations. Monitor size, since large repos produce large workspaces.

## Learn More

- [Installation and Quickstart](/docs/getting-started/installation)
- [Managing Workspaces](/docs/tutorials/managing-workspaces)
- [Merging Workspaces](/docs/tutorials/merging-workspaces)
- [Using with Git Repo](/docs/tutorials/using-treq-with-git-repo)
