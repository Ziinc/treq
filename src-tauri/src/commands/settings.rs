use crate::core;
use crate::AppState;
use std::collections::HashMap;
use tauri::{State, Window};

#[tauri::command]
pub fn init_repo(_state: State<AppState>, repo_path: String) -> Result<bool, String> {
    core::init(&repo_path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_setting(state: State<AppState>, key: String) -> Result<Option<String>, String> {
    let db = state.db.lock().unwrap();
    db.get_setting(&key).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_settings_batch(
    state: State<AppState>,
    keys: Vec<String>,
) -> Result<HashMap<String, Option<String>>, String> {
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

#[tauri::command]
pub fn set_window_repo_path(
    state: State<AppState>,
    window: Window,
    repo_path: String,
) -> Result<(), String> {
    let mut map = state.window_repo_paths.lock().unwrap();
    map.insert(window.label().to_string(), repo_path);
    Ok(())
}

#[tauri::command]
pub fn get_window_repo_path(
    state: State<AppState>,
    window: Window,
) -> Result<Option<String>, String> {
    let map = state.window_repo_paths.lock().unwrap();
    Ok(map.get(window.label()).cloned())
}
