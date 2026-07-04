---
sidebar_position: 6
---

# Merging Workspaces

_How to bring completed workspace changes back into your main branch._

Merge a workspace after its changes are committed, reviewed, and ready to land. Treq keeps each workspace on its own branch, so merging is the point where that isolated work becomes part of your main repository history.

## Before You Merge

Open the workspace and confirm there are no unexpected uncommitted changes. Stage and commit anything that should be included, then run the relevant tests from the workspace terminal.

If the branch is shared with a remote, push it before review or merge so collaborators can see the same commits.

## Merging From Treq

From the dashboard, select the workspace and choose **Merge**. Treq shows the target branch, the commits that will be merged, and any warnings about uncommitted changes or branch divergence.

Review the summary carefully, then confirm the merge. After the merge completes, Treq updates the dashboard so the workspace no longer shows commits ahead of the target branch.

## Handling Conflicts

If Git reports conflicts, open the affected files in the workspace or main repository and resolve the conflict markers. Stage the resolved files, complete the merge commit, then refresh Treq.

For large conflicts, pause and make sure the target branch is up to date before continuing. It is often easier to pull the latest main branch, resolve conflicts in the workspace, and retry the merge once tests pass.

## After Merging

Push the target branch if the merge should be shared with a remote. Once the workspace is no longer needed, delete it from the dashboard to keep `.treq/workspaces/` tidy.

## Next Steps

- [Pushing to Remote](../common-tasks/pushing-to-remote) — Share merged commits
- [Discarding Changes](../common-tasks/discarding-changes) — Clean up unwanted work
- [Moving Files Between Workspaces](../common-tasks/moving-files-between-workspaces) — Preserve work before cleanup
