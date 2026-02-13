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
- **core.rs** - High-level workspace orchestration (WorkspaceStatus, WorkspaceNode, WorkspaceMetadata, MergeCommit enum, SplitMode/SplitPosition enums, DAG nodes for hierarchy)
- **db.rs** - Global SQLite (settings, sessions, git_cache, file_views)
- **local_db.rs** - Per-repo SQLite (workspaces, sessions, changed_files, workspace_files, pending_reviews)

**JJ Integration:**

- **jj.rs** - JJ VCS operations (workspaces, diffs, commits, rebase, push/pull)
- **auto_rebase.rs** - Auto-rebase for target branch tracking
- **file_indexer.rs** - Workspace file indexing via `jj file list`

**Infrastructure:**

- **pty.rs** - PTY management with portable-pty
- **binary_paths.rs** - Binary detection (git, jj, claude)

**Commands (src-tauri/src/commands/):**

- **workspace.rs** - Workspace CRUD, auto-rebase, indexing, merge, split, status
- **jj_commands.rs** - JJ command wrappers
- **session.rs** - AI session management
- **settings.rs** - App/repo settings
- **filesystem.rs** - File operations
- **file_view.rs** - File view tracking
- **pty_commands.rs** - Terminal sessions
- **binary.rs** - Binary detection
- **file_watcher.rs** - File change detection
- **pending_review.rs** - Pending review persistence (load/save/clear)

### Frontend (src/)

**Core:**

- **App.tsx** - Root with providers (QueryClient, Auth, Theme, PrismThemeLoader, Terminal/Diff settings, EditorApps, Toast)
- **Dashboard.tsx** - Main UI, auto-rebase on focus
- **ShowWorkspace.tsx** - Workspace detail (Code/Review/Files tabs)

**Workspace Management:**

- **CreateWorkspaceDialog.tsx** - Create workspace with branch naming, intent, target branch selection
- **SplitWorkspaceDialog.tsx** - Split workspace (file/commit selection, move/copy, before/after)
- **MoveToWorkspaceDialog.tsx** - Move files between workspaces
- **WorkspaceDeletion.tsx** - Safe workspace deletion with confirmation
- **WorkspacePicker.tsx** - Dropdown workspace switcher
- **TargetBranchSelector.tsx** - Target branch selection for stacking/rebasing
- **WorkspaceEditSession.tsx** - Workspace edit session

**Navigation:**

- **WorkspaceSidebar.tsx** - Workspace list, multi-select
- **CommandPalette.tsx** - Cmd+K
- **FilePicker.tsx** - Cmd+P
- **BranchSwitcher.tsx** - Branch switching
- **SearchOverlay.tsx** - File/content search overlay
- **FileTreeView.tsx** - Hierarchical file tree display

**Diff & Review:**

- **ChangesDiffViewer.tsx** - Main diff viewer, code review
- **AnnotatableDiffViewer.tsx** - Advanced diff with line annotations/comments
- **ChangesSection.tsx** / **ConflictsSection.tsx** - File lists
- **CommittedChangesSection.tsx** - Committed changes display
- **GitFileRow.tsx** - Individual file change row with status badges
- **FileContextMenu.tsx** - File right-click context menu
- **LineDiffStatsDisplay.tsx** - Insertions/deletions stats
- **LinearCommitHistory.tsx** - Linear commit graph with stats
- **ReviewSummaryPanel.tsx** - Review summary
- **FileBrowser.tsx** - File tree with virtualized code view

**Merge:**

- **MergePreviewPage.tsx** - Merge preview (commits ahead, file diffs, merge/squash strategy)
- **MergeDialog.tsx** - Merge dialog with strategy selection

**Settings & Account:**

- **SettingsPage.tsx** - Tabbed settings (Application/Repository/Account)
- **RepositorySettingsContent.tsx** - Repo-level settings (branch naming patterns)
- **AccountSettings.tsx** - Auth sign-in/out, subscription status, profile display
- **ModelSelector.tsx** - AI model selection

**Terminal:**

