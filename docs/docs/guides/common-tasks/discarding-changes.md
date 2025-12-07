---
sidebar_position: 3
---

# Discarding Changes

_How to safely discard unwanted changes._

**Unstaging** moves files from staged to unstaged—changes are preserved. **Discarding** permanently deletes changes and cannot be undone.

## Discarding Files

In the diff viewer, right-click a file in the unstaged section and select **Discard Changes**, or select the file and press `Delete`. In the terminal, use `git checkout -- filename`. The file reverts to its last committed state.

To discard all changes, click **Discard All** and confirm. In the terminal: `git checkout -- .`

## Partial Discards

Treq doesn't support discarding specific lines directly. As a workaround: stage the lines you want to keep, discard unstaged changes, then unstage to continue working.

## Recovery

There's no direct undo for discarded changes. Check your editor's local history (VS Code, IntelliJ), look for auto-save copies, or check git reflog if changes were previously committed.

Before discarding uncertain changes, create a safety net with `git stash push -m "backup"` or commit to a temporary branch.

## Best Practices

Review the diff before discarding. Prefer stashing over discarding when unsure—you can always drop the stash later. Discard files individually when possible rather than all at once. Commit often so discards are less risky.

## Next Steps

- [Staging and Committing](../core-workflows/staging-and-committing)
- [Moving Files Between Worktrees](moving-files-between-worktrees)
