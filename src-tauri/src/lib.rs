mod db;
mod git;
mod git_ops;
mod git2_ops;
mod jj;
mod local_db;
mod plan_storage;
mod pty;

use db::{Database, FileView, GitCacheEntry, Session, Worktree};
use git::{git_init, is_git_repository, BranchListItem, *};
use git_ops::{
    BranchCommitInfo, BranchDiffFileChange, BranchDiffFileDiff, DiffHunk, LineSelection,
    MergeStrategy,
};
use ignore::WalkBuilder;
use local_db::{PlanHistoryEntry, PlanHistoryInput};
use plan_storage::{PlanFile, PlanMetadata};
use pty::PtyManager;
use std::collections::HashSet;
use std::sync::Mutex;
use tauri::menu::{MenuBuilder, MenuItemBuilder, SubmenuBuilder};
use tauri::{AppHandle, Emitter, EventTarget, Manager, State};

struct AppState {
    db: Mutex<Database>,
    pty_manager: Mutex<PtyManager>,
}

// Database commands
#[tauri::command]
fn get_worktrees(repo_path: String) -> Result<Vec<Worktree>, String> {
    local_db::get_worktrees(&repo_path)
}

#[tauri::command]
fn add_worktree_to_db(
    repo_path: String,
    worktree_path: String,
    branch_name: String,
    metadata: Option<String>,
) -> Result<i64, String> {
    local_db::add_worktree(&repo_path, worktree_path, branch_name, metadata)
}

#[tauri::command]
fn delete_worktree_from_db(repo_path: String, id: i64) -> Result<(), String> {
    // Cascade delete sessions (handled by DB foreign key constraint)
    local_db::delete_worktree(&repo_path, id)
}

#[tauri::command]
fn toggle_worktree_pin(repo_path: String, id: i64) -> Result<bool, String> {
    local_db::toggle_worktree_pin(&repo_path, id)
}

#[tauri::command]
fn rebuild_worktrees(repo_path: String) -> Result<Vec<Worktree>, String> {
    local_db::rebuild_worktrees_from_filesystem(&repo_path)
}

