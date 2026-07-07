---
sidebar_position: 3
---

# Git Worktrees vs Clones

When you need to work on multiple branches simultaneously, two approaches exist: create additional worktrees from the same repository, or clone the repository again into a separate directory. Both give you independent working directories with separate branches checked out, but they differ in how they share state and what they cost.

## How they compare

| | Worktrees | Clones |
|---|---|---|
| Disk usage | Shares object store; only the working tree is duplicated | Full copy of all objects for each clone |
| Commits visible across contexts | Immediately | Only after push + fetch |
| Branch sharing | Same refs; a branch created in one worktree is visible in all | Separate ref namespaces; branches must be pushed to be shared |
| `git fetch` needed | No — objects are shared | Yes — each clone fetches independently |
| Remote configuration | Shared | Separate per clone |
| Setup time | Fast — just creates a directory | Slower for large repos (clones all objects) |
| Isolation | Logical; shares config and hooks | Physical; fully independent processes |

## When worktrees are the better choice

**Parallel development on the same repo**: if you're switching between branches of the same project, worktrees avoid redundant object storage and keep refs in sync automatically.

**CI-adjacent workflows**: spinning up a worktree for each CI job or agent task is faster and cheaper than cloning.

**Agent isolation**: giving each AI coding agent its own worktree lets agents work in parallel without interfering, while the host repository stays coherent.

## When clones are the better choice

**Full isolation is required**: clones have independent Git config, hooks, and remote credentials. If you need each environment to behave as a completely separate repository, a clone is cleaner.

**Different remotes**: worktrees share remote configuration; if you need different credentials or different upstream URLs, a clone is simpler.

**Teaching or demos**: a clone feels like "a fresh copy" and is easier to reason about without knowing the worktree model.

**Disposable environments**: if you want to delete an environment without any risk to the main repository state, a clone is safer. A `rm -rf` of a clone directory removes everything cleanly.

## The practical difference in daily use

For most concurrent-branch workflows within a single project, worktrees are more efficient. Clones make more sense when the contexts genuinely need to be independent — different teams, different remotes, or when the Git configuration itself needs to differ.

## Related concepts

- [What are Git Worktrees?](./git-worktrees)
- [What are Stacked PRs?](./stacked-prs)
