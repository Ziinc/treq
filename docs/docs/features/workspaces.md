---
sidebar_position: 1
---

# Workspaces

_Technical overview of Treq's workspace management system._

Treq enhances Git's native workspace functionality with visual management, metadata storage, and integrated tooling for working across multiple branches simultaneously. Treq uses the `.treq` directory to store and manage local state.

## How Workspaces Work

### Git Fundamentals

A Git workspace is an additional working directory linked to the same repository:

```
.git/               # Shared git directory
.treq/workspaces/
  ├── treq-feature-1/  # Workspace 1 (branch: treq/feature-1)
  ├── treq-bugfix-2/   # Workspace 2 (branch: treq/bugfix-2)
  └── ...
```

All workspaces share the same `.git` directory, with each workspace checking out a different branch. Changes in one workspace don't affect others, while Git objects (commits, refs) are shared across all workspaces. Treq extends this by abstracting away some of the Git complexity and overhead for managing and working with these workspaces.

## Treq's Enhancements

### Visual Management

Treq provides a dashboard interface showing all workspaces in use, branch names and status, commit divergence (ahead/behind), uncommitted changes indicator, and quick actions (open, merge, delete).

### Automated Workflows

**Branch naming patterns**: You can customize branch naming patterns to maintain consistency across your team. For instance, you might use a pattern like `treq/{name}` to prefix all branches created through Treq. The system automatically sanitizes branch names to ensure they comply with Git's naming requirements.

### Parallel Agent Terminals

Each workspace can have multiple terminal sessions with independent shell environments, persistent session history, and associated plans and metadata.

## Storage Structure

### Directory Layout

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

### Creation Flow

1. User initiates creation (UI or CLI)
2. Treq validates branch name and path
3. Creates the workspace
4. Opens terminal session (optional)
6. Updates dashboard

### Update Flow

Treq polls for changes:
1. Checks for uncommitted changes
2. Calculates divergence from base
3. Updates UI indicators

### Deletion Flow

1. User initiates deletion
2. Treq checks for uncommitted changes
3. Warns if work might be lost
4. Removes workspace directory
5. Closes associated sessions
6. Updates dashboard

## Performance Optimizations

### Caching Strategy

Treq caches expensive git operations:

**Cached data**:
- File status (staged/unstaged)
- Commit divergence
- Branch information
- File diffs

**Cache invalidation**:
- After git operations
- On user-triggered refresh
- After configuration changes
- Maximum age (5 minutes)

### Lazy Loading

- Workspace data loaded on-demand
- Diffs generated only when viewed
- Terminal sessions created when opened

### Background Operations

Long-running operations run in background:
- Repository scanning
- Divergence calculation

## Settings & Configuration

### Repository Settings

Scoped by repository path:
- Branch naming pattern
- Default base branch
- Ignored file patterns

### Global Settings

Application preferences:
- Terminal preferences
- UI theme and layout
- Keyboard shortcuts
- Update preferences

## Limitations & Constraints

**Git limitations**:
- Can't check out same branch in multiple workspaces
- Workspace paths must be unique
- Requires Git 2.35+ for full features

**Treq limitations**:
- One repository at a time
- Workspaces must be in `.treq/workspaces/`
- Windows path length limits may apply

## Best Practices

1. **Regular cleanup**: Delete unused workspaces
2. **Consistent naming**: Use branch patterns
3. **Commit often**: Preserve work before operations
4. **Monitor size**: Large repos = large workspaces

## Learn More

- [Creating Workspaces Guide](/docs/guides/getting-started/your-first-workspace)
- [Merging Workspaces](/docs/guides/core-workflows/merging-workspaces)
- [Using with Git Repo](/docs/guides/core-workflows/using-treq-with-git-repo)
