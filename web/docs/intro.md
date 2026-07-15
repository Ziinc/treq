---
sidebar_position: 1
slug: /
---

# Treq

_Technical overview of Treq's workspace model, runtime behavior, and macOS-specific assumptions._

Treq is a local review and workspace manager for Git repositories. You open a Git repo, create workspaces for parallel work, and push through normal Git remotes. You do not need to know [Jujutsu](https://jj-vcs.github.io/jj/latest/) to use Treq.

Under the hood, Treq places Git and Jujutsu side by side in the same repo. That setup lets Treq rebase workspace branches when their targets move. Git worktrees cannot do that. Treq runs those repository operations for you. Dropping to the `jj` CLI is a power-user option and is not recommended for normal use.

The app treats workspaces as local execution environments for agents and humans. It tracks branch state, file changes, terminal sessions, review state, and stack relationships so work can move through review without blocking the main repository checkout.

## Architecture

Treq has four main layers.

| Layer | Responsibility |
|---|---|
| Interface | Renders the dashboard, workspace detail view, diffs, review UI, terminal panes, and settings. |
| Core runtime | Creates workspaces, reads repository state, stages files, commits changes, rebases stacks, and moves changes between workspaces. |
| Repository-local storage | Stores workspace metadata, repository settings, review comments, terminal session state, and plan history under `.treq`. This state belongs to the selected repository. |
| Global app storage | Stores app-level preferences and cross-repository state in the application database. This state follows the local app install, not a specific repository. |

Git is what you work with for remotes, authentication, and push or pull. Jujutsu beside Git supplies the revision model that makes automatic workspace rebasing possible. The interface refreshes status after user actions, file watcher events, terminal activity, and explicit refreshes. Expensive repository reads are cached and invalidated after operations that can change branch or file state.

## Workspace Behavior

A workspace is a separate working copy for one branch-like line of work. Treq creates it under `.treq/workspaces/<workspace-name>` and records metadata for display and orchestration.

Treq assumes the source repository remains the authority for shared history. Workspaces are disposable execution contexts. Delete a workspace only after committing, moving, or discarding the work you care about.

## Review Behavior

Treq reviews are local. Comments attach to files and line ranges in the workspace diff. The review UI keeps file navigation, diff viewing, inline comments, and commit history together so reviewers can inspect both cumulative changes and individual commits.

Review comments do not sync to a remote review system by default.

## Terminal Behavior

Each workspace can own multiple terminal sessions. A terminal starts in the workspace directory, runs as a real shell process, and continues running when the user switches tabs or workspaces.

Terminal state belongs to the workspace. Closing a workspace session can terminate the process behind it. Deleting a workspace closes associated sessions because the working directory no longer exists.

## Learn More

- [Workspaces](/docs/concepts/workspaces)
- [Using Treq with a Git Repository](/docs/tutorials/using-treq-with-git-repo)
- [Changes and Reviews](/docs/concepts/changes-and-reviews)
- [Under the Hood](/docs/under-the-hood)
- [Terminal Sessions](/docs/concepts/terminal-sessions)
- [CLI](/docs/reference/cli)
- [Contributing](/docs/reference/contributing)
