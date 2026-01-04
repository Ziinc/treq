---
sidebar_position: 2
---

# Creating Worktrees

_How to create and manage Git worktrees in Treq._

Worktrees let you work on multiple branches simultaneously, each in its own directory. Click **New Worktree** in the dashboard (or `Cmd+N`) to open the creation dialog.

## Creating a Worktree

Choose **Create new branch** and enter a name or intent like `add-user-profile`. Treq applies your branch naming pattern (default: `treq/{name}`) so this becomes `treq/add-user-profile`. Alternatively, select **From existing branch** to check out an existing local or remote branch.

Select a **base branch** (usually `main` or `develop`) that your new branch will start from. Optionally add a **plan title** like "Add user profile page with avatar upload" to help you remember what you're working on.

Click **Create Worktree**. Treq creates the directory in `.treq/worktrees/`, checks out the branch, and runs any configured post-create commands (like `npm install`).

## Working in Your Worktree

Click **Open** on the worktree card to open a terminal session. The working directory is automatically set to your worktree path. Make changes, run commands, and use Git as you normally would. Treq detects changes automatically and updates the dashboard.

The worktree card shows status indicators: commits ahead/behind the base branch, uncommitted changes, and available actions (Open, View Changes, Merge, Delete).

## Branch Naming Patterns

Configure patterns in Settings → Repository → Branch Pattern. Examples: `treq/{name}` (default), `feature/{name}`, `dev/{user}/{name}`, or just `{name}` for no prefix. Available variables include `{name}` (your input), `{user}` (git username), and `{date}` (YYYY-MM-DD).

## Post-Create Commands

Configure commands in Settings → Repository → Post-Create Commands to run automatically after creating worktrees. Examples: `npm install`, `pip install -r requirements.txt`, or `npm ci && npm run dev`. Uncheck "Run post-create commands" in the dialog to skip for a single creation.

## Working with Remote Branches

To work on a teammate's branch, first fetch (`git fetch origin`), then create a worktree from the existing branch and select the remote branch (e.g., `origin/feature-branch`). Treq creates a local tracking branch.

## FAQ

**Where are worktrees stored?** In `.treq/worktrees/{branch-name}/` relative to your repository.

**Can I use my regular editor?** Yes—open the worktree directory in VS Code, Cursor, or any editor.

**Can I create multiple worktrees?** Yes, create as many as you need for different features or fixes.

**How do I delete a worktree?** Click Delete on the worktree card (after committing or discarding changes).

## Troubleshooting

If you see "Branch already exists," choose a different name or select the existing branch. If post-create commands fail, the worktree is still created—run commands manually in the terminal. If a worktree doesn't appear, use Settings → Rebuild Worktrees Database.

## Next Steps

- [Interface Overview](interface-overview) — Understand the UI
- [Staging and Committing](../core-workflows/staging-and-committing) — Commit your changes
- [Merging Worktrees](../core-workflows/merging-worktrees) — Merge back to main
