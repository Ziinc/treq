---
sidebar_position: 7
---

# Using the Merge Queue

_Intended workflow for enqueueing stacked GitHub pull requests through Treq's managed merge queue._

:::note Work in progress

The merge queue is not fully shipped. Settings, panel UI, and backend foundations exist in the codebase, but the end-to-end product is still incomplete. Use this page as a preview of the planned design, not as a guarantee of current behavior.

:::

The planned merge queue merges open PRs in stack order after CI passes. It is a Treq service, not [GitHub's native merge queue](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/managing-a-merge-queue). Private repos will not need GitHub Enterprise Cloud to use it.

## Requirements

| Requirement | Why |
|---|---|
| Treq Pro | Queue automation is planned as a Pro feature |
| Treq GitHub App on the repo | Server-side merges and webhooks use the App installation |
| Merge queue enabled for the repo | Opt in under Settings → Integrations |
| Open pull request on the workspace branch | Enqueue attaches to that PR |

Complete [Connecting GitHub](/docs/how-to/connecting-github) first if the App or Pro plan is missing.

## Turn the Queue On

1. Open the repository in Treq.
2. Go to Settings → Integrations.
3. Under GitHub, enable **Merge queue** when the control is available.

On the web dashboard Integrations tab you will be able to set queue details for the repo, including the trigger label, target branch, and required checks. Those settings control when a queued entry is allowed to merge.

## Enqueue a Workspace

1. Open a workspace that already has an open GitHub PR.
2. Confirm CI is the state you expect from the header pill. See [Creating and Viewing Pull Requests](/docs/how-to/creating-and-viewing-pull-requests).
3. Click **Merge** on the workspace header.

With the queue finished and enabled, that action is meant to enqueue the workspace through Treq and apply the configured trigger label on the open PR. If there is no open PR, enqueue should fail and ask you to create one first.

## Watch Queue Status

Open **GitHub** → **Merge Queue** in the sidebar. The tab is planned to list queue entries with status chips such as queued, testing, merging, merged, or failed. Entries should group by stack when workspaces target each other, matching the [workspace stack](/docs/concepts/workspaces) order.

Workspace sidebar rows are also planned to show a queue status dot when statuses exist.

## Remove Entries

From the Merge Queue tab you will be able to remove one entry or remove a stack segment. Removing a mid-stack branch should also remove everything above it, so higher layers cannot stay queued ahead of a missing base.

## How Merges Stay Safe

The queue is planned to merge a PR only when all of these hold:

- The PR is still open
- The PR still targets the configured branch
- The head SHA matches the SHA the lane tested
- Required checks succeed on that tested SHA

`neutral` and `skipped` check conclusions will not count as success when required checks are configured. If the head moves after enqueue, the entry should re-queue at the new SHA instead of merging the old one.

## Next Steps

- [Connecting GitHub](/docs/how-to/connecting-github)
- [Creating and Viewing Pull Requests](/docs/how-to/creating-and-viewing-pull-requests)
- [GitHub Integration](/docs/concepts/github-integration)
- [Workspaces](/docs/concepts/workspaces)
- [Stacked PRs](/learn/concepts/git/stacked-prs)
- [Roadmap](/roadmap)