- **WorkspaceTerminalPane.tsx** - Terminal container
- **ConsolidatedTerminal.tsx** - xterm.js terminal with addons (WebGL, search, ligatures, Unicode, images)
- **Terminal.tsx** - Terminal component
- **terminal/** - ClaudeTerminalPanel, ShellTerminalPanel, ResizeDivider

**Other:**

- **ConflictCommentCard.tsx** - Conflict info/resolution display
- **ErrorBoundary.tsx** - React error boundary
- **PrismThemeLoader.tsx** - Dynamic syntax highlighting theme loading
- **lib/api.ts** - Type-safe Tauri wrappers

### Hooks (src/hooks/)

- **useTheme.tsx** - Theme management
- **useTerminalSettings.tsx** - Terminal font (8-32px)
- **useDiffSettings.tsx** - Diff font (8-16px)
- **useSettingsPreloader.tsx** - Batch settings preload
- **useCachedWorkspaceChanges.ts** - Workspace cache
- **useDebounce.ts** - Debounce
- **useKeyboard.ts** - Shortcuts (j, k, p, n)
- **useAuth.tsx** - Authentication state, Supabase session, subscription tracking, deep-link auth callback, token exchange
- **useEditorApps.tsx** - Detect installed editors (Cursor, VSCode, Zed)
- **useCreateStackedWorkspace.ts** - Stacked workspace creation (unique branch names, parent inheritance)
- **useWorkspaceHierarchy.ts** - Workspace hierarchy ops (addAfter, addBefore, moveWorkspace, cycle detection)

### Lib (src/lib/)

- **api.ts** - Type-safe Tauri command wrappers
- **supabase.ts** - Supabase client configuration
- **features.ts** - Feature flags from package.json
- **workspace-tree.ts** - Tree utilities (buildWorkspaceTree, flattenWorkspaceTree, getAncestorChain, getDescendants, getStackRoot, getEntireStack, isDescendantOf, getValidTargets)
- **workspace-utils.ts** - Workspace utility functions
- **toast-helpers.ts** - Toast notification helpers
- **logger.ts** - Logging utilities
- **utils.ts** - General utilities (getFullWorkspacePath, etc.)
- **git-status-colors.ts** - Git status color mappings
- **git-utils.ts** - Git utility functions
- **syntax-highlight.ts** - Syntax highlighting utilities
- **text-search.ts** - Text search utilities

### Database Schema

**Local DB (`.treq/local.db`)** - Per repository:

- **workspaces** - id, workspace_name, workspace_path, branch_name, created_at, metadata, target_branch, has_conflicts, archived, not_on_remote, intent, moved_files
- **sessions** - id, workspace_id, name, created_at, last_accessed, model
- **changed_files** - id, workspace_id, file_path, workspace_status, is_untracked, hunks_json, updated_at
- **workspace_files** - id, workspace_id, file_path, relative_path, is_directory, parent_path, cached_at, mtime
- **pending_reviews** - id, workspace_id (unique), comments (JSON), viewed_files (JSON), summary_text, created_at, updated_at

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
- **Workspace Hierarchy/Stacking** - DAG of workspaces with parent/child via target_branch, cycle detection, addBefore/addAfter/move operations
- **Deep-Link Authentication** - `treq://` scheme for desktop-to-web auth, one-time token exchange via Supabase edge function
- **Supabase Integration** - Auth + subscriptions (free/pro plans) with session persistence in settings DB
- **Merge Preview** - Squash/merge strategies, commits-ahead calculation, combined diff display
- **Workspace Splitting** - Move/copy modes, before/after positioning, file/commit-based selection
- **Feature Flags** - `featureFlags` from package.json, exposed via `features.ts`
- **Editor Detection** - Detect Cursor, VSCode, Zed via macOS `mdfind` / PATH
- **File Watcher** - `notify` crate with 1s debounce, emits `workspace-files-changed` event, respects .gitignore

## Key Commands (Condensed)

**Workspace:** get_workspaces, create_workspace, add_workspace_to_db, delete_workspace_from_db, delete_workspace, push_workspace_to_remote, merge_workspace, split_workspace, cleanup_stale_workspaces, rebuild_workspaces, update_workspace_metadata, update_workspace_not_on_remote, list_workspace_statuses, get_workspace_status, set_workspace_target_branch, check_and_rebase_workspaces, ensure_workspace_indexed

**JJ:** jj_create_workspace, jj_list_workspaces, jj_remove_workspace, jj_get_workspace_info, jj_squash_to_workspace, jj_get_changed_files, jj_get_file_hunks, jj_get_file_lines, jj_restore_file, jj_restore_all, jj_commit, jj_split, jj_is_workspace, jj_init, jj_rebase_onto, jj_get_conflicted_files, jj_get_default_branch, jj_get_current_branch, jj_push, jj_get_sync_status, jj_git_fetch, jj_git_fetch_background, jj_pull, jj_get_log, jj_get_commits_ahead, jj_get_merge_diff, jj_create_merge, jj_check_branch_exists, jj_get_branches, jj_edit_bookmark, jj_track_workspace_bookmarks

**PTY:** pty_create_session, pty_write, pty_resize, pty_close, pty_session_exists

**Session:** create_session, get_sessions, update_session_access, update_session_name, delete_session, get_session_model, set_session_model

**Settings:** get_setting, get_settings_batch, set_setting, get_repo_setting, set_repo_setting

**File System:** read_file, list_directory, list_directory_cached, get_change_indicators, search_workspace_files

**File View:** mark_file_viewed, unmark_file_viewed, get_viewed_files, clear_all_viewed_files

**File Watcher:** start_file_watcher, stop_file_watcher

**Pending Review:** load_pending_review, save_pending_review, clear_pending_review

**Binary:** detect_binaries, detect_editor_apps

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
- **Supabase** - Auth + subscriptions via `@supabase/supabase-js`

**Frontend:**

- Lazy load `ShowWorkspace` with `Suspense`
- Heavy memoization (`memo`, `useMemo`, `useCallback`)
- Virtualization with `react-window`
- View modes: `"session" | "show-workspace" | "settings" | "merge-preview"`
- Deep-link auth flow: `treq://` URL scheme triggers `AuthProvider` callback, exchanges one-time token via Supabase edge function

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
