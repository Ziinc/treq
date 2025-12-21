use chrono::Utc;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};

// Re-export types from db module
use crate::db::{Session, Workspace};

// ============================================================================
// Database Trait for Testing
// ============================================================================

/// Trait for database operations (enables mocking in tests)
#[cfg_attr(test, mockall::automock)]
pub trait WorkspaceDb {
    fn add_workspace(
        &self,
        repo_path: &str,
        workspace_name: String,
        workspace_path: String,
        branch_name: String,
        metadata: Option<String>,
    ) -> Result<i64, String>;

    fn get_workspaces(&self, repo_path: &str) -> Result<Vec<Workspace>, String>;
}

/// Real implementation of WorkspaceDb
pub struct LocalDb;

impl WorkspaceDb for LocalDb {
    fn add_workspace(
        &self,
        repo_path: &str,
        workspace_name: String,
        workspace_path: String,
        branch_name: String,
        metadata: Option<String>,
    ) -> Result<i64, String> {
        add_workspace(repo_path, workspace_name, workspace_path, branch_name, metadata)
    }

    fn get_workspaces(&self, repo_path: &str) -> Result<Vec<Workspace>, String> {
        get_workspaces(repo_path)
    }
}

// ============================================================================
// Database Initialization Tracker
// ============================================================================

/// Track which local databases have been initialized to avoid repeated schema checks
static INITIALIZED_DBS: OnceLock<Mutex<HashSet<String>>> = OnceLock::new();

