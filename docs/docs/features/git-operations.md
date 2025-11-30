---
sidebar_position: 4
---

# Git Operations

Technical overview of how Treq executes and manages Git operations.

## Overview

Treq uses the Git CLI for all operations, parsing command output to provide visual feedback and caching results for performance.

## Architecture

### Why Git CLI?

Treq uses git commands instead of libgit2 because:

**Compatibility**: Works with any Git version 2.35+
**Features**: All Git features immediately available
**Reliability**: Well-tested, stable implementations
**Debugging**: Operations visible in logs
**Flexibility**: Easy to customize and extend

### Command Execution

**Rust backend** (`src-tauri/src/git_ops.rs`):

```rust
pub fn git_command(repo_path: &str, args: &[&str]) -> Result<String> {
    Command::new("git")
        .current_dir(repo_path)
        .args(args)
        .output()?
        .stdout
}
```

**Error handling**:
- Captures stderr
- Parses exit codes
- Returns user-friendly errors
- Logs detailed output

## Core Operations

### Status

**Command**:
```bash
git status --porcelain=v2
```

**Output format**:
```
1 .M N... 100644 100644 100644 abc123 def456 src/file.js
```

**Parsed fields**:
- Status code (1 = ordinary changed)
- XY (staging status)
- Submodule state
- Mode (file permissions)
- Object names (hashes)
- Path

**Polling**:
- Every 5 seconds when dashboard active
- On-demand when viewing worktree
- After git operations

### Diff Generation

**File diff**:
```bash
git diff src/file.js
```

**Staged diff**:
```bash
git diff --cached src/file.js
```

**Branch diff**:
```bash
git diff main...feature-branch
```

**Parsing**:
- Hunks extracted with context
- Line numbers calculated
- Binary files detected
- Large diffs truncated

### Staging

**Stage file**:
```bash
git add path/to/file
```

**Stage lines** (via patch):
```bash
git apply --cached <<EOF
diff --git a/file.js b/file.js
--- a/file.js
+++ b/file.js
@@ -10,0 +11,1 @@
+new line
EOF
```

**Unstage**:
```bash
git reset HEAD path/to/file
```

### Committing

**Create commit**:
```bash
git commit -m "commit message"
```

**Amend**:
```bash
git commit --amend -m "updated message"
```

**Validation before commit**:
- Message not empty
- At least one staged file
- No merge conflicts
- Not in detached HEAD

### Merging

**Regular merge**:
```bash
git merge --no-ff branch-name
```

**Squash merge**:
```bash
git merge --squash branch-name
git commit -m "message"
```

**Fast-forward only**:
```bash
git merge --ff-only branch-name
```

**Conflict detection**:
- Parses merge output
- Identifies conflicted files
- Extracts conflict markers

### Remote Operations

**Push**:
```bash
git push origin branch-name
```

**Pull**:
```bash
git pull origin branch-name
```

**Fetch**:
```bash
git fetch origin
```

**Authentication**:
- Uses system Git credentials
- Supports SSH keys
- Supports credential helpers
- HTTPS with stored credentials

## Caching Strategy

### What's Cached

**Git data**:
- File status (5 min TTL)
- Commit history (1 hour TTL)
- Branch info (5 min TTL)
- File diffs (until file changes)

**Cache storage**: SQLite database

```sql
CREATE TABLE git_cache (
  key TEXT PRIMARY KEY,
  value TEXT,
  expires_at TIMESTAMP
);
```

### Invalidation

Cache cleared when:
- Git operation completes
- User triggers refresh
- File system changes detected
- Cache expires (TTL reached)

**Smart invalidation**:
- Only invalidate affected data
- Batch invalidations
- Background refresh

### Performance Impact

**Without cache**:
- Every status check: ~50-200ms
- Dashboard with 5 worktrees: ~1s

**With cache**:
- Cached status: ~5ms
- Dashboard with 5 worktrees: ~50ms

