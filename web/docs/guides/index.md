---
sidebar_position: 1
---

# User Guides

Treq is an AI code review manager for developers who use coding agents. It gives each task an isolated workspace, keeps those workspaces rebased as the underlying code changes, and lets you review agent output before it reaches your main branch.

Use Treq to inspect diffs like a GitHub PR, leave inline comments, and send those comments back to an agent for changes. If you spot an issue while browsing files or reviewing a specific commit, Treq keeps that feedback tied to the code so the agent can work on it in the background.

Workspaces are separate copies of your codebase, so multiple agents can run in parallel without stepping on each other. Treq automatically rebases dependent workspaces, can hand conflict resolution to AI, and supports stacked workspaces for breaking large features into smaller reviewable branches.

Start with [Installation](getting-started/installation) to select a repository and create your first workspace.