// ============================================================================
// Git Cache Types
// ============================================================================

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CachedFileChange {
    pub id: i64,
    pub workspace_id: Option<i64>,
    pub file_path: String,
    pub workspace_status: Option<String>,
    pub is_untracked: bool,
    pub hunks_json: Option<String>,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CachedWorkspaceFile {
    pub id: i64,
    pub workspace_id: Option<i64>,
    pub file_path: String,
    pub relative_path: String,
    pub is_directory: bool,
    pub parent_path: Option<String>,
    pub cached_at: String,
    pub mtime: Option<i64>, // File modification time (unix timestamp)
}

pub fn get_local_db_path(repo_path: &str) -> PathBuf {
    Path::new(repo_path).join(".treq").join("local.db")
}

pub fn init_local_db(repo_path: &str) -> Result<(), String> {
    let db_path = get_local_db_path(repo_path);
    if let Some(parent) = db_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create .treq directory: {}", e))?;
    }

    let conn = Connection::open(db_path).map_err(|e| format!("Failed to open local db: {}", e))?;

    // Create workspaces table
    conn.execute(
        "CREATE TABLE IF NOT EXISTS workspaces (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            workspace_name TEXT NOT NULL,
            workspace_path TEXT NOT NULL UNIQUE,
            branch_name TEXT NOT NULL,
            created_at TEXT NOT NULL,
            metadata TEXT,
            target_branch TEXT
        )",
        [],
    )
    .map_err(|e| format!("Failed to create workspaces table: {}", e))?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_workspaces_branch ON workspaces(branch_name)",
        [],
    )
    .map_err(|e| format!("Failed to create workspaces branch index: {}", e))?;

    // Migration: Add target_branch column if it doesn't exist
    let _ = conn.execute("ALTER TABLE workspaces ADD COLUMN target_branch TEXT", []);

    // Create sessions table
    conn.execute(
        "CREATE TABLE IF NOT EXISTS sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            workspace_id INTEGER,
            name TEXT NOT NULL,
            created_at TEXT NOT NULL,
            last_accessed TEXT NOT NULL,
            model TEXT,
            FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
        )",
        [],
    )
    .map_err(|e| format!("Failed to create sessions table: {}", e))?;

    // Migration: Rename worktree_id to workspace_id in sessions table
    let has_worktree_col: Result<i64, _> = conn.query_row(
        "SELECT COUNT(*) FROM pragma_table_info('sessions') WHERE name='worktree_id'",
        [],
        |row| row.get(0),
    );

    if let Ok(count) = has_worktree_col {
        if count > 0 {
            // Recreate the sessions table with new column name
            conn.execute(
                "CREATE TABLE sessions_new (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    workspace_id INTEGER,
                    name TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    last_accessed TEXT NOT NULL,
                    model TEXT,
                    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
                )",
                [],
            )
            .map_err(|e| format!("Failed to create sessions_new table: {}", e))?;

            conn.execute(
                "INSERT INTO sessions_new SELECT id, worktree_id, name, created_at, last_accessed, model FROM sessions",
                [],
            )
            .map_err(|e| format!("Failed to migrate sessions data: {}", e))?;

            conn.execute("DROP TABLE sessions", [])
                .map_err(|e| format!("Failed to drop old sessions table: {}", e))?;

            conn.execute("ALTER TABLE sessions_new RENAME TO sessions", [])
                .map_err(|e| format!("Failed to rename sessions_new to sessions: {}", e))?;
        }
    }

    // Migration: Add model column if it doesn't exist
    let _ = conn.execute("ALTER TABLE sessions ADD COLUMN model TEXT", []);

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_sessions_workspace ON sessions(workspace_id)",
        [],
    )
    .map_err(|e| format!("Failed to create sessions workspace index: {}", e))?;

    // Migration: Drop old tables if they exist
    let _ = conn.execute("DROP TABLE IF EXISTS git_file_hunks", []);
    let _ = conn.execute("DROP TABLE IF EXISTS git_changed_files", []);
    let _ = conn.execute("DROP INDEX IF EXISTS idx_git_file_hunks_workspace", []);
    let _ = conn.execute("DROP INDEX IF EXISTS idx_git_changed_files_workspace", []);

    // Create consolidated changes cache table
    conn.execute(
        "CREATE TABLE IF NOT EXISTS changed_files (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            workspace_id INTEGER,
            file_path TEXT NOT NULL,
            workspace_status TEXT,
            is_untracked INTEGER NOT NULL DEFAULT 0,
            hunks_json TEXT,
            updated_at TEXT NOT NULL,
            FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
            UNIQUE(workspace_id, file_path)
        )",
        [],
    )
    .map_err(|e| format!("Failed to create changed_files table: {}", e))?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_changed_files_workspace ON changed_files(workspace_id)",
        [],
    )
    .map_err(|e| format!("Failed to create changed_files workspace index: {}", e))?;

    // Create workspace files cache table
    conn.execute(
        "CREATE TABLE IF NOT EXISTS workspace_files (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            workspace_id INTEGER,
            file_path TEXT NOT NULL,
            relative_path TEXT NOT NULL,
            is_directory INTEGER NOT NULL DEFAULT 0,
            parent_path TEXT,
            cached_at TEXT NOT NULL,
            mtime INTEGER,
            FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
            UNIQUE(workspace_id, file_path)
        )",
        [],
    )
    .map_err(|e| format!("Failed to create workspace_files table: {}", e))?;

    // Migration: Add mtime column if it doesn't exist
    let _ = conn.execute("ALTER TABLE workspace_files ADD COLUMN mtime INTEGER", []);

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_workspace_files_workspace ON workspace_files(workspace_id)",
        [],
    )
    .map_err(|e| format!("Failed to create workspace_files workspace index: {}", e))?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_workspace_files_parent ON workspace_files(workspace_id, parent_path)",
        [],
    )
    .map_err(|e| format!("Failed to create workspace_files parent index: {}", e))?;

    Ok(())
}

fn get_connection(repo_path: &str) -> Result<Connection, String> {
    // Check if this database has already been initialized
    let initialized = INITIALIZED_DBS.get_or_init(|| Mutex::new(HashSet::new()));
    let db_key = repo_path.to_string();

    {
        let guard = initialized.lock().unwrap();
        if !guard.contains(&db_key) {
            drop(guard); // Release lock before calling init
            init_local_db(repo_path)?;
            initialized.lock().unwrap().insert(db_key);
        }
    }

    let db_path = get_local_db_path(repo_path);
    Connection::open(db_path).map_err(|e| format!("Failed to open local db: {}", e))
}

// ============================================================================
// Workspaces Functions
// ============================================================================

