---
sidebar_position: 14
description: Choose git worktrees or separate clones for coding agents based on the isolation you need for refs, config, and credentials.
---

# Git Worktrees vs Clones for Agents

_Pick worktrees for shared-history parallel agents. Pick clones when repository state must diverge._

## Goal

Choose between linked Git worktrees and separate clones when running coding agents. Base the choice on isolation needs, not setup habit.

## Short answer

| Need | Prefer |
| --- | --- |
| Parallel local agents on one repo | Worktrees |
| Fast creation, shared objects | Worktrees |
| Immediate visibility of local commits | Worktrees |
| Different remotes or repo config | Clones |
| Disposable repo state / experiments with hooks | Clones |
| Credential or host isolation | Neither alone. Use a sandbox or separate OS user |

## Worktrees for agents

Create a linked worktree and branch per agent:

```bash
git fetch origin
git worktree add -b agent/cache-headers ../app-cache-headers origin/main
cd ../app-cache-headers
claude
```

Worktrees share the object database and most refs. Each agent gets its own files, `HEAD`, and index. This is the default for Claude Code, Codex, and similar local agents under one trust boundary.

Limits:

- branch names are shared across worktrees
- fetch, maintenance, and hooks can affect every linked worktree
- dependencies still install per directory

See [Git Worktrees for AI Coding Agents](/learn/git-worktrees-for-ai).

## Clones for agents

Create a separate repository when the agent needs independent Git state:

```bash
git clone git@github.com:org/app.git ../app-agent-isolate
cd ../app-agent-isolate
git switch -c agent/cache-headers
codex
```

Clones fit agents that change remotes, replace hooks, rewrite repository config, or should be deleted without touching your primary checkout's admin state.

Limits:

- commits are not visible in your main clone until you fetch or push
- disk use is higher unless you use local clone optimizations
- a clone is not a security boundary by itself

## Decision examples

**Two feature agents on one app.** Use worktrees. You want shared history and quick review from the main checkout.

**An agent testing a different remote or fork.** Use a clone with its own `origin`.

**An agent that must not see production credentials.** Use a container, VM, or separate OS account. Then use either a worktree or clone inside that boundary.

**CI jobs that mutate Git config.** Use clones or ephemeral runners. Do not attach them as worktrees to a developer laptop repo.

## Treq's model

Treq uses Jujutsu workspaces inside a colocated Git repository. That is closer to the worktree model: separate working copies, shared history, managed under `.treq/workspaces/`. It adds stack targeting and auto-rebase on top. Details are in [Workspaces](/docs/concepts/workspaces).

## Common failure cases

**Using clones for every agent by default.** You pay setup and sync cost without gaining the isolation you actually needed.

**Using worktrees when remotes must differ.** Repository config is mostly shared. You will fight the worktree model.

**Assuming either option sandboxes secrets.** Both can read your home-directory credentials if the process can. Isolate the process when that matters.

**Deleting worktree directories by hand.** Use `git worktree remove` or `git worktree prune` so administrative records stay consistent.

## Related

- [Git Worktrees vs Clones](/learn/concepts/git/git-worktrees-vs-clones)
- [What are Git Worktrees?](/learn/concepts/git/git-worktrees)
- [How to Run Multiple Claude Code Sessions](/learn/how-to/how-to-run-multiple-claude-code-sessions)
- [Parallel Coding Agents Without Branch Chaos](/learn/parallel-coding-agents)