#[tauri::command]
fn get_git_cache(
    state: State<AppState>,
    worktree_path: String,
    file_path: Option<String>,
    cache_type: String,
) -> Result<Option<GitCacheEntry>, String> {
    let db = state.db.lock().unwrap();
    db.get_git_cache(&worktree_path, file_path.as_deref(), &cache_type)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn set_git_cache(
    state: State<AppState>,
    worktree_path: String,
    file_path: Option<String>,
    cache_type: String,
    data: String,
) -> Result<(), String> {
    let db = state.db.lock().unwrap();
    db.set_git_cache(&worktree_path, file_path.as_deref(), &cache_type, &data)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn invalidate_git_cache(state: State<AppState>, worktree_path: String) -> Result<(), String> {
    let db = state.db.lock().unwrap();
    db.invalidate_git_cache(&worktree_path)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn preload_worktree_git_data(state: State<AppState>, worktree_path: String) -> Result<(), String> {
    let changed_files = git_ops::git_get_changed_files(&worktree_path)?;
    let serialized_changes = serde_json::to_string(&changed_files).map_err(|e| e.to_string())?;

    {
        let db = state.db.lock().unwrap();
        db.set_git_cache(&worktree_path, None, "changed_files", &serialized_changes)
            .map_err(|e| e.to_string())?;
    }

    let file_paths: HashSet<String> = changed_files
        .iter()
        .filter_map(|entry| extract_path_from_status_entry(entry))
        .collect();

    for path in file_paths {
        match git_ops::git_get_file_hunks(&worktree_path, &path) {
            Ok(hunks) => match serde_json::to_string(&hunks) {
                Ok(serialized_hunks) => {
                    let cache_result = {
                        let db = state.db.lock().unwrap();
                        db.set_git_cache(
                            &worktree_path,
                            Some(&path),
                            "file_hunks",
                            &serialized_hunks,
                        )
                    };
                    if let Err(err) = cache_result {
                        eprintln!("Failed to cache hunks for {}: {}", path, err);
                    }
                }
                Err(err) => {
                    eprintln!("Failed to serialize hunks for {}: {}", path, err);
                }
            },
            Err(err) => {
                eprintln!("Failed to preload hunks for {}: {}", path, err);
            }
        }
    }

    Ok(())
}

#[tauri::command]
fn get_setting(state: State<AppState>, key: String) -> Result<Option<String>, String> {
    let db = state.db.lock().unwrap();
    db.get_setting(&key).map_err(|e| e.to_string())
}

#[tauri::command]
fn set_setting(state: State<AppState>, key: String, value: String) -> Result<(), String> {
    let db = state.db.lock().unwrap();
    db.set_setting(&key, &value).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_repo_setting(
    state: State<AppState>,
    repo_path: String,
    key: String,
) -> Result<Option<String>, String> {
    let db = state.db.lock().unwrap();
    db.get_repo_setting(&repo_path, &key)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn set_repo_setting(
    state: State<AppState>,
    repo_path: String,
    key: String,
    value: String,
) -> Result<(), String> {
    let db = state.db.lock().unwrap();
    db.set_repo_setting(&repo_path, &key, &value)
        .map_err(|e| e.to_string())
}

// Git commands
#[tauri::command]
fn git_create_worktree(
    state: State<AppState>,
    app: AppHandle,
    repo_path: String,
    branch: String,
    new_branch: bool,
    source_branch: Option<String>,
) -> Result<String, String> {
    // Ensure repo is properly configured
    ensure_repo_ready(&state, &app, &repo_path)?;

    // Load inclusion patterns from database
    let inclusion_patterns = {
        let db = state.db.lock().unwrap();
        db.get_repo_setting(&repo_path, "included_copy_files")
            .ok()
            .flatten()
            .map(|patterns_str| {
                patterns_str
                    .lines()
                    .map(|s| s.trim().to_string())
                    .filter(|s| !s.is_empty())
                    .collect::<Vec<String>>()
            })
    };

    create_worktree(
        &repo_path,
        &branch,
        new_branch,
        source_branch.as_deref(),
        inclusion_patterns,
    )
}

#[tauri::command]
fn git_get_current_branch(
    state: State<AppState>,
    app: AppHandle,
    repo_path: String,
) -> Result<String, String> {
    ensure_repo_ready(&state, &app, &repo_path)?;
    get_current_branch(&repo_path)
}

#[tauri::command]
fn git_execute_post_create_command(
    worktree_path: String,
    command: String,
) -> Result<String, String> {
    git::execute_post_create_command(&worktree_path, &command)
}

#[tauri::command]
fn git_list_worktrees(
    state: State<AppState>,
    app: AppHandle,
    repo_path: String,
) -> Result<Vec<WorktreeInfo>, String> {
    ensure_repo_ready(&state, &app, &repo_path)?;
    list_worktrees(&repo_path)
}

#[tauri::command]
fn git_remove_worktree(repo_path: String, worktree_path: String) -> Result<String, String> {
    remove_worktree(&repo_path, &worktree_path)
}

#[tauri::command]
fn git_get_status(worktree_path: String) -> Result<GitStatus, String> {
    // Try git2 first (faster), fallback to subprocess if it fails
    git2_ops::get_status_git2(&worktree_path)
        .or_else(|_| get_git_status(&worktree_path))
}

#[tauri::command]
fn git_get_branch_info(worktree_path: String) -> Result<BranchInfo, String> {
    // Try git2 first (faster), fallback to subprocess if it fails
    git2_ops::get_branch_info_git2(&worktree_path)
        .or_else(|_| get_branch_info(&worktree_path))
}

#[tauri::command]
fn git_get_branch_divergence(
    worktree_path: String,
    base_branch: String,
) -> Result<BranchDivergence, String> {
    // Try git2 first (faster), fallback to subprocess if it fails
    git2_ops::get_divergence_git2(&worktree_path, &base_branch)
        .or_else(|_| get_branch_divergence(&worktree_path, &base_branch))
}

#[tauri::command]
fn git_get_line_diff_stats(
    worktree_path: String,
    base_branch: String,
) -> Result<git_ops::LineDiffStats, String> {
    git_ops::git_get_line_diff_stats(&worktree_path, &base_branch)
}

#[tauri::command]
fn git_get_diff_between_branches(
    repo_path: String,
    base_branch: String,
    head_branch: String,
) -> Result<Vec<BranchDiffFileDiff>, String> {
    git_ops::git_get_diff_between_branches(&repo_path, &base_branch, &head_branch)
}

#[tauri::command]
fn git_get_changed_files_between_branches(
    repo_path: String,
    base_branch: String,
    head_branch: String,
) -> Result<Vec<BranchDiffFileChange>, String> {
    git_ops::git_get_changed_files_between_branches(&repo_path, &base_branch, &head_branch)
}

#[tauri::command]
fn git_get_commits_between_branches(
    repo_path: String,
    base_branch: String,
    head_branch: String,
    limit: Option<usize>,
) -> Result<Vec<BranchCommitInfo>, String> {
    git_ops::git_get_commits_between_branches(&repo_path, &base_branch, &head_branch, limit)
}

#[tauri::command]
fn git_list_branches(repo_path: String) -> Result<Vec<String>, String> {
    list_branches(&repo_path)
}

#[tauri::command]
fn git_list_branches_detailed(repo_path: String) -> Result<Vec<BranchListItem>, String> {
    list_branches_detailed(&repo_path)
}

#[tauri::command]
fn git_checkout_branch(
    repo_path: String,
    branch_name: String,
    create_new: bool,
) -> Result<String, String> {
    checkout_branch(&repo_path, &branch_name, create_new)
}

#[tauri::command]
fn git_is_repository(path: String) -> Result<bool, String> {
    is_git_repository(&path)
}

#[tauri::command]
fn git_init_repo(path: String) -> Result<String, String> {
    git_init(&path)
}

#[tauri::command]
fn git_list_gitignored_files(repo_path: String) -> Result<Vec<String>, String> {
    list_gitignored_files(&repo_path)
}

#[tauri::command]
fn git_merge(
    repo_path: String,
    branch: String,
    strategy: String,
    commit_message: Option<String>,
) -> Result<String, String> {
    let strategy = match strategy.as_str() {
        "regular" => MergeStrategy::Regular,
        "squash" => MergeStrategy::Squash,
        "no_ff" => MergeStrategy::NoFastForward,
        "ff_only" => MergeStrategy::FastForwardOnly,
        other => {
            return Err(format!("Unsupported merge strategy: {}", other));
        }
    };

    git_ops::git_merge(&repo_path, &branch, strategy, commit_message.as_deref())
}

#[tauri::command]
fn git_discard_all_changes(worktree_path: String) -> Result<String, String> {
    git_ops::git_discard_all_changes(&worktree_path)
}

#[tauri::command]
fn git_discard_files(worktree_path: String, file_paths: Vec<String>) -> Result<String, String> {
    git_ops::git_discard_files(&worktree_path, file_paths)
}

#[tauri::command]
fn git_has_uncommitted_changes(worktree_path: String) -> Result<bool, String> {
    git_ops::has_uncommitted_changes(&worktree_path)
}

#[tauri::command]
fn git_stash_push_files(
    worktree_path: String,
    file_paths: Vec<String>,
    message: String,
) -> Result<String, String> {
    git::git_stash_push_files(&worktree_path, file_paths, &message)
}

#[tauri::command]
fn git_stash_pop(worktree_path: String) -> Result<String, String> {
    git::git_stash_pop(&worktree_path)
}

// PTY commands
#[tauri::command]
fn pty_create_session(
    state: State<AppState>,
    app: AppHandle,
    session_id: String,
    working_dir: Option<String>,
    shell: Option<String>,
    initial_command: Option<String>,
) -> Result<(), String> {
    let pty_manager = state.pty_manager.lock().unwrap();
    let sid = session_id.clone();

    pty_manager.create_session(
        session_id,
        working_dir,
        shell,
        initial_command,
        Box::new(move |data| {
            let _ = app.emit(&format!("pty-data-{}", sid), data);
        }),
    )
}

#[tauri::command]
fn pty_session_exists(state: State<AppState>, session_id: String) -> Result<bool, String> {
    let pty_manager = state.pty_manager.lock().unwrap();
    Ok(pty_manager.session_exists(&session_id))
}

#[tauri::command]
fn pty_write(state: State<AppState>, session_id: String, data: String) -> Result<(), String> {
    let pty_manager = state.pty_manager.lock().unwrap();
    pty_manager.write_to_session(&session_id, &data)
}

#[tauri::command]
fn pty_resize(
    state: State<AppState>,
    session_id: String,
    rows: u16,
    cols: u16,
) -> Result<(), String> {
    let pty_manager = state.pty_manager.lock().unwrap();
    pty_manager.resize_session(&session_id, rows, cols)
}

#[tauri::command]
fn pty_close(state: State<AppState>, session_id: String) -> Result<(), String> {
    let pty_manager = state.pty_manager.lock().unwrap();
    pty_manager.close_session(&session_id)
}

// File system commands
#[tauri::command]
fn read_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(path).map_err(|e| e.to_string())
}

#[derive(serde::Serialize)]
struct DirectoryEntry {
    name: String,
    path: String,
    is_directory: bool,
}

#[tauri::command]
fn list_directory(path: String) -> Result<Vec<DirectoryEntry>, String> {
    use std::path::Path;

    let base_path = Path::new(&path);
    let mut files = Vec::new();

    // Use ignore::WalkBuilder to respect .gitignore patterns
    let walker = WalkBuilder::new(&path)
        .max_depth(Some(1)) // Only immediate children
        .hidden(false) // Show hidden files (except those in .gitignore)
        .git_ignore(true) // Respect .gitignore patterns
        .git_global(true) // Respect global gitignore
        .git_exclude(true) // Respect .git/info/exclude
        .parents(true) // Check parent directories for ignore files
        .build();

    for entry in walker {
        if let Ok(entry) = entry {
            let entry_path = entry.path();

            // Skip the base directory itself
            if entry_path == base_path {
                continue;
            }

            if let Some(name) = entry_path.file_name().and_then(|n| n.to_str()) {
                let is_dir = entry_path.is_dir();
                files.push(DirectoryEntry {
                    name: name.to_string(),
                    path: entry_path.to_string_lossy().to_string(),
                    is_directory: is_dir,
                });
            }
        }
    }

    // Sort: directories first, then files
    files.sort_by(|a, b| match (a.is_directory, b.is_directory) {
        (true, false) => std::cmp::Ordering::Less,
        (false, true) => std::cmp::Ordering::Greater,
        _ => a.name.cmp(&b.name),
    });

    Ok(files)
}

// Git operations
#[tauri::command]
fn git_commit(worktree_path: String, message: String) -> Result<String, String> {
    git_ops::git_commit(&worktree_path, &message)
}

#[tauri::command]
fn git_add_all(worktree_path: String) -> Result<String, String> {
    git_ops::git_add_all(&worktree_path)
}

#[tauri::command]
fn git_unstage_all(worktree_path: String) -> Result<String, String> {
    git_ops::git_unstage_all(&worktree_path)
}

#[tauri::command]
fn git_push(worktree_path: String) -> Result<String, String> {
    git_ops::git_push(&worktree_path)
}

#[tauri::command]
fn git_push_force(worktree_path: String) -> Result<String, String> {
    git_ops::git_push_force(&worktree_path)
}

#[tauri::command]
fn git_commit_amend(worktree_path: String, message: String) -> Result<String, String> {
    git_ops::git_commit_amend(&worktree_path, &message)
}

#[tauri::command]
fn git_pull(worktree_path: String) -> Result<String, String> {
    git_ops::git_pull(&worktree_path)
}

#[tauri::command]
fn git_fetch(worktree_path: String) -> Result<String, String> {
    git_ops::git_fetch(&worktree_path)
}

#[tauri::command]
fn git_stage_file(worktree_path: String, file_path: String) -> Result<String, String> {
    git_ops::git_stage_file(&worktree_path, &file_path)
}

#[tauri::command]
fn git_unstage_file(worktree_path: String, file_path: String) -> Result<String, String> {
    git_ops::git_unstage_file(&worktree_path, &file_path)
}

#[tauri::command]
fn git_get_changed_files(worktree_path: String) -> Result<Vec<String>, String> {
    git_ops::git_get_changed_files(&worktree_path)
}

fn extract_path_from_status_entry(entry: &str) -> Option<String> {
    if entry.starts_with("?? ") {
        return Some(entry[3..].trim().to_string());
    }

    if entry.len() < 4 {
        return None;
    }

    let raw = entry[3..].trim();
    if raw.is_empty() {
        return None;
    }

    if let Some(idx) = raw.rfind(" -> ") {
        Some(raw[idx + 4..].trim().to_string())
    } else {
        Some(raw.to_string())
    }
}

#[tauri::command]
fn git_stage_hunk(worktree_path: String, patch: String) -> Result<String, String> {
    git_ops::git_stage_hunk(&worktree_path, &patch)
}

#[tauri::command]
fn git_unstage_hunk(worktree_path: String, patch: String) -> Result<String, String> {
    git_ops::git_unstage_hunk(&worktree_path, &patch)
}

#[tauri::command]
fn git_get_file_hunks(worktree_path: String, file_path: String) -> Result<Vec<DiffHunk>, String> {
    git_ops::git_get_file_hunks(&worktree_path, &file_path)
}

#[tauri::command]
fn git_get_file_lines(
    worktree_path: String,
    file_path: String,
    is_staged: bool,
    start_line: usize,
    end_line: usize,
) -> Result<git_ops::FileLines, String> {
    git_ops::git_get_file_lines(&worktree_path, &file_path, is_staged, start_line, end_line)
}

#[tauri::command]
fn git_stage_selected_lines(
    worktree_path: String,
    file_path: String,
    selections: Vec<LineSelection>,
    metadata_lines: Vec<String>,
    hunks: Vec<(String, Vec<String>)>,
) -> Result<String, String> {
    git_ops::git_stage_selected_lines(
        &worktree_path,
        &file_path,
        selections,
        metadata_lines,
        hunks,
    )
}

#[tauri::command]
fn git_unstage_selected_lines(
    worktree_path: String,
    file_path: String,
    selections: Vec<LineSelection>,
    metadata_lines: Vec<String>,
    hunks: Vec<(String, Vec<String>)>,
) -> Result<String, String> {
    git_ops::git_unstage_selected_lines(
        &worktree_path,
        &file_path,
        selections,
        metadata_lines,
        hunks,
    )
}

// Plan history commands
#[tauri::command]
fn save_executed_plan_command(
    repo_path: String,
    worktree_id: i64,
    plan_data: PlanHistoryInput,
) -> Result<i64, String> {
    local_db::save_executed_plan(&repo_path, worktree_id, plan_data)
}

#[tauri::command]
fn get_worktree_plans_command(
    repo_path: String,
    worktree_id: i64,
    limit: Option<i64>,
) -> Result<Vec<PlanHistoryEntry>, String> {
    local_db::get_worktree_plans(&repo_path, worktree_id, limit)
}

#[tauri::command]
fn get_all_worktree_plans_command(
    repo_path: String,
    worktree_id: i64,
) -> Result<Vec<PlanHistoryEntry>, String> {
    local_db::get_all_worktree_plans(&repo_path, worktree_id)
}

// Plan storage commands
#[tauri::command]
fn save_plan_to_file(
    repo_path: String,
    plan_id: String,
    content: String,
    metadata: PlanMetadata,
) -> Result<(), String> {
    plan_storage::save_plan_to_file(&repo_path, &plan_id, &content, metadata)
}

#[tauri::command]
fn load_plans_from_files(repo_path: String) -> Result<Vec<PlanFile>, String> {
    plan_storage::load_plans_from_files(&repo_path)
}

#[tauri::command]
fn get_plan_file(repo_path: String, plan_id: String) -> Result<PlanFile, String> {
    plan_storage::get_plan_file(&repo_path, &plan_id)
}

#[tauri::command]
fn delete_plan_file(repo_path: String, plan_id: String) -> Result<(), String> {
    plan_storage::delete_plan_file(&repo_path, &plan_id)
}

// Session management commands
#[tauri::command]
fn create_session(
    repo_path: String,
    worktree_id: Option<i64>,
    name: String,
    plan_title: Option<String>,
) -> Result<i64, String> {
    local_db::add_session(&repo_path, worktree_id, name, plan_title)
}

#[tauri::command]
fn get_sessions(repo_path: String) -> Result<Vec<Session>, String> {
    local_db::get_sessions(&repo_path)
}

#[tauri::command]
fn update_session_access(repo_path: String, id: i64) -> Result<(), String> {
    local_db::update_session_access(&repo_path, id)
}

#[tauri::command]
fn update_session_name(repo_path: String, id: i64, name: String) -> Result<(), String> {
    local_db::update_session_name(&repo_path, id, name)
}

#[tauri::command]
fn delete_session(repo_path: String, id: i64) -> Result<(), String> {
    local_db::delete_session(&repo_path, id)
}

#[tauri::command]
fn get_session_model(repo_path: String, id: i64) -> Result<Option<String>, String> {
    local_db::get_session_model(&repo_path, id)
}

#[tauri::command]
fn set_session_model(repo_path: String, id: i64, model: Option<String>) -> Result<(), String> {
    local_db::set_session_model(&repo_path, id, model)
}

// File view tracking commands
#[tauri::command]
fn mark_file_viewed(
    state: State<AppState>,
    worktree_path: String,
    file_path: String,
    content_hash: String,
) -> Result<(), String> {
    let db = state.db.lock().unwrap();
    db.mark_file_viewed(&worktree_path, &file_path, &content_hash)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn unmark_file_viewed(
    state: State<AppState>,
    worktree_path: String,
    file_path: String,
) -> Result<(), String> {
    let db = state.db.lock().unwrap();
    db.unmark_file_viewed(&worktree_path, &file_path)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn get_viewed_files(
    state: State<AppState>,
    worktree_path: String,
) -> Result<Vec<FileView>, String> {
    let db = state.db.lock().unwrap();
    db.get_viewed_files(&worktree_path)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn clear_all_viewed_files(state: State<AppState>, worktree_path: String) -> Result<(), String> {
    let db = state.db.lock().unwrap();
    db.clear_all_viewed_files(&worktree_path)
        .map_err(|e| e.to_string())
}

/// Check if a path has a jj workspace
#[tauri::command]
fn jj_is_workspace(repo_path: String) -> bool {
    jj::is_jj_workspace(&repo_path)
}

/// Manually initialize jj for a repository
#[tauri::command]
fn jj_init(state: State<AppState>, repo_path: String) -> Result<bool, String> {
    let db = state.db.lock().unwrap();
    jj::ensure_jj_initialized(&db, &repo_path).map_err(|e| e.to_string())
}

/// Ensure repository is properly configured before operations
/// This includes git config and jj initialization
/// Emits event to frontend if initialization fails
fn ensure_repo_ready(
    state: &State<AppState>,
    app: &AppHandle,
    repo_path: &str,
) -> Result<(), String> {
    // Only initialize if it's a git repository
    if !is_git_repository(repo_path).unwrap_or(false) {
        return Ok(());
    }

    #[derive(Clone, serde::Serialize)]
    struct InitError {
        repo_path: String,
        error: String,
        error_type: String,
    }

    // Ensure .jj and .treq are in .gitignore (runs on every repo open)
    if let Err(ref error) = jj::ensure_gitignore_entries(repo_path) {
        let _ = app.emit(
            "repo-init-error",
            InitError {
                repo_path: repo_path.to_string(),
                error: error.to_string(),
                error_type: "gitignore".to_string(),
            },
        );
    }

    // Get DB and check/initialize git config
    let git_result = {
        let db = state.db.lock().unwrap();
        git::ensure_repo_configured(&db, repo_path)
    };

    // If git config failed, emit event for frontend notification
    if let Err(ref error) = git_result {
        let _ = app.emit(
            "repo-init-error",
            InitError {
                repo_path: repo_path.to_string(),
                error: error.clone(),
                error_type: "git-config".to_string(),
            },
        );
    }

    // Initialize jj for git repository
    let jj_result = {
        let db = state.db.lock().unwrap();
        jj::ensure_jj_initialized(&db, repo_path)
    };

    match jj_result {
        Ok(true) => {
            // jj was newly initialized - emit success event
            #[derive(Clone, serde::Serialize)]
            struct JjInitSuccess {
                repo_path: String,
            }
            let _ = app.emit(
                "jj-initialized",
                JjInitSuccess {
                    repo_path: repo_path.to_string(),
                },
            );
        }
        Ok(false) => {
            // Already initialized, no action needed
        }
        Err(jj::JjError::AlreadyInitialized) | Err(jj::JjError::NotGitRepository) => {
            // Not an error, just skip
        }
        Err(ref error) => {
            // Other errors should be reported
            let _ = app.emit(
                "repo-init-error",
                InitError {
                    repo_path: repo_path.to_string(),
                    error: error.to_string(),
                    error_type: "jj-init".to_string(),
                },
            );
        }
    }

    // Don't block operation even if init failed
    Ok(())
}

/// Emits an event only to the focused webview window.
/// Falls back to broadcasting if no focused window is found.
fn emit_to_focused<S: serde::Serialize + Clone>(app: &AppHandle, event: &str, payload: S) {
    for (label, window) in app.webview_windows() {
        if window.is_focused().unwrap_or(false) {
            let _ = app.emit_to(EventTarget::webview_window(&label), event, payload);
            return;
        }
    }
    // Fallback: emit globally if no focused window found
    let _ = app.emit(event, payload);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            // Initialize database
            let app_dir = app
                .path()
                .app_data_dir()
                .expect("Failed to get app data dir");
            std::fs::create_dir_all(&app_dir).expect("Failed to create app data directory");
            let db_path = app_dir.join("treq.db");

            let db = Database::new(db_path).expect("Failed to open database");
            db.init().expect("Failed to initialize database");

            let pty_manager = PtyManager::new();

            let app_state = AppState {
                db: Mutex::new(db),
                pty_manager: Mutex::new(pty_manager),
            };

            app.manage(app_state);

            // Create menu
            #[cfg(target_os = "macos")]
            {
                use tauri::menu::PredefinedMenuItem;

                // App menu (automatically gets app name on macOS)
                let app_menu = SubmenuBuilder::new(app, "App")
                    .item(&PredefinedMenuItem::hide(app, None)?)
                    .item(&PredefinedMenuItem::hide_others(app, None)?)
                    .item(&PredefinedMenuItem::show_all(app, None)?)
                    .separator()
                    .item(&PredefinedMenuItem::quit(app, None)?)
                    .build()?;

                // File menu items
                let open_item = MenuItemBuilder::with_id("open", "Open...")
                    .accelerator("CmdOrCtrl+O")
                    .build(app)?;

                let open_new_window_item =
                    MenuItemBuilder::with_id("open_new_window", "Open in New Window...")
                        .accelerator("CmdOrCtrl+Shift+O")
                        .build(app)?;

                let file_menu = SubmenuBuilder::new(app, "File")
                    .item(&open_item)
                    .item(&open_new_window_item)
                    .build()?;

                // Edit menu with native shortcuts
                let edit_menu = SubmenuBuilder::new(app, "Edit")
                    .item(&PredefinedMenuItem::undo(app, None)?)
                    .item(&PredefinedMenuItem::redo(app, None)?)
                    .separator()
                    .item(&PredefinedMenuItem::cut(app, None)?)
                    .item(&PredefinedMenuItem::copy(app, None)?)
                    .item(&PredefinedMenuItem::paste(app, None)?)
                    .item(&PredefinedMenuItem::select_all(app, None)?)
                    .build()?;

                // View menu
                let view_menu = SubmenuBuilder::new(app, "View")
                    .item(&PredefinedMenuItem::fullscreen(app, None)?)
                    .build()?;

                // Go menu items
                let dashboard_item = MenuItemBuilder::with_id("dashboard", "Dashboard")
                    .accelerator("CmdOrCtrl+D")
                    .build(app)?;

                let settings_item = MenuItemBuilder::with_id("settings", "Settings")
                    .accelerator("CmdOrCtrl+,")
                    .build(app)?;

                let go_menu = SubmenuBuilder::new(app, "Go")
                    .item(&dashboard_item)
                    .item(&settings_item)
                    .build()?;

                // Window menu
                let window_menu = SubmenuBuilder::new(app, "Window")
                    .item(&PredefinedMenuItem::minimize(app, None)?)
                    .item(&PredefinedMenuItem::maximize(app, None)?)
                    .separator()
                    .item(&PredefinedMenuItem::close_window(app, None)?)
                    .build()?;

                // Help menu
                let learn_more_item = MenuItemBuilder::with_id("learn_more", "Learn More")
                    .build(app)?;

                let help_menu = SubmenuBuilder::new(app, "Help")
                    .item(&learn_more_item)
                    .build()?;

                let menu = MenuBuilder::new(app)
                    .item(&app_menu)
                    .item(&file_menu)
                    .item(&edit_menu)
                    .item(&view_menu)
                    .item(&go_menu)
                    .item(&window_menu)
                    .item(&help_menu)
                    .build()?;

                app.set_menu(menu)?;
            }

            #[cfg(not(target_os = "macos"))]
            {
                // File menu items
                let open_item = MenuItemBuilder::with_id("open", "Open...")
                    .accelerator("CmdOrCtrl+O")
                    .build(app)?;

                let open_new_window_item =
                    MenuItemBuilder::with_id("open_new_window", "Open in New Window...")
                        .accelerator("CmdOrCtrl+Shift+O")
                        .build(app)?;

                let file_menu = SubmenuBuilder::new(app, "File")
                    .item(&open_item)
                    .item(&open_new_window_item)
                    .build()?;

                // Go menu items
                let dashboard_item = MenuItemBuilder::with_id("dashboard", "Dashboard")
                    .accelerator("CmdOrCtrl+D")
                    .build(app)?;

                let settings_item = MenuItemBuilder::with_id("settings", "Settings")
                    .accelerator("CmdOrCtrl+,")
                    .build(app)?;

                let go_menu = SubmenuBuilder::new(app, "Go")
                    .item(&dashboard_item)
                    .item(&settings_item)
                    .build()?;

                let menu = MenuBuilder::new(app)
                    .item(&file_menu)
                    .item(&go_menu)
                    .build()?;

                app.set_menu(menu)?;
            }

            // Handle menu events - emit only to focused window
            app.on_menu_event(move |app, event| {
                match event.id().as_ref() {
                    "dashboard" => emit_to_focused(app, "navigate-to-dashboard", ()),
                    "settings" => emit_to_focused(app, "navigate-to-settings", ()),
                    "open" => emit_to_focused(app, "menu-open-repository", ()),
                    "open_new_window" => emit_to_focused(app, "menu-open-in-new-window", ()),
                    "learn_more" => {
                        #[cfg(target_os = "macos")]
                        {
                            use tauri_plugin_opener::OpenerExt;
                            let _ = app.opener().open_url("https://treq.dev", None::<&str>);
                        }
                    }
                    _ => {}
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_worktrees,
            add_worktree_to_db,
            delete_worktree_from_db,
            toggle_worktree_pin,
            rebuild_worktrees,
            get_setting,
            set_setting,
            get_repo_setting,
            set_repo_setting,
            get_git_cache,
            set_git_cache,
            invalidate_git_cache,
            preload_worktree_git_data,
            git_create_worktree,
            git_get_current_branch,
            git_execute_post_create_command,
            git_list_worktrees,
            git_remove_worktree,
            git_get_status,
            git_get_branch_info,
            git_get_branch_divergence,
            git_get_line_diff_stats,
            git_get_diff_between_branches,
            git_get_changed_files_between_branches,
            git_get_commits_between_branches,
            git_list_branches,
            git_list_branches_detailed,
            git_checkout_branch,
            git_is_repository,
            git_init_repo,
            git_list_gitignored_files,
            git_merge,
            git_discard_all_changes,
            git_discard_files,
            git_has_uncommitted_changes,
            git_stash_push_files,
            git_stash_pop,
            git_commit,
            git_commit_amend,
            git_add_all,
            git_unstage_all,
            git_push,
            git_push_force,
            git_pull,
            git_fetch,
            git_stage_file,
            git_unstage_file,
            git_stage_hunk,
            git_unstage_hunk,
            git_get_changed_files,
            git_get_file_hunks,
            git_get_file_lines,
            git_stage_selected_lines,
            git_unstage_selected_lines,
            pty_create_session,
            pty_session_exists,
            pty_write,
            pty_resize,
            pty_close,
            read_file,
            list_directory,
            save_executed_plan_command,
            get_worktree_plans_command,
            get_all_worktree_plans_command,
            save_plan_to_file,
            load_plans_from_files,
            get_plan_file,
            delete_plan_file,
            create_session,
            get_sessions,
            update_session_access,
            update_session_name,
            delete_session,
            get_session_model,
            set_session_model,
            mark_file_viewed,
            unmark_file_viewed,
            get_viewed_files,
            clear_all_viewed_files,
            jj_is_workspace,
            jj_init,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
