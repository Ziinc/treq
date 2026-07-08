---
sidebar_position: 1
---

# What are Git Worktrees?

## Introduction

A Git worktree is an additional working directory linked to the same Git repository — a way to have multiple branches checked out simultaneously in separate directories on disk, without cloning the repository again. The standard Git model gives you one working tree: a single directory where your files live and where you run your editor. When you need to switch branches, every tracked file in that directory changes. Git worktrees break that one-to-one relationship between "repository" and "working directory."

The problem this solves is context-switch overhead. When you are mid-task on a feature branch and a colleague flags an urgent hotfix, you must either stash your work, commit something half-finished, or lose your editor state to check out a different branch. That friction accumulates across a workday. For developers running AI coding agents, the problem is even more acute: a single working directory is a bottleneck when you want multiple agents to work in parallel on the same codebase.

This article is for developers who regularly switch between branches, run parallel workstreams, or want to understand how Git worktrees differ from simply cloning a repository twice. After reading, you will understand how `git worktree add`, `git worktree list`, and `git worktree remove` work, how the shared `.git` directory model functions, what the one-branch-per-worktree constraint means in practice, and which use cases genuinely benefit from worktrees versus which call for a different approach.

## Understanding the Concept

Git has always separated the "working tree" — the directory where your files live on disk — from the `.git` directory that stores the object database, refs, and configuration. When you run `git worktree add`, you ask Git to create an additional working tree: a new directory with its own checked-out files, its own `HEAD` reference pointing to a branch, and its own staging index. What it does not create is a new object database. Every worktree shares the same `.git` directory, and therefore the same commit history, the same branches, the same tags, and the same remote configuration.

The mental model that helps most is: imagine you have one filing cabinet (`.git`) and multiple desks (worktrees). Each desk holds a different project folder — a different branch checked out — but they all draw from the same filing cabinet. A document filed from any desk is immediately available at every other desk without needing to be copied.

Key terminology: the "main worktree" is the original directory where you cloned or initialized the repository. "Linked worktrees" are additional directories created with `git worktree add`. Each worktree has an entry in `.git/worktrees/` that tracks which branch or commit it points to. The "index" — the staging area — is per-worktree, so changes staged in one worktree do not appear in another.

The one-branch-per-worktree constraint is enforced by Git itself: you cannot check out the same branch in two worktrees simultaneously. Git enforces this to prevent two directories from having diverging HEAD states on the same branch, which would make it impossible to know which one represents the branch's actual state. The practical implication is that each worktree must have a unique branch — you create a new branch for each new worktree, or use an existing branch that is not already checked out elsewhere.

The stash is a per-repository construct and is shared across all worktrees. Stashing in one worktree and popping in another is technically valid, though it is rarely intentional. Hooks run per-worktree: a pre-commit hook defined in the repository runs in the context of whichever worktree triggers the commit. Worktrees were introduced in Git 2.5 (2015) and are available in any modern Git installation.

## Applying It in Practice

The three core commands are `git worktree add`, `git worktree list`, and `git worktree remove`.

```bash
# Create a new worktree at ../hotfix, checking out a new branch based on origin/main
git worktree add ../hotfix -b hotfix/critical-bug origin/main

# List all active worktrees with their paths and branches
git worktree list

# Remove a worktree when finished
git worktree remove ../hotfix
```

A realistic scenario: you are on `feature/auth` with uncommitted changes. A colleague pushes a hotfix branch and asks you to review it. Instead of stashing, you run `git worktree add ../review-hotfix origin/hotfix/payment-fix`. You open `../review-hotfix` in your editor or run its test suite, while `feature/auth` in your main directory is untouched — your editor state, terminal history, and staged changes all remain exactly where you left them. When the review is done, `git worktree remove ../review-hotfix` cleans up the directory.

For AI coding agents, the pattern is to provision each agent its own worktree before it starts work:

```bash
# Provision worktrees for two agents working in parallel
git worktree add ../agent-1-workspace -b agent/task-1 main
git worktree add ../agent-2-workspace -b agent/task-2 main
```

