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

#[derive(Debug, Serialize, Deserialize)]
pub struct EditorAppsResponse {
    pub cursor: bool,
    pub vscode: bool,
    pub zed: bool,
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

/// Detect and cache editor applications (Cursor, VSCode, Zed)
#[tauri::command]
pub fn detect_editor_apps(state: State<'_, AppState>) -> Result<EditorAppsResponse, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;

    let editors = vec![
        ("Cursor", "cursor"),
        ("Visual Studio Code", "vscode"),
        ("Zed", "zed"),
    ];

    let mut detected_apps = HashMap::new();

    for (app_name, key) in &editors {
        let is_installed = binary_paths::detect_editor_app(app_name);
        log::info!(
            "Editor app {}: {}",
            app_name,
            if is_installed { "found" } else { "not found" }
        );

        detected_apps.insert(key.to_string(), is_installed);

        // Store in database
        let db_key = format!("editor_app_{}", key);
        let value = if is_installed { "true" } else { "false" };
        if let Err(e) = db.set_setting(&db_key, value) {
            log::warn!("Failed to cache {} in database: {}", key, e);
        }
    }

    // Initialize in-memory cache
    binary_paths::init_editor_apps_cache(detected_apps.clone());

    Ok(EditorAppsResponse {
        cursor: *detected_apps.get("cursor").unwrap_or(&false),
        vscode: *detected_apps.get("vscode").unwrap_or(&false),
        zed: *detected_apps.get("zed").unwrap_or(&false),
    })
}

/// Load cached editor apps from database on startup
pub fn load_cached_editor_apps(db: &Database) -> HashMap<String, bool> {
    let editors = vec![
        ("cursor", "Cursor"),
        ("vscode", "Visual Studio Code"),
        ("zed", "Zed"),
    ];
    let mut apps = HashMap::new();

    for (key, app_name) in editors {
        let db_key = format!("editor_app_{}", key);
        if let Ok(Some(value)) = db.get_setting(&db_key) {
            let is_installed = value == "true";
            log::info!("Loaded cached editor app {}: {}", key, is_installed);
            apps.insert(key.to_string(), is_installed);
        } else {
            // If not cached, detect now
            let is_installed = binary_paths::detect_editor_app(app_name);
            log::info!("Detected editor app {}: {}", app_name, is_installed);
            apps.insert(key.to_string(), is_installed);

            // Cache for next time
            let value = if is_installed { "true" } else { "false" };
            if let Err(e) = db.set_setting(&db_key, value) {
                log::warn!("Failed to cache {} app: {}", key, e);
            }
        }
    }

    apps
}
