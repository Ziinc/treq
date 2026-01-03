use chrono::Utc;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};


#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Workspace {
    pub id: i64,
    pub repo_path: String,
    pub workspace_name: String,
    pub workspace_path: String,
    pub branch_name: String,
    pub created_at: String,
    pub metadata: Option<String>,
    pub target_branch: Option<String>,
    pub has_conflicts: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Session {
    pub id: i64,
    pub workspace_id: Option<i64>,
    pub name: String,
    pub created_at: String,
    pub last_accessed: String,
    pub model: Option<String>,
}

static INITIALIZED_DBS: OnceLock<Mutex<HashSet<String>>> = OnceLock::new();

/// Cached file information for workspace file indexing
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CachedWorkspaceFile {
    pub id: i64,
    pub workspace_id: Option<i64>,
    pub file_path: String,
    pub relative_path: String,
    pub is_directory: bool,
    pub parent_path: Option<String>,
    pub cached_at: String,
    /// File modification time (unix timestamp)
    pub mtime: Option<i64>,
}

pub fn get_local_db_path(repo_path: &str) -> PathBuf {
    Path::new(repo_path).join(".treq").join("local.db")
}

/// Initialize the local database for a repository.
///
/// Creates tables for workspaces, sessions, changed_files, and workspace_files.
/// Handles schema migrations for backward compatibility.
pub fn init_local_db(repo_path: &str) -> Result<(), String> {
    let db_path = get_local_db_path(repo_path);
    if let Some(parent) = db_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create .treq directory: {}", e))?;
    }

    let conn = Connection::open(db_path).map_err(|e| format!("Failed to open local db: {}", e))?;

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

    let _ = conn.execute("ALTER TABLE workspaces ADD COLUMN target_branch TEXT", []);
    let _ = conn.execute("ALTER TABLE workspaces ADD COLUMN has_conflicts BOOLEAN DEFAULT 0", []);
    let _ = conn.execute("ALTER TABLE workspaces ADD COLUMN archived BOOLEAN DEFAULT 0", []);

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

    let has_worktree_col: Result<i64, _> = conn.query_row(
        "SELECT COUNT(*) FROM pragma_table_info('sessions') WHERE name='worktree_id'",
        [],
        |row| row.get(0),
    );

    if let Ok(count) = has_worktree_col {
        if count > 0 {
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

    let _ = conn.execute("ALTER TABLE sessions ADD COLUMN model TEXT", []);

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_sessions_workspace ON sessions(workspace_id)",
        [],
    )
    .map_err(|e| format!("Failed to create sessions workspace index: {}", e))?;

    let _ = conn.execute("DROP TABLE IF EXISTS git_file_hunks", []);
    let _ = conn.execute("DROP TABLE IF EXISTS git_changed_files", []);
    let _ = conn.execute("DROP INDEX IF EXISTS idx_git_file_hunks_workspace", []);
    let _ = conn.execute("DROP INDEX IF EXISTS idx_git_changed_files_workspace", []);

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

/// Get a database connection for a repository.
///
/// Ensures the database is initialized before returning the connection.
/// Uses a cache to avoid re-initializing databases that have already been set up in this session.
fn get_connection(repo_path: &str) -> Result<Connection, String> {
    let initialized = INITIALIZED_DBS.get_or_init(|| Mutex::new(HashSet::new()));
    let db_key = repo_path.to_string();

    {
        let guard = initialized.lock().unwrap();
        if !guard.contains(&db_key) {
            drop(guard);
            init_local_db(repo_path)?;
            initialized.lock().unwrap().insert(db_key);
        }
    }

    let db_path = get_local_db_path(repo_path);
    Connection::open(db_path).map_err(|e| format!("Failed to open local db: {}", e))
}

pub fn get_workspaces(repo_path: &str) -> Result<Vec<Workspace>, String> {
    let conn = get_connection(repo_path)?;
    let mut stmt = conn
        .prepare("SELECT id, workspace_name, workspace_path, branch_name, created_at, metadata, target_branch, COALESCE(has_conflicts, 0) FROM workspaces ORDER BY branch_name COLLATE NOCASE ASC")
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
                has_conflicts: row.get::<_, i64>(7)? != 0,
            })
        })
        .map_err(|e| format!("Failed to query workspaces: {}", e))?;

    workspaces
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())
}

