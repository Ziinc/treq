# Treq - AI Agent Reference

This document provides essential information for AI agents working with the Treq codebase.

## Project Overview

Treq is a modern desktop application for managing Git worktrees with integrated terminal, diff viewer, and AI editor launcher support. Built with Tauri 2.0 (Rust backend) and React/TypeScript (frontend).

**Tech Stack:**
- **Backend**: Tauri 2.0, Rust, rusqlite 0.32, portable-pty 0.8, tokio 1.0
- **Frontend**: React 18.3, TypeScript 5.6, Tailwind CSS 3.3, TanStack Query 5.12, xterm.js 5.5, Monaco Editor 0.45
- **Build Tools**: Vite 6.0, npm

## Development Commands

```bash
# Setup
npm install                    # Install dependencies

# Development - DO NOT RUN THESE COMMANDS, ONLY DEVELOPER SHOULD RUN THIS
npm run tauri dev             # Run app in dev mode (builds Rust + starts dev server)
npm run dev                   # Frontend-only dev server (without Tauri) 

# Building
npm run build                 # Build frontend
npm run tauri build           # Build production app
```



## Architecture

### Backend Structure (src-tauri/src/)

- **lib.rs** - Main entry point, Tauri command registry, global state (AppState.db, AppState.pty_manager)
- **db.rs** - SQLite database layer with 3 tables: worktrees, commands, settings
- **git.rs** - Git CLI wrapper for worktree operations (create, list, remove, status)
- **git_ops.rs** - Git operations (commit, push, pull, fetch, log)
- **pty.rs** - PTY management using portable-pty, background threads for output streaming
- **shell.rs** - Shell command execution and application launching (platform-specific)

### Frontend Structure (src/)

