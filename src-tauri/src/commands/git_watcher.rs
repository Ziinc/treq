use tauri::State;
use crate::{AppState, local_db};

#[tauri::command]
pub fn start_git_watcher(
    state: State<AppState>,
    repo_path: String,
) -> Result<(), String> {
    // Get all workspace paths
    let workspaces = local_db::get_workspaces(&repo_path)?;
    let mut workspace_paths: Vec<(Option<i64>, String)> = workspaces
        .iter()
        .map(|w| (Some(w.id), w.workspace_path.clone()))
        .collect();

    // Add main repo
    workspace_paths.push((None, repo_path.clone()));

    state.watcher_manager.start_watching(repo_path, workspace_paths)
}

#[tauri::command]
pub fn stop_git_watcher(
    state: State<AppState>,
    repo_path: String,
) -> Result<(), String> {
    state.watcher_manager.stop_watching(&repo_path)
}

#[tauri::command]
pub fn trigger_workspace_scan(
    state: State<AppState>,
    repo_path: String,
    workspace_id: Option<i64>,
) -> Result<(), String> {
    state.watcher_manager.trigger_rescan(&repo_path, workspace_id)
}
