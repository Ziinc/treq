---
sidebar_position: 3
---

# Discarding Changes

Learn how to safely discard unwanted changes in your worktrees.

- Understanding discard vs unstage
- Discarding file changes
- Discarding all changes
- Recovery options
- Safety considerations

## Discard vs Unstage

**Unstage**: Move from staged to unstaged (changes preserved)
**Discard**: Permanently delete changes (⚠️ cannot undo!)

## Discarding Single File

### In Diff Viewer

1. Right-click on file in unstaged section
2. Select **"Discard Changes"**
3. Confirm the action

**Keyboard**: Select file and press `Delete`

### In Terminal

```bash
git checkout -- file.js
```

**What happens**: File reverts to last committed state

## Discarding All Changes

**In Treq**:
1. Click **"Discard All"** button
2. Review list of affected files
3. Confirm (are you sure?)

**In Terminal**:
```bash
git checkout -- .
```

## Discarding Specific Lines

**Not directly supported** - must discard entire file

**Workaround**:
1. Stage lines you want to keep
2. Discard unstaged changes
3. Unstage to continue working

## Partial Discard Strategy

To keep some changes, discard others:

1. **Stage what you want to keep**
2. **Discard unstaged** (what you don't want)
3. **Unstage** to continue editing

## Safety Tips

1. **Review First**: Check diff before discarding
2. **Stage First**: Stage anything uncertain
3. **Commit Often**: Committed work is safe
4. **Use Stash**: `git stash` instead of discard if unsure

## Recovery Options

### If Just Discarded

**No direct undo** - changes are lost

**Possible recovery**:
- Check editor's local history (VS Code, IntelliJ)
- Look for auto-save copies
- Git reflog (if changes were committed previously)

### Before Discarding

**Create safety net**:
```bash
# Stash instead
git stash push -m "backup before discard"

# Or commit to temp branch
git checkout -b temp-backup
git add .
git commit -m "temp backup"
git checkout original-branch
```

## Best Practices

1. **Double-Check**: Always review what's being discarded
2. **Stash Over Discard**: Safer for temporary removal
3. **Small Discards**: Discard files individually when possible
4. **Commit Often**: Makes discard less risky
5. **Test First**: Ensure changes aren't needed

## Troubleshooting

**Can't discard**: File might be in use or have permissions issue
**Changes remain**: Try `git clean -fd` for untracked files (⚠️ dangerous!)

## Next Steps

- [Staging and Committing](../core-workflows/staging-and-committing)
- [Moving Files Between Worktrees](moving-files-between-worktrees)
