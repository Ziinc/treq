---
sidebar_position: 4
---

# Moving Files Between Worktrees

Learn how to transfer uncommitted changes from one worktree to another.

- Why move files between worktrees
- Using Treq's move feature
- Manual file transfer methods
- Recovery from mistakes
- Best practices

## When to Move Files

**Common scenarios**:
- Started work in wrong worktree
- Want to split changes into multiple branches
- Realized changes belong elsewhere
- Experimenting with different approaches

## Using Treq's Move Feature

### Step-by-Step

**Step 1: Select Files**

In the source worktree's diff viewer:
1. Select files in unstaged section
2. Click multiple with `Cmd/Ctrl+Click`
3. Or range select with `Shift+Click`

**Step 2: Initiate Move**

- Right-click selected files
- Choose **"Move to Worktree..."**
- Or click **"Move"** button in toolbar

**Step 3: Select Destination**

- Dropdown shows all other worktrees
- Select target worktree
- Click **"Move Files"**

**Step 4: Verify**

- Files disappear from source
- Appear in destination worktree
- Check destination to confirm

### What Gets Moved

**Moved**:
- Unstaged changes
- File modifications
- New files

**Not moved**:
- Staged changes (unstage first)
- Committed changes
- Untracked files outside git

## Manual File Transfer

### Using Git Stash

**In source worktree**:
```bash
# Stash changes
git stash push -m "moving to other worktree"
```

**In destination worktree**:
```bash
# Apply stash
git stash pop stash@{0}
```

### Copy Files Directly

**Be careful** - can cause issues:

```bash
# Copy from source to destination
cp /path/to/source/file.js /path/to/dest/file.js
```

**Then in destination**:
```bash
git add file.js
```

**Problems**:
- Might overwrite destination changes
- Git might not detect properly
- Easy to make mistakes

## Moving Specific Changes

### Line-Level Move

Treq doesn't support line-level moves directly.

**Workaround**:
1. Stage lines you DON'T want to move
2. Move unstaged (lines you do want)
3. Unstage remaining in source

### Hunk-Level Move

Similar to line-level - use staging to control what moves.

## Recovery from Mistakes

### Moved Wrong Files

**If not yet committed in destination**:
1. Discard in destination
2. Check source's stash or reflog
3. Restore from there

**If already committed**:
1. Reset commit in destination
2. Move files back
3. Re-organize properly

### Lost Changes

Check:
1. Git stash in both worktrees
2. Treq's undo (if available)
3. Git reflog
4. Editor's local history

## Best Practices

1. **Commit First**: Commit in source, then cherry-pick to destination
2. **Test Destinations**: Ensure target worktree is correct
3. **One at a Time**: Move files incrementally
4. **Verify**: Check both source and destination after
5. **Use Git**: Prefer git stash over direct copy

## Alternative: Commit and Cherry-Pick

**More reliable method**:

**In source**:
```bash
git add files-to-move
git commit -m "temp: changes to move"
```

**In destination**:
```bash
git cherry-pick source-branch-commit-hash
```

**In source**:
```bash
git reset HEAD~1  # Undo commit, keep changes
```

## Troubleshooting

**Files not appearing**: Check git status in destination
**Conflicts during move**: Resolve manually in destination
**Move cancelled**: Operation rolled back, check stash

## Next Steps

- [Creating Worktrees](creating-worktrees)
- [Staging and Committing](../core-workflows/staging-and-committing)
- [Discarding Changes](discarding-changes)
