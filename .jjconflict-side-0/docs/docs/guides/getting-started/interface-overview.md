---
sidebar_position: 3
---

# Interface Overview

_Learn your way around Treq's interface._

Treq's interface is organized around a left sidebar for navigation and a main content area that changes based on your current view. The sidebar provides access to the dashboard, individual worktree sessions, and settings.

## Dashboard

The dashboard is your starting point, showing an overview of all worktrees in the repository. The left column displays the main repository's current branch, sync status with remote (commits ahead/behind), staged and unstaged change counts, and commit controls. The right column shows all active worktrees with their branch names, divergence from the base branch, and uncommitted change indicators.

Each worktree entry has action buttons for opening a terminal session, viewing the diff, initiating a merge, or deleting the worktree. Right-click any worktree for additional options like renaming or copying its path.

## Session View

Clicking "Open" on a worktree switches to the session view with two main panels. The **terminal panel** on the left provides full terminal emulation—you can run commands, navigate directories, and interact with your shell just like a standalone terminal. The **diff viewer panel** on the right shows staged and unstaged changes with syntax highlighting.

The diff viewer has a file tree at the top (staged files in green, unstaged in orange) and the actual diff display below using Monaco Editor. You can stage individual lines, hunks, or entire files directly from this view.

When working with implementation plans, a **plan panel** appears at the bottom showing the formatted plan with execution controls.

## Code Review View

The review view (accessed via a worktree's "Review" button) provides tools for code review with inline comments. The left side shows the file tree with change and viewed indicators, the center displays branch comparison diffs, and the right side contains annotation controls for adding comments to specific lines.

## Command Palette

Press `Cmd+K` (or `Ctrl+K`) to open the command palette for quick access to any action—navigation, worktree operations, git commands, and settings. It supports fuzzy search and shows recent commands at the top.

## Essential Shortcuts

`Cmd+N` creates a new worktree. In the terminal, standard copy/paste shortcuts work as expected. See the full [Keyboard Shortcuts Guide](/docs/keyboard-shortcuts) for more.

## Customization

Settings let you adjust theme (light/dark), terminal font and size, diff viewer options (line numbers, minimap, word wrap), and layout preferences. Access settings through the gear icon in the sidebar.

## Next Steps

- [Using Treq with a Git Repo](../core-workflows/using-treq-with-git-repo) — Set up your workflow
- [Creating Terminal Sessions](../core-workflows/creating-terminal-sessions) — Essential tasks
- [Customizing Settings](../tips-and-tricks/customizing-settings) — Work more efficiently
