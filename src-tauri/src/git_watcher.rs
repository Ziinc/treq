use chrono::Utc;
use notify::{RecommendedWatcher, RecursiveMode, Watcher};
use notify_debouncer_full::{new_debouncer, DebounceEventResult, Debouncer, FileIdMap};
use rayon::prelude::*;
use std::collections::{HashMap, HashSet};
use std::path::Path;
use std::sync::{Arc, RwLock};
use std::time::Duration;
use tauri::Emitter;

use crate::git_ops;
use crate::local_db::{self, CachedFileChange};

// Thresholds for smart hunk fetching
const EAGER_HUNK_FILE_THRESHOLD: usize = 10;
const EAGER_HUNK_LINES_THRESHOLD: usize = 50;

#[derive(Debug, Clone, serde::Serialize)]
pub struct WorkspaceChangesPayload {
    pub workspace_path: String,
    pub workspace_id: Option<i64>,
}

/// Global watcher manager stored in AppState
pub struct GitWatcherManager {
    watchers: Arc<RwLock<HashMap<String, WatcherHandle>>>,
    app_handle: tauri::AppHandle,
}

struct WatcherHandle {
    _watcher: Debouncer<RecommendedWatcher, FileIdMap>,
    _repo_path: String,
    _watched_paths: Vec<(Option<i64>, String)>, // (workspace_id, path)
}

impl GitWatcherManager {
    pub fn new(app_handle: tauri::AppHandle) -> Self {
        Self {
            watchers: Arc::new(RwLock::new(HashMap::new())),
            app_handle,
        }
    }

    /// Start watching a repository and its workspaces
    pub fn start_watching(
        &self,
        repo_path: String,
        workspace_paths: Vec<(Option<i64>, String)>,
    ) -> Result<(), String> {
        // Check if already watching
        {
            let watchers = self.watchers.read().unwrap();
            if watchers.contains_key(&repo_path) {
                return Ok(());
            }
        }

        // Create debouncer
        let app_handle = self.app_handle.clone();
        let repo_path_clone = repo_path.clone();
        let workspace_paths_clone = workspace_paths.clone();

        let mut debouncer = new_debouncer(
            Duration::from_secs(2),
            None,
            move |result: DebounceEventResult| {
                match result {
                    Ok(events) => {
                        handle_file_events(
                            &app_handle,
                            &repo_path_clone,
                            &workspace_paths_clone,
                            &events,
                        );
                    }
                    Err(errors) => {
                        eprintln!("File watcher errors: {:?}", errors);
                    }
                }
            },
        )
        .map_err(|e| format!("Failed to create debouncer: {}", e))?;

        // Watch all paths
        for (_workspace_id, path) in &workspace_paths {
            debouncer
                .watcher()
                .watch(Path::new(path), RecursiveMode::Recursive)
                .map_err(|e| format!("Failed to watch path {}: {}", path, e))?;
        }

        // Store watcher
        let handle = WatcherHandle {
            _watcher: debouncer,
            _repo_path: repo_path.clone(),
            _watched_paths: workspace_paths,
        };

        let mut watchers = self.watchers.write().unwrap();
        watchers.insert(repo_path, handle);

        Ok(())
    }

    /// Stop watching a repository
    pub fn stop_watching(&self, repo_path: &str) -> Result<(), String> {
        let mut watchers = self.watchers.write().unwrap();
        watchers.remove(repo_path);
        Ok(())
    }

    /// Trigger a manual rescan
    pub fn trigger_rescan(
        &self,
        repo_path: &str,
        workspace_id: Option<i64>,
    ) -> Result<(), String> {
        let workspace_path = if let Some(wid) = workspace_id {
            // Get workspace path from database
            let workspaces = local_db::get_workspaces(repo_path)?;
            workspaces
                .iter()
                .find(|w| w.id == wid)
                .map(|w| w.workspace_path.clone())
                .ok_or_else(|| "Workspace not found".to_string())?
        } else {
            repo_path.to_string()
        };

        // Manual rescan includes full file indexing
        handle_full_rescan(&self.app_handle, repo_path, workspace_id, &workspace_path, true);
        Ok(())
    }
}

