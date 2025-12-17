# Treq - AI Agent Reference

This document provides essential information for AI agents working with the Treq codebase.

## Project Overview

Treq is a modern desktop application for managing Git worktrees with integrated terminal, diff viewer, and AI editor launcher support. Built with Tauri 2.0 (Rust backend) and React/TypeScript (frontend).

## Development Commands

```bash
npm install                   # Install dependencies
npm run build                 # Build frontend (production)
npm run tauri build           # Build complete production app

# DO NOT RUN DEV COMMANDS - ONLY DEVELOPER SHOULD RUN THESE
npm run tauri dev            # Run in dev mode (Rust + frontend dev server)
```



## Architecture

### Backend Structure (src-tauri/src/)

- **lib.rs** - Main entry point, Tauri command registry, global state (AppState.db, AppState.pty_manager)
- **db.rs** - SQLite database layer with dual-database architecture:
  - **Local DB** (`.treq/local.db` in each repo): worktrees, commands (repo-specific data)
  - **Global DB** (`~/Library/Application Support/.../treq.db`): settings (application-level config)
- **git.rs** - Git CLI wrapper for worktree operations (create, list, remove, status)
- **git_ops.rs** - Git operations (commit, push, pull, fetch, log)
- **pty.rs** - PTY management using portable-pty, background threads for output streaming
- **shell.rs** - Shell command execution and application launching (platform-specific)

### Frontend Structure (src/)

**Core Components:**
- **App.tsx** - Root with QueryClient provider, routing, and global state
- **components/Dashboard.tsx** - Main UI controller (repository dashboard)
- **components/ShowWorkspace.tsx** - Workspace viewer with overview, changes, and files tabs
- **components/StagingDiffViewer.tsx** - Git staging area with file tree and diff view
- **components/AnnotatableDiffViewer.tsx** - Diff viewer with annotation support
- **components/ui/** - Shadcn-based UI primitives

**Key Modules:**
- **lib/api.ts** - Type-safe Tauri command wrappers
- **hooks/** - React hooks for keyboard shortcuts, terminal management, etc.

### Communication Flow

1. **Commands (Request/Response)**: Frontend calls `invoke("command_name", args)` → Rust handler → returns `Result<T, String>`
2. **Events (Backend → Frontend)**: Rust emits via `app.emit()` → Frontend listens with `listen()` (used for PTY output streaming)

### Database Schema

Treq uses a dual-database architecture to separate local repository data from global application settings:

#### Local Database (`.treq/local.db`)
**Location**: `.treq/local.db` in each Git repository root
**Purpose**: Repository-specific worktree and command history data
**Tables**:
- **worktrees**: id, repo_path, worktree_path, branch_name, created_at, metadata
- **commands**: id, worktree_id, command, created_at, status, output

#### Global Database (`treq.db`)
**Location**: `~/Library/Application Support/com.treq.app/treq.db` (macOS), `~/.local/share/com.treq.app/treq.db` (Linux), `%APPDATA%/com.treq.app/treq.db` (Windows)
**Purpose**: Application-level settings and state shared across all repositories
**Tables**:
- **settings**: key, value (e.g., "last_repo_path", global preferences)

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
3. Frontend listens to event, renders in ghostty-web terminal
4. User input → `ptyWrite(sessionId, data)` → written to PTY stdin
5. Cleanup: `ptyClose(sessionId)` when component unmounts

### Diff Viewer Pattern
- File tree is lazy-loaded (directories expanded on click)
- `git diff` output fetched per file on selection
- Monaco Editor in read-only mode with diff syntax highlighting

## Important Implementation Notes

### Dependencies
- **react-window**: Always use v2 API (not v1). Use `List` component with `rowComponent`, `rowHeight`, `rowCount`, and `listRef` props. The v1 `VariableSizeList` API is deprecated.

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
- Database: Use SQLite CLI to inspect databases:
  - Local DB: `.treq/local.db` in each repository (worktrees, commands)
  - Global DB: `treq.db` in app data directory (settings)

## Key Tauri Commands

### Database
- **Worktrees**: `get_worktrees()`, `add_worktree_to_db()`, `delete_worktree_from_db()`
- **Settings**: `get_setting()`, `set_setting()`, `get_repo_setting()`, `set_repo_setting()`, `delete_repo_setting()`
- **Sessions**: `create_session()`, `get_sessions()`, `update_session_access()`, `delete_session()`
- **Cache**: `get_git_cache()`, `set_git_cache()`, `invalidate_git_cache()`, `preload_worktree_git_data()`
- **File Views**: `mark_file_viewed()`, `unmark_file_viewed()`, `get_viewed_files()`, `clear_all_viewed_files()`

### Git
- **Worktrees**: `git_create_worktree()`, `git_list_worktrees()`, `git_remove_worktree()`
- **Status**: `git_get_status()`, `git_get_branch_info()`, `git_get_branch_divergence()`, `git_get_changed_files()`, `git_get_file_hunks()`
- **Diffs**: `git_get_file_diff()`, `git_get_diff_between_branches()`, `git_get_commits_between_branches()`
- **Staging**: `git_stage_file()`, `git_unstage_file()`, `git_add_all()`, `git_unstage_all()`, `git_stage_hunk()`, `git_stage_selected_lines()`
- **Commits**: `git_commit()`, `git_commit_amend()`, `git_log()`
- **Remote**: `git_push()`, `git_push_force()`, `git_pull()`, `git_fetch()`
- **Branches**: `git_list_branches()`, `git_merge()`, `git_get_current_branch()`
- **Changes**: `git_discard_all_changes()`, `git_stash_push_files()`, `git_stash_pop()`

### PTY
- `pty_create_session()`, `pty_write()`, `pty_resize()`, `pty_close()`, `pty_session_exists()`

### File System
- `read_file()`, `list_directory()`, `calculate_directory_size()`

### Shell
- `shell_execute(command, working_dir)`

### Plans
- `save_executed_plan_command()`, `get_worktree_plans_command()`, `save_plan_to_file()`, `load_plans_from_files()`