pub fn get_workspaces(repo_path: &str) -> Result<Vec<Workspace>, String> {
    let conn = get_connection(repo_path)?;
    let mut stmt = conn
        .prepare("SELECT id, workspace_name, workspace_path, branch_name, created_at, metadata, target_branch FROM workspaces ORDER BY branch_name COLLATE NOCASE ASC")
        .map_err(|e| format!("Failed to prepare workspaces query: {}", e))?;

    let workspaces = stmt
        .query_map([], |row| {
            Ok(Workspace {
                id: row.get(0)?,
                repo_path: repo_path.to_string(),
                workspace_name: row.get(1)?,
                workspace_path: row.get(2)?,
                branch_name: row.get(3)?,
                created_at: row.get(4)?,
                metadata: row.get(5)?,
                target_branch: row.get(6)?,
            })
        })
        .map_err(|e| format!("Failed to query workspaces: {}", e))?;

    workspaces
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())
}

pub fn add_workspace(
    repo_path: &str,
    workspace_name: String,
    workspace_path: String,
    branch_name: String,
    metadata: Option<String>,
) -> Result<i64, String> {
    let conn = get_connection(repo_path)?;
    let created_at = Utc::now().to_rfc3339();

    conn.execute(
        "INSERT INTO workspaces (workspace_name, workspace_path, branch_name, created_at, metadata)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        params![
            workspace_name,
            workspace_path,
            branch_name,
            created_at,
            metadata
        ],
    )
    .map_err(|e| format!("Failed to insert workspace: {}", e))?;

    Ok(conn.last_insert_rowid())
}

pub fn delete_workspace(repo_path: &str, id: i64) -> Result<(), String> {
    let conn = get_connection(repo_path)?;
    conn.execute("DELETE FROM workspaces WHERE id = ?1", [id])
        .map_err(|e| format!("Failed to delete workspace: {}", e))?;
    Ok(())
}

pub fn update_workspace_metadata(repo_path: &str, id: i64, metadata: &str) -> Result<(), String> {
    let conn = get_connection(repo_path)?;
    conn.execute(
        "UPDATE workspaces SET metadata = ?1 WHERE id = ?2",
        params![metadata, id],
    )
    .map_err(|e| format!("Failed to update workspace metadata: {}", e))?;
    Ok(())
}

pub fn update_workspace_target_branch(
    repo_path: &str,
    id: i64,
    target_branch: &str,
) -> Result<(), String> {
    let conn = get_connection(repo_path)?;
    conn.execute(
        "UPDATE workspaces SET target_branch = ?1 WHERE id = ?2",
        params![target_branch, id],
    )
    .map_err(|e| format!("Failed to update workspace target branch: {}", e))?;
    Ok(())
}

/// Get the branch_name for a workspace by its workspace_path
pub fn get_workspace_branch_name(
    repo_path: &str,
    workspace_path: &str,
) -> Result<Option<String>, String> {
    let conn = get_connection(repo_path)?;
    let mut stmt = conn
        .prepare("SELECT branch_name FROM workspaces WHERE workspace_path = ?1")
        .map_err(|e| format!("Failed to prepare branch_name query: {}", e))?;

    let result = stmt
        .query_row(params![workspace_path], |row| row.get::<_, String>(0))
        .optional()
        .map_err(|e| format!("Failed to query branch_name: {}", e))?;

    Ok(result)
}

