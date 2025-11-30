---
sidebar_position: 2
---

# Pushing to Remote

Learn how to push your committed changes to remote repositories.

- Pushing commits to remote
- Setting up tracking branches
- Force push considerations
- Handling push errors
- Best practices for remote sync

## Basic Push

### First Push (New Branch)

For branches not yet on remote:

```bash
git push -u origin treq/your-branch
```

The `-u` flag sets up tracking, so future pushes just need:
```bash
git push
```

### Subsequent Pushes

After first push:
```bash
git push
```

## In Treq Dashboard

**From Worktree Card**:
1. Click the push icon (↑)
2. Or right-click → **"Push"**

**Status indicators**:
- **↑2**: 2 commits ahead (need to push)
- **↓3**: 3 commits behind (need to pull)
- **↑2 ↓3**: Both ahead and behind (sync needed)

## Handling Push Rejections

### "Updates were rejected"

**Cause**: Remote has commits you don't have

**Solution**:
```bash
# Option 1: Pull and merge
git pull origin treq/your-branch

# Option 2: Pull and rebase
git pull --rebase origin treq/your-branch
```

Then push again.

### Authentication Issues

**HTTPS**: Configure credential helper
```bash
git config --global credential.helper store
```

**SSH**: Ensure key is added
```bash
ssh-add ~/.ssh/id_rsa
```

## Force Push

**⚠️ Dangerous!** Only force push when:
- You rebased your own branch
- Fixing mistakes in unpushed commits
- **Never** on shared/main branches

```bash
git push --force-with-lease origin treq/your-branch
```

`--force-with-lease` is safer than `--force`

## Best Practices

1. **Push Often**: Don't let local diverge too far
2. **Pull Before Push**: Sync with remote first
3. **Never Force Main**: Protect important branches
4. **Check Status**: Verify what's being pushed
5. **Communicate**: Tell team if force pushing shared branch

## Troubleshooting

**"Permission denied"**: Check authentication
**"Non-fast-forward"**: Pull first, then push
**"Remote contains work"**: Someone pushed, pull and merge

## Next Steps

- [Merging Worktrees](../core-workflows/merging-worktrees)
- [Using Treq with Git Repo](../core-workflows/using-treq-with-git-repo)
