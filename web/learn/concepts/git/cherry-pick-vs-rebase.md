---
sidebar_position: 4
---

# Cherry-pick vs Rebase

## Introduction

`git cherry-pick` and `git rebase` both move commits from one place in Git's history to another, but they operate at different scopes and serve different purposes. Cherry-pick copies specific, individually named commits onto the current branch, leaving the originals in place. Rebase takes every commit on the current branch that its upstream does not have, and replays them all on top of a new base — moving the entire branch, not individual commits.

The problem developers face is reaching for the wrong tool: using cherry-pick where a full rebase is needed and ending up with duplicate commits scattered across branches that later cause confusing conflicts, or using rebase where cherry-pick is appropriate and inadvertently rewriting history that others depend on. Both mistakes create real pain downstream. Duplicate commits from cherry-pick cause false conflicts when branches eventually merge. Uncoordinated rebases of shared branches disrupt colleagues who have based local work on the old SHAs.

This article is for developers who need to move commits between branches or bring a branch up to date with upstream changes. After reading, you will understand what each command does mechanically, the scope difference that defines when each is appropriate, the duplicate commit problem that cherry-pick creates when used in the wrong context, the golden rule that determines when rebase is safe, and concrete guidance on the canonical use cases: backporting a fix to a release branch, recovering a misplaced commit, updating a feature branch, and cleaning up history before opening a PR.

## Understanding the Concept

`git cherry-pick <commit>` takes a specific commit — identified by its SHA — and applies the changes that commit introduced onto the tip of the current branch. Git computes the diff the original commit introduced and re-applies it as a new commit, with a new SHA but the same commit message and authorship. The original commit is untouched. Cherry-pick is surgical: you choose exactly which commits to transplant.

```
Before cherry-pick:
main:         A - B - C - D
                          ^
                     fix-123 is commit C

release/2.3:  A - X - Y

After: git checkout release/2.3 && git cherry-pick C

main:         A - B - C - D     (unchanged)
release/2.3:  A - X - Y - C'    (C' has the same diff as C, but a new SHA)
```

`git rebase <upstream>` takes every commit on the current branch that is not on `<upstream>` and replays them all in order on top of `<upstream>`. The original commits are abandoned and replaced with new commits — same diffs, new SHAs. The branch is re-attached to a new starting point, and the old commits disappear from the branch's history (though they remain in the object database until garbage collection).

```
Before rebase:
main:      A - B - C - D - E
feature:   A - B - F - G

After: git checkout feature && git rebase main

main:      A - B - C - D - E
feature:                    F' - G'    (F' and G' are new commits with new SHAs)
```

The scope difference is the essential distinction. Cherry-pick operates on specific commits you name explicitly. Rebase operates on a branch — specifically, everything that branch contains that its upstream does not. A useful side-by-side comparison:

| | Cherry-pick | Rebase |
|---|---|---|
| Scope | Specific named commits | All commits on branch since divergence |
| Original commits | Left in place on their branch | Abandoned, replaced with new SHAs |
| Typical use | Moving isolated changes across branches | Updating a branch to a new base |
| History effect | Adds new commits on top of current HEAD | Rewrites the branch from a new starting point |
| Duplicate commits created | Yes, if branches later merge | No |

## Applying It in Practice

Cherry-pick is the canonical tool for backporting. A security fix committed on `main` needs to land on a `v2.3-stable` release branch without pulling in everything else that has accumulated on `main` since the release branched:

```bash
# Find the exact commit SHA on main
git log --oneline main | grep "fix: XSS vulnerability"
# Output: a3f9c12 fix: XSS vulnerability in user input handler

# Apply only that commit to the release branch
git checkout release/v2.3
git cherry-pick a3f9c12
```

Cherry-pick is also the right tool when a commit landed on the wrong branch. If you committed to `feature-a` but the work belongs on `feature-b`:

```bash
# Copy the commit to the correct branch
git checkout feature-b
git cherry-pick <SHA>

# Remove it from the wrong branch
git checkout feature-a
git revert <SHA>    # Preferred if already pushed; creates a new revert commit
# Or: git reset HEAD~1  # If not yet pushed; discards the commit cleanly
```

Rebase is the right tool for keeping a feature branch current with `main`. After several days of development on a feature branch, `main` has moved forward:

```bash
git checkout feature/my-work
git fetch origin
git rebase origin/main
# Your commits are replayed on top of the latest origin/main
```

This replays your commits on top of current `main`, so your branch is up to date and can merge cleanly. Rebasing before opening a PR is standard practice — it removes the noise of stale merge history and keeps the diff focused on your changes alone.

