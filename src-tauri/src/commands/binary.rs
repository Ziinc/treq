use crate::binary_paths;
use crate::db::Database;
use crate::AppState;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tauri::State;

#[derive(Debug, Serialize, Deserialize)]
pub struct BinaryPathsResponse {
    pub git: Option<String>,
    pub jj: Option<String>,
    pub claude: Option<String>,
}

/// Detect and cache binary paths for required binaries (git, jj, claude)
#[tauri::command]
pub fn detect_binaries(state: State<'_, AppState>) -> Result<BinaryPathsResponse, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;

    let binaries = vec!["git", "jj", "claude"];
    let mut detected_paths = HashMap::new();

    for binary in &binaries {
        // Try to detect the binary
        if let Some(path) = binary_paths::detect_binary(binary) {
            log::info!("Detected {} at: {}", binary, path);
            detected_paths.insert(binary.to_string(), path.clone());

            // Store in database
            let key = format!("binary_path_{}", binary);
            if let Err(e) = db.set_setting(&key, &path) {
                log::warn!("Failed to cache {} path in database: {}", binary, e);
            }
        } else {
            log::warn!("Could not detect {} binary", binary);
        }
    }

    // Initialize the in-memory cache
    binary_paths::init_binary_paths_cache(detected_paths.clone());

    Ok(BinaryPathsResponse {
        git: detected_paths.get("git").cloned(),
        jj: detected_paths.get("jj").cloned(),
        claude: detected_paths.get("claude").cloned(),
    })
}

/// Load cached binary paths from database on startup
pub fn load_cached_binary_paths(db: &Database) -> HashMap<String, String> {
    let binaries = vec!["git", "jj", "claude"];
    let mut paths = HashMap::new();

    for binary in binaries {
        let key = format!("binary_path_{}", binary);
        if let Ok(Some(path)) = db.get_setting(&key) {
            log::info!("Loaded cached {} path: {}", binary, path);
            paths.insert(binary.to_string(), path);
        } else {
            // If not cached, try to detect
            if let Some(detected_path) = binary_paths::detect_binary(binary) {
                log::info!("Detected {} at: {}", binary, detected_path);
                paths.insert(binary.to_string(), detected_path.clone());

                // Cache for next time
                if let Err(e) = db.set_setting(&key, &detected_path) {
                    log::warn!("Failed to cache {} path: {}", binary, e);
                }
            }
        }
    }

    paths
}
