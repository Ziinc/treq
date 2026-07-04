---
sidebar_position: 2
---

# Commits Management

_Technical overview of how Treq handles commit manipulation inside a workspace._

Treq treats commits as workspace-scoped units of review and delivery. A workspace can contain uncommitted changes, one new commit, or a stack of commits that build on its target branch. Treq keeps commit operations tied to the active workspace so changes do not leak into the main checkout or other workspaces.

## Workspace Scope

Commit actions run against the selected workspace. The file tree, diff viewer, commit history, and review state all read from that workspace path. This keeps each line of work isolated while still sharing repository objects with the parent Git repository.

Treq does not create a separate staging area. Users select files or hunks in the diff viewer, then create a commit from that selection. Unselected changes remain in the workspace for a later commit or further edits.

## Commit Creation

The commit form validates that a message exists and that at least one change is selected. Treq then writes the selected content into a new workspace commit. The resulting commit appears in the workspace history and updates the workspace status indicators.

Partial selection lets users split a large agent change into reviewable commits. File-level selection is useful for broad changes. Hunk-level selection is useful when generated work mixes unrelated fixes.

## Commit History

Treq shows commits relative to the workspace target. This makes the current stack visible without requiring users to inspect raw Git refs. The history view separates committed work from pending file changes so reviewers can decide whether to inspect the whole diff or review commit by commit.

Commit history also drives review context. The review UI can show cumulative workspace changes or a selected commit. Comments still attach to files and line ranges, while the selected commit controls which diff the reviewer sees.

## Manipulation Model

Treq supports commit manipulation as workspace operations. These operations update the workspace branch-like line of work and then refresh derived state such as file changes, divergence, and review context.

| Operation | Purpose | Workspace effect |
|---|---|---|
| Create commit | Save selected changes with a message | Adds a new commit above the workspace target |
| Split changes | Commit only selected files or hunks | Leaves unselected changes in the workspace |
| Review commit | Inspect one commit instead of the cumulative diff | Changes the visible diff context |
| Merge workspace | Integrate workspace commits into the target | Moves completed work out of the workspace flow |

## Safety Boundaries

Treq keeps destructive commit operations explicit. Discarding changes is separate from deselecting changes. Merging a workspace is separate from creating commits. This keeps review, commit creation, and integration as distinct decisions.

Dirty workspaces can block operations that would rewrite or integrate history. Commit, move, or discard pending changes before operations that need a clean workspace.

## Learn More

- [Committing Changes](/docs/guides/core-workflows/committing-changes)
- [Code Review Workflow](/docs/guides/core-workflows/code-review-workflow)
- [Workspaces](/docs/features/workspaces)