Interactive rebase (`git rebase -i`) adds the ability to reorder, squash, rename, or drop commits during the replay, making it a powerful tool for polishing local history before sharing:

```bash
git rebase -i origin/main
# Editor opens showing your commits; mark with 's' to squash, 'r' to rename, 'd' to drop
```

After any rebase, a force-push is required because the SHAs have changed. Use `--force-with-lease` rather than `--force` to avoid overwriting work others may have pushed since your last fetch:

```bash
git push --force-with-lease origin feature/my-work
```

## Engineering Decision Guide

Cherry-pick is the right choice when you need to move a specific, bounded change across branches — a bug fix to a release branch, a useful commit from a stale PR, a commit that was made on the wrong branch. Its selectivity is its value: it does not touch anything you did not explicitly name.

The cost of cherry-pick is the duplicate commit problem. The same logical change now exists in two branches with different SHAs. If those two branches are ever merged together, Git sees the changes as different commits — because they have different SHAs — even though they introduce the same diff. This can produce redundant commits in the combined history or, worse, conflicts where Git cannot automatically resolve what is actually the same underlying change. For this reason, cherry-pick is appropriate for permanent cross-branch propagation (a backport that will never be merged back into the source branch) but is the wrong choice for temporarily sharing work between branches that will eventually converge.

Rebase is the right choice when you want to update a branch to a new base or when you want to linearize history before merging. It is the workhorse of modern Git workflows that prioritize clean, readable history. The critical constraint is the golden rule of rebase: do not rebase commits that have been pushed to a branch that others have checked out or based work on. Rebase rewrites SHAs, and anyone who has the old SHAs in their local history now has a divergence from the rewritten remote branch. Resolving this requires a `git pull --rebase` or a rebase of their own, and in the worst case — if they have committed on top of the old SHAs — work can be lost or duplicated.

Rebase is safe on private branches: branches you have not pushed yet, or branches where you are the sole author and you are certain no colleague has based local work on them. On shared branches — `main`, long-lived feature branches with multiple contributors — do not rebase. The recommendation: use cherry-pick for targeted backports and isolated cross-branch patches; use rebase for updating your local feature branch and for preparing PRs. Avoid cherry-picking changes between branches that will later merge.

## Scaling & Operational Considerations

The duplicate commit problem is the most significant failure mode in cherry-pick-heavy workflows. Teams that routinely cherry-pick the same fixes across many release branches accumulate a proliferating set of commits representing the same logical change. When audit or bisect is needed later, the history is cluttered. When two cherry-picked branches eventually merge, Git may generate conflicts on changes that are semantically identical. The operational discipline is: treat cherry-picked commits as permanently diverging. If you plan for the source and destination branches to converge, rebase or merge rather than cherry-pick.

A common team mistake with rebase is running it on a branch that has already been pushed and that a colleague has based local work on. The result is that the colleague's local branch diverges from the remote after the force-push. Recovery requires them to run `git rebase origin/<branch>` or `git pull --rebase` to align with the rewritten history, and if they have uncommitted work or additional commits of their own, the situation is worse. On teams, the policy should be explicit: rebase is safe locally on private branches, and any rebase of a remote branch requires team communication before the force-push.

Interactive rebase (`git rebase -i`) is powerful but carries its own operational risks. Squashing a commit that a colleague referenced in a PR comment, or reordering commits that an automated test suite depends on in sequence, creates confusion and potential breakage. Limit interactive rebase to local, unpushed history, and do not use it to rewrite commits that are already under review.

When a rebase produces a conflict, Git pauses at the conflicting commit and lets you resolve it before continuing. The pattern is: resolve the conflict, `git add` the resolution, then `git rebase --continue`. If the conflict is too complex or the rebase was a mistake, `git rebase --abort` returns the branch to its exact pre-rebase state cleanly. Never force-push a rebase result without verifying the conflict resolution is correct — pushing a misresolved rebase corrupts the remote branch for every colleague who has it checked out.

## Next Steps

- [Merge vs Rebase](./merge-vs-rebase) — how merge and rebase produce different history shapes, and when each is appropriate at the team level, including the golden rule of rebase in full context
- [What are Stacked PRs?](./stacked-prs) — how stacked PRs use rebase as the mechanism for keeping a chain of branches current with each other, and what the cascade looks like in practice
- [Stacked PR Workflow](/learn/workflows/git/stacked-pr) — a practical guide to managing the rebase cascade in a stacked pull request workflow, including tooling that automates it