pub fn get_workspace_by_id(repo_path: &str, id: i64) -> Result<Option<Workspace>, String> {
    let conn = get_connection(repo_path)?;
    let mut stmt = conn
        .prepare("SELECT id, workspace_name, workspace_path, branch_name, created_at, metadata, target_branch, COALESCE(has_conflicts, 0) FROM workspaces WHERE id = ?1")
        .map_err(|e| format!("Failed to prepare workspace query: {}", e))?;

    let workspace = stmt
        .query_row([id], |row| {
            Ok(Workspace {
                id: row.get(0)?,
                repo_path: repo_path.to_string(),
                workspace_name: row.get(1)?,
                workspace_path: row.get(2)?,
                branch_name: row.get(3)?,
                created_at: row.get(4)?,
                metadata: row.get(5)?,
                target_branch: row.get(6)?,
                has_conflicts: row.get::<_, i64>(7)? != 0,
            })
        })
        .optional()
        .map_err(|e| format!("Failed to query workspace: {}", e))?;

    Ok(workspace)
}

pub fn get_workspace_by_path(repo_path: &str, workspace_path: &str) -> Result<Option<Workspace>, String> {
    let conn = get_connection(repo_path)?;
    let mut stmt = conn
        .prepare("SELECT id, workspace_name, workspace_path, branch_name, created_at, metadata, target_branch, COALESCE(has_conflicts, 0) FROM workspaces WHERE workspace_path = ?1")
        .map_err(|e| format!("Failed to prepare workspace query: {}", e))?;

    let workspace = stmt
        .query_row([workspace_path], |row| {
            Ok(Workspace {
                id: row.get(0)?,
                repo_path: repo_path.to_string(),
                workspace_name: row.get(1)?,
                workspace_path: row.get(2)?,
                branch_name: row.get(3)?,
                created_at: row.get(4)?,
                metadata: row.get(5)?,
                target_branch: row.get(6)?,
                has_conflicts: row.get::<_, i64>(7)? != 0,
            })
        })
        .optional()
        .map_err(|e| format!("Failed to query workspace: {}", e))?;

    Ok(workspace)
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

/// Get all workspaces targeting a specific branch
pub fn get_workspaces_by_target_branch(
    repo_path: &str,
    target_branch: &str,
) -> Result<Vec<Workspace>, String> {
    let conn = get_connection(repo_path)?;
    let mut stmt = conn
        .prepare("SELECT id, workspace_name, workspace_path, branch_name, created_at, metadata, target_branch, COALESCE(has_conflicts, 0) FROM workspaces WHERE target_branch = ?1 ORDER BY branch_name COLLATE NOCASE ASC")
        .map_err(|e| format!("Failed to prepare workspaces query: {}", e))?;

    let workspaces = stmt
        .query_map([target_branch], |row| {
            Ok(Workspace {
                id: row.get(0)?,
                repo_path: repo_path.to_string(),
                workspace_name: row.get(1)?,
                workspace_path: row.get(2)?,
                branch_name: row.get(3)?,
                created_at: row.get(4)?,
                metadata: row.get(5)?,
                target_branch: row.get(6)?,
                has_conflicts: row.get::<_, i64>(7)? != 0,
            })
        })
        .map_err(|e| format!("Failed to query workspaces: {}", e))?;

    workspaces
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())
}

/// Update the has_conflicts flag for a workspace
pub fn update_workspace_has_conflicts(
    repo_path: &str,
    id: i64,
    has_conflicts: bool,
) -> Result<(), String> {
    let conn = get_connection(repo_path)?;
    conn.execute(
        "UPDATE workspaces SET has_conflicts = ?1 WHERE id = ?2",
        params![has_conflicts as i64, id],
    )
    .map_err(|e| format!("Failed to update workspace has_conflicts: {}", e))?;
    Ok(())
}

/// Get last rebased commit from workspace metadata
pub fn get_workspace_last_rebased_commit(
    repo_path: &str,
    id: i64,
) -> Result<Option<String>, String> {
    let workspaces = get_workspaces(repo_path)?;
    let workspace = workspaces.iter().find(|w| w.id == id);

    if let Some(ws) = workspace {
        if let Some(metadata) = &ws.metadata {
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(metadata) {
                return Ok(json
                    .get("last_rebased_target_commit")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string()));
            }
        }
    }
    Ok(None)
}

