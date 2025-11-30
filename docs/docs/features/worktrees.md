---
sidebar_position: 1
---

# Worktrees

_Technical overview of Treq's worktree management system._

Treq enhances Git's native worktree functionality with visual management, metadata storage, and integrated tooling for working across multiple branches simultaneously. Treq uses the `.treq` directory to store and manage local state.

## How Git Worktrees Work

### Git Fundamentals

A Git worktree is an additional working directory linked to the same repository:

```
.git/               # Shared git directory
.treq/worktrees/
  ├── treq-feature-1/  # Worktree 1 (branch: treq/feature-1)
  ├── treq-bugfix-2/   # Worktree 2 (branch: treq/bugfix-2)
  └── ...
```

All worktrees share the same `.git` directory, with each worktree checking out a different branch. Changes in one worktree don't affect others, while Git objects (commits, refs) are shared across all worktrees. Treq extends this by abstracting away some of the Git complexity and overhead for managing and working with these worktrees.

## Treq's Enhancements

### Visual Management

Treq provides a dashboard interface showing all worktrees in use, branch names and status, commit divergence (ahead/behind), uncommitted changes indicator, and quick actions (open, merge, delete).

### Automated Workflows

**Post-create commands**: Treq allows you to configure commands that run automatically after creating a new worktree. For example, you might set up `npm install && npm run dev` to install dependencies and start a development server. These commands are stored per-repository, allowing different projects to have their own setup workflows.


**Branch naming patterns**: You can customize branch naming patterns to maintain consistency across your team. For instance, you might use a pattern like `treq/{name}` to prefix all branches created through Treq. The system automatically sanitizes branch names to ensure they comply with Git's naming requirements.

### Parallel Agent Terminals

Each worktree can have multiple terminal sessions with independent shell environments, persistent session history, and associated plans and metadata.

## Storage Structure

### Directory Layout

```
{repo}/
├── .git/                    # Shared git data
├── .treq/
│   ├── local.db             # SQLite database
│   ├── worktrees/
│   │   └── {branch-name}/   # Worktree directories
│   ├── plans/               # Implementation plans
│   └── .gitignore           # Ignore .treq folder
├── src/                     # Main repo files
└── ...
```

### Database Relationships

```
worktrees (1) ←→ (N) sessions
worktrees (1) ←→ (N) plans
worktrees (1) ←→ (N) file_views (for reviews)
```

## Lifecycle Management

### Creation Flow

1. User initiates creation (UI or CLI)
2. Treq validates branch name and path
3. Executes `git worktree add` command
4. Creates database entry
5. Runs post-create commands
6. Opens terminal session (optional)
7. Updates dashboard

### Update Flow

Treq polls for changes every 5 seconds:
1. Runs `git status` in worktree
2. Checks for uncommitted changes
3. Calculates divergence from base
4. Updates UI indicators
5. Caches results in database

### Deletion Flow

1. User initiates deletion
2. Treq checks for uncommitted changes
3. Warns if work might be lost
4. Removes worktree directory
5. Deletes database entry
6. Closes associated sessions
7. Updates dashboard

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

- Worktree data loaded on-demand
- Diffs generated only when viewed
- Terminal sessions created when opened

### Background Operations

Long-running operations run in background:
- Repository scanning
- Divergence calculation
- Post-create commands

## Git Integration Points

### Status Monitoring

Treq uses `git status --porcelain=v2`:

```bash
git status --porcelain=v2
```

**Parsed output**:
- Modified files (M)
- Added files (A)
- Deleted files (D)
- Renamed files (R)
- Untracked files (??)

### Branch Operations

**Get current branch**:
```bash
git rev-parse --abbrev-ref HEAD
```

**Calculate divergence**:
```bash
git rev-list --left-right --count main...treq/feature
```

Output: `5\t3` (5 ahead, 3 behind)

### Remote Tracking

**Get upstream branch**:
```bash
git rev-parse --abbrev-ref @{u}
```

**Fetch status**:
```bash
git fetch --dry-run
```

## Settings & Configuration

### Repository Settings

Stored in database, scoped by repository path:
- Branch naming pattern
- Post-create commands
- Default base branch
- Ignored file patterns

### Global Settings

Stored in application preferences:
- Terminal preferences
- UI theme and layout
- Keyboard shortcuts
- Update preferences

## Limitations & Constraints

**Git limitations**:
- Can't check out same branch in multiple worktrees
- Worktree paths must be unique
- Requires Git 2.35+ for full features

**Treq limitations**:
- One repository at a time
- Worktrees must be in `.treq/worktrees/`
- Windows path length limits may apply

## Best Practices

1. **Regular cleanup**: Delete unused worktrees
2. **Consistent naming**: Use branch patterns
3. **Commit often**: Preserve work before operations
4. **Monitor size**: Large repos = large worktrees
5. **Backup database**: Export `.treq/local.db` periodically

## Learn More

- [Creating Worktrees Guide](/docs/guides/common-tasks/creating-worktrees)
- [Merging Worktrees](/docs/guides/core-workflows/merging-worktrees)
- [Using with Git Repo](/docs/guides/core-workflows/using-treq-with-git-repo)
