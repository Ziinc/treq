use crate::logs::WorkspaceLogSession;

#[tauri::command]
pub fn get_workspace_logs(
    repo_path: String,
    workspace_id: Option<i64>,
    workspace_key: Option<String>,
) -> Result<Vec<WorkspaceLogSession>, String> {
    crate::logs::query_workspace_logs(&repo_path, workspace_id, workspace_key.as_deref())
}
