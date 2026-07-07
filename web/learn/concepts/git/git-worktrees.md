---
sidebar_position: 1
---

# What are Git Worktrees?

A Git worktree is an additional working directory linked to the same repository. Where a standard Git repository has one working tree (the directory where you check out files and run your editor), `git worktree add` creates a second — or third, or tenth — each with its own branch checked out, while sharing the same underlying `.git` directory and all its history.

## The problem worktrees solve

Switching branches in Git means changing every tracked file in your working directory. If you're mid-task on a feature branch and need to check out a hotfix branch, you have to stash or commit your work first. That context-switching overhead accumulates.

Worktrees let you have both branches checked out at once in separate directories. You can compile, run tests, or review code on one branch without touching another.

## How worktrees work

```bash
# Create a new worktree at ../hotfix checking out a branch
git worktree add ../hotfix origin/main -b hotfix/critical-bug

# List all worktrees
git worktree list

# Remove a worktree when done
git worktree remove ../hotfix
```

Each worktree is a directory on disk with:
- Its own checked-out files
- Its own `HEAD` (pointing to its branch)
- Its own index (staging area)

All worktrees share the objects, refs, and config in the `.git` directory of the main repository. A commit made in one worktree is immediately visible in all others.

## Constraints

- **One branch per worktree**: you cannot check out the same branch in two worktrees simultaneously. Git enforces this to prevent diverging `HEAD` states on the same branch.
- **Shared stash**: the stash is shared across all worktrees. Stashing in one worktree and popping in another works, though it's rarely intentional.
- **Hooks run per worktree**: pre-commit and other hooks run in the context of the worktree triggering the operation.

## When to use worktrees

- Reviewing a colleague's PR while keeping your own work in progress
- Running a long test suite on one branch while continuing development on another
- Keeping a stable branch checked out for reference while writing experimental code
- Giving each AI coding agent its own isolated workspace without the overhead of a full clone

## Related concepts

- [Git Worktrees vs Clones](./git-worktrees-vs-clones)
- [What are Stacked PRs?](./stacked-prs)
