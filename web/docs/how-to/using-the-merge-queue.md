---
sidebar_position: 7
---

# Using the Merge Queue

_Enqueue stacked GitHub pull requests through Treq's managed merge queue._

Treq's merge queue merges open PRs in stack order after CI passes. It is a Treq service, not [GitHub's native merge queue](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/managing-a-merge-queue). Private repos do not need GitHub Enterprise Cloud to use it.

## Requirements

| Requirement | Why |
|---|---|
| Treq Pro | Queue automation is a Pro feature |
| Treq GitHub App on the repo | Server-side merges and webhooks use the App installation |
| Merge queue enabled for the repo | Opt in under Settings → Integrations |
| Open pull request on the workspace branch | Enqueue attaches to that PR |

Complete [Connecting GitHub](/docs/how-to/connecting-github) first if the App or Pro plan is missing.

## Turn the Queue On

1. Open the repository in Treq.
2. Go to Settings → Integrations.
3. Under GitHub, enable **Merge queue**.

On the web dashboard Integrations tab you can set queue details for the repo, including the trigger label, target branch, and required checks. Those settings control when a queued entry is allowed to merge.

## Enqueue a Workspace

1. Open a workspace that already has an open GitHub PR.
2. Confirm CI is the state you expect from the header pill. See [Creating and Viewing Pull Requests](/docs/how-to/creating-and-viewing-pull-requests).
3. Click **Merge** on the workspace header.

With the queue enabled, that action enqueues the workspace through Treq. The service applies the configured trigger label on the open PR. If there is no open PR, enqueue fails and asks you to create one first.

## Watch Queue Status

Open **GitHub** → **Merge Queue** in the sidebar. The tab lists queue entries with status chips such as queued, testing, merging, merged, or failed. Entries group by stack when workspaces target each other, matching the [workspace stack](/docs/concepts/workspaces) order.

Workspace sidebar rows also show a queue status dot when statuses exist. The panel refreshes on a short interval while you keep it open.

## Remove Entries

From the Merge Queue tab you can remove one entry or remove a stack segment. Removing a mid-stack branch also removes everything above it, so higher layers cannot stay queued ahead of a missing base.

## How Merges Stay Safe

The queue merges a PR only when all of these hold:

- The PR is still open
- The PR still targets the configured branch
- The head SHA matches the SHA the lane tested
- Required checks succeed on that tested SHA

`neutral` and `skipped` check conclusions do not count as success when required checks are configured. If the head moves after enqueue, the entry re-queues at the new SHA instead of merging the old one.

## Next Steps

- [Connecting GitHub](/docs/how-to/connecting-github)
- [Creating and Viewing Pull Requests](/docs/how-to/creating-and-viewing-pull-requests)
- [GitHub Integration](/docs/concepts/github-integration)
- [Workspaces](/docs/concepts/workspaces)
- [Stacked PRs](/learn/concepts/git/stacked-prs)
