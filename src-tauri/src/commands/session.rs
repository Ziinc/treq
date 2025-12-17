use crate::db::Session;
use crate::local_db;

#[tauri::command]
pub fn create_session(
    repo_path: String,
    workspace_id: Option<i64>,
    name: String,
) -> Result<i64, String> {
    local_db::add_session(&repo_path, workspace_id, name)
}

#[tauri::command]
pub fn get_sessions(repo_path: String) -> Result<Vec<Session>, String> {
    local_db::get_sessions(&repo_path)
}

#[tauri::command]
pub fn update_session_access(repo_path: String, id: i64) -> Result<(), String> {
    local_db::update_session_access(&repo_path, id)
}

#[tauri::command]
pub fn update_session_name(repo_path: String, id: i64, name: String) -> Result<(), String> {
    local_db::update_session_name(&repo_path, id, name)
}

#[tauri::command]
pub fn delete_session(repo_path: String, id: i64) -> Result<(), String> {
    local_db::delete_session(&repo_path, id)
}

#[tauri::command]
pub fn get_session_model(repo_path: String, id: i64) -> Result<Option<String>, String> {
    local_db::get_session_model(&repo_path, id)
}

#[tauri::command]
pub fn set_session_model(repo_path: String, id: i64, model: Option<String>) -> Result<(), String> {
    local_db::set_session_model(&repo_path, id, model)
}