/// Update last rebased commit in workspace metadata.
///
/// Retrieves the current metadata, parses it as JSON, updates the
/// last_rebased_target_commit field, and serializes it back to the database.
pub fn update_workspace_last_rebased_commit(
    repo_path: &str,
    id: i64,
    commit_id: &str,
) -> Result<(), String> {
    let conn = get_connection(repo_path)?;

    let current_metadata: Option<String> = conn
        .query_row("SELECT metadata FROM workspaces WHERE id = ?1", [id], |row| {
            row.get(0)
        })
        .ok();

    let mut meta: serde_json::Value = current_metadata
        .and_then(|m| serde_json::from_str(&m).ok())
        .unwrap_or(serde_json::json!({}));

    meta["last_rebased_target_commit"] = serde_json::Value::String(commit_id.to_string());

    let new_metadata = serde_json::to_string(&meta)
        .map_err(|e| format!("Failed to serialize metadata: {}", e))?;

    conn.execute(
        "UPDATE workspaces SET metadata = ?1 WHERE id = ?2",
        params![new_metadata, id],
    )
    .map_err(|e| format!("Failed to update metadata: {}", e))?;

    Ok(())
}

/// Rebuild workspaces list from filesystem.
///
/// Scans the .treq/workspaces directory and adds any new workspaces to the database
/// that aren't already tracked. Returns existing workspaces from database if the
/// workspaces directory doesn't exist. Only adds directories with a .git file.
pub fn rebuild_workspaces_from_filesystem(repo_path: &str) -> Result<Vec<Workspace>, String> {
    let workspaces_dir = Path::new(repo_path).join(".treq").join("workspaces");

    let existing_workspaces = get_workspaces(repo_path)?;
    let existing_paths: std::collections::HashSet<String> = existing_workspaces
        .iter()
        .map(|w| w.workspace_path.clone())
        .collect();

    if !workspaces_dir.exists() {
        return Ok(existing_workspaces);
    }

    let mut workspaces = Vec::new();

    let entries = fs::read_dir(&workspaces_dir)
        .map_err(|e| format!("Failed to read workspaces directory: {}", e))?;

    for entry in entries {
        let entry = entry.map_err(|e| format!("Failed to read directory entry: {}", e))?;
        let path = entry.path();

        if !path.is_dir() {
            continue;
        }

        let workspace_name = path
            .file_name()
            .and_then(|n| n.to_str())
            .ok_or_else(|| "Invalid directory name".to_string())?
            .to_string();

        let workspace_path = path
            .to_str()
            .ok_or_else(|| "Invalid workspace path".to_string())?
            .to_string();

        if existing_paths.contains(&workspace_path) {
            continue;
        }

        let git_file = path.join(".git");
        if !git_file.exists() {
            continue;
        }

        let branch_name = get_workspace_branch(&workspace_path).unwrap_or(workspace_name.clone());

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
            has_conflicts: false,
        });
    }

    let mut all_workspaces = existing_workspaces;
    all_workspaces.extend(workspaces);

    Ok(all_workspaces)
}

