use tauri::State;
use rayon::prelude::*;
use crate::{AppState, db::GitCacheEntry, local_db, git_ops};

// Helper function to extract file path from git status entry
fn extract_path_from_status_entry(entry: &str) -> Option<String> {
    if entry.starts_with("?? ") {
        return Some(entry[3..].trim().to_string());
    }

    if entry.len() < 4 {
        return None;
    }

    let raw = entry[3..].trim();
    if raw.is_empty() {
        return None;
    }

    if let Some(idx) = raw.rfind(" -> ") {
        Some(raw[idx + 4..].trim().to_string())
    } else {
        Some(raw.to_string())
    }
}

// Global git cache commands (in main app DB)
#[tauri::command]
pub fn get_git_cache(
    state: State<AppState>,
    workspace_path: String,
    file_path: Option<String>,
    cache_type: String,
) -> Result<Option<GitCacheEntry>, String> {
    let db = state.db.lock().unwrap();
    db.get_git_cache(&workspace_path, file_path.as_deref(), &cache_type)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_git_cache(
    state: State<AppState>,
    workspace_path: String,
    file_path: Option<String>,
    cache_type: String,
    data: String,
) -> Result<(), String> {
    let db = state.db.lock().unwrap();
    db.set_git_cache(&workspace_path, file_path.as_deref(), &cache_type, &data)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn invalidate_git_cache(state: State<AppState>, workspace_path: String) -> Result<(), String> {
    let db = state.db.lock().unwrap();
    db.invalidate_git_cache(&workspace_path)
        .map_err(|e| e.to_string())
}

// Git cache (local DB) commands
#[tauri::command]
pub fn get_cached_git_changes(
    repo_path: String,
    workspace_id: Option<i64>,
) -> Result<Vec<local_db::CachedFileChange>, String> {
    local_db::get_cached_changes(&repo_path, workspace_id)
}

#[tauri::command]
pub fn preload_workspace_git_data(state: State<AppState>, workspace_path: String) -> Result<(), String> {
    let changed_files = git_ops::git_get_changed_files(&workspace_path)?;
    let serialized_changes = serde_json::to_string(&changed_files).map_err(|e| e.to_string())?;

    {
        let db = state.db.lock().unwrap();
        db.set_git_cache(&workspace_path, None, "changed_files", &serialized_changes)
            .map_err(|e| e.to_string())?;
    }

    let file_paths: Vec<String> = changed_files
        .iter()
        .filter_map(|entry| extract_path_from_status_entry(entry))
        .collect();

    // Parallelize: Fetch hunks for all files at once using rayon
    let hunks_results: Vec<_> = file_paths
        .par_iter()
        .filter_map(|path| {
            let hunks = git_ops::git_get_file_hunks(&workspace_path, path).ok()?;
            let hunks_json = serde_json::to_string(&hunks).ok()?;
            Some((path.clone(), hunks_json))
        })
        .collect();

    // Cache the hunks (this must be sequential due to DB lock)
    for (path, serialized_hunks) in hunks_results {
        let cache_result = {
            let db = state.db.lock().unwrap();
            db.set_git_cache(
                &workspace_path,
                Some(&path),
                "file_hunks",
                &serialized_hunks,
            )
        };
        if let Err(err) = cache_result {
            eprintln!("Failed to cache hunks for {}: {}", path, err);
        }
    }

    Ok(())
}
