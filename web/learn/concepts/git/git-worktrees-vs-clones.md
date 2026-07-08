---
sidebar_position: 3
---

# Git Worktrees vs Clones

## Introduction

When you need to work on multiple branches of the same repository simultaneously, two approaches exist: create additional worktrees using `git worktree add`, or clone the repository a second time into a separate directory. Both give you independent working directories with different branches checked out, but they differ fundamentally in how state is shared, what they cost in disk space and setup time, and what kind of isolation they actually provide.

The problem developers face is choosing between these two approaches without fully understanding what "shared" versus "isolated" means in each case. Worktrees look like independent environments, but they share the same `.git` directory, which means shared configuration, shared hooks, and shared remote credentials. Clones look identical to each other, but each one is a genuinely independent repository with its own object store and configuration. Making the wrong choice leads to unexpected behavior: hooks running where they should not, credentials leaking between environments, or paying the setup and disk cost of a full clone when a worktree would have been faster and cheaper.

This article is for developers setting up parallel development environments, engineers building agent orchestration systems, and anyone who has wondered whether `git worktree add` or `git clone` is the right tool for their use case. After reading, you will understand the shared object store advantage of worktrees, what "full isolation" from a clone actually gives you, how credentials and remotes work differently in each approach, how they compare on performance and disk usage, and which to use when running AI coding agents.

## Understanding the Concept

The fundamental difference is where the `.git` directory lives. A repository's `.git` directory contains the object database (all commits, trees, and blobs), the ref store (branches, tags, HEAD), and configuration including remotes, hooks, and local settings. When you create a worktree with `git worktree add`, you create a new working directory — the checked-out files — but that directory points back to the same `.git` directory as the main worktree. When you clone a repository, you create an entirely new `.git` directory with its own copy of the object database, its own ref store, and its own independent configuration.

The shared object store is the core advantage of worktrees. A commit made in any worktree is immediately visible in every other worktree because they all read from the same object database. You do not need to push to a remote and fetch in another directory to share a commit. For disk usage, this means you pay only for the working tree files — the checked-out source code — not for a second copy of the entire commit history.

Clones, by contrast, are physically independent. Each clone has its own copy of the full object database. A commit in one clone is not visible in another without a push-and-fetch cycle. This independence is the feature, not a limitation: clones can have different remote URLs, different credentials, different hooks, and different local configuration. They behave as separate repositories that happen to share a common ancestry.

| | Worktrees | Clones |
|---|---|---|
| Object store | Shared (one copy) | Separate per clone |
| Disk usage | Working tree files only duplicated | Full history duplicated per clone |
| Commit visibility | Immediate across all worktrees | Requires push + fetch |
| Remote configuration | Shared | Independent per clone |
| Hooks | Shared | Independent per clone |
| Branch constraint | One worktree per branch | No constraint |
| Setup time | Fast (seconds) | Slow for large repos (proportional to history size) |
| Full isolation | No | Yes |

## Applying It in Practice

For a common parallel development scenario — working on `feature/api` while reviewing `hotfix/payment` — a worktree is straightforward and fast:

```bash
# Create a worktree to review the hotfix branch
git worktree add ../review-hotfix origin/hotfix/payment
# Do your review work in ../review-hotfix
# Remove it cleanly when done
git worktree remove ../review-hotfix
```

Achieving the same layout with a clone works, but costs more:

```bash
git clone git@github.com:org/repo.git ../review-hotfix
cd ../review-hotfix && git checkout hotfix/payment
```

For a large repository the clone takes minutes rather than seconds, and duplicates the full object history to disk. For reviewing a branch, this overhead is unnecessary.

For AI coding agents, the worktree approach scales efficiently. Provisioning ten parallel agents from the same repository:

```bash
for i in $(seq 1 10); do
  git worktree add ../agent-$i -b agent/task-$i main
done
```

Each agent gets its own working directory and its own branch, sharing the same object store. Disk usage is proportional to ten working trees, not ten full repositories. A commit by agent-1 is immediately visible to the orchestrating process without any network operation.

A clone is the right choice when the environment genuinely needs to be independent of the main repository's configuration. For example, an integration test environment that must use different remote credentials, or a staging environment where you want hook behavior to differ from development:

```bash
# Clone pointing at a different remote with its own credentials
git clone --origin staging git@staging.example.com:org/repo.git ../staging-env
```