- **App.tsx** - Root component with QueryClient and ToastProvider
- **components/Dashboard.tsx** - Main view controller (dashboard/terminal/diff modes)
- **components/WorktreeCard.tsx** - Individual worktree display with actions
- **components/Terminal.tsx** - xterm.js wrapper with PTY integration
- **components/DiffViewer.tsx** - Monaco Editor with hierarchical file tree
- **components/CreateWorktreeDialog.tsx** - Worktree creation form
- **components/EditorLauncher.tsx** - Dropdown for launching Cursor/VS Code/Aider
- **components/ui/** - Reusable UI components (button, card, dialog, input, label, toast)
- **lib/api.ts** - Type-safe wrappers around Tauri invoke() commands
- **hooks/useKeyboard.ts** - Keyboard shortcut handler

### Communication Flow

1. **Commands (Request/Response)**: Frontend calls `invoke("command_name", args)` → Rust handler → returns `Result<T, String>`
2. **Events (Backend → Frontend)**: Rust emits via `app.emit()` → Frontend listens with `listen()` (used for PTY output streaming)

### Database Schema

Location: `~/Library/Application Support/com.treq.app/treq.db` (macOS), `~/.local/share/com.treq.app/treq.db` (Linux), `%APPDATA%/com.treq.app/treq.db` (Windows)

Tables:
- **worktrees**: id, repo_path, worktree_path, branch_name, created_at, metadata
- **commands**: id, worktree_id, command, created_at, status, output
- **settings**: key, value (e.g., "repo_path" for main repository)

## Complete Feature Set

### Core Git Worktree Management
- Create worktrees (new or existing branches)
- List all worktrees with details
- Delete worktrees with confirmation
- Real-time git status monitoring
- Branch ahead/behind tracking
- File change detection (modified, added, deleted, untracked)
- Post-creation command execution

### User Interface
- Modern, responsive design with Tailwind CSS
- Dark mode support
- Worktree cards with status indicators
- Dashboard with three view modes (dashboard, terminal, diff)
- Settings dialog for repository configuration
- Create worktree dialog with validation
- Toast notification system (success, error, info, warning)
- Search/filter worktrees
- Responsive grid layout

### Terminal Integration
- Full PTY terminal emulation with bidirectional I/O
- Proper terminal resizing
- Working directory context per worktree
- Shell detection (bash, zsh, PowerShell)
- Web links addon (clickable URLs)

### Diff Viewer
- Monaco Editor integration with syntax highlighting
- Hierarchical directory tree (expandable/collapsible)
- Lazy loading of directory contents
- Unified diff format, read-only mode

### AI Editor Integration
- Cursor, VS Code, Aider launchers
- Actual command execution (background processes)
- Cross-platform support

### Keyboard Shortcuts
- Ctrl/Cmd + N: New worktree
- Ctrl/Cmd + R: Refresh
- Ctrl/Cmd + F: Focus search
- Ctrl/Cmd + ,: Settings
- Esc: Close dialogs

### Git Operations
- Commit with message, stage all changes
- Push to remote, pull from remote, fetch from remote
- Get commit log, git status, branch info
- Get file diffs, list branches

## Key Design Patterns

### State Management
- TanStack Query for server state (auto-refresh every 30s)
- React hooks for local UI state
- No global state library - data flows through React Query cache

### Error Handling
- All Tauri commands return `Result<T, String>` in Rust
- Frontend uses toast notifications for user-facing errors
- Git command errors captured and displayed inline

### PTY/Terminal Pattern
1. Frontend creates session: `ptyCreateSession(sessionId, workingDir, shell)`
2. Backend spawns PTY, starts reader thread emitting to `pty-data-{sessionId}`
3. Frontend listens to event, renders in xterm.js
4. User input → `ptyWrite(sessionId, data)` → written to PTY stdin
5. Cleanup: `ptyClose(sessionId)` when component unmounts

### Diff Viewer Pattern
- File tree is lazy-loaded (directories expanded on click)
- `git diff` output fetched per file on selection
- Monaco Editor in read-only mode with diff syntax highlighting

## Important Implementation Notes

### Git Operations
- All git commands execute in main repository path or specific worktree path
- Worktree creation uses `git worktree add` with `-b` flag for new branches
- Status tracking uses `git status --porcelain` for parsing

### Terminal Sessions
- Each terminal has unique session ID (typically worktree path or random UUID)
- Sessions persist until explicitly closed or app shutdown
- PTY sessions run in background threads with bidirectional communication
- Proper resize functionality: Store `MasterPty` reference in session for resizing

### Cross-Platform Compatibility
- Shell detection: Unix uses `$SHELL` env var, Windows defaults to PowerShell
- Path handling: All paths converted to platform-specific format
- Editor launching: Uses platform-specific commands (open on macOS, start on Windows, xdg-open on Linux)

### Monaco Editor Integration
- Loaded from CDN (not bundled) via `@monaco-editor/react`
- Syntax highlighting for all major languages
- Diff view uses Monaco's built-in diff editor component

## Common Tasks

### Adding a New Tauri Command
1. Define Rust function with `#[tauri::command]` attribute in `src-tauri/src/lib.rs` (or relevant module)
2. Add to `invoke_handler` in `lib.rs` setup
3. Add TypeScript wrapper in `src/lib/api.ts` with proper types
4. Use in components via `invoke()` or wrap in React Query hook

### Adding a New UI Component
1. Create in `src/components/` (or `src/components/ui/` for reusable primitives)
2. Use Tailwind classes for styling
3. Follow patterns: TypeScript with explicit prop types, forwardRef for ref-able components

### Modifying Git Operations
- Git logic is in `src-tauri/src/git.rs` and `src-tauri/src/git_ops.rs`
- All commands use `std::process::Command` with proper error handling
- Return structured data (serde-serializable structs), not raw strings

### Debugging
- Frontend: Browser DevTools (Tauri opens with DevTools in dev mode)
- Backend: Rust logs via `println!` or `eprintln!` appear in terminal
- Database: Use SQLite CLI to inspect `treq.db` directly

## Key Tauri Commands

### Database
- `get_worktrees()`, `add_worktree_to_db()`, `delete_worktree_from_db(id)`
- `get_commands(worktree_id)`, `add_command()`
- `get_setting(key)`, `set_setting(key, value)`

### Git
- `git_create_worktree()`, `git_list_worktrees()`, `git_remove_worktree()`
- `git_get_status()`, `git_get_branch_info()`, `git_get_file_diff()`
- `git_list_branches()`, `git_commit()`, `git_push()`, `git_pull()`, `git_fetch()`, `git_log()`

### PTY
- `pty_create_session()`, `pty_write()`, `pty_resize()`, `pty_close()`

### Shell
- `shell_execute()`, `shell_launch_app()`

### File System
- `read_file(path)`, `list_directory(path)`

## Performance Notes

- Auto-refresh every 30 seconds with manual refresh button
- Lazy directory loading in diff viewer
- Optimistic UI updates
- Efficient state management with TanStack Query
- Background process handling for editors and terminals
- Toast auto-dismiss to prevent memory buildup

