use crate::{db::FileView, AppState};
use tauri::State;

#[tauri::command]
pub fn mark_file_viewed(
    state: State<AppState>,
    workspace_path: String,
    file_path: String,
    content_hash: String,
) -> Result<(), String> {
    let db = state.db.lock().unwrap();
    db.mark_file_viewed(&workspace_path, &file_path, &content_hash)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn unmark_file_viewed(
    state: State<AppState>,
    workspace_path: String,
    file_path: String,
) -> Result<(), String> {
    let db = state.db.lock().unwrap();
    db.unmark_file_viewed(&workspace_path, &file_path)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_viewed_files(
    state: State<AppState>,
    workspace_path: String,
) -> Result<Vec<FileView>, String> {
    let db = state.db.lock().unwrap();
    db.get_viewed_files(&workspace_path)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn clear_all_viewed_files(
    state: State<AppState>,
    workspace_path: String,
) -> Result<(), String> {
    let db = state.db.lock().unwrap();
    db.clear_all_viewed_files(&workspace_path)
        .map_err(|e| e.to_string())
}