Each agent operates in its own directory, writes its own files, runs its own tests, and commits to its own branch — while all agents share the same object store. A commit made by agent-1 is immediately visible to the host process without a push-and-fetch cycle, because all worktrees read from the same `.git` object database.

Best practice: name worktree directories clearly and consistently, especially when spinning up many of them. A convention like `../<repo-name>-<branch-slug>` makes it easy to understand what each directory is for at a glance. Always remove worktrees with `git worktree remove` rather than deleting directories manually, because Git tracks linked worktrees in `.git/worktrees/` and stale entries cause warnings and block recreating a worktree at the same path.

## Engineering Considerations

The primary benefit of worktrees over the naive alternative — stash and switch — is that they eliminate stashing entirely and allow genuinely parallel work. You can run a test suite in one worktree while editing code in another, and neither operation affects the other. The shared object store means you pay no disk cost for history: only the working tree files are duplicated, not the entire commit database.

The main trade-off is the one-branch-per-worktree constraint. Attempting to add a worktree for a branch that is already checked out fails with a clear error. This is intentional design, not a limitation to work around. The practical workaround is always to create a new branch for each worktree, which is usually desirable behavior anyway.

Worktrees are the right choice when you need to work on multiple branches of the same repository concurrently, want to avoid the disk and setup overhead of a full clone, or are orchestrating multiple AI agents on the same codebase. They are not the right choice when you need independent Git configuration per environment. The shared `.git` directory means all worktrees share config, hooks, and remotes. If you need different remote credentials, different hook behavior, or want to guard one environment from another at the Git configuration level, a full clone gives you that independence. See [Git Worktrees vs Clones](./git-worktrees-vs-clones) for a detailed comparison.

For the most common use cases — parallel branch development, agent isolation, reviewing a PR while keeping local work in progress — worktrees are more efficient than clones and the right default choice.

## Scaling & Operational Considerations

The most common failure mode is accumulating stale worktrees. When a directory is deleted manually without `git worktree remove`, Git still tracks the worktree entry in `.git/worktrees/`. This causes warnings on subsequent Git operations and blocks recreating a worktree at the same path. The fix is `git worktree prune`, which removes entries whose directories no longer exist on disk.

```bash
# Clean up stale worktree entries after manual directory deletion
git worktree prune
```

Attempting to check out the same branch in two worktrees is another common mistake, especially in automation. The error message from Git is clear, but scripts that create worktrees from branch names can hit this when branch names collide across concurrent tasks. Using unique branch names per task — or per agent — avoids this entirely. A naming convention that includes a timestamp or task ID makes collisions structurally impossible.

The shared stash is a subtler issue. Teams that adopt worktrees to avoid stashing should adopt a policy of not using `git stash` when worktrees are in play. The whole point of worktrees is to have separate directories for separate concerns — stashing undermines that by mixing state across the shared repo.

At scale — an orchestration system spinning up dozens of worktrees for parallel agents — directory management becomes a real operational concern. Each worktree is a directory entry and a `.git/worktrees/` record. Scripts that create worktrees must include cleanup logic. If a process exits abnormally, `git worktree prune` should be part of the recovery routine, not an afterthought.

Security note: all worktrees share the same hooks. A pre-commit hook change in the main worktree affects every concurrent linked worktree immediately. In agent orchestration scenarios where agents may run untrusted code, this shared hook behavior should be understood and designed for explicitly.

The most common misconception is that worktrees and clones are interchangeable. They are not: a worktree is a view into a single repository, while a clone is a separate repository. The difference in isolation model, disk usage, and credential handling means the choice between them matters in practice.

## Next Steps

- [Git Worktrees vs Clones](./git-worktrees-vs-clones) — detailed comparison of when each approach gives you better isolation, performance, or simplicity, including guidance for AI agent setups
- [What are Stacked PRs?](./stacked-prs) — how to break large features into a chain of reviewable pull requests, a natural complement to parallel development with worktrees
- [Parallel Development Workflow](/learn/workflows/git/parallel-development) — step-by-step guide to setting up and running multiple branches concurrently using worktrees
- [What are Coding Agents?](/learn/concepts/ai-engineering/coding-agents) — how AI coding agents use worktrees to operate in parallel on the same codebase without interfering with each other
