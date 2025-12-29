use crate::local_db;

#[tauri::command]
pub fn load_pending_review(
    repo_path: String,
    workspace_id: i64,
) -> Result<Option<local_db::PendingReview>, String> {
    local_db::get_pending_review(&repo_path, workspace_id)
}

#[tauri::command]
pub fn save_pending_review(
    repo_path: String,
    workspace_id: i64,
    comments: String,
    viewed_files: Option<String>,
    summary_text: Option<String>,
) -> Result<i64, String> {
    local_db::save_pending_review(
        &repo_path,
        workspace_id,
        &comments,
        viewed_files.as_deref(),
        summary_text.as_deref(),
    )
}

#[tauri::command]
pub fn clear_pending_review(repo_path: String, workspace_id: i64) -> Result<(), String> {
    local_db::clear_pending_review(&repo_path, workspace_id)
}
