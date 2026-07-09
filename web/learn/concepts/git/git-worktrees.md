---
sidebar_position: 1
---

# What are Git Worktrees?

## Introduction

A Git worktree is an additional working directory linked to the same Git repository — a way to have multiple branches checked out simultaneously in separate directories on disk, without cloning the repository again. The standard Git model gives you one working tree: a single directory where your files live and where you run your editor. When you need to switch branches, every tracked file in that directory changes. Git worktrees break that one-to-one relationship between "repository" and "working directory."

The problem this solves is context-switch overhead. When you are mid-task on a feature branch and a colleague flags an urgent hotfix, you must either stash your work, commit something half-finished, or lose your editor state to check out a different branch. That friction accumulates across a workday. For developers running AI coding agents, the problem is more acute still: a single working directory is a bottleneck when you want multiple agents to work in parallel on the same codebase.

This article is for developers who regularly switch between branches, run parallel workstreams, or are evaluating modern approaches to multi-branch development. It compares Git worktrees with Jujutsu workspaces, a newer alternative built on the same underlying object model that solves the same problem through a fundamentally different mental model. After reading, you will understand how `git worktree add`, `git worktree list`, and `git worktree remove` work, how Jujutsu's `jj workspace` commands compare, what the practical differences are in day-to-day use, and which approach better fits your situation.

## Understanding the Concept

Git has always separated the "working tree" — the directory where your files live on disk — from the `.git` directory that stores the object database, refs, and configuration. When you run `git worktree add`, you ask Git to create an additional working tree: a new directory with its own checked-out files, its own `HEAD` reference pointing to a branch, and its own staging index. What it does not create is a new object database. Every worktree shares the same `.git` directory, and therefore the same commit history, the same branches, the same tags, and the same remote configuration.

The mental model that helps most: imagine one filing cabinet (`.git`) and multiple desks (worktrees). Each desk holds a different project folder — a different branch checked out — but they all draw from the same filing cabinet. A document filed from any desk is immediately available at every other desk without needing to be copied.

Key terminology: the "main worktree" is the original directory where you cloned or initialized the repository. "Linked worktrees" are additional directories created with `git worktree add`. Each worktree has an entry in `.git/worktrees/` that tracks which branch or commit it points to. The "index" — the staging area — is per-worktree, so changes staged in one worktree do not appear in another. The one-branch-per-worktree constraint is enforced by Git itself: you cannot check out the same branch in two worktrees simultaneously. Git enforces this to prevent two directories from having diverging HEAD states on the same branch, which would make it impossible to know which one represents the branch's actual state.

**Jujutsu workspaces** operate on the same principle — one repository, multiple working directories — but with a different underlying model. Jujutsu (the `jj` CLI) uses Git's object storage as its backend, so the repository on disk is still a `.git` directory and all commits are Git-compatible. What Jujutsu changes is the interaction model: there is no staging area. Every workspace maintains its own "working-copy commit," a real commit in the history that Jujutsu automatically amends as you edit files. This commit is identified in the repository by the workspace name: the default workspace uses `@`, and additional workspaces use `<workspace-name>@`.

The practical implication: in a Jujutsu workspace, your uncommitted changes are always a commit. There is no stash, no index, no `git add` before `git commit`. You simply edit files and Jujutsu keeps the working-copy commit up to date. When you create a new workspace with `jj workspace add`, you get a new directory, a new working-copy commit tracked under a different name, and full access to the shared object history. Unlike Git's one-branch-per-worktree constraint, Jujutsu workspaces are not tied to branches in the same way — each workspace tracks its own working-copy commit independently, and the branch concept in Jujutsu (called "bookmarks") maps onto Git branches but is not enforced in the same one-per-workspace manner.

Both Git worktrees and Jujutsu workspaces have been available for years: Git worktrees since Git 2.5 (2015), Jujutsu workspaces as a core feature since its initial public release in 2022.

## Applying It in Practice

**Git worktrees** use three core commands: `git worktree add`, `git worktree list`, and `git worktree remove`.

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

Each agent operates in its own directory, writes its own files, runs its own tests, and commits to its own branch — all sharing the same object store. A commit made by one agent is immediately visible to the host process without a push-and-fetch cycle.

