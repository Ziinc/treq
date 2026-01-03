---
sidebar_position: 4
---

# Moving Files Between Worktrees

_How to transfer uncommitted changes from one worktree to another._

Use this when you started work in the wrong worktree, want to split changes into multiple branches, or realize changes belong elsewhere.

## Using Treq's Move Feature

In the source worktree's diff viewer, select files in the unstaged section (use `Cmd/Ctrl+Click` for multiple or `Shift+Click` for ranges). Right-click and choose **Move to Worktree** or click the **Move** button. Select the destination worktree from the dropdown and click **Move Files**.

Only unstaged changes are moved. Staged and committed changes must be unstaged or handled separately.

## Using Git Stash

For more control, use git stash:

```bash
# In source worktree
git stash push -m "moving to other worktree"

# In destination worktree
git stash pop stash@{0}
```

## Commit and Cherry-Pick

The most reliable method: commit your changes in the source, cherry-pick in the destination, then reset the source:

```bash
# In source
git add files-to-move && git commit -m "temp: changes to move"

# In destination
git cherry-pick <commit-hash>

# In source (to undo the commit but keep changes)
git reset HEAD~1
```

## Recovery

If you moved the wrong files and haven't committed in the destination, discard there and check the source's stash or reflog. If already committed, reset the commit in the destination and move files back.

## Next Steps

- [Staging and Committing](../core-workflows/staging-and-committing)
- [Discarding Changes](discarding-changes)
