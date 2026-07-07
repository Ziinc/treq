---
sidebar_position: 3
---

# Reviews

_Technical overview of Treq's local review model._

Reviews are workspace-scoped. Treq reads the workspace diff, lets reviewers attach comments to changed files, and stores review state locally with the workspace metadata.

The review system is built for human-in-the-loop agent work. A reviewer can inspect the agent's changes, leave comments on exact lines, and use those comments as structured feedback for follow-up work.

## Review State

Treq tracks review state separately from repository history. Commits describe what changed. Review state describes what the reviewer has inspected, commented on, and approved.

| State | Meaning |
|---|---|
| Draft | The review is still in progress. |
| Changes requested | The reviewer found issues that need follow-up work. |
| Approved | The workspace is ready to merge from the reviewer's point of view. |

## Comments

Comments attach to files and line ranges in the rendered diff. Treq keeps comment context local to the workspace so review feedback stays tied to the branch-like line of work being inspected.

Comment categories let reviewers distinguish questions, issues, suggestions, praise, and small nitpicks. The category is metadata. The comment body remains plain markdown text.

## File Review Progress

Treq tracks whether a changed file has been reviewed. This state helps reviewers move through large diffs without relying on memory or scroll position.

File review state does not change repository contents. It is local review metadata and can be reset or replaced without changing commits.

## Commit Review

The review UI can show cumulative changes or individual commits. Commit-level review helps when an agent produced a sequence of changes that are easier to inspect step by step.

Treq still stores comments against files and line ranges. The selected commit changes what the reviewer sees, not the core review storage model.

## Storage and Sync

Reviews are local by default. Comments, file review progress, and review status belong to Treq's workspace metadata. They do not sync to a remote review system by default.

## Learn More

- [Code Review Workflow](/learn/tutorials/code-review-workflow)
- [Workspaces](/learn/concepts/workspaces)