/// Handle file system events
fn handle_file_events(
    app_handle: &tauri::AppHandle,
    repo_path: &str,
    workspace_paths: &[(Option<i64>, String)],
    events: &[notify_debouncer_full::DebouncedEvent],
) {
    // Group changed paths by workspace for incremental indexing
    let mut workspace_changes: HashMap<(Option<i64>, String), HashSet<String>> = HashMap::new();

    // Determine which workspace each event belongs to
    for event in events {
        for path in &event.paths {
            // Skip if should not process
            if !should_process_event(path) {
                continue;
            }

            // Check for HEAD changes (branch switch)
            if path.to_string_lossy().ends_with("/.git/HEAD") {
                // Trigger full rescan for the affected workspace (branch switch = full reindex)
                if let Some((workspace_id, workspace_path)) =
                    find_workspace_for_path(workspace_paths, path)
                {
                    handle_full_rescan(app_handle, repo_path, workspace_id, workspace_path, true);
                }
                continue;
            }

            // Handle regular file changes - collect changed paths for incremental update
            if let Some((workspace_id, workspace_path)) =
                find_workspace_for_path(workspace_paths, path)
            {
                // Extract relative path
                if let Ok(rel_path) = path.strip_prefix(workspace_path) {
                    let key = (workspace_id, workspace_path.to_string());
                    workspace_changes
                        .entry(key)
                        .or_insert_with(HashSet::new)
                        .insert(rel_path.to_string_lossy().to_string());
                }
            }
        }
    }

    // Process incremental updates for each affected workspace
    for ((workspace_id, workspace_path), changed_paths) in workspace_changes {
        handle_incremental_update(
            app_handle,
            repo_path,
            workspace_id,
            &workspace_path,
            changed_paths.into_iter().collect(),
        );
    }
}

/// Find which workspace a path belongs to
fn find_workspace_for_path<'a>(
    workspace_paths: &'a [(Option<i64>, String)],
    path: &Path,
) -> Option<(Option<i64>, &'a str)> {
    let path_str = path.to_string_lossy();

    // Find the most specific (longest) matching workspace path
    workspace_paths
        .iter()
        .filter(|(_, workspace_path)| path_str.starts_with(workspace_path))
        .max_by_key(|(_, workspace_path)| workspace_path.len())
        .map(|(workspace_id, workspace_path)| (*workspace_id, workspace_path.as_str()))
}

/// Check if an event should be processed
fn should_process_event(path: &Path) -> bool {
    let path_str = path.to_string_lossy();

    // Skip git internals except HEAD
    if path_str.contains("/.git/") && !path_str.ends_with("/.git/HEAD") {
        return false;
    }

    // Skip common non-source directories
    if path_str.contains("/node_modules/")
        || path_str.contains("/target/")
        || path_str.contains("/.jj/")
        || path_str.contains("/.treq/local.db")
    {
        return false;
    }

    // Check if file is gitignored
    if is_gitignored(path) {
        return false;
    }

    true
}

/// Check if a file is gitignored using `git check-ignore`
fn is_gitignored(path: &Path) -> bool {
    // Find the git repo root for this path
    let repo_root = path
        .ancestors()
        .find(|p| p.join(".git").exists())
        .map(|p| p.to_path_buf());

    if let Some(repo_root) = repo_root {
        let output = std::process::Command::new("git")
            .args(["check-ignore", "-q", path.to_string_lossy().as_ref()])
            .current_dir(&repo_root)
            .status();

        // Exit code 0 = ignored, 1 = not ignored
        matches!(output, Ok(status) if status.success())
    } else {
        false
    }
}

/// Handle full rescan of a workspace
/// `should_index_files`: whether to also run full file indexing (true for branch switch/manual rescan)
fn handle_full_rescan(
    app_handle: &tauri::AppHandle,
    repo_path: &str,
    workspace_id: Option<i64>,
    workspace_path: &str,
    should_index_files: bool,
) {
    // Get changed files from git
    let changed_files = match git_ops::git_get_changed_files(workspace_path) {
        Ok(files) => files,
        Err(e) => {
            eprintln!("Failed to get changed files: {}", e);
            return;
        }
    };

    // Parse into CachedFileChange format
    let now = Utc::now().to_rfc3339();
    let mut changes = Vec::new();

    for file_line in changed_files {
        if let Some((status, path)) = parse_status_line(&file_line) {
            let (staged_status, workspace_status) = parse_status_chars(&status);
            changes.push(CachedFileChange {
                id: 0, // Will be set by database
                workspace_id,
                file_path: path.to_string(),
                staged_status,
                workspace_status,
                is_untracked: status.contains('?'),
                hunks_json: None, // Will be set below if eager fetching
                updated_at: now.clone(),
            });
        }
    }

    // Smart hunk fetching: only preload for small changesets
    let should_eager_fetch_hunks = if let Ok(stats) = git_ops::get_change_stats(workspace_path) {
        stats.file_count <= EAGER_HUNK_FILE_THRESHOLD
            && (stats.lines_added + stats.lines_deleted) <= EAGER_HUNK_LINES_THRESHOLD
    } else {
        // Fallback to file count only
        changes.len() <= EAGER_HUNK_FILE_THRESHOLD
    };

    if should_eager_fetch_hunks {
        // Parallel: Fetch hunks for all files and store inline
        let hunks_results: Vec<_> = changes
            .par_iter()
            .enumerate()
            .filter_map(|(idx, change)| {
                let hunks = git_ops::git_get_file_hunks(workspace_path, &change.file_path).ok()?;
                let hunks_json = serde_json::to_string(&hunks).ok()?;
                Some((idx, hunks_json))
            })
            .collect();

        // Update changes with hunks
        for (idx, hunks_json) in hunks_results {
            if let Some(change) = changes.get_mut(idx) {
                change.hunks_json = Some(hunks_json);
            }
        }
    }
    // else: hunks will be loaded on-demand when files are selected

    // Sync to database with hunks inline
    if let Err(e) = local_db::sync_workspace_changes(repo_path, workspace_id, changes.clone()) {
        eprintln!("Failed to sync workspace changes: {}", e);
        return;
    }

    // Optionally index workspace files (only on branch switch or manual rescan)
    if should_index_files {
        if let Err(e) = crate::file_indexer::index_workspace_files(repo_path, workspace_id, workspace_path) {
            eprintln!("Failed to index workspace files: {}", e);
        }
    }

    // Emit event to frontend
    let _ = app_handle.emit(
        "workspace-changes-updated",
        WorkspaceChangesPayload {
            workspace_path: workspace_path.to_string(),
            workspace_id,
        },
    );
}

