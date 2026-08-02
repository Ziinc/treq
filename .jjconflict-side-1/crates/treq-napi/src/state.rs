use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};

use treq_lib::db::Database;

pub struct NapiState {
    pub db: Mutex<Database>,
}

// SAFETY: Database wraps rusqlite::Connection which is Send when using bundled feature.
// treq_lib already uses Mutex<Database> in Tauri's AppState (which requires Send + Sync).
unsafe impl Send for NapiState {}
unsafe impl Sync for NapiState {}

static GLOBAL_STATE: OnceLock<NapiState> = OnceLock::new();

/// Initialize the global napi state with a database at the given path.
/// Also detects and caches binary paths (jj, git, claude).
/// Call this in test beforeAll.
pub fn init(db_path: PathBuf) -> Result<(), String> {
    if let Some(parent) = db_path.parent() {
        std::env::set_var("TREQ_APP_DATA_DIR", parent.to_string_lossy().to_string());
    }
    std::env::set_var("TREQ_APP_DB_PATH", db_path.to_string_lossy().to_string());
    let db = Database::new(db_path).map_err(|e| format!("Failed to open database: {}", e))?;
    db.init()
        .map_err(|e| format!("Failed to initialize database: {}", e))?;

    // Detect binaries and populate the in-memory cache so jj commands work
    let mut detected = HashMap::new();
    for binary in &["git", "jj", "claude"] {
        if let Some(path) = treq_lib::binary_paths::detect_binary(binary) {
            detected.insert(binary.to_string(), path);
        }
    }
    treq_lib::binary_paths::init_binary_paths_cache(detected);

    GLOBAL_STATE
        .set(NapiState { db: Mutex::new(db) })
        .map_err(|_| "State already initialized".to_string())
}

pub fn get() -> Result<&'static NapiState, String> {
    GLOBAL_STATE
        .get()
        .ok_or_else(|| "NapiState not initialized. Call initState() first.".to_string())
}