pub fn rebuild_workspaces_from_filesystem(repo_path: &str) -> Result<Vec<Workspace>, String> {
    let workspaces_dir = Path::new(repo_path).join(".treq").join("workspaces");

    // Get existing workspaces from database before rebuilding
    let existing_workspaces = get_workspaces(repo_path)?;
    let existing_paths: std::collections::HashSet<String> = existing_workspaces
        .iter()
        .map(|w| w.workspace_path.clone())
        .collect();

    // If the workspaces directory doesn't exist, return existing workspaces from database
    if !workspaces_dir.exists() {
        return Ok(existing_workspaces);
    }

    let mut workspaces = Vec::new();

    // Read the workspaces directory
    let entries = fs::read_dir(&workspaces_dir)
        .map_err(|e| format!("Failed to read workspaces directory: {}", e))?;

    for entry in entries {
        let entry = entry.map_err(|e| format!("Failed to read directory entry: {}", e))?;
        let path = entry.path();

        // Skip if not a directory
        if !path.is_dir() {
            continue;
        }

        // Get the workspace name from the directory name
        let workspace_name = path
            .file_name()
            .and_then(|n| n.to_str())
            .ok_or_else(|| "Invalid directory name".to_string())?
            .to_string();

        let workspace_path = path
            .to_str()
            .ok_or_else(|| "Invalid workspace path".to_string())?
            .to_string();

        // Skip if workspace already exists in database
        if existing_paths.contains(&workspace_path) {
            continue;
        }

        // Check if it's actually a git workspace (has .git file)
        let git_file = path.join(".git");
        if !git_file.exists() {
            continue;
        }

        // Get the branch name from git
        let branch_name = get_workspace_branch(&workspace_path).unwrap_or(workspace_name.clone());

        // Add to database (only if not already present)
        let id = add_workspace(
            repo_path,
            workspace_name.clone(),
            workspace_path.clone(),
            branch_name.clone(),
            None,
        )?;

        workspaces.push(Workspace {
            id,
            repo_path: repo_path.to_string(),
            workspace_name,
            workspace_path,
            branch_name,
            created_at: Utc::now().to_rfc3339(),
            metadata: None,
            target_branch: None,
        });
    }

    // Combine existing workspaces with newly found ones
    let mut all_workspaces = existing_workspaces;
    all_workspaces.extend(workspaces);

    Ok(all_workspaces)
}

