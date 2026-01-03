---
sidebar_position: 2
---

# Creating Terminal Sessions

_How to create and manage terminal sessions across worktrees._

Terminal sessions in Treq are full PTY shells bound to a worktree's directory. Each worktree can have multiple sessions for running parallel processes like dev servers, tests, and builds. Sessions use ghostty-web for terminal emulation with support for copy/paste, clickable URLs, and your default shell.

## Creating Sessions

When you create a worktree and click "Open," Treq automatically creates a session with the working directory set to the worktree path. To create additional sessions for an existing worktree, right-click the worktree and select **New Session**, or click the **+** icon in the session tabs.

## Managing Sessions

Give sessions meaningful names by right-clicking the tab and selecting **Rename Session**—names like "Dev Server," "Tests," or "Build" help you identify their purpose. Session tabs show status indicators: green for active, gray for backgrounded, yellow for unread output, and ✕ for exited processes.

Switch between sessions by clicking tabs, using `Cmd+1` through `Cmd+9` for quick access, or `Cmd+[` / `Cmd+]` for previous/next. The command palette (`Cmd+K`) also lets you jump to any session by name.

## Working with Multiple Sessions

Create separate sessions for long-running processes so you don't have to stop and restart them. A typical full-stack setup might use one session for the frontend dev server, another for the backend, a third for the database container, and a fourth for general commands and git operations.

The terminal supports all standard operations: `Cmd+C` to copy (or interrupt), `Cmd+V` to paste, `Cmd+F` to search output, and `Cmd+K` or `clear` to clear the screen. URLs are clickable with Cmd+Click.

## Session Settings

Configure terminal appearance in Settings → Terminal: font family (monospace fonts like Fira Code or JetBrains Mono), font size (12-16px recommended), default shell (bash, zsh, fish, or custom path), and scrollback buffer size.

To run commands automatically when a worktree is created, configure post-create commands in Settings → Repository (e.g., `npm install && npm run dev`). For session-specific initialization, set environment variables with `export` or add logic to your shell's RC file.

## Closing Sessions

Close sessions by clicking the ✕ on the tab or right-clicking and selecting **Close Session**. If processes are running, you'll be asked to confirm. Periodically close unused sessions to keep the UI clean—terminal buffers consume minimal resources but clutter adds up.

## Troubleshooting

If a session won't open, verify the shell path in Settings → Terminal → Default Shell (`which zsh` or `which bash`). For garbled output, type `reset` or reopen the session. If commands fail, check your working directory with `pwd` and verify you're in the correct worktree.

## Next Steps

- [Executing Implementation Plans](executing-implementation-plans) — Use plans in terminals
- [Staging and Committing](staging-and-committing) — Git workflows
- [Customizing Settings](../tips-and-tricks/customizing-settings) — Terminal customization
