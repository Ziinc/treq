use crate::db::Database;
use crate::jj;
use crate::local_db;

/// Initializes a repository for use with Treq.
///
/// Sets up both the local database (per-repo) and ensures JJ is initialized.
///
/// # Arguments
/// * `repo_path` - Path to the repository root
///
/// # Returns
/// Returns true if successful or already initialized, false if JJ initialization failed.
pub fn init(repo_path: &str) -> Result<bool, String> {
    let db_path = local_db::init_local_db(repo_path)?;
    let db = Database::new(db_path).map_err(|e| format!("Failed to open database: {}", e))?;
    match jj::ensure_jj_initialized(&db, repo_path) {
        Ok(_already_initialized) => Ok(true),
        Err(_) => Ok(false),
    }
}
