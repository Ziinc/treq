---
sidebar_position: 5
---

# Connecting GitHub

_Set up the GitHub CLI and the Treq GitHub App so workspaces can open PRs and manage repository linking._

Treq talks to GitHub in two ways. Pull requests, issues, CI, and review threads use the local `gh` CLI. Connected repositories and the in-progress merge queue use the Treq GitHub App through your Treq account. Complete the `gh` path for Create PR and CI. Add the App when you need connected-repo management or want to follow merge queue progress.

## Confirm a GitHub Remote

Treq only enables GitHub UI when `origin` is a `github.com` remote:

```bash
git remote -v
```

SSH and HTTPS GitHub URLs both work. Remotes on other hosts keep ordinary [push](/docs/how-to/pushing-to-remote) behavior without Create PR or CI pills.

## Install and Authenticate `gh`

Install the [GitHub CLI](https://cli.github.com/), then authenticate on the machine that runs Treq:

```bash
gh auth login
gh auth status
```

Without a working `gh` session, Create PR, View PR, the GitHub panel, CI status, and inline review threads stay empty or fail when invoked. The app does not embed a separate GitHub OAuth flow for those actions.

## Sign In to Treq

Open Settings → Integrations in the desktop app. If you are signed out, choose **Sign in with Browser** and finish the Treq account flow.

Free accounts see public connected repositories. Pro accounts see public and private ones. Merge queue opt-in appears for Pro when that work is available, but the queue itself is still WIP.

## Install the Treq GitHub App

1. In Settings → Integrations, choose **Manage GitHub**. That opens the web dashboard Integrations tab.
2. Start the GitHub App install from the dashboard. Treq mints a single-use install intent, then sends you through GitHub's install screen.
3. Pick the organization or user and the repositories the App may access.
4. Complete the callback so Treq records the installation and repository list.

Back in the desktop app, Connected repositories should list the repos the App can see for your plan. If a repo is missing, re-open Manage GitHub and adjust the App's repository access on GitHub.

## Enable the Merge Queue for a Repo

:::note[Work in progress]

The merge queue is not fully shipped. The Integrations toggle may appear while the end-to-end product is still incomplete.

:::

The planned merge queue needs Pro, an App-linked repository, and a per-repo opt-in:

1. Open the repository in Treq.
2. Go to Settings → Integrations.
3. Under GitHub, turn on **Merge queue**, or choose **Enable merge queue** when the control is available.

If the toggle is missing, the page states the blocker: no GitHub remote, Free plan, or App not installed on that `owner/repo`. The intended queue workflow is covered in [Using the Merge Queue](/docs/how-to/using-the-merge-queue).

## Verify the Connection

1. Open a non-default-branch [workspace](/docs/concepts/workspaces) that already has a commit.
2. Confirm **Create PR** appears in the workspace header, or **View PR** if a PR already exists.
3. Open **GitHub** in the sidebar and load Pull Requests for the repo.
4. Run `treq st` in a terminal. A linked PR prints as `GitHub: owner/repo#N` when `gh` can resolve it.

## Next Steps

- [Creating and Viewing Pull Requests](/docs/how-to/creating-and-viewing-pull-requests)
- [GitHub Integration](/docs/concepts/github-integration)
- [Customizing Settings](/docs/how-to/customizing-settings)
- [Security and Privacy](/docs/security-and-privacy)
