---
sidebar_position: 5
---

# Merge vs Rebase

`git merge` and `git rebase` both integrate changes from one branch into another, but they produce different history shapes and carry different implications for collaboration. Which one to use depends on what you want your repository history to record.

## What each command does

**`git merge <branch>`** creates a new merge commit that joins two lines of history. Both branches remain in the history as distinct lines that converge at the merge point.

**`git rebase <upstream>`** moves your commits to start from the tip of `<upstream>`, rewriting their SHAs in the process. The result is a linear history as if you had started your branch from the current tip of `<upstream>`.

## Visual comparison

Before, both commands start from the same state:

```
main:    A - B - C
                  \
feature:           D - E
```

**After `git merge main` from feature:**
```
main:    A - B - C -------
                  \       \
feature:           D - E - M   (M is the merge commit)
```

**After `git rebase main` from feature:**
```
main:    A - B - C
                  \
feature:           D' - E'     (D' and E' are new commits with new SHAs)
```

## How they differ in practice

| | Merge | Rebase |
|---|---|---|
| History shape | Preserves divergence; creates merge commits | Linear; rewrites commits |
| Original commits | Unchanged | Replaced with new SHAs |
| Conflict resolution | Once, at merge time | Once per replayed commit |
| Traceability | Exact record of when branches joined | Cleaner log; divergence is invisible |
| Safe on shared branches | Yes | Only safe if you're the only one working on the branch |

## Arguments for merge

**Preserves intent**: the merge commit records the exact point when a feature was integrated. You can `git log --merges` to see the integration history.

**Non-destructive**: merge never rewrites existing commits. Collaborators who have based work on your branch are not disrupted.

**Simpler mental model**: merge doesn't require understanding commit rewriting or force-push behaviour.

## Arguments for rebase

**Cleaner history**: `git log` shows a straight line of commits instead of a tangle of merge bubbles. `git bisect` and `git blame` are easier to use on linear history.

**Smaller, more focused diffs**: rebasing before opening a PR keeps the diff focused on your changes; merge commits add noise.

**Integration-friendly**: many teams prefer to land changes through a rebase-and-merge (or squash-and-merge) strategy to keep `main` linear.

## The golden rule of rebase

Never rebase a branch that others have checked out or based work on. Rebase rewrites commits, changing their SHAs. Anyone else who has the old SHAs in their history now has a divergence from the new history, which requires a `git pull --force` or a rebase of their own to resolve.

The safe use of rebase is on private branches — branches you haven't pushed, or branches where you're the only author.

## Combining both: rebase then merge

A common workflow uses both:
1. Rebase your feature branch onto the latest `main` to keep it current and resolve conflicts commit-by-commit
2. Merge (or squash-merge) the rebased branch into `main` to record the integration

This gives you the conflict-resolution clarity of rebase and the integration traceability of merge.

## Related concepts

- [Cherry-pick vs Rebase](./cherry-pick-vs-rebase)
- [What are Stacked PRs?](./stacked-prs)
- [What are Git Worktrees?](./git-worktrees)
