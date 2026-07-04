---
sidebar_position: 2
---

# Terminal Sessions

_Technical overview of Treq's integrated terminal and PTY implementation._

Treq provides full-featured terminal sessions backed by the `portable-pty` Rust crate. Each workspace can have multiple independent terminal sessions with separate PTY processes.

## Architecture

The frontend renders terminal output with support for copy/paste, clickable URLs, and ANSI escape sequences for colors, formatting, and cursor control.

The backend spawns PTY processes via the `portable-pty` crate. User input goes to the PTY stdin, while shell output streams back to the frontend for rendering.

## Session Management

Each workspace can have multiple terminal sessions sharing the same working directory base. Sessions run independently with their own PTY process and output buffer. Switching between sessions preserves state. All terminals continue running in the background.

Sessions follow a simple lifecycle: creation spawns a PTY and adds it to the session manager, active sessions receive input and stream output, backgrounded sessions keep running but aren't visible, and closing terminates the PTY and cleans up resources.

## Learn More

- [Creating Terminal Sessions Guide](/docs/guides/core-workflows/creating-terminal-sessions)
- [Keyboard Shortcuts](/docs/keyboard-shortcuts)
