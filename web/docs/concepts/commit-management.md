---
sidebar_position: 2
---

# Commit Management

_How Treq creates, splits, and reviews commits inside a workspace._

Treq runs commit operations inside the active Jujutsu workspace. A workspace can contain uncommitted changes, one commit, or a stack of commits above its target. Other workspaces keep their own working copies, so pending changes stay isolated.

## Workspace Scope

The file tree, diff viewer, commit history, and review tools all read from the selected workspace path. Each workspace has an independent working copy and shares repository history through the colocated Jujutsu repository.

Jujutsu has no Git staging index. Treq provides a file selection layer in the interface instead. When you select files, Treq splits those files into a new commit and leaves the other changes in the working copy.

<!-- TODO: Document hunk-level commit selection here if the commit UI gains support for it. Line selection currently applies to review comments and copying, not commit creation. -->

## Commit Creation

The commit form requires a message of no more than 500 characters. If you selected files, Treq commits those files through a Jujutsu split operation. If you selected no files, Treq commits every pending change in the working copy.

File selection lets you divide a large agent change into reviewable commits. Select files that belong to one logical change, commit them, then repeat with the files left behind.

## Commit History

Treq shows commits relative to the workspace target. This makes the current stack visible without requiring you to inspect bookmarks or revisions from the command line. The history separates committed work from pending file changes.

The review interface can show the cumulative workspace diff or one commit. Comments attach to files and line ranges in the visible diff.

## Manipulation Model

Commit operations update the workspace history. Treq then refreshes derived state such as changed files, divergence from the target, and the visible review diff.

| Operation | Purpose | Workspace effect |
|---|---|---|
| Create commit | Save selected changes with a message | Adds a new commit above the workspace target |
| Split changes | Commit selected files | Leaves unselected files in the working copy |
| Review commit | Inspect one commit instead of the cumulative diff | Changes the visible diff context |
| Merge workspace | Integrate workspace commits into the target | Moves completed work out of the workspace flow |

## Safety Boundaries

Discarding a change modifies the working copy. Deselecting a file only removes it from the next partial commit. Treq also keeps workspace integration separate from commit creation, so creating a commit never merges the workspace into its target.

Pending changes can prevent Treq from synchronizing a working copy after a rebase. Commit, move, or discard those changes before rewriting a workspace stack.

<!-- TODO: Add a user-facing matrix of which merge and rebase operations accept pending changes once those guarantees are stable. -->

## Learn More

- [Committing Changes](/docs/tutorials/committing-changes)
- [Code Review Workflow](/docs/tutorials/code-review-workflow)
- [Workspaces](/docs/concepts/workspaces)
