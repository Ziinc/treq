---
sidebar_position: 7
---

# Using the Merge Queue

_Enqueue stacked GitHub pull requests through Treq's managed merge queue._

:::note[Work in progress]

The merge queue is still work in progress and not fully shipped. This page explains the features that are currently being built.

:::

The merge queue merges open PRs in stack order after CI passes. It is a Treq service, not [GitHub's native merge queue](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/managing-a-merge-queue). Users do not need GitHub Enterprise Cloud to use it.

## Requirements

- Complete [Connecting GitHub](/docs/how-to/connecting-github) to install the GitHub App on your desired repositories.
- The user should be on the Pro Treq plan or higher.
- Merge queue needs to be [enabled](#enable-the-merge-queue) in the GitHub Integration page.
- The workspace branch needs an open pull request.

## Enable the Merge Queue

1. Open the repository in Treq.
2. Go to Settings → Integrations.
3. Under GitHub, enable **Merge queue** when the control is available.

On the web dashboard Integrations tab you can set queue details for the repo, including the trigger label, target branch, and required checks. Those settings control when a queued entry is allowed to merge.

## Enqueue a Workspace

1. Open a workspace that already has an open GitHub PR.
2. Confirm that CI passes before enqueuing it. See [Creating and Viewing Pull Requests](/docs/how-to/creating-and-viewing-pull-requests).
3. Click **Add to Queue** on the workspace header.

That action enqueues the workspace through Treq and applies the configured trigger label on the open PR. If there is no open PR, enqueue fails and asks you to create one first.

## Watch Queue Status

Open **GitHub** → **Merge Queue** in the sidebar. The tab will list the queued pull requests with the queue status. Stacks are grouped together and are merged in order.

## Remove Entries

From the Merge Queue tab you will be able to remove one entry or remove a stack. Removing a mid-stack branch will also remove everything above it, so higher layers cannot stay queued ahead of a missing base.

## How Merges Stay Safe

The queue merges a PR only when all of these hold:

- The PR is still open
- The PR still targets the configured branch
- The head SHA matches the SHA the lane tested
- Required checks succeed on that tested SHA

`neutral` and `skipped` check conclusions do not count as success when required checks are configured. If the head of a pull request moves after enqueue, the entry should re-queue at the new SHA instead of merging the old one.

## Next Steps

- [Connecting GitHub](/docs/how-to/connecting-github)
- [Creating and Viewing Pull Requests](/docs/how-to/creating-and-viewing-pull-requests)
- [GitHub Integration](/docs/concepts/github-integration)
- [Workspaces](/docs/concepts/workspaces)
- [Stacked PRs](/learn/concepts/git/stacked-prs)
- [Roadmap](/roadmap)
