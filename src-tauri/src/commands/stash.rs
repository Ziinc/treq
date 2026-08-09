use crate::core;
use crate::jj::JjRevisionDiff;
use crate::local_db::StashEntry;

#[tauri::command]
pub async fn stash_workspace_changes(
  repo_path: String,
  workspace_id: Option<i64>,
) -> Result<StashEntry, String> {
  tauri::async_runtime::spawn_blocking(move || {
    core::stash_workspace_changes(&repo_path, workspace_id)
  })
  .await
  .map_err(|e| format!("Failed to join stash_workspace_changes task: {}", e))?
}

#[tauri::command]
pub async fn list_stashes(repo_path: String) -> Result<Vec<StashEntry>, String> {
  tauri::async_runtime::spawn_blocking(move || core::list_stashes(&repo_path))
    .await
    .map_err(|e| format!("Failed to join list_stashes task: {}", e))?
}

#[tauri::command]
pub async fn delete_stash(repo_path: String, stash_id: i64) -> Result<(), String> {
  tauri::async_runtime::spawn_blocking(move || core::delete_stash(&repo_path, stash_id))
    .await
    .map_err(|e| format!("Failed to join delete_stash task: {}", e))?
}

#[tauri::command]
pub async fn apply_stash(
  repo_path: String,
  stash_id: i64,
  target_branch: String,
) -> Result<(), String> {
  tauri::async_runtime::spawn_blocking(move || {
    core::apply_stash(&repo_path, stash_id, &target_branch)
  })
  .await
  .map_err(|e| format!("Failed to join apply_stash task: {}", e))?
}

#[tauri::command]
pub async fn get_stash_diff(repo_path: String, stash_id: i64) -> Result<JjRevisionDiff, String> {
  tauri::async_runtime::spawn_blocking(move || core::get_stash_diff(&repo_path, stash_id))
    .await
    .map_err(|e| format!("Failed to join get_stash_diff task: {}", e))?
}

#[tauri::command]
pub async fn export_stash_git_patch(repo_path: String, stash_id: i64) -> Result<String, String> {
  tauri::async_runtime::spawn_blocking(move || core::export_stash_git_patch(&repo_path, stash_id))
    .await
    .map_err(|e| format!("Failed to join export_stash_git_patch task: {}", e))?
}