/// Get the current branch of a workspace
/// Falls back to jj bookmark if git is in detached HEAD state
fn get_workspace_branch(workspace_path: &str) -> Result<String, String> {
    use std::process::Command;

    let output = Command::new("git")
        .current_dir(workspace_path)
        .args(["rev-parse", "--abbrev-ref", "HEAD"])
        .output()
        .map_err(|e| e.to_string())?;

    if output.status.success() {
        let branch = String::from_utf8_lossy(&output.stdout).trim().to_string();

        // If not detached, return the branch name
        if branch != "HEAD" {
            return Ok(branch);
        }

        // Git is in detached HEAD - try to get branch from jj bookmark
        // jj bookmark list outputs: bookmark_name: <commit_id>
        if let Ok(jj_output) = Command::new("jj")
            .current_dir(workspace_path)
            .args(["bookmark", "list", "--no-pager"])
            .output()
        {
            if jj_output.status.success() {
                let bookmarks = String::from_utf8_lossy(&jj_output.stdout);
                // Find the first non-remote bookmark (local bookmarks don't have @)
                for line in bookmarks.lines() {
                    let line = line.trim();
                    if line.is_empty() || line.contains('@') {
                        continue;
                    }
                    // Extract bookmark name (before the colon)
                    if let Some(name) = line.split(':').next() {
                        let name = name.trim();
                        if !name.is_empty() {
                            return Ok(name.to_string());
                        }
                    }
                }
            }
        }

        // Still detached with no bookmark - return HEAD
        Ok(branch)
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

// ============================================================================
// Sessions Functions
// ============================================================================

pub fn get_sessions(repo_path: &str) -> Result<Vec<Session>, String> {
    let conn = get_connection(repo_path)?;
    let mut stmt = conn
        .prepare("SELECT id, workspace_id, name, created_at, last_accessed, model FROM sessions ORDER BY created_at ASC")
        .map_err(|e| format!("Failed to prepare sessions query: {}", e))?;

    let sessions = stmt
        .query_map([], |row| {
            Ok(Session {
                id: row.get(0)?,
                workspace_id: row.get(1)?,
                name: row.get(2)?,
                created_at: row.get(3)?,
                last_accessed: row.get(4)?,
                model: row.get(5)?,
            })
        })
        .map_err(|e| format!("Failed to query sessions: {}", e))?;

    sessions
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())
}

pub fn add_session(
    repo_path: &str,
    workspace_id: Option<i64>,
    name: String,
) -> Result<i64, String> {
    let conn = get_connection(repo_path)?;
    let now = Utc::now().to_rfc3339();

    conn.execute(
        "INSERT INTO sessions (workspace_id, name, created_at, last_accessed, model)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        params![workspace_id, name, now, now, None::<String>],
    )
    .map_err(|e| format!("Failed to insert session: {}", e))?;

    Ok(conn.last_insert_rowid())
}

pub fn update_session_access(repo_path: &str, id: i64) -> Result<(), String> {
    let conn = get_connection(repo_path)?;
    let now = Utc::now().to_rfc3339();

    conn.execute(
        "UPDATE sessions SET last_accessed = ?1 WHERE id = ?2",
        params![now, id],
    )
    .map_err(|e| format!("Failed to update session access time: {}", e))?;

    Ok(())
}

pub fn update_session_name(repo_path: &str, id: i64, name: String) -> Result<(), String> {
    let conn = get_connection(repo_path)?;
    conn.execute(
        "UPDATE sessions SET name = ?1 WHERE id = ?2",
        params![name, id],
    )
    .map_err(|e| format!("Failed to update session name: {}", e))?;

    Ok(())
}

pub fn delete_session(repo_path: &str, id: i64) -> Result<(), String> {
    let conn = get_connection(repo_path)?;
    conn.execute("DELETE FROM sessions WHERE id = ?1", [id])
        .map_err(|e| format!("Failed to delete session: {}", e))?;
    Ok(())
}

pub fn get_session_model(repo_path: &str, id: i64) -> Result<Option<String>, String> {
    let conn = get_connection(repo_path)?;
    let mut stmt = conn
        .prepare("SELECT model FROM sessions WHERE id = ?1")
        .map_err(|e| format!("Failed to prepare query: {}", e))?;

    let model: Option<String> = stmt
        .query_row([id], |row| row.get(0))
        .map_err(|e| format!("Failed to get session model: {}", e))?;

    Ok(model)
}

pub fn set_session_model(repo_path: &str, id: i64, model: Option<String>) -> Result<(), String> {
    let conn = get_connection(repo_path)?;
    conn.execute(
        "UPDATE sessions SET model = ?1 WHERE id = ?2",
        params![model, id],
    )
    .map_err(|e| format!("Failed to update session model: {}", e))?;

    Ok(())
}

// ============================================================================
// Git Cache Functions
// ============================================================================

/// Get all cached changed files for a workspace
pub fn get_cached_changes(
    repo_path: &str,
    workspace_id: Option<i64>,
) -> Result<Vec<CachedFileChange>, String> {
    let conn = get_connection(repo_path)?;
    let mut stmt = conn
        .prepare(
            "SELECT id, workspace_id, file_path, staged_status, workspace_status, is_untracked, hunks_json, updated_at
             FROM changed_files
             WHERE workspace_id IS ?1
             ORDER BY file_path",
        )
        .map_err(|e| format!("Failed to prepare query: {}", e))?;

    let changes = stmt
        .query_map([workspace_id], |row| {
            Ok(CachedFileChange {
                id: row.get(0)?,
                workspace_id: row.get(1)?,
                file_path: row.get(2)?,
                workspace_status: row.get(3)?,
                is_untracked: row.get::<_, i64>(4)? != 0,
                hunks_json: row.get(5)?,
                updated_at: row.get(6)?,
            })
        })
        .map_err(|e| format!("Failed to query cached changes: {}", e))?;

    changes
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())
}

