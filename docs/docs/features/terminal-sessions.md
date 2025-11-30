---
sidebar_position: 2
---

# Terminal Sessions

Technical overview of Treq's integrated terminal and PTY implementation.

## Overview

Treq provides full-featured terminal emulation using PTY (pseudo-terminal) on the backend and xterm.js on the frontend, with session persistence and management.

## Architecture

### Components

**Frontend**: xterm.js with addons
- Web-based terminal emulator
- Supports ANSI escape sequences
- Addons: search, links, ligatures, WebGL

**Backend**: PTY (Pseudo-Terminal)
- Rust-based PTY spawning
- Uses `pty` crate
- Platform-specific implementations

**Communication**: Tauri IPC
- Bidirectional streaming
- Input from frontend → backend → shell
- Output from shell → backend → frontend

### Data Flow

```
User Input → xterm.js → Tauri IPC → PTY → Shell
                                              ↓
User Display ← xterm.js ← Tauri IPC ← PTY ← Shell Output
```

## PTY Implementation

### Session Creation

**Rust backend** (`src-tauri/src/pty.rs`):

```rust
// Simplified
pub fn create_session(working_dir: &str) -> Session {
    let pty = spawn_pty(working_dir)?;
    Session {
        id: uuid::new_v4(),
        pty,
        working_dir,
        buffer: Vec::new(),
    }
}
```

### Process Management

**Shell detection order**:
1. User-configured shell
2. `$SHELL` environment variable
3. Platform default (`zsh` on macOS, `bash` on Linux, `powershell` on Windows)

**Environment variables**:
- `TERM=xterm-256color`
- `COLORTERM=truecolor`
- `PWD={working_directory}`
- Inherits from parent process

### Platform Differences

**macOS/Linux**:
- Uses Unix PTY (`openpty()`)
- Supports all standard shells
- ANSI escape sequences

**Windows**:
- Uses ConPTY (Windows 10+)
- PowerShell or cmd.exe
- Limited ANSI support in older versions

## Frontend Terminal

### xterm.js Configuration

```typescript
const terminal = new Terminal({
  fontFamily: 'Fira Code, monospace',
  fontSize: 14,
  cursorBlink: true,
  scrollback: 1000,
  theme: {
    // Custom theme colors
  }
});
```

### Addons

**WebLinks Addon**:
- Detects URLs in output
- Makes them clickable
- Opens in default browser

**Search Addon**:
- Find text in terminal buffer
- Navigate matches
- Case-sensitive/insensitive

**WebGL Renderer**:
- Hardware-accelerated rendering
- Better performance for large outputs
- Falls back to canvas if unsupported

**Ligatures Addon**:
- Renders programming ligatures
- Requires font with ligature support
- Example: `=>` becomes single glyph

## Session Persistence

### State Storage

**In-memory**:
- Terminal output buffer (last N lines)
- Current working directory
- Active PTY reference

**In database**:
- Session ID and metadata
- Working directory
- Associated worktree
- Creation and last-access times

### Buffer Management

**Scrollback buffer**:
- Default: 1000 lines
- Configurable: 100-10,000 lines
- Stored in memory only
- Cleared on session close

**Not persisted**:
- Running processes
- Shell state (variables, functions)
- SSH connections
- Active file handles

## Terminal Operations

### Input Handling

**Text input**:
1. User types in xterm.js
2. Events captured
3. Sent via IPC to backend
4. Written to PTY stdin

**Special keys**:
- `Ctrl+C`: SIGINT to process
- `Ctrl+D`: EOF (exit shell)
- `Ctrl+Z`: SIGTSTP (suspend)

**Paste handling**:
- Sanitizes multiline input
- Confirms destructive pastes
- Escapes special characters

### Output Processing

**ANSI Escape Sequences**:
- Colors (foreground/background)
- Text formatting (bold, italic, underline)
- Cursor movement
- Screen clearing

**Binary output**:
- Filtered from display
- Prevents terminal corruption

### Resize Handling

When terminal resized:
1. Frontend detects size change
2. Sends new dimensions to backend
3. Backend calls `pty.resize(cols, rows)`
4. Shell receives SIGWINCH signal
5. Shell adjusts output formatting

## Session Management

### Multiple Sessions

**Per-worktree sessions**:
- Each worktree can have N sessions
- Sessions share working directory base
- Independent PTY processes
- Separate output buffers

**Session switching**:
- Frontend shows/hides terminal divs
- All sessions render simultaneously (hidden via CSS)
- Preserves state when switching

### Lifecycle

**Creation**: PTY spawned, added to manager
**Active**: Receiving input/output
**Backgrounded**: Still running, not visible
**Closed**: PTY terminated, resources cleaned up

## Copy/Paste

### Copy

**Text selection**:
- Click and drag to select
- `Cmd+C` / `Ctrl+C` to copy
- Uses clipboard API

**Special handling**:
- Preserves newlines
- Strips ANSI codes
- Handles multiline selections

### Paste

**Basic paste**: `Cmd+V` / `Ctrl+V`

**Smart paste**:
- Detects dangerous commands (`rm -rf`)
- Warns before pasting
- Can be disabled in settings

## Performance Optimization

### Rendering

**Batching**:
- Output buffered before rendering
- Maximum 60 FPS (16ms batching)
- Reduces flickering

**Virtualization**:
- Only visible rows rendered
- Scrollback uses virtual scrolling
- Memory efficient for large buffers

### Output Throttling

For high-volume output:
- Pauses rendering if too fast
- Displays "Output paused" message
- Resumes when caught up
- Prevents browser freezing

## Settings

### Terminal Settings

**Font**:
- Family: Any monospace font
- Size: 8-24px
- Line height: Multiplier of font size

**Behavior**:
- Scrollback lines
- Cursor style (block/underline/bar)
- Cursor blink
- Bell (visual/audio/none)

**Advanced**:
- Fast scrolling modifier
- Right-click behavior
- Scroll sensitivity

## Limitations

**Process limits**:
- Maximum sessions: Platform-dependent
- Usually 100+ sessions without issues

**Output limits**:
- Very fast output may pause
- Terminal buffer has size limit
- Long-running output may be truncated

**Platform constraints**:
- Windows: Limited shell support
- macOS: Sandbox restrictions
- Linux: Varies by distribution

## Learn More

- [Creating Terminal Sessions Guide](/docs/guides/core-workflows/creating-terminal-sessions)
- [Keyboard Shortcuts](/docs/keyboard-shortcuts)
