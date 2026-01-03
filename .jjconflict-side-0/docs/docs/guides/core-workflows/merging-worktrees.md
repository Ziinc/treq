---
sidebar_position: 6
---

# Merging Worktrees

_How to merge worktree branches back into your main branch._

Merging combines changes from your worktree branch into a target branch (usually main). Treq provides a merge dialog that handles pre-merge checks, strategy selection, and conflict detection.

## Starting a Merge

Click the **Merge** button on any worktree in the dashboard, or right-click and select "Merge into..." The merge dialog shows the source branch (your worktree), target branch (where to merge), and pre-merge checks including uncommitted changes, branch divergence, and potential conflicts.

Before merging, ensure all changes are committed in your worktree, tests pass, and you've synced with the latest target branch. If your branch is behind main, merge main into your worktree first to handle any conflicts there: `git merge main`.

## Merge Strategies

Treq supports four merge strategies. **Regular merge** (default) creates a merge commit and preserves all commits from your branch—use this for most cases. **Squash merge** combines all commits into one, creating cleaner history but losing individual commit progression. **No fast-forward** always creates a merge commit even if the branch could fast-forward, useful for documentation purposes. **Fast-forward only** merges without a merge commit but fails if branches have diverged.

Select your strategy from the dropdown in the merge dialog, customize the commit message if desired, then click Merge.

## Handling Conflicts

Conflicts occur when the same lines were modified in both branches. Treq warns you before merging if conflicts are likely. If conflicts happen during merge, the operation pauses and you'll need to resolve them manually.

Conflicted files contain markers showing both versions:

```
<<<<<<< HEAD
their version
=======
your version
>>>>>>> treq/feature-branch
```

Edit the file to keep the correct code, remove all conflict markers, stage the resolved files with `git add`, and complete the merge with `git commit`. If conflicts are too complex, abort with `git merge --abort` and try again after updating your branch from main.

## Post-Merge Cleanup

After a successful merge, verify the result by checking the main branch log and running tests. Push to remote with `git push origin main`. You can then delete the worktree from the dashboard—this removes the worktree directory, sessions, and local branch. The remote branch remains and can be deleted separately with `git push origin --delete branch-name`.

## Troubleshooting

If the merge button is disabled, you likely have uncommitted changes in either the worktree or main repository. Commit or stash those changes first. If tests fail after merging, either revert the merge commit (`git revert -m 1 HEAD`) or reset to before the merge (`git reset --hard HEAD^`) and fix issues in your worktree before trying again.

## Next Steps

- [Pushing to Remote](../common-tasks/pushing-to-remote) — Share merged changes
- [Creating Worktrees](../common-tasks/creating-worktrees) — Start your next feature
- [Code Review Workflow](code-review-workflow) — Review before merging
