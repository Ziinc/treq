---
sidebar_position: 6
---

# Creating and Viewing Pull Requests

_Create, open, and inspect GitHub pull requests from a Treq workspace._

Once [GitHub is connected](/docs/how-to/connecting-github) and `gh` is authenticated, each workspace with a GitHub remote can create and open its pull request without leaving the app.

## Create a Pull Request

1. Open a workspace that is not the default branch.
2. Make at least one commit. Working-copy changes alone do not enable Create PR.
3. In the workspace header, click **Create PR**.

Treq pushes the branch when it is missing on the remote, then creates the PR. The title comes from a conventional-commit derivation of the workspace title or branch name. The body uses the workspace description when one exists.

Use the chevron next to **Create PR** for:

| Action | Result |
|---|---|
| Create draft PR | Same push-and-create path with a draft PR |
| Create PR manually | Push if needed, then open GitHub's compare URL with title and body filled in |

After the PR exists, **Create PR** hides. A toast offers **Open in Web**.

From the Review tab, open the Commit split button and choose **Commit and create PR** to commit, push if needed, and create the PR in one action. **Commit and push** pushes without creating a PR.

## View a Pull Request

Click **View PR** in the workspace header to open the in-app GitHub panel on that PR. The Open or Closed filter follows the PR state. Use the secondary control, or the toast action, to open the same URL in your browser.

Right-click the workspace in the sidebar and choose **Copy link to GitHub PR** when Treq already has the PR URL.

From the command palette (`Cmd+K`):

| Command | Behavior |
|---|---|
| Open Workspace PR in Browser | Opens the PR URL with the system browser helper |
| Open Workspace PR | Navigates the app webview to the PR URL on GitHub |

Prefer **View PR** when you want the dual-pane panel inside Treq.

## Use the GitHub Panel

Open **GitHub** in the sidebar, then **Pull Requests**. Select Open, Closed, or All. Click a row to open detail beside the list.

From detail you can:

- Read title, state, draft chip, head and base, labels, and body
- Read conversation comments and add a new comment
- Mark ready for review or convert to draft
- Close or reopen the PR
- Open the PR on GitHub
- Inspect the Checks section for the same CI rollup as the workspace header

Use **New** on the PR list when you need a manual title, body, base, and head instead of the workspace Create PR flow. Issues under the same GitHub panel follow the same list and detail pattern.

## Read CI Status

When checks exist for the open PR, the workspace header shows a `passed/total` pill. Open it to see each check, sorted with failures first. Durations appear when GitHub reports them. Click a check to open its URL when one is present.

The Merge button on the workspace turns solid green when every check has passed. That signals readiness. It does not merge on its own. With the [merge queue](/docs/how-to/using-the-merge-queue) enabled, Merge enqueues the open PR instead of only opening a local merge preview.

## Read GitHub Review Threads

Open the Review tab on a workspace that already has a PR. Treq loads GitHub review threads and places them on matching hunks in both uncommitted and committed diffs. Quote a thread into a local comment when you want an agent to act on it. Local comments still do not publish back to GitHub. See [Changes and Reviews](/docs/concepts/changes-and-reviews).

## Next Steps

- [Connecting GitHub](/docs/how-to/connecting-github)
- [Using the Merge Queue](/docs/how-to/using-the-merge-queue)
- [Code Review Workflow](/docs/tutorials/code-review-workflow)
- [Pushing to Remote](/docs/how-to/pushing-to-remote)
- [GitHub Integration](/docs/concepts/github-integration)
