use crate::db::Workspace;
use crate::local_db;
use crate::jj::{self, JjRebaseResult};
use std::collections::HashSet;
use std::sync::{Mutex, OnceLock};

// Track which workspaces have been indexed this session
static INDEXED_WORKSPACES: OnceLock<Mutex<HashSet<String>>> = OnceLock::new();

#[tauri::command]
pub fn get_workspaces(repo_path: String) -> Result<Vec<Workspace>, String> {
    local_db::get_workspaces(&repo_path)
}

#[tauri::command]
pub fn add_workspace_to_db(
    repo_path: String,
    workspace_name: String,
    workspace_path: String,
    branch_name: String,
    metadata: Option<String>,
) -> Result<i64, String> {
    local_db::add_workspace(&repo_path, workspace_name, workspace_path, branch_name, metadata)
}

#[tauri::command]
pub fn delete_workspace_from_db(repo_path: String, id: i64) -> Result<(), String> {
    // Cascade delete sessions (handled by DB foreign key constraint)
    local_db::delete_workspace(&repo_path, id)
}

#[tauri::command]
pub fn rebuild_workspaces(repo_path: String) -> Result<Vec<Workspace>, String> {
    local_db::rebuild_workspaces_from_filesystem(&repo_path)
}

#[tauri::command]
pub fn update_workspace_metadata(
    repo_path: String,
    id: i64,
    metadata: String,
) -> Result<(), String> {
    local_db::update_workspace_metadata(&repo_path, id, &metadata)
}

#[tauri::command]
pub fn ensure_workspace_indexed(
    repo_path: String,
    workspace_id: Option<i64>,
    workspace_path: String,
) -> Result<bool, String> {
    let indexed = INDEXED_WORKSPACES.get_or_init(|| Mutex::new(HashSet::new()));
    let mut guard = indexed.lock().unwrap();

    // Use workspace_path as the key
    if guard.contains(&workspace_path) {
        // Already indexed this session
        return Ok(false);
    }

    // Mark as indexed
    guard.insert(workspace_path.clone());
    drop(guard);

    // Trigger indexing
    crate::file_indexer::index_workspace_files(&repo_path, workspace_id, &workspace_path)?;

    Ok(true)
}

#[tauri::command]
pub fn set_workspace_target_branch(
    repo_path: String,
    workspace_path: String,
    id: i64,
    target_branch: String,
) -> Result<JjRebaseResult, String> {
    // Convert Git remote branch format (origin/main) to jj format (main@origin)
    let jj_branch_name = if target_branch.starts_with("origin/") {
        target_branch.replace("origin/", "") + "@origin"
    } else {
        target_branch.clone()
    };

    // Perform rebase
    let rebase_result = jj::jj_rebase_onto(&workspace_path, &jj_branch_name)
        .map_err(|e| e.to_string())?;

    // If rebase succeeded (even with conflicts), save the target branch (in Git format for UI)
    if rebase_result.success || rebase_result.has_conflicts {
        local_db::update_workspace_target_branch(&repo_path, id, &target_branch)?;
    }

    Ok(rebase_result)
}
