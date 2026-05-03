use std::collections::HashMap;
use std::path::Path;

use crate::binary_paths;
use crate::core::workspaces;
use crate::db::Database;
use crate::jj;
use crate::local_db;

/// Detect binary paths for required binaries (git, jj, claude),
/// cache them in the database and in-memory cache.
/// Returns a HashMap of binary_name -> detected_path.
pub fn detect_binaries(db: &Database) -> Result<HashMap<String, String>, String> {
    let binaries = vec!["git", "jj", "claude"];
    let mut detected_paths = HashMap::new();

    for binary in &binaries {
        if let Some(path) = binary_paths::detect_binary(binary) {
            log::info!("Detected {} at: {}", binary, path);
            detected_paths.insert(binary.to_string(), path.clone());

            let key = format!("binary_path_{}", binary);
            if let Err(e) = db.set_setting(&key, &path) {
                log::warn!("Failed to cache {} path in database: {}", binary, e);
            }
        } else {
            log::warn!("Could not detect {} binary", binary);
        }
    }

    binary_paths::init_binary_paths_cache(detected_paths.clone());
    Ok(detected_paths)
}

/// Initializes a repository for use with Treq.
///
/// Sets up both the local database (per-repo) and ensures JJ is initialized.
/// Creates the .treq/workspaces directory if it doesn't exist.
///
/// # Arguments
/// * `repo_path` - Path to the repository root
///
/// # Returns
/// Returns true if successful or already initialized, false if JJ initialization failed.
pub fn init(repo_path: &str) -> Result<bool, String> {
    let db_path = local_db::init_local_db(repo_path)?;
    let db = Database::new(db_path).map_err(|e| format!("Failed to open database: {}", e))?;
    db.init()
        .map_err(|e| format!("Failed to initialize database: {}", e))?;

    let workspaces_dir = Path::new(repo_path).join(".treq").join("workspaces");
    std::fs::create_dir_all(&workspaces_dir)
        .map_err(|e| format!("Failed to create workspaces directory: {}", e))?;

    match jj::ensure_jj_initialized(&db, repo_path) {
        Ok(_already_initialized) => {
            let _ = workspaces::sync_workspaces(repo_path);
            Ok(true)
        }
        Err(_) => Ok(false),
    }
}
