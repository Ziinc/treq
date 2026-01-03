---
sidebar_position: 2
---

# Terminal Sessions

_Technical overview of Treq's integrated terminal and PTY implementation._

Treq provides full-featured terminal emulation using ghostty-web on the frontend and the `portable-pty` Rust crate on the backend. Each worktree can have multiple independent terminal sessions with separate PTY processes.

## Architecture

The frontend uses ghostty-web, a WASM-based terminal emulator built on Ghostty's VT100 parser. It features hardware-accelerated canvas rendering, built-in URL detection, and full ANSI escape sequence support for colors, formatting, and cursor control.

The backend spawns PTY processes via the `portable-pty` crate—Unix PTY on macOS/Linux and ConPTY on Windows 10+. Communication flows through Tauri IPC: user input goes from ghostty-web to the PTY stdin, while shell output streams back to the frontend for rendering.

## Session Management

Each worktree can have multiple terminal sessions sharing the same working directory base. Sessions run independently with their own PTY process and output buffer. Switching between sessions preserves state—all terminals continue running in the background.

Sessions follow a simple lifecycle: creation spawns a PTY and adds it to the session manager; active sessions receive input and stream output; backgrounded sessions keep running but aren't visible; closing terminates the PTY and cleans up resources.

## Input and Output

Standard terminal input works as expected: text goes to the PTY stdin, and special keys send appropriate signals (Ctrl+C for SIGINT, Ctrl+D for EOF, Ctrl+Z for SIGTSTP). Paste operations sanitize multiline input and can warn before pasting potentially dangerous commands.

Output is batched at 60 FPS to reduce flickering. For high-volume output, rendering pauses temporarily to prevent browser freezing and resumes once caught up. The scrollback buffer uses virtual scrolling for memory efficiency.

When the terminal resizes, the frontend sends new dimensions to the backend, which calls `pty.resize()`. The shell receives SIGWINCH and adjusts its output formatting accordingly.

## Settings

Terminal settings include font family and size (any monospace font, 8-24px), cursor style (block, underline, or bar), cursor blink, scrollback line count, and bell behavior. Copy uses standard selection and clipboard APIs; pasted text has ANSI codes stripped.

## Limitations

Session limits are platform-dependent but typically support 100+ concurrent sessions. Very fast output may pause temporarily. Windows has more limited shell support compared to macOS/Linux.

## Learn More

- [Creating Terminal Sessions Guide](/docs/guides/core-workflows/creating-terminal-sessions)
- [Keyboard Shortcuts](/docs/keyboard-shortcuts)
