---
sidebar_position: 13
description: Merge conflicts are becoming an AI-development bottleneck. Learn how to prevent them and resolve them faster.
---

# How to Fix Merge Conflicts Created by Coding Agents

_Prevent parallel-agent conflicts where you can, and resolve the rest with rebase discipline and reviewed agent help._

## Goal

Reduce merge conflicts from parallel coding agents, and resolve the conflicts that remain without merging the wrong side of a change.

## Why conflicts rise with parallel agents

Conflicts increase when several writers edit related files against moving bases. Agents amplify that pattern:

- they finish branches quickly, so more branches sit waiting for review
- they often touch shared entry points, configs, and generated files
- they continue from stale bases unless something rebases them

Two agents in one checkout also create false conflicts: interleaved edits that look like merge problems but are really shared-filesystem collisions. Isolate agents first. See [Git Worktrees for AI Coding Agents](/learn/git-worktrees-for-ai).

## Prevention patterns

**One task, one branch, one working copy.** Do not run two agents in the same directory.

**Agree on shared contracts before parallel work.** If two tasks need the same interface, define it in a lower stack layer or merge it first.

**Keep tasks small and bounded.** Broad agent prompts wander into shared files and raise collision odds.

**Rebase early.** A conflict against last week's `main` is harder than a conflict against yesterday's.

```bash
git fetch origin
git rebase origin/main
```

**Stack dependent work.** If B needs A's schema, make B target A instead of inventing the schema twice.

## Rebase discipline

Resolve conflicts on the branch that will merge next. For stacks, fix the lowest conflict first:

```bash
git switch auth/schema
git rebase origin/main
# resolve, test, push

git switch auth/service
git rebase auth/schema
# resolve, test, push
```

During conflict resolution:

```bash
git status
# edit conflicted files
git add path/to/file
git rebase --continue
```

Abort when the conflict shows the task no longer makes sense on the new base:

```bash
git rebase --abort
```

Restarting the agent on current `main` can be cheaper than preserving a small obsolete patch. Compare old and new intended behavior before discarding work.

## Agent-assisted resolution

You can ask an agent to resolve conflicts, but you must review the result. Provide:

- the intended behavior after merge
- which side owns the correct contract when both changed
- tests that must pass after resolution

Example prompt shape:

```text
Rebase onto origin/main and resolve conflicts in src/api/routes.ts.
Keep the pagination response shape from origin/main.
Keep the new auth middleware from this branch.
Add or update tests for an authenticated paginated list request.
Do not resolve unrelated files by deleting them.
```

In Treq, conflicted files appear in the workspace review UI. You can attach resolution instructions and send them to an agent. Treq blocks merge while unresolved conflicts remain. See [Changes and Reviews](/docs/concepts/changes-and-reviews).

## Treq angle

Treq reduces avoidable conflicts through workspace isolation and auto-rebase of dependent workspaces. It does not remove semantic conflicts when two tasks change the same contract. Those still need a human decision about which behavior wins.

When a bookmark conflict appears after remote updates, resolve it from the bottom of the stack upward, then let dependents rebase. See [Workspaces](/docs/concepts/workspaces).

## Common failure cases

**Accepting both sides blindly.** The file compiles and still implements two contradictory behaviors. Re-read the conflicted region against the task.

**Resolving generated lockfiles by hand incorrectly.** Prefer regenerating the lockfile after resolving package manifests.

**Force-pushing a bad resolution.** Run tests before `--force-with-lease`.

**Leaving upper stack layers conflicted while reviewing them.** Fix lower layers first or the upper review is fiction.

## Related

- [Auto-Rebasing AI Workspaces](/learn/how-to/auto-rebase-ai-branches)
- [Parallel Coding Agents Without Branch Chaos](/learn/parallel-coding-agents)
- [Merge vs Rebase](/learn/concepts/git/merge-vs-rebase)
- [Merging Workspaces](/docs/tutorials/merging-workspaces)