/// Batch update all changed files for a workspace (replaces all)
pub fn sync_workspace_changes(
    repo_path: &str,
    workspace_id: Option<i64>,
    changes: Vec<CachedFileChange>,
) -> Result<(), String> {
    let mut conn = get_connection(repo_path)?;
    let tx = conn
        .transaction()
        .map_err(|e| format!("Failed to start transaction: {}", e))?;

    // Delete existing entries for this workspace
    tx.execute(
        "DELETE FROM changed_files WHERE workspace_id IS ?1",
        params![workspace_id],
    )
    .map_err(|e| format!("Failed to delete existing changes: {}", e))?;

    // Insert new entries
    for change in &changes {
        tx.execute(
            "INSERT INTO changed_files
             (workspace_id, file_path, workspace_status, is_untracked, hunks_json, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![
                workspace_id,
                &change.file_path,
                &change.workspace_status,
                if change.is_untracked { 1 } else { 0 },
                &change.hunks_json,
                &change.updated_at,
            ],
        )
        .map_err(|e| format!("Failed to insert change: {}", e))?;
    }

    tx.commit()
        .map_err(|e| format!("Failed to commit transaction: {}", e))?;

    Ok(())
}

// ============================================================================
// Workspace Files Cache Functions
// ============================================================================

/// Get cached directory listing for a specific parent path
pub fn get_cached_directory_listing(
    repo_path: &str,
    workspace_id: Option<i64>,
    parent_path: &str,
) -> Result<Vec<CachedWorkspaceFile>, String> {
    let conn = get_connection(repo_path)?;
    let mut stmt = conn
        .prepare(
            "SELECT id, workspace_id, file_path, relative_path, is_directory, parent_path, cached_at, mtime
             FROM workspace_files
             WHERE workspace_id IS ?1 AND parent_path IS ?2
             ORDER BY is_directory DESC, relative_path",
        )
        .map_err(|e| format!("Failed to prepare query: {}", e))?;

    let files = stmt
        .query_map(params![workspace_id, parent_path], |row| {
            Ok(CachedWorkspaceFile {
                id: row.get(0)?,
                workspace_id: row.get(1)?,
                file_path: row.get(2)?,
                relative_path: row.get(3)?,
                is_directory: row.get::<_, i64>(4)? != 0,
                parent_path: row.get(5)?,
                cached_at: row.get(6)?,
                mtime: row.get(7)?,
            })
        })
        .map_err(|e| format!("Failed to query cached files: {}", e))?;

    files
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())
}

/// Batch update all cached files for a workspace (replaces all)
pub fn sync_workspace_files(
    repo_path: &str,
    workspace_id: Option<i64>,
    files: Vec<CachedWorkspaceFile>,
) -> Result<(), String> {
    let mut conn = get_connection(repo_path)?;
    let tx = conn
        .transaction()
        .map_err(|e| format!("Failed to start transaction: {}", e))?;

    // Delete existing entries for this workspace
    tx.execute(
        "DELETE FROM workspace_files WHERE workspace_id IS ?1",
        params![workspace_id],
    )
    .map_err(|e| format!("Failed to delete existing files: {}", e))?;

    // Insert new entries
    for file in &files {
        tx.execute(
            "INSERT INTO workspace_files
             (workspace_id, file_path, relative_path, is_directory, parent_path, cached_at, mtime)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                workspace_id,
                &file.file_path,
                &file.relative_path,
                if file.is_directory { 1 } else { 0 },
                &file.parent_path,
                &file.cached_at,
                &file.mtime,
            ],
        )
        .map_err(|e| format!("Failed to insert file: {}", e))?;
    }

    tx.commit()
        .map_err(|e| format!("Failed to commit transaction: {}", e))?;

    Ok(())
}

/// Upsert a single workspace file (for incremental updates)
pub fn upsert_workspace_file(
    repo_path: &str,
    workspace_id: Option<i64>,
    file_path: &str,
    relative_path: &str,
    is_directory: bool,
    parent_path: Option<&str>,
    mtime: Option<i64>,
) -> Result<(), String> {
    let conn = get_connection(repo_path)?;
    let cached_at = Utc::now().to_rfc3339();

    conn.execute(
        "INSERT INTO workspace_files (workspace_id, file_path, relative_path, is_directory, parent_path, cached_at, mtime)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
         ON CONFLICT(workspace_id, file_path)
         DO UPDATE SET relative_path = ?3, is_directory = ?4, parent_path = ?5, cached_at = ?6, mtime = ?7",
        params![
            workspace_id,
            file_path,
            relative_path,
            if is_directory { 1 } else { 0 },
            parent_path,
            cached_at,
            mtime,
        ],
    )
    .map_err(|e| format!("Failed to upsert workspace file: {}", e))?;

    Ok(())
}

/// Delete specific workspace files by paths (for incremental updates when files are deleted)
pub fn delete_workspace_files(
    repo_path: &str,
    workspace_id: Option<i64>,
    file_paths: Vec<String>,
) -> Result<(), String> {
    if file_paths.is_empty() {
        return Ok(());
    }

    let mut conn = get_connection(repo_path)?;
    let tx = conn
        .transaction()
        .map_err(|e| format!("Failed to start transaction: {}", e))?;

    for file_path in &file_paths {
        tx.execute(
            "DELETE FROM workspace_files WHERE workspace_id IS ?1 AND file_path = ?2",
            params![workspace_id, file_path],
        )
        .map_err(|e| format!("Failed to delete file: {}", e))?;
    }

    tx.commit()
        .map_err(|e| format!("Failed to commit transaction: {}", e))?;

    Ok(())
}

