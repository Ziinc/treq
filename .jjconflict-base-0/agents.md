# Treq - AI Agent Reference

Essential information for AI agents working with the Treq codebase.

## Directives (IMPORTANT)

- when instructed to TDD, do not write tests for styling, only logic
- tests should be written for either UI or rust side.

## Project Overview

Treq is a desktop application for managing JJ (Jujutsu) workspaces with integrated terminal, diff viewer, and AI editor. Built with Tauri 2.0 (Rust) and React/TypeScript.

**Key**: Uses JJ on top of Git in colocated mode for advanced workspace management with Git compatibility.

## Development Commands

```bash
npm install                   # Install dependencies
npm run build                 # Build frontend
npm run tauri build           # Build app

# Testing
npm test                      # Watch mode
npm run test:run              # Single run
npm run test:ui               # Vitest UI
cargo test                    # Rust tests

# DO NOT RUN - DEVELOPER ONLY
npm run tauri dev            # Dev mode
```

## Architecture

### Backend (src-tauri/src/)

**Core:**

- **lib.rs** - Entry point, command registry, AppState
- **main.rs** - Calls `treq_lib::run()`
- **db.rs** - Global SQLite (settings, sessions, git_cache, file_views)
- **local_db.rs** - Per-repo SQLite (workspaces, sessions, changed_files, workspace_files)

**JJ Integration:**

- **jj.rs** - JJ VCS operations (workspaces, diffs, commits, rebase, push/pull)
- **auto_rebase.rs** - Auto-rebase for target branch tracking
- **file_indexer.rs** - Workspace file indexing via `jj file list`

**Infrastructure:**

- **pty.rs** - PTY management with portable-pty
- **binary_paths.rs** - Binary detection (git, jj, claude)

**Commands (src-tauri/src/commands/):**

- **workspace.rs** - Workspace CRUD, auto-rebase, indexing
- **jj_commands.rs** - JJ command wrappers
- **session.rs** - AI session management
- **settings.rs** - App/repo settings
- **filesystem.rs** - File operations
- **file_view.rs** - File view tracking
- **pty_commands.rs** - Terminal sessions
- **binary.rs** - Binary detection
- **git_watcher.rs** - File change detection

### Frontend (src/)

**Core:**

- **App.tsx** - Root with providers (QueryClient, Theme, Terminal/Diff settings, Toast)
- **Dashboard.tsx** - Main UI, auto-rebase on focus
- **ShowWorkspace.tsx** - Workspace detail (Code/Review/Files tabs)

**Navigation:**

- **WorkspaceSidebar.tsx** - Workspace list, multi-select
- **CommandPalette.tsx** - Cmd+K
- **FilePicker.tsx** - Cmd+P
- **BranchSwitcher.tsx** - Branch switching

**Diff & Review:**

- **ChangesDiffViewer.tsx** - Main diff viewer (2508 lines), code review
- **ChangesSection.tsx** / **ConflictsSection.tsx** - File lists
- **ReviewSummaryPanel.tsx** - Review summary
- **FileBrowser.tsx** - File tree with virtualized code view

**Terminal:**

- **WorkspaceTerminalPane.tsx** - Terminal container
- **terminal/** - ClaudeTerminalPanel, ShellTerminalPanel, ResizeDivider

**Other:**

- **lib/api.ts** - Type-safe Tauri wrappers
- **hooks/** - Custom React hooks (theme, settings, keyboard, debounce)

### Hooks (src/hooks/)

- **useTheme.tsx** - Theme management
- **useTerminalSettings.tsx** - Terminal font (8-32px)
- **useDiffSettings.tsx** - Diff font (8-16px)
- **useSettingsPreloader.tsx** - Batch settings preload
- **useCachedWorkspaceChanges.ts** - Workspace cache
- **useDebounce.ts** - Debounce
- **useKeyboard.ts** - Shortcuts (j, k, p, n)

### Database Schema

**Local DB (`.treq/local.db`)** - Per repository:

- **workspaces** - id, workspace_name, workspace_path, branch_name, created_at, metadata, target_branch, has_conflicts
- **sessions** - id, workspace_id, name, created_at, last_accessed, model
- **changed_files** - id, workspace_id, file_path, workspace_status, is_untracked, hunks_json, updated_at
- **workspace_files** - id, workspace_id, file_path, relative_path, is_directory, parent_path, cached_at, mtime

**Global DB (`treq.db`)** - App-wide:

- **settings** - key, value (theme, last_repo_path, etc.)
- **sessions** - id, workspace_id, type, name, created_at, last_accessed, model (legacy)
- **git_cache** - id, workspace_path, file_path, cache_type, data, updated_at
- **file_views** - id, workspace_path, file_path, viewed_at, content_hash

## Key Patterns

- **JJ + Git Colocated** - JJ workspaces in `.treq/workspaces/` as git worktrees with `.jj` dirs
- **Dual Database** - Global (`treq.db`) for app settings, Local (`.treq/local.db`) per repo
- **Auto-Rebase** - Workspaces track `target_branch`, rebase on updates, store `has_conflicts`
- **File Indexing** - `jj file list` → hierarchical DB tree for fast search/browsing
- **Command Modules** - Commands in `commands/` submodules, re-exported via `mod.rs`
- **Session Caching** - `OnceLock<Mutex<HashSet>>` prevents redundant indexing
- **Binary Detection** - Caches git/jj/claude paths in `OnceLock`, extends PTY PATH
- **State (Frontend)** - React Query for server state, Context API for UI state
- **PTY** - portable-pty with background threads, HashMap storage, UTF-8 handling

## Key Commands (Condensed)

**Workspace:** get_workspaces, create_workspace, delete_workspace_from_db, rebuild_workspaces, set_workspace_target_branch, check_and_rebase_workspaces, ensure_workspace_indexed

**JJ:** jj_create_workspace, jj_get_changed_files, jj_get_file_hunks, jj_restore_file, jj_commit, jj_split, jj_rebase_onto, jj_get_conflicted_files, jj_push, jj_pull, jj_get_log

**PTY:** pty_create_session, pty_write, pty_resize, pty_close, pty_session_exists

**Session:** create_session, get_sessions, update_session_access, delete_session, get_session_model, set_session_model

**Settings:** get_setting, get_settings_batch, set_setting, get_repo_setting, set_repo_setting

**File System:** read_file, list_directory, list_directory_cached, search_workspace_files

**File View:** mark_file_viewed, unmark_file_viewed, get_viewed_files, clear_all_viewed_files

**Binary:** detect_binaries

## Code Style

### Rust

- **Use rustdoc comments (`///`)** for public functions, structs, enums, modules
- **No inline comments (`//`)** - code should be self-documenting
- Include `# Arguments` and `# Returns` sections in rustdoc

```rust
/// Creates a new JJ workspace at the specified path.
///
/// # Arguments
/// * `repo_path` - Path to the repository root
/// * `workspace_name` - Name for the new workspace
/// * `branch` - Branch to create or checkout
///
/// # Returns
/// Returns the workspace path on success, or an error string on failure.
pub fn create_workspace(repo_path: &str, workspace_name: &str, branch: &str) -> Result<String, String> {
    let workspace_path = format!("{}/{}", repo_path, workspace_name);
    initialize_jj_workspace(&workspace_path, branch)?;
    Ok(workspace_path)
}
```

### TypeScript/JavaScript

- **No JSDoc tags** (`@param`, `@returns`, `@type`) - TypeScript types are sufficient
- **No inline comments (`//`)** - code should be self-documenting
- Only comment complex business logic that isn't obvious

```typescript
// GOOD
export async function createWorkspace(
  repoPath: string,
  workspaceName: string,
  branch: string
): Promise<number> {
  return await invoke<number>("create_workspace", {
    repoPath,
    workspaceName,
    branch,
  });
}

// BAD - Don't do this
/**
 * Creates a workspace
 * @param repoPath - The repository path
 * @returns The workspace ID
 */
