---
sidebar_position: 3
---

# Parallel Development Workflow

A workflow for running multiple independent workstreams simultaneously — whether that's multiple human developers, multiple AI agents, or a mix of both — without one blocking or polluting another.

## Overview

Parallel development requires that each workstream be isolated. Work in progress on feature A must not affect the environment for feature B. When work is ready, it needs a path to integrate without manual conflict resolution for every interaction.

The practical tools for this are Git worktrees (one branch per workspace, all sharing the same repository) and disciplined branch hygiene (short-lived branches that merge frequently).

## Step 1 — Identify independent workstreams

Before parallelising, confirm the workstreams are actually independent. Two tasks are independent if:

- They modify different files (or at least different functions within shared files)
- Neither's outcome depends on the other being merged first
- They can be reviewed and merged in any order without conflict

If tasks share a file heavily — both modify `UserService`, for example — they're likely not independent enough to run in parallel without producing messy conflicts.

## Step 2 — Create one workspace per workstream

Create a workspace for each parallel task. Each workspace checks out its own branch from the current `main`.

With AI agents, assign one agent per workspace. Agents working in the same workspace will overwrite each other's changes — workspace isolation is what prevents this.

## Step 3 — Run workstreams concurrently

With workspaces isolated:

- Multiple AI agents can run simultaneously without coordination between them
- A developer can work in one workspace while an agent works in another
- Long-running tasks (a test suite, a build, a deep refactoring) can proceed in one workspace while unrelated work continues in another

Check in on each workspace's progress periodically rather than waiting for all to complete before reviewing any.

## Step 4 — Review and merge as each workstream completes

Don't wait for all workstreams to finish before reviewing any of them. As each workspace produces a reviewable diff, review it and merge it to `main`.

This is important for keeping `main` current. Workstreams that run long against a stale base accumulate divergence and produce larger conflicts when they eventually merge.

## Step 5 — Rebase long-running workstreams regularly

If a workstream takes more than a day or two, rebase its workspace branch onto the latest `main` periodically. This keeps the diff small and the conflicts manageable.

A workspace that hasn't rebased in a week against an active `main` branch will be difficult to merge cleanly.

## Step 6 — Merge and clean up

As each workstream merges to `main`, delete its workspace. Other workspaces should rebase onto the updated `main` to pull in the merged changes.

If a workstream is abandoned — the agent failed to produce usable output, or the task turned out to be unnecessary — delete its workspace and its branch without merging.

## Handling conflicts

When two workstreams modify the same code, the second one to merge will encounter a conflict. A few strategies:

- **Merge `main` into the conflicting workspace** and resolve conflicts there before merging to `main`
- **Rebase the conflicting workspace** onto `main` and resolve conflict commit-by-commit
- **Re-run the agent** with context about what the first workstream changed, producing a diff that accounts for the new state of the code

With AI agents, re-running is often faster than resolving conflicts manually. The agent has no attachment to its previous output.

## Tips

- Track workstreams in a task list. It's easy to lose track of which workspaces are active, what state they're in, and which ones need attention.
- Set a limit on concurrent workstreams. Five parallel AI agents in an active codebase will produce more conflicts than a team can review efficiently. Two or three simultaneous workstreams is a manageable starting point.
- Keep workstreams short. A workstream that runs for a week accumulates divergence and review debt. Parallel development works best with tasks that can be completed and merged in hours or a day.

## Related concepts and workflows

- [What are Git Worktrees?](/learn/concepts/git/git-worktrees)
- [Stacked PR Workflow](./stacked-pr)
- [AI Feature Development Workflow](/learn/workflows/ai/ai-feature-development)