**Jujutsu workspaces** use an analogous set of commands:

```bash
# Create a new workspace at ../hotfix
jj workspace add ../hotfix

# List all active workspaces
jj workspace list

# Remove a workspace (does not delete the directory)
jj workspace forget hotfix
```

In Jujutsu, the working-copy commit model changes the hotfix review scenario. When you run `jj workspace add ../review`, Jujutsu creates a new workspace with its own working-copy commit initialized at the current revision. You navigate to that directory, run `jj git fetch` if needed, then `jj new <revision>` to start from the hotfix commit. Your original workspace's working-copy commit is completely unaffected — because Jujutsu tracks each workspace's state as a separate named commit, there is no shared index to conflict with.

```bash
# In the review workspace: move to the hotfix revision and inspect
cd ../review
jj git fetch
jj new hotfix/payment-fix
# Run tests, inspect files — original workspace untouched
```

For agent orchestration with Jujutsu, the pattern is similar in structure but each agent's state is a real commit rather than staged changes:

```bash
# Provision workspaces for two agents
jj workspace add ../agent-1
jj workspace add ../agent-2
# Each agent works in its directory; their working-copy commits are independent
```

Best practices for both tools: name directories clearly and consistently, especially when spinning up many at once. A convention like `../<repo-name>-<task-slug>` makes it easy to identify each directory at a glance. With Git, always remove worktrees with `git worktree remove` rather than deleting directories manually, because Git tracks linked worktrees in `.git/worktrees/` and stale entries block recreating a worktree at the same path. With Jujutsu, `jj workspace forget` removes the tracking entry without deleting the directory, which is intentional for cases where you want the directory to persist.

## Engineering Decision Guide

**Git worktrees** offer several concrete advantages. They require no tooling beyond standard Git. They integrate with every Git-native workflow, CI system, and editor plugin without modification. The one-branch-per-worktree constraint, while occasionally inconvenient, enforces a useful discipline: each unit of parallel work has a distinct branch and therefore a distinct history. This makes merging, reviewing, and auditing straightforward. Worktrees are the established, battle-tested approach with a decade of production use.

The trade-offs are real. The staging-area-per-worktree model means you can have uncommitted changes in multiple worktrees simultaneously, and it is easy to lose track of what is staged where. The one-branch constraint fails loudly and requires explicitly creating new branches for each worktree, which adds a small setup step. The stash is shared across all worktrees and using it undermines the purpose of having separate working directories.

**Jujutsu workspaces** offer a cleaner mental model for parallel work. Because every workspace's state is a real commit, there is no ambiguity about what is "in progress" — you can run `jj log` and see all workspace states as named commits in the history. The absence of a staging area eliminates the `git add` / `git commit` cycle entirely. Conflicts in Jujutsu are not blocking: Jujutsu materializes conflict markers in files and allows you to continue working through a conflict rather than being stopped by it, which is particularly valuable in long-running parallel workstreams.

Jujutsu's costs are also real. Adoption requires your team to learn a new tool and migrate workflows. CI systems, code review platforms, and editor integrations are all built for Git's model. Jujutsu is still maturing, with a smaller ecosystem and less widespread operational knowledge. The working-copy-commit model can initially be disorienting: there is always an "open" commit in every workspace, which looks different from Git's explicit commit cycle.

**When to use Git worktrees:** you are working in a fully Git-native environment, your team uses standard Git tooling, and you need parallel branch development without additional tool adoption overhead. This is the right default for most teams.

**When to consider Jujutsu workspaces:** you have already adopted Jujutsu across your workflow, or you are evaluating Jujutsu for its ergonomic improvements and want your multi-workspace pattern to match its model. Do not adopt Jujutsu workspaces in isolation from Jujutsu itself — they are one feature of a coherent alternative workflow, not a drop-in replacement for Git worktrees.

**Decision framework:** if your team uses Git, use Git worktrees. If your team uses Jujutsu, use Jujutsu workspaces. The underlying object model is compatible — commits created in a Jujutsu workspace appear in Git history and vice versa — but the interaction model is not. Mixing the two within a single team creates unnecessary confusion. Choose the tool that matches your primary VCS workflow, and use it consistently.