## Branch Operations

### Divergence Calculation

**Command**:
```bash
git rev-list --left-right --count main...feature
```

**Output**: `5\t3`
- 5 commits ahead
- 3 commits behind

**Caching**: 5-minute TTL

### Remote Tracking

**Get upstream**:
```bash
git rev-parse --abbrev-ref @{u}
```

**Check if up-to-date**:
```bash
git fetch --dry-run 2>&1
```

Output indicates if pull needed.

### Branch Listing

**All branches**:
```bash
git branch -a
```

**Remote branches only**:
```bash
git branch -r
```

**Format**: Parsed to extract branch names and current branch indicator (`*`).

## File Operations

### Hunks

A **hunk** is a section of changed lines:

**Hunk header**:
```
@@ -10,6 +10,8 @@
```
- `-10,6`: Old file, line 10, 6 lines
- `+10,8`: New file, line 10, 8 lines

**Hunk extraction**:
1. Run `git diff`
2. Parse output
3. Split by hunk headers
4. Store with line numbers
5. Cache by file path

### Binary Detection

**Indicators**:
- File extension (`.png`, `.jpg`, `.pdf`)
- Git's `binary` attribute
- Unprintable characters in content

**Handling**:
- Show "Binary file" message
- Display file size change
- No line-by-line diff

### Large Files

For files >1MB:
- Warn before generating diff
- Offer "view anyway" option
- Consider using Git LFS

## Error Handling

### Common Errors

**"Not a git repository"**:
- Detection: Check for `.git` folder
- Recovery: Prompt to init or select different folder

**"Merge conflicts"**:
- Detection: Parse conflict markers
- Recovery: Guide user to resolve

**"Permission denied"**:
- Detection: Git exit code and stderr
- Recovery: Check file permissions

**"Remote rejected push"**:
- Detection: Parse push output
- Recovery: Suggest pull first

### Graceful Degradation

If git operations fail:
- Show cached data (if available)
- Disable affected features
- Display error in UI
- Log detailed error for debugging

## Performance Optimizations

### Concurrent Operations

**Safe to run in parallel**:
- Multiple status checks (different repos)
- Diff generation
- Log operations
- Read-only commands

**Must be sequential**:
- Staging + committing
- Merge operations
- Push/pull/fetch

**Implementation**: Queue system for sequential operations.

### Background Preloading

When dashboard loads:
1. Load worktree list (from DB)
2. Display immediately
3. Background: Fetch latest status
4. Update UI as results arrive

Perceived performance: `<100ms`

### Debouncing

**File watching**: 500ms debounce
- Prevents excessive status checks
- Batches rapid file changes

**UI updates**: 100ms debounce
- Smoother visual feedback
- Reduces flickering

## Settings

### Git Configuration

**User config** (uses system Git):
- Name: `git config user.name`
- Email: `git config user.email`
- Editor: `git config core.editor`

**Repo config** (Treq-specific):
- Ignored patterns
- Branch patterns
- Post-operation hooks

### Advanced

**Git path**: Custom git executable
**Timeout**: Max seconds for operations (default: 30)
**Retry**: Automatic retry count (default: 0)

## Limitations

**Requires Git CLI**: Git must be installed and in PATH
**Version dependency**: Some features need Git 2.35+
**Performance**: Large repos (>10GB) may be slow
**Windows line endings**: May require configuration

## Best Practices

1. **Keep Git updated**: Use latest stable version
2. **Configure credentials**: Set up SSH or credential helper
3. **Clean repos**: Remove large unnecessary files
4. **Regular fetches**: Stay synced with remote
5. **Avoid force operations**: Unless necessary

## Learn More

- [Using Treq with Git Repo](/docs/guides/core-workflows/using-treq-with-git-repo)
- [Staging and Committing](/docs/guides/core-workflows/staging-and-committing)
- [Merging Worktrees](/docs/guides/core-workflows/merging-worktrees)
