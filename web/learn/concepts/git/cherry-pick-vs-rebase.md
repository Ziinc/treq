---
sidebar_position: 4
---

# Cherry-pick vs Rebase

`git cherry-pick` and `git rebase` both apply existing commits to a different base, but they serve different purposes and produce different results. Choosing the wrong one for a given situation creates unnecessary history noise or breaks expectations downstream.

## What each command does

**`git cherry-pick <commit>`** copies a specific commit — or range of commits — onto the current branch. The original commits remain untouched on their original branch. Cherry-pick is selective: you choose exactly which commits to transplant.

**`git rebase <upstream>`** moves an entire branch by replaying its commits on top of a new base. Rebase rewrites the commits on your current branch so they appear to start from `<upstream>` instead of wherever they originally branched from.

## The key difference: scope

| | Cherry-pick | Rebase |
|---|---|---|
| Scope | Specific commits you name | All commits on the current branch since it diverged |
| Original commits | Left in place | Replaced with new commits (same changes, new SHAs) |
| Typical use | Moving isolated fixes across branches | Updating a branch to include recent upstream changes |
| History shape | Adds commits on top of current HEAD | Reattaches the branch at a new base point |

## When to use cherry-pick

**Backporting a fix**: a bug was fixed on `main`, and you need that fix on a `v2.3-stable` release branch. Cherry-pick copies exactly the fix commit without bringing along everything else that landed on `main` after the branch diverged.

**Recovering a commit landed on the wrong branch**: if you committed to `feature-a` but the commit belongs on `feature-b`, cherry-pick it across and revert on the original branch.

**Applying a patch from a stale PR**: a contributor's PR won't merge cleanly, but a specific commit in it is useful. Cherry-pick that commit rather than resolving the full merge.

## When to use rebase

**Keeping a feature branch up to date**: your feature branch diverged from `main` three weeks ago and main has moved on. Rebase replays your commits on top of the current `main` so your branch is up to date and can merge cleanly.

**Preparing a PR for review**: rebasing onto the latest `main` before opening a PR keeps the diff focused on your changes and avoids noise from merge commits.

**Linearising history**: rebase produces a straight line of commits instead of a merge bubble, which makes `git log` and `git bisect` easier to read.

## Risks of each

Cherry-pick creates duplicate commits — the same logical change exists in multiple branches with different SHAs. If those branches ever merge together, the change appears twice or causes confusing conflicts.

Rebase rewrites commits. If other people have already based work on your branch, rewriting it disrupts their history. The rule of thumb: don't rebase commits that have been pushed to a shared branch.

## Related concepts

- [Merge vs Rebase](./merge-vs-rebase)
- [What are Stacked PRs?](./stacked-prs)