/// Get the current branch of a workspace.
///
/// Falls back to jj bookmark if git is in detached HEAD state.
/// Returns the branch name, or "HEAD" if in detached state with no bookmark.
fn get_workspace_branch(workspace_path: &str) -> Result<String, String> {
    use crate::binary_paths;
    use std::process::Command;

    /// Helper function to create Command for a binary using cached path
    fn command_for(binary: &str) -> Command {
        let path = binary_paths::get_binary_path(binary).unwrap_or_else(|| binary.to_string());
        Command::new(path)
    }

    let output = command_for("git")
        .current_dir(workspace_path)
        .args(["rev-parse", "--abbrev-ref", "HEAD"])
        .output()
        .map_err(|e| e.to_string())?;

    if output.status.success() {
        let branch = String::from_utf8_lossy(&output.stdout).trim().to_string();

        if branch != "HEAD" {
            return Ok(branch);
        }

        if let Ok(jj_output) = command_for("jj")
            .current_dir(workspace_path)
            .args(["bookmark", "list", "--no-pager"])
            .output()
        {
            if jj_output.status.success() {
                let bookmarks = String::from_utf8_lossy(&jj_output.stdout);
                for line in bookmarks.lines() {
                    let line = line.trim();
                    if line.is_empty() || line.contains('@') {
                        continue;
                    }
                    if let Some(name) = line.split(':').next() {
                        let name = name.trim();
                        if !name.is_empty() {
                            return Ok(name.to_string());
                        }
                    }
                }
            }
        }

        Ok(branch)
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

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

/// Search workspace files by filename or path.
///
/// Returns files (not directories) matching the query string using case-insensitive
/// LIKE matching against the relative_path. Results are ordered by:
/// - Exact filename matches first
/// - Then by path length (shorter = more relevant)
pub fn search_workspace_files(
    repo_path: &str,
    workspace_id: Option<i64>,
    query: &str,
    limit: usize,
) -> Result<Vec<CachedWorkspaceFile>, String> {
    if query.trim().is_empty() {
        return Ok(Vec::new());
    }

    let conn = get_connection(repo_path)?;

    let search_pattern = format!("%{}%", query.to_lowercase());

    let mut stmt = conn
        .prepare(
            "SELECT id, workspace_id, file_path, relative_path, is_directory, parent_path, cached_at, mtime
             FROM workspace_files
             WHERE workspace_id IS ?1
               AND is_directory = 0
               AND LOWER(relative_path) LIKE ?2
             ORDER BY
               CASE WHEN LOWER(relative_path) LIKE ?3 THEN 0 ELSE 1 END,
               LENGTH(relative_path)
             LIMIT ?4",
        )
        .map_err(|e| format!("Failed to prepare search query: {}", e))?;

    let filename_pattern = format!("%/{}", query.to_lowercase());

    let files = stmt
        .query_map(
            params![workspace_id, search_pattern, filename_pattern, limit as i64],
            |row| {
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
            },
        )
        .map_err(|e| format!("Failed to search files: {}", e))?;

    files
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())
}

/// Batch update all cached files for a workspace.
///
/// Deletes all existing entries for the workspace and inserts the provided files.
/// This is an all-or-nothing replacement operation performed within a transaction.
pub fn sync_workspace_files(
    repo_path: &str,
    workspace_id: Option<i64>,
    files: Vec<CachedWorkspaceFile>,
) -> Result<(), String> {
    let mut conn = get_connection(repo_path)?;
    let tx = conn
        .transaction()
        .map_err(|e| format!("Failed to start transaction: {}", e))?;

    tx.execute(
        "DELETE FROM workspace_files WHERE workspace_id IS ?1",
        params![workspace_id],
    )
    .map_err(|e| format!("Failed to delete existing files: {}", e))?;

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

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    #[test]
    fn test_add_workspace_persists_to_db() {
        let temp_dir = TempDir::new().expect("Failed to create temp dir");
        let repo_path = temp_dir.path().to_str().unwrap();

        let workspace_dir = temp_dir
            .path()
            .join(".treq")
            .join("workspaces")
            .join("test-workspace");
        fs::create_dir_all(&workspace_dir).expect("Failed to create workspace dir");
        let workspace_path = workspace_dir.to_str().unwrap().to_string();

        assert!(
            workspace_dir.exists(),
            "Workspace directory should exist"
        );

        let id = add_workspace(
            repo_path,
            "test-workspace".to_string(),
            workspace_path.clone(),
            "test-branch".to_string(),
            Some(r#"{"intent":"test intent"}"#.to_string()),
        )
        .expect("add_workspace should succeed");

        assert!(id > 0, "Workspace ID should be positive");

        let workspaces = get_workspaces(repo_path).expect("get_workspaces should succeed");

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

        let db_path = get_local_db_path(repo_path);
        assert!(
            db_path.exists(),
            "Database file should exist at {:?}",
            db_path
        );

        if let Some(initialized) = INITIALIZED_DBS.get() {
            initialized.lock().unwrap().remove(repo_path);
        }
    }

    #[test]
    fn test_add_multiple_workspaces() {
        let temp_dir = TempDir::new().expect("Failed to create temp dir");
        let repo_path = temp_dir.path().to_str().unwrap();

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

        let workspaces = get_workspaces(repo_path).expect("get_workspaces should succeed");

        assert_eq!(workspaces.len(), 2, "Should have 2 workspaces");
        assert_eq!(workspaces[0].id, id1);
        assert_eq!(workspaces[0].workspace_name, "workspace-1");
        assert_eq!(workspaces[1].id, id2);
        assert_eq!(workspaces[1].workspace_name, "workspace-2");

        if let Some(initialized) = INITIALIZED_DBS.get() {
            initialized.lock().unwrap().remove(repo_path);
        }
    }

    #[test]
    fn test_workspace_persists_after_reload() {
        let temp_dir = TempDir::new().expect("Failed to create temp dir");
        let repo_path = temp_dir.path().to_str().unwrap();

        let id = add_workspace(
            repo_path,
            "test-workspace".to_string(),
            format!("{}/.treq/workspaces/test-workspace", repo_path),
            "test-branch".to_string(),
            None,
        )
        .expect("add_workspace should succeed");

        let workspaces = get_workspaces(repo_path).expect("get_workspaces should succeed");
        assert_eq!(workspaces.len(), 1, "Workspace should exist initially");
        assert_eq!(workspaces[0].id, id);

        if let Some(initialized) = INITIALIZED_DBS.get() {
            initialized.lock().unwrap().remove(repo_path);
        }

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

        if let Some(initialized) = INITIALIZED_DBS.get() {
            initialized.lock().unwrap().remove(repo_path);
        }
    }

    #[test]
    fn test_rebuild_workspaces_deletes_workspace_without_git_file() {
        let temp_dir = TempDir::new().expect("Failed to create temp dir");
        let repo_path = temp_dir.path().to_str().unwrap();

        let workspace_dir = temp_dir
            .path()
            .join(".treq")
            .join("workspaces")
            .join("test-workspace");
        fs::create_dir_all(&workspace_dir).expect("Failed to create workspace dir");
        let workspace_path = workspace_dir.to_str().unwrap().to_string();

        let id = add_workspace(
            repo_path,
            "test-workspace".to_string(),
            workspace_path.clone(),
            "test-branch".to_string(),
            None,
        )
        .expect("add_workspace should succeed");

        let workspaces = get_workspaces(repo_path).expect("get_workspaces should succeed");
        assert_eq!(workspaces.len(), 1, "Workspace should exist before rebuild");
        assert_eq!(workspaces[0].id, id);

        let rebuilt =
            rebuild_workspaces_from_filesystem(repo_path).expect("rebuild should succeed");

        assert_eq!(
            rebuilt.len(),
            1,
            "Workspace should persist after rebuild, even without .git file"
        );

        let workspaces_after = get_workspaces(repo_path).expect("get_workspaces should succeed");
        assert_eq!(
            workspaces_after.len(),
            1,
            "Workspace should still exist in database after rebuild"
        );
        assert_eq!(workspaces_after[0].id, id);

        if let Some(initialized) = INITIALIZED_DBS.get() {
            initialized.lock().unwrap().remove(repo_path);
        }
    }

    #[test]
    fn test_get_workspaces_by_target_branch() {
        let temp_dir = TempDir::new().expect("Failed to create temp dir");
        let repo_path = temp_dir.path().to_str().unwrap();

        let id1 = add_workspace(
            repo_path,
            "workspace-1".to_string(),
            format!("{}/.treq/workspaces/workspace-1", repo_path),
            "branch-a".to_string(),
            None,
        )
        .expect("add_workspace 1 should succeed");
        update_workspace_target_branch(repo_path, id1, "main")
            .expect("update target branch should succeed");

        let id2 = add_workspace(
            repo_path,
            "workspace-2".to_string(),
            format!("{}/.treq/workspaces/workspace-2", repo_path),
            "branch-b".to_string(),
            None,
        )
        .expect("add_workspace 2 should succeed");
        update_workspace_target_branch(repo_path, id2, "develop")
            .expect("update target branch should succeed");

        let id3 = add_workspace(
            repo_path,
            "workspace-3".to_string(),
            format!("{}/.treq/workspaces/workspace-3", repo_path),
            "branch-c".to_string(),
            None,
        )
        .expect("add_workspace 3 should succeed");
        update_workspace_target_branch(repo_path, id3, "main")
            .expect("update target branch should succeed");

        let main_workspaces =
            get_workspaces_by_target_branch(repo_path, "main").expect("query should succeed");

        assert_eq!(main_workspaces.len(), 2);
        assert_eq!(main_workspaces[0].id, id1);
        assert_eq!(main_workspaces[1].id, id3);
        assert_eq!(main_workspaces[0].target_branch, Some("main".to_string()));
        assert_eq!(main_workspaces[1].target_branch, Some("main".to_string()));

        if let Some(initialized) = INITIALIZED_DBS.get() {
            initialized.lock().unwrap().remove(repo_path);
        }
    }

    #[test]
    fn test_update_workspace_has_conflicts() {
        let temp_dir = TempDir::new().expect("Failed to create temp dir");
        let repo_path = temp_dir.path().to_str().unwrap();

        let id = add_workspace(
            repo_path,
            "test-workspace".to_string(),
            format!("{}/.treq/workspaces/test-workspace", repo_path),
            "test-branch".to_string(),
            None,
        )
        .expect("add_workspace should succeed");

        let workspaces = get_workspaces(repo_path).expect("get_workspaces should succeed");
        assert_eq!(workspaces[0].has_conflicts, false);

        update_workspace_has_conflicts(repo_path, id, true)
            .expect("update should succeed");

        let workspaces = get_workspaces(repo_path).expect("get_workspaces should succeed");
        assert_eq!(workspaces[0].has_conflicts, true);

        update_workspace_has_conflicts(repo_path, id, false)
            .expect("update should succeed");

        let workspaces = get_workspaces(repo_path).expect("get_workspaces should succeed");
        assert_eq!(workspaces[0].has_conflicts, false);

        if let Some(initialized) = INITIALIZED_DBS.get() {
            initialized.lock().unwrap().remove(repo_path);
        }
    }
}