export async function createWorkspace(...) { ... }
```

## Implementation Notes

**JJ Operations:**

- Commands run in workspace/repo path
- Uses `Workspace::init_external_git()` for colocated mode
- No staging area - working copy only
- `jj_commit` for direct commits, `jj_split` for partial

**Terminal:**

- Unique session IDs (workspace path or UUID)
- Background threads with bidirectional communication
- Store `MasterPty` reference for resizing

**Cross-Platform:**

- Shell: `$SHELL` on Unix, PowerShell on Windows
- Paths: Platform-specific conversion
- Launch: `open` (macOS), `start` (Windows), `xdg-open` (Linux)

**Dependencies:**

- **react-window** - Use v2 API (`List` with `rowComponent`, `rowHeight`, `rowCount`, `listRef`)
- **Monaco Editor** - CDN loaded via `@monaco-editor/react`

**Frontend:**

- Lazy load `ShowWorkspace` with `Suspense`
- Heavy memoization (`memo`, `useMemo`, `useCallback`)
- Virtualization with `react-window`
- View modes: `"session" | "show-workspace" | "settings"`

**Keyboard:**

- Cmd+K: Command Palette
- Cmd+P: File Picker
- Cmd+J: Toggle Terminal
- Cmd+N: New Workspace

## Testing (Recommended, Not Mandatory)

**Frameworks:**

- Frontend: Vitest + Testing Library
- Backend: Rust + mockall + tempfile

**Organization:**

- Frontend: `/test/*.test.{ts,tsx}`
- Backend: `#[cfg(test)] mod tests` inline

**Patterns:**

Frontend:

```typescript
import { render, screen, waitFor } from "../test/test-utils";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";

vi.mock("../src/lib/api", () => ({
  getWorkspaces: vi.fn().mockResolvedValue([]),
}));

test("component test", async () => {
  const user = userEvent.setup();
  render(<Component />);
  await user.click(screen.getByRole("button"));
  await waitFor(() => expect(screen.getByText("Result")).toBeInTheDocument());
});
```

Backend:

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn test_function() {
        let temp_dir = TempDir::new().unwrap();
        let path = temp_dir.path().to_str().unwrap();
        // Test implementation
    }
}
```

**Guidelines:**

- Write tests before or alongside features
- Frontend: `/test/` directory
- Backend: `#[cfg(test)]` in same file
- Mock Tauri APIs (see `test/setup.ts`)
- Use `test-utils.tsx` render (includes providers)
- Use UI interactions for assertions (userEvent.click, userEvent.type, etc.)
- Clean up resources

## Common Tasks

**Add Tauri Command:**

1. Define in command module with `#[tauri::command]`
2. Export from module, ensure `commands/mod.rs` re-exports
3. Add to `lib.rs` `invoke_handler`
4. Add TypeScript wrapper in `src/lib/api.ts`

**Add Component:**

1. Create in `src/components/`
2. Use Tailwind, explicit prop types, forwardRef if needed
3. Consider test in `/test/`

**Modify JJ Operations:**

- Edit `src-tauri/src/jj.rs` or `src-tauri/src/commands/jj_commands.rs`
- Return serde-serializable structs

**Debug:**

- Frontend: DevTools
- Backend: `println!`/`eprintln!`
- Database: SQLite CLI on `.treq/local.db` or `treq.db`
