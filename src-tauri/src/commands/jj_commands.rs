use crate::jj;
use crate::AppState;
use tauri::{AppHandle, State};

// JJ Workspace commands

#[tauri::command]
pub fn jj_create_workspace(
    state: State<AppState>,
    _app: AppHandle,
    repo_path: String,
    workspace_name: String,
    branch: String,
    new_branch: bool,
    source_branch: Option<String>,
) -> Result<String, String> {
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

    jj::create_workspace(
        &repo_path,
        &workspace_name,
        &branch,
        new_branch,
        source_branch.as_deref(),
        inclusion_patterns,
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn jj_list_workspaces(
    _state: State<AppState>,
    _app: AppHandle,
    repo_path: String,
) -> Result<Vec<jj::WorkspaceInfo>, String> {
    jj::list_workspaces(&repo_path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn jj_remove_workspace(repo_path: String, workspace_path: String) -> Result<(), String> {
    jj::remove_workspace(&repo_path, &workspace_path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn jj_get_workspace_info(workspace_path: String) -> Result<jj::WorkspaceInfo, String> {
    jj::get_workspace_info(&workspace_path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn jj_squash_to_workspace(
    source_workspace_path: String,
    target_workspace_name: String,
    file_paths: Option<Vec<String>>,
) -> Result<String, String> {
    jj::squash_to_workspace(&source_workspace_path, &target_workspace_name, file_paths)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn jj_get_changed_files(workspace_path: String) -> Result<Vec<jj::JjFileChange>, String> {
    jj::jj_get_changed_files(&workspace_path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn jj_get_file_hunks(
    workspace_path: String,
    file_path: String,
) -> Result<Vec<jj::JjDiffHunk>, String> {
    jj::jj_get_file_hunks(&workspace_path, &file_path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn jj_get_file_lines(
    workspace_path: String,
    file_path: String,
    from_parent: bool,
    start_line: usize,
    end_line: usize,
) -> Result<jj::JjFileLines, String> {
    jj::jj_get_file_lines(
        &workspace_path,
        &file_path,
        from_parent,
        start_line,
        end_line,
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn jj_restore_file(workspace_path: String, file_path: String) -> Result<String, String> {
    jj::jj_restore_file(&workspace_path, &file_path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn jj_restore_all(workspace_path: String) -> Result<String, String> {
    jj::jj_restore_all(&workspace_path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn jj_commit(workspace_path: String, message: String) -> Result<String, String> {
    let result = jj::jj_commit(&workspace_path, &message).map_err(|e| e.to_string())?;

    // Trigger auto-rebase in background (fire-and-forget)
    std::thread::spawn(move || {
        // Derive repo path and get committed branch
        if let Some(repo_path) = jj::derive_repo_path_from_workspace(&workspace_path) {
            if let Ok(branch) = jj::get_workspace_branch(&workspace_path) {
                // Fire and forget - don't block commit result on rebase
                let _ = crate::auto_rebase::rebase_after_commit(&repo_path, &branch);
            }
        }
    });

    Ok(result)
}

#[tauri::command]
pub fn jj_split(
    workspace_path: String,
    message: String,
    file_paths: Vec<String>,
) -> Result<String, String> {
    let result = jj::jj_split(&workspace_path, &message, file_paths).map_err(|e| e.to_string())?;

    // Trigger auto-rebase in background (fire-and-forget)
    std::thread::spawn(move || {
        // Derive repo path and get committed branch
        if let Some(repo_path) = jj::derive_repo_path_from_workspace(&workspace_path) {
            if let Ok(branch) = jj::get_workspace_branch(&workspace_path) {
                // Fire and forget - don't block split result on rebase
                let _ = crate::auto_rebase::rebase_after_commit(&repo_path, &branch);
            }
        }
    });

    Ok(result)
}

/// Check if a path has a jj workspace
#[tauri::command]
pub fn jj_is_workspace(repo_path: String) -> bool {
    jj::is_jj_workspace(&repo_path)
}

/// Manually initialize jj for a repository
#[tauri::command]
pub fn jj_init(state: State<AppState>, repo_path: String) -> Result<bool, String> {
    let db = state.db.lock().unwrap();
    jj::ensure_jj_initialized(&db, &repo_path).map_err(|e| e.to_string())
}

/// Rebase workspace onto a target branch
#[tauri::command]
pub fn jj_rebase_onto(
    workspace_path: String,
    target_branch: String,
) -> Result<jj::JjRebaseResult, String> {
    jj::jj_rebase_onto(&workspace_path, &target_branch).map_err(|e| e.to_string())
}

/// Get list of conflicted files in workspace
#[tauri::command]
pub fn jj_get_conflicted_files(workspace_path: String) -> Result<Vec<String>, String> {
    jj::get_conflicted_files(&workspace_path, None).map_err(|e| e.to_string())
}

/// Get the default branch of the repository (main/master)
#[tauri::command]
pub fn jj_get_default_branch(repo_path: String) -> Result<String, String> {
    jj::get_default_branch(&repo_path).map_err(|e| e.to_string())
}

/// Get the current branch of a workspace
#[tauri::command]
pub fn jj_get_current_branch(workspace_path: String) -> Result<String, String> {
    jj::get_workspace_branch(&workspace_path).map_err(|e| e.to_string())
}

/// Push changes to remote using jj git push
#[tauri::command]
pub fn jj_push(workspace_path: String, force: Option<bool>) -> Result<String, String> {
    jj::jj_push(&workspace_path, force.unwrap_or(false)).map_err(|e| e.to_string())
}

/// Get sync status with remote (ahead/behind counts)
#[tauri::command]
pub fn jj_get_sync_status(workspace_path: String, branch_name: String) -> Result<(usize, usize), String> {
    jj::jj_get_sync_status(&workspace_path, &branch_name).map_err(|e| e.to_string())
}

/// Fetch remote branches using jj git fetch (without rebasing)
#[tauri::command]
pub fn jj_git_fetch(repo_path: String) -> Result<String, String> {
    jj::jj_git_fetch(&repo_path).map_err(|e| e.to_string())
}

/// Fetch remote branches in background (fire-and-forget)
#[tauri::command]
pub fn jj_git_fetch_background(repo_path: String) -> Result<(), String> {
    std::thread::spawn(move || {
        let _ = jj::jj_git_fetch(&repo_path);
    });
    Ok(())
}

/// Pull changes from remote using jj git fetch + rebase
#[tauri::command]
pub fn jj_pull(workspace_path: String) -> Result<String, String> {
    jj::jj_pull(&workspace_path).map_err(|e| e.to_string())
}

/// Get commit log for a workspace
#[tauri::command]
pub fn jj_get_log(
    workspace_path: String,
    target_branch: String,
    is_home_repo: Option<bool>,
) -> Result<jj::JjLogResult, String> {
    jj::jj_get_log(&workspace_path, &target_branch, is_home_repo).map_err(|e| e.to_string())
}

/// Get commits ahead of target branch (commits to be merged)
#[tauri::command]
pub fn jj_get_commits_ahead(
    workspace_path: String,
    target_branch: String,
) -> Result<jj::JjCommitsAhead, String> {
    jj::jj_get_commits_ahead(&workspace_path, &target_branch).map_err(|e| e.to_string())
}

/// Get combined diff between workspace and target branch
#[tauri::command]
pub fn jj_get_merge_diff(
    workspace_path: String,
    target_branch: String,
) -> Result<jj::JjRevisionDiff, String> {
    jj::jj_get_merge_diff(&workspace_path, &target_branch).map_err(|e| e.to_string())
}

/// Create a merge commit combining workspace changes with target branch
#[tauri::command]
pub fn jj_create_merge(
    workspace_path: String,
    workspace_branch: String,
    target_branch: String,
    message: String,
) -> Result<jj::JjMergeResult, String> {
    jj::jj_create_merge_commit(&workspace_path, &workspace_branch, &target_branch, &message)
        .map_err(|e| e.to_string())
}

/// Check if a branch exists locally and/or remotely
#[tauri::command]
pub fn jj_check_branch_exists(
    repo_path: String,
    branch_name: String,
) -> Result<jj::BranchStatus, String> {
    jj::check_branch_exists(&repo_path, &branch_name).map_err(|e| e.to_string())
}

/// Get list of branches in the repository
#[tauri::command]
pub fn jj_get_branches(repo_path: String) -> Result<Vec<jj::JjBranch>, String> {
    jj::get_branches(&repo_path).map_err(|e| e.to_string())
}

/// Edit/switch to a bookmark (similar to git checkout)
#[tauri::command]
pub fn jj_edit_bookmark(repo_path: String, bookmark_name: String) -> Result<String, String> {
    jj::jj_edit_bookmark(&repo_path, &bookmark_name).map_err(|e| e.to_string())
}

#[derive(Debug, serde::Serialize)]
pub struct BookmarkTrackingResult {
    pub tracked: Vec<String>,
    pub failed: Vec<(String, String)>,
    pub already_tracked: Vec<String>,
}

/// Track remote bookmarks for all workspaces in a repository
/// Used on app startup to ensure bookmarks are properly tracked with origin
#[tauri::command]
pub fn jj_track_workspace_bookmarks(
    repo_path: String,
    state: State<AppState>,
) -> Result<BookmarkTrackingResult, String> {

    let remote = "origin";

    // Get currently tracked bookmarks
    let tracked_bookmarks = match jj::is_bookmark_tracked(&repo_path, "", remote) {
        Ok(_) => {
            // If we got here, use bookmark list command to get all tracked ones
            match std::process::Command::new("jj")
                .current_dir(&repo_path)
                .args(["bookmark", "list", "--tracked", "--remote", remote])
                .output()
            {
                Ok(output) if output.status.success() => {
                    let stdout = String::from_utf8_lossy(&output.stdout);
                    stdout
                        .lines()
                        .filter_map(|line| {
                            let trimmed = line.trim();
                            if !trimmed.is_empty() && !trimmed.starts_with("@") {
                                if let Some(colon_pos) = trimmed.find(':') {
                                    let name = trimmed[..colon_pos].trim().trim_start_matches('*');
                                    return Some(name.to_string());
                                }
                            }
                            None
                        })
                        .collect::<std::collections::HashSet<_>>()
                }
                _ => std::collections::HashSet::new(),
            }
        }
        Err(_) => std::collections::HashSet::new(),
    };

    // Get all workspace branches from database
    let workspace_branches: Vec<String> = {
        match state.db.lock() {
            Ok(_db) => {
                match crate::local_db::get_workspaces(&repo_path) {
                    Ok(workspaces) => workspaces.into_iter().map(|ws| ws.branch_name).collect(),
                    Err(_) => Vec::new(),
                }
            }
            Err(_) => Vec::new(),
        }
    };

    let mut result = BookmarkTrackingResult {
        tracked: Vec::new(),
        failed: Vec::new(),
        already_tracked: Vec::new(),
    };

    // Track each untracked workspace bookmark
    for branch_name in workspace_branches {
        if tracked_bookmarks.contains(&branch_name) {
            result.already_tracked.push(branch_name.clone());
            continue;
        }

        match jj::jj_bookmark_track(&repo_path, &branch_name, remote) {
            Ok(_) => {
                eprintln!("[BookmarkTracking] Tracked {branch_name}@{remote}");
                result.tracked.push(branch_name);
            }
            Err(e) => {
                eprintln!("[BookmarkTracking] Failed to track {branch_name}@{remote}: {}", e);
                result.failed.push((branch_name, e.to_string()));
            }
        }
    }

    Ok(result)
}
