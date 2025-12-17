use std::collections::HashMap;
use tauri::State;
use crate::AppState;

#[tauri::command]
pub fn get_setting(state: State<AppState>, key: String) -> Result<Option<String>, String> {
    let db = state.db.lock().unwrap();
    db.get_setting(&key).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_settings_batch(state: State<AppState>, keys: Vec<String>) -> Result<HashMap<String, Option<String>>, String> {
    let db = state.db.lock().unwrap();
    db.get_settings_batch(&keys).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_setting(state: State<AppState>, key: String, value: String) -> Result<(), String> {
    let db = state.db.lock().unwrap();
    db.set_setting(&key, &value).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_repo_setting(
    state: State<AppState>,
    repo_path: String,
    key: String,
) -> Result<Option<String>, String> {
    let db = state.db.lock().unwrap();
    db.get_repo_setting(&repo_path, &key)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_repo_setting(
    state: State<AppState>,
    repo_path: String,
    key: String,
    value: String,
) -> Result<(), String> {
    let db = state.db.lock().unwrap();
    db.set_repo_setting(&repo_path, &key, &value)
        .map_err(|e| e.to_string())
}
