use crate::conflict_markers;
use crate::core;
use crate::jj;
use crate::AppState;
use tauri::State;

// JJ Workspace commands

#[tauri::command]
pub fn get_workspace_file_hunks(
    state: State<AppState>,
    repo_path: String,
    workspace_id: Option<i64>,
    file_path: String,
) -> Result<Vec<jj::JjDiffHunk>, String> {
    let conflict_style = state
        .db
        .lock()
        .unwrap()
        .get_setting("conflict_marker_style")
        .ok()
        .flatten()
        .unwrap_or_else(|| "git".to_string());
    crate::core::list_file_hunks(&repo_path, workspace_id, &file_path, &conflict_style)
}

#[tauri::command]
pub fn get_workspace_file_lines(
    repo_path: String,
    workspace_id: Option<i64>,
    file_path: String,
    from_parent: bool,
    start_line: usize,
    end_line: usize,
) -> Result<jj::JjFileLines, String> {
    crate::core::get_file_lines(
        &repo_path,
        workspace_id,
        &file_path,
        from_parent,
        start_line,
        end_line,
    )
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
pub fn create_commit(
    repo_path: String,
    workspace_id: Option<i64>,
    message: String,
) -> Result<String, String> {
    crate::core::commit_workspace(&repo_path, workspace_id, &message)
}

#[tauri::command]
pub fn list_commits(
    repo_path: String,
    workspace_id: Option<i64>,
    include_target_branch_history: Option<bool>,
    target_branch_limit: Option<usize>,
    limit: Option<usize>,
) -> Result<crate::jj::JjLogResult, String> {
    crate::core::list_commits(
        &repo_path,
        workspace_id,
        include_target_branch_history.unwrap_or(false),
        target_branch_limit,
        limit,
    )
}

#[tauri::command]
pub fn jj_split(
    workspace_path: String,
    message: String,
    file_paths: Vec<String>,
) -> Result<String, String> {
    let result = jj::jj_split(&workspace_path, &message, file_paths).map_err(|e| e.to_string())?;

    // Run auto-rebase synchronously so jj state is settled before returning
    if let Some(repo_path) = jj::derive_repo_path_from_workspace(&workspace_path) {
        if let Ok(branch) = jj::get_workspace_branch(&workspace_path) {
            let _ = crate::auto_rebase::rebase_after_commit(&repo_path, &branch);
        }
    }

    Ok(result)
}

/// Fetch remote branches in background (fire-and-forget)
#[tauri::command]
pub fn jj_git_fetch_background(repo_path: String) -> Result<(), String> {
    std::thread::spawn(move || {
        let _ = jj::jj_git_fetch(&repo_path);
    });
    Ok(())
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
pub fn get_workspace_diff(
    state: State<AppState>,
    repo_path: String,
    workspace_id: i64,
) -> Result<jj::JjRevisionDiff, String> {
    let conflict_style = state
        .db
        .lock()
        .unwrap()
        .get_setting("conflict_marker_style")
        .ok()
        .flatten()
        .unwrap_or_else(|| "git".to_string());
    crate::core::workspace_diff(&repo_path, workspace_id, &conflict_style)
}

/// Get diff for a single commit by revision (commit_id or change_id)
#[tauri::command]
pub fn get_commit_diff(
    state: State<AppState>,
    repo_path: String,
    workspace_id: Option<i64>,
    revision: String,
) -> Result<jj::JjRevisionDiff, String> {
    let conflict_style = state
        .db
        .lock()
        .unwrap()
        .get_setting("conflict_marker_style")
        .ok()
        .flatten()
        .unwrap_or_else(|| "git".to_string());

    crate::core::get_commit_diff(&repo_path, workspace_id, &revision, &conflict_style)
}

/// Check if a branch exists locally and/or remotely
#[tauri::command]
pub fn jj_check_branch_exists(
    repo_path: String,
    branch_name: String,
) -> Result<jj::BranchStatus, String> {
    jj::check_branch_exists(&repo_path, &branch_name).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_repo_branches(repo_path: String) -> Result<Vec<jj::JjBranch>, String> {
    core::list_repo_branches(&repo_path)
}

/// Switch the repository working copy to the given bookmark (branch).
#[tauri::command]
pub fn switch_repo_branch(repo_path: String, bookmark_name: String) -> Result<String, String> {
    core::switch_repo_branch(&repo_path, &bookmark_name)
}

/// Parse conflict markers from file content.
///
/// # Arguments
/// * `content` - The full text content of a file
/// * `file_path` - Path to the file (used for generating region IDs)
///
/// # Returns
/// A vector of conflict regions found in the content.
#[tauri::command]
pub fn parse_conflict_markers(
    content: String,
    file_path: String,
) -> Vec<conflict_markers::ConflictRegion> {
    conflict_markers::parse_conflict_markers(&content, &file_path)
}