/// Invalidate (clear) all cached files for a workspace
pub fn invalidate_workspace_files(
    repo_path: &str,
    workspace_id: Option<i64>,
) -> Result<(), String> {
    let conn = get_connection(repo_path)?;
    conn.execute(
        "DELETE FROM workspace_files WHERE workspace_id IS ?1",
        params![workspace_id],
    )
    .map_err(|e| format!("Failed to invalidate workspace files: {}", e))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    #[test]
    fn test_add_workspace_persists_to_db() {
        // Setup: Create temp directory as repo_path
        let temp_dir = TempDir::new().expect("Failed to create temp dir");
        let repo_path = temp_dir.path().to_str().unwrap();

        // Create workspace directory structure (simulating jj::create_workspace)
        let workspace_dir = temp_dir
            .path()
            .join(".treq")
            .join("workspaces")
            .join("test-workspace");
        fs::create_dir_all(&workspace_dir).expect("Failed to create workspace dir");
        let workspace_path = workspace_dir.to_str().unwrap().to_string();

        // Verify directory was created
        assert!(
            workspace_dir.exists(),
            "Workspace directory should exist"
        );

        // Add workspace to database
        let id = add_workspace(
            repo_path,
            "test-workspace".to_string(),
            workspace_path.clone(),
            "test-branch".to_string(),
            Some(r#"{"intent":"test intent"}"#.to_string()),
        )
        .expect("add_workspace should succeed");

        assert!(id > 0, "Workspace ID should be positive");

        // Retrieve workspaces from database
        let workspaces = get_workspaces(repo_path).expect("get_workspaces should succeed");

        // Verify workspace exists in database
        assert_eq!(workspaces.len(), 1, "Should have exactly 1 workspace");
        assert_eq!(workspaces[0].id, id);
        assert_eq!(workspaces[0].workspace_name, "test-workspace");
        assert_eq!(workspaces[0].workspace_path, workspace_path);
        assert_eq!(workspaces[0].branch_name, "test-branch");
        assert_eq!(
            workspaces[0].metadata,
            Some(r#"{"intent":"test intent"}"#.to_string())
        );
        assert!(workspaces[0].target_branch.is_none());

        // Verify database file was created
        let db_path = get_local_db_path(repo_path);
        assert!(
            db_path.exists(),
            "Database file should exist at {:?}",
            db_path
        );

        // Cleanup: TempDir automatically cleans up on drop
        // Clear INITIALIZED_DBS cache for this repo to avoid test pollution
        if let Some(initialized) = INITIALIZED_DBS.get() {
            initialized.lock().unwrap().remove(repo_path);
        }
    }

    #[test]
    fn test_add_multiple_workspaces() {
        let temp_dir = TempDir::new().expect("Failed to create temp dir");
        let repo_path = temp_dir.path().to_str().unwrap();

        // Add two workspaces
        let id1 = add_workspace(
            repo_path,
            "workspace-1".to_string(),
            format!("{}/.treq/workspaces/workspace-1", repo_path),
            "branch-a".to_string(),
            None,
        )
        .expect("add_workspace 1 should succeed");

        let id2 = add_workspace(
            repo_path,
            "workspace-2".to_string(),
            format!("{}/.treq/workspaces/workspace-2", repo_path),
            "branch-b".to_string(),
            None,
        )
        .expect("add_workspace 2 should succeed");

        // Retrieve and verify
        let workspaces = get_workspaces(repo_path).expect("get_workspaces should succeed");

        assert_eq!(workspaces.len(), 2, "Should have 2 workspaces");

        // Workspaces are ordered by branch_name (branch-a, branch-b)
        assert_eq!(workspaces[0].id, id1);
        assert_eq!(workspaces[0].workspace_name, "workspace-1");
        assert_eq!(workspaces[1].id, id2);
        assert_eq!(workspaces[1].workspace_name, "workspace-2");

        // Cleanup
        if let Some(initialized) = INITIALIZED_DBS.get() {
            initialized.lock().unwrap().remove(repo_path);
        }
    }

    #[test]
    fn test_workspace_persists_after_reload() {
        // This test simulates the user's bug: workspace appears initially but disappears after reload
        let temp_dir = TempDir::new().expect("Failed to create temp dir");
        let repo_path = temp_dir.path().to_str().unwrap();

        // Step 1: Add workspace
        let id = add_workspace(
            repo_path,
            "test-workspace".to_string(),
            format!("{}/.treq/workspaces/test-workspace", repo_path),
            "test-branch".to_string(),
            None,
        )
        .expect("add_workspace should succeed");

        // Step 2: Verify workspace exists (this simulates the UI showing it initially)
        let workspaces = get_workspaces(repo_path).expect("get_workspaces should succeed");
        assert_eq!(workspaces.len(), 1, "Workspace should exist initially");
        assert_eq!(workspaces[0].id, id);

        // Step 3: Simulate app reload by clearing the INITIALIZED_DBS cache
        // This forces the next get_connection to re-initialize
        if let Some(initialized) = INITIALIZED_DBS.get() {
            initialized.lock().unwrap().remove(repo_path);
        }

        // Step 4: Verify workspace still exists after "reload" (this is where the bug appears)
        let workspaces_after_reload =
            get_workspaces(repo_path).expect("get_workspaces should succeed after reload");
        assert_eq!(
            workspaces_after_reload.len(),
            1,
            "Workspace should persist after reload (BUG: this fails!)"
        );
        assert_eq!(workspaces_after_reload[0].id, id);
        assert_eq!(
            workspaces_after_reload[0].workspace_name,
            "test-workspace"
        );

        // Cleanup
        if let Some(initialized) = INITIALIZED_DBS.get() {
            initialized.lock().unwrap().remove(repo_path);
        }
    }

    #[test]
    fn test_rebuild_workspaces_deletes_workspace_without_git_file() {
        // This test reproduces the actual bug: rebuild_workspaces deletes workspaces without .git files
        let temp_dir = TempDir::new().expect("Failed to create temp dir");
        let repo_path = temp_dir.path().to_str().unwrap();

        // Step 1: Create workspace directory structure WITHOUT .git file
        let workspace_dir = temp_dir
            .path()
            .join(".treq")
            .join("workspaces")
            .join("test-workspace");
        fs::create_dir_all(&workspace_dir).expect("Failed to create workspace dir");
        let workspace_path = workspace_dir.to_str().unwrap().to_string();

        // Step 2: Add workspace to database (simulating create_workspace)
        let id = add_workspace(
            repo_path,
            "test-workspace".to_string(),
            workspace_path.clone(),
            "test-branch".to_string(),
            None,
        )
        .expect("add_workspace should succeed");

        // Step 3: Verify workspace exists in database
        let workspaces = get_workspaces(repo_path).expect("get_workspaces should succeed");
        assert_eq!(workspaces.len(), 1, "Workspace should exist before rebuild");
        assert_eq!(workspaces[0].id, id);

        // Step 4: Call rebuild_workspaces (this is what Dashboard does on reload)
        let rebuilt =
            rebuild_workspaces_from_filesystem(repo_path).expect("rebuild should succeed");

        // EXPECTED: Workspace should still be present (even without .git file)
        // ACTUAL: Workspace is deleted because it has no .git file (THIS IS THE BUG!)
        assert_eq!(
            rebuilt.len(),
            1,
            "Workspace should persist after rebuild, even without .git file"
        );

        // Step 5: Verify workspace still exists in database after rebuild
        let workspaces_after = get_workspaces(repo_path).expect("get_workspaces should succeed");
        assert_eq!(
            workspaces_after.len(),
            1,
            "Workspace should still exist in database after rebuild"
        );
        assert_eq!(workspaces_after[0].id, id);

        // Cleanup
        if let Some(initialized) = INITIALIZED_DBS.get() {
            initialized.lock().unwrap().remove(repo_path);
        }
    }
}