For AI agent orchestration specifically, both approaches work well. Git worktrees are more widely supported by automation tooling and scripts. Jujutsu workspaces offer cleaner state tracking because each agent's in-progress state is a named commit visible in `jj log`. For teams already using Jujutsu, the workspace model for agent orchestration is superior; for everyone else, Git worktrees are the practical choice.

## Scaling & Operational Considerations

**Stale worktree entries** are the most common operational failure with Git worktrees. When a directory is deleted manually without `git worktree remove`, Git still tracks the worktree entry in `.git/worktrees/`. This causes warnings on subsequent Git operations and blocks recreating a worktree at the same path. The fix is `git worktree prune`, which removes entries whose directories no longer exist on disk.

```bash
# Clean up stale worktree entries after manual directory deletion
git worktree prune
```

In automation systems that spin up and tear down worktrees at scale — such as an agent orchestration layer creating dozens of concurrent worktrees — stale entry cleanup must be part of the recovery routine, not an afterthought. Any process that creates worktrees should include `git worktree prune` in its cleanup path, even when removal is expected to succeed.

**The one-branch constraint** is a frequent stumbling block in automated workflows. Scripts that create worktrees from branch names can fail when branch names collide across concurrent tasks. A naming convention that includes a task ID or timestamp makes collisions structurally impossible. Attempting to check out a branch already checked out elsewhere produces a clear error from Git, but catching this in automation requires explicit handling.

**The shared stash** is a subtler issue. Teams that adopt worktrees to avoid stashing should adopt a policy of not using `git stash` when worktrees are in play. Using the stash to "hold" changes that belong to a specific worktree's work defeats the purpose of having separate working directories and creates confusion about which stash entry belongs where.

**Shared hooks** apply to all worktrees simultaneously. A pre-commit hook change in the main worktree takes effect in every concurrent linked worktree immediately. In agent orchestration scenarios where agents may run untrusted code, this shared hook behavior must be understood and explicitly accounted for in the system design.

**Jujutsu workspace operational considerations** are different in character. There is no equivalent of stale entries: `jj workspace forget` removes the workspace record, and unlike Git's `git worktree prune`, Jujutsu's workspace bookkeeping is less susceptible to manual-deletion confusion. However, forgotten workspaces leave orphaned working-copy commits in the history. These are not harmful — Jujutsu eventually garbage-collects them — but they appear in `jj log` until they are cleaned up, which can be visually noisy in an active multi-workspace environment.

The working-copy commit model at scale introduces a different kind of complexity: every workspace has a named `@` commit visible in the shared history. With many concurrent workspaces, the log view can become cluttered with workspace-specific commits that are not meaningful to other team members. Teams adopting Jujutsu workspaces for agent orchestration at scale should establish conventions for how workspace commits are named and when they are abandoned or squashed.

The most common misconception about both tools is that they are interchangeable with cloning the repository. They are not. A worktree or workspace is a view into a single repository — configuration, remotes, and history are shared. A clone is a separate repository with its own configuration, credentials, and remote state. When you need isolation at the Git configuration level — different credentials per environment, independent remote configurations, or protection from hook side effects — a full clone provides isolation that neither worktrees nor workspaces can. See [Git Worktrees vs Clones](./git-worktrees-vs-clones) for a detailed comparison.

## Next Steps

- [Git Worktrees vs Clones](./git-worktrees-vs-clones) — detailed comparison of when each approach gives you better isolation, performance, or simplicity, including guidance for AI agent setups
- [What is Version Control?](./version-control) — high-level overview of Git and Jujutsu as version control systems, with guidance on when to consider migrating from one to the other
- [What are Stacked PRs?](./stacked-prs) — how to break large features into a chain of reviewable pull requests, a natural complement to parallel development with worktrees
- [Parallel Development Workflow](/learn/workflows/git/parallel-development) — step-by-step guide to setting up and running multiple branches concurrently using worktrees
- [What are Coding Agents?](/learn/concepts/ai-engineering/coding-agents) — how AI coding agents use worktrees to operate in parallel on the same codebase without interfering with each other