This clone has its own remote pointing at a different server, its own credential store, and its own Git configuration. Changes to the main repository's hooks or config do not affect it. For disposable environments, clones are also cleaner: `rm -rf ../staging-env` removes everything completely, with no residual state in the main repository's `.git/worktrees/` directory to clean up.

## Engineering Considerations

Worktrees win on efficiency for most parallel-branch workflows within a single project. The shared object store means no disk duplication, no push-fetch cycles to synchronize commits between environments, and fast setup time that does not depend on repository size. These advantages compound when managing many concurrent working directories, as in agent orchestration: ten worktrees on a 2 GB repository cost roughly 10x the size of one working tree, while ten clones cost roughly 20 GB.

The trade-off of worktrees is the trade-off of sharing. Shared hooks mean a change to a pre-commit hook affects every concurrent linked worktree immediately — usually desirable for consistency, but worth understanding. Shared remote configuration means you cannot configure different credentials for different worktrees. The one-branch-per-worktree constraint means you must create a new branch for each worktree, which is usually what you want anyway.

Clones win when isolation is the actual requirement. If each environment must behave as an independent repository — different remotes, different hooks, different credentials, or a configuration that differs from the main repository — a clone is the correct model. Clones are also appropriate for truly disposable environments: a `rm -rf` on a clone directory removes it completely and cleanly. Removing a worktree directory without using `git worktree remove` leaves a stale entry in `.git/worktrees/` that requires `git worktree prune` to clean up.

For AI agents specifically: worktrees are almost always the right choice. Agents working on the same codebase benefit from the shared object store — commits are immediately visible without a push-fetch cycle — and the overhead of a full clone per agent is unnecessary and expensive at scale. The exception is when each agent needs different credentials or must be isolated at the Git configuration level, which is rare in most orchestration setups.

The recommendation: default to worktrees for parallel branch work within a project. Reach for clones when you need independent Git environments with different configuration, credentials, or remotes, or when you want the environment to be a truly disposable copy of the repository with no shared state.

## Scaling & Operational Considerations

The most common operational mistake with worktrees is deleting worktree directories without using `git worktree remove`. This leaves stale entries in `.git/worktrees/`, which causes Git to emit warnings and can block creation of new worktrees at the same path. Recovery is straightforward but requires an explicit step:

```bash
# Clean up entries pointing to directories that no longer exist
git worktree prune
```

At scale — dozens of worktrees for agent orchestration — the `.git/worktrees/` directory can accumulate entries from tasks that were interrupted or cleaned up improperly. A long-running orchestration system should call `git worktree prune` periodically as part of its maintenance routine, not only when it encounters an error.

Clones at scale have the opposite problem: disk usage. A repository with 5 GB of history cloned ten times consumes 50 GB. For orchestration systems that spin up and down environments frequently, clones are impractical without some form of object sharing (such as Git's reference clone feature, `git clone --reference`). Shallow clones (`git clone --depth 1`) reduce disk usage but remove history, which breaks `git log`, `git bisect`, and any workflow that inspects commit ancestry beyond the latest snapshot.

A subtle failure mode with worktrees is lock contention on Git's internal lock files during very high-frequency concurrent operations. In practice, Git handles concurrent worktree access well for normal workflows, but many agents committing simultaneously at high frequency can occasionally produce locking errors. This is uncommon but worth load-testing for high-throughput agent systems before deploying to production scale.

Security considerations differ meaningfully: worktrees share hooks, which means a malicious or misconfigured hook in the main repository runs in every linked worktree. In agent orchestration scenarios where agents might modify repository files including hooks, this shared hook surface should be understood and designed for. Clones allow hooks to be disabled or configured independently per environment, providing more granular control in security-sensitive setups.

The most persistent misconception is that worktrees and clones are interchangeable because they both produce directories with checked-out files. They are not. A worktree is a view into a single repository; a clone is a separate repository. The isolation model, disk behavior, credential handling, and operational cleanup procedures are all different.

## Next Steps

- [What are Git Worktrees?](./git-worktrees) — the complete reference for worktree mechanics, the `add/list/remove` commands, and the one-branch-per-worktree constraint
- [Parallel Development Workflow](/learn/workflows/git/parallel-development) — how to structure a multi-branch development environment using worktrees in practice
- [What are Coding Agents?](/learn/concepts/ai-engineering/coding-agents) — how AI coding agents use worktrees for parallel execution and why the shared object store matters for orchestration efficiency