/// Handle incremental update for specific changed files
/// This is called for regular file changes (not branch switches)
fn handle_incremental_update(
    app_handle: &tauri::AppHandle,
    repo_path: &str,
    workspace_id: Option<i64>,
    workspace_path: &str,
    changed_paths: Vec<String>,
) {
    // Still need to get full git status to update the cache correctly
    // (file system events don't tell us if a file is staged/unstaged/etc)
    let changed_files = match git_ops::git_get_changed_files(workspace_path) {
        Ok(files) => files,
        Err(e) => {
            eprintln!("Failed to get changed files: {}", e);
            return;
        }
    };

    // Parse into CachedFileChange format
    let now = Utc::now().to_rfc3339();
    let mut changes = Vec::new();

    for file_line in changed_files {
        if let Some((status, path)) = parse_status_line(&file_line) {
            let (staged_status, workspace_status) = parse_status_chars(&status);
            changes.push(CachedFileChange {
                id: 0,
                workspace_id,
                file_path: path.to_string(),
                staged_status,
                workspace_status,
                is_untracked: status.contains('?'),
                hunks_json: None, // Will be set below if eager fetching
                updated_at: now.clone(),
            });
        }
    }

    // Smart hunk fetching for incremental updates too
    let should_eager_fetch_hunks = if let Ok(stats) = git_ops::get_change_stats(workspace_path) {
        stats.file_count <= EAGER_HUNK_FILE_THRESHOLD
            && (stats.lines_added + stats.lines_deleted) <= EAGER_HUNK_LINES_THRESHOLD
    } else {
        changes.len() <= EAGER_HUNK_FILE_THRESHOLD
    };

    if should_eager_fetch_hunks {
        // Parallel: Fetch hunks for all files and store inline
        let hunks_results: Vec<_> = changes
            .par_iter()
            .enumerate()
            .filter_map(|(idx, change)| {
                let hunks = git_ops::git_get_file_hunks(workspace_path, &change.file_path).ok()?;
                let hunks_json = serde_json::to_string(&hunks).ok()?;
                Some((idx, hunks_json))
            })
            .collect();

        // Update changes with hunks
        for (idx, hunks_json) in hunks_results {
            if let Some(change) = changes.get_mut(idx) {
                change.hunks_json = Some(hunks_json);
            }
        }
    }

    // Sync to database with hunks inline (still full replacement for git changes, but faster than before)
    if let Err(e) = local_db::sync_workspace_changes(repo_path, workspace_id, changes.clone()) {
        eprintln!("Failed to sync workspace changes: {}", e);
        return;
    }

    // Incremental file indexing for the changed paths only
    if !changed_paths.is_empty() {
        if let Err(e) = crate::file_indexer::index_changed_files(
            repo_path,
            workspace_id,
            workspace_path,
            changed_paths,
        ) {
            eprintln!("Failed to incrementally index changed files: {}", e);
        }
    }

    // Emit event to frontend
    let _ = app_handle.emit(
        "workspace-changes-updated",
        WorkspaceChangesPayload {
            workspace_path: workspace_path.to_string(),
            workspace_id,
        },
    );
}

/// Parse a git status line like "M  file.txt" or "?? newfile.txt"
fn parse_status_line(line: &str) -> Option<(String, String)> {
    if line.len() < 3 {
        return None;
    }

    let status = line[..2].to_string();
    let path = line[3..].to_string();
    Some((status, path))
}

/// Parse status characters into staged and workspace status
fn parse_status_chars(status: &str) -> (Option<String>, Option<String>) {
    if status.len() != 2 {
        return (None, None);
    }

    let staged_char = status.chars().nth(0).unwrap();
    let workspace_char = status.chars().nth(1).unwrap();

    let staged_status = if staged_char == ' ' {
        None
    } else {
        Some(staged_char.to_string())
    };

    let workspace_status = if workspace_char == ' ' {
        None
    } else if status == "??" {
        Some("??".to_string())
    } else {
        Some(workspace_char.to_string())
    };

    (staged_status, workspace_status)
}
