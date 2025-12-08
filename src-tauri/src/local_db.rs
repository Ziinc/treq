use chrono::Utc;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fs;
use std::path::{Path, PathBuf};

// Re-export types from db module
use crate::db::{Session, Workspace};

#[derive(Debug, Serialize, Deserialize)]
pub struct PlanHistoryEntry {
    pub id: i64,
    pub workspace_id: i64,
    pub title: String,
    #[serde(rename = "type")]
    pub plan_type: String,
    pub content: Value,
    pub created_at: String,
    pub executed_at: String,
    pub status: String,
}

#[derive(Debug, Deserialize)]
pub struct PlanHistoryInput {
    pub title: String,
    #[serde(rename = "type")]
    pub plan_type: String,
    pub content: Value,
    pub created_at: Option<String>,
    pub executed_at: Option<String>,
    pub status: Option<String>,
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

    conn.execute(
        "CREATE TABLE IF NOT EXISTS plans (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            workspace_id INTEGER NOT NULL,
            title TEXT NOT NULL,
            type TEXT NOT NULL,
            content TEXT NOT NULL,
            created_at TEXT NOT NULL,
            executed_at TEXT NOT NULL,
            status TEXT NOT NULL
        )",
        [],
    )
    .map_err(|e| format!("Failed to create plans table: {}", e))?;

    // Migration: Rename worktree_id to workspace_id in plans table
    let has_worktree_col: Result<i64, _> = conn.query_row(
        "SELECT COUNT(*) FROM pragma_table_info('plans') WHERE name='worktree_id'",
        [],
        |row| row.get(0),
    );

    if let Ok(count) = has_worktree_col {
        if count > 0 {
            // SQLite doesn't support RENAME COLUMN in older versions, so recreate the table
            conn.execute(
                "CREATE TABLE plans_new (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    workspace_id INTEGER NOT NULL,
                    title TEXT NOT NULL,
                    type TEXT NOT NULL,
                    content TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    executed_at TEXT NOT NULL,
                    status TEXT NOT NULL
                )",
                [],
            )
            .map_err(|e| format!("Failed to create plans_new table: {}", e))?;

            conn.execute(
                "INSERT INTO plans_new SELECT id, worktree_id, title, type, content, created_at, executed_at, status FROM plans",
                [],
            )
            .map_err(|e| format!("Failed to migrate plans data: {}", e))?;

            conn.execute("DROP TABLE plans", [])
                .map_err(|e| format!("Failed to drop old plans table: {}", e))?;

            conn.execute("ALTER TABLE plans_new RENAME TO plans", [])
                .map_err(|e| format!("Failed to rename plans_new to plans: {}", e))?;
        }
    }

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_plans_workspace_id ON plans(workspace_id)",
        [],
    )
    .map_err(|e| format!("Failed to create workspace index: {}", e))?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_plans_executed_at ON plans(executed_at)",
        [],
    )
    .map_err(|e| format!("Failed to create executed_at index: {}", e))?;

    // Create workspaces table
    conn.execute(
        "CREATE TABLE IF NOT EXISTS workspaces (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            workspace_name TEXT NOT NULL,
            workspace_path TEXT NOT NULL UNIQUE,
            branch_name TEXT NOT NULL,
            created_at TEXT NOT NULL,
            metadata TEXT,
            is_pinned INTEGER DEFAULT 0
        )",
        [],
    )
    .map_err(|e| format!("Failed to create workspaces table: {}", e))?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_workspaces_branch ON workspaces(branch_name)",
        [],
    )
    .map_err(|e| format!("Failed to create workspaces branch index: {}", e))?;

    // Create sessions table
    conn.execute(
        "CREATE TABLE IF NOT EXISTS sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            workspace_id INTEGER,
            name TEXT NOT NULL,
            created_at TEXT NOT NULL,
            last_accessed TEXT NOT NULL,
            plan_title TEXT,
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
                    plan_title TEXT,
                    model TEXT,
                    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
                )",
                [],
            )
            .map_err(|e| format!("Failed to create sessions_new table: {}", e))?;

            conn.execute(
                "INSERT INTO sessions_new SELECT id, worktree_id, name, created_at, last_accessed, plan_title, model FROM sessions",
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
    let _ = conn.execute(
        "ALTER TABLE sessions ADD COLUMN model TEXT",
        [],
    );

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_sessions_workspace ON sessions(workspace_id)",
        [],
    )
    .map_err(|e| format!("Failed to create sessions workspace index: {}", e))?;

    Ok(())
}

fn get_connection(repo_path: &str) -> Result<Connection, String> {
    init_local_db(repo_path)?;
    let db_path = get_local_db_path(repo_path);
    Connection::open(db_path).map_err(|e| format!("Failed to open local db: {}", e))
}

pub fn save_executed_plan(
    repo_path: &str,
    workspace_id: i64,
    plan_data: PlanHistoryInput,
) -> Result<i64, String> {
    let conn = get_connection(repo_path)?;
    let created_at = plan_data
        .created_at
        .unwrap_or_else(|| Utc::now().to_rfc3339());
    let executed_at = plan_data
        .executed_at
        .unwrap_or_else(|| Utc::now().to_rfc3339());
    let status = plan_data.status.unwrap_or_else(|| "executed".to_string());
    let content = serde_json::to_string(&plan_data.content)
        .map_err(|e| format!("Failed to serialize plan content: {}", e))?;

    conn.execute(
        "INSERT INTO plans (workspace_id, title, type, content, created_at, executed_at, status)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![
            workspace_id,
            plan_data.title,
            plan_data.plan_type,
            content,
            created_at,
            executed_at,
            status,
        ],
    )
    .map_err(|e| format!("Failed to insert plan history: {}", e))?;

    Ok(conn.last_insert_rowid())
}

pub fn get_workspace_plans(
    repo_path: &str,
    workspace_id: i64,
    limit: Option<i64>,
) -> Result<Vec<PlanHistoryEntry>, String> {
    let conn = get_connection(repo_path)?;
    let mut query = String::from(
        "SELECT id, workspace_id, title, type, content, created_at, executed_at, status
         FROM plans WHERE workspace_id = ?1
         ORDER BY datetime(executed_at) DESC, id DESC",
    );

    if let Some(limit) = limit {
        query.push_str(" LIMIT ?2");
        let mut stmt = conn
            .prepare(&query)
            .map_err(|e| format!("Failed to prepare plan query: {}", e))?;
        let rows = stmt
            .query_map(params![workspace_id, limit], |row| row_to_plan(row))
            .map_err(|e| format!("Failed to query plans: {}", e))?;
        return rows
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string());
    }

    let mut stmt = conn
        .prepare(&query)
        .map_err(|e| format!("Failed to prepare plan query: {}", e))?;
    let rows = stmt
        .query_map(params![workspace_id], |row| row_to_plan(row))
        .map_err(|e| format!("Failed to query plans: {}", e))?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())
}

pub fn get_all_workspace_plans(
    repo_path: &str,
    workspace_id: i64,
) -> Result<Vec<PlanHistoryEntry>, String> {
    get_workspace_plans(repo_path, workspace_id, None)
}

fn row_to_plan(row: &rusqlite::Row) -> rusqlite::Result<PlanHistoryEntry> {
    let content: String = row.get(4)?;
    let content_value = serde_json::from_str(&content).unwrap_or(Value::Null);

    Ok(PlanHistoryEntry {
        id: row.get(0)?,
        workspace_id: row.get(1)?,
        title: row.get(2)?,
        plan_type: row.get(3)?,
        content: content_value,
        created_at: row.get(5)?,
        executed_at: row.get(6)?,
        status: row.get(7)?,
    })
}

// ============================================================================
// Workspaces Functions
// ============================================================================

pub fn get_workspaces(repo_path: &str) -> Result<Vec<Workspace>, String> {
    let conn = get_connection(repo_path)?;
    let mut stmt = conn
        .prepare("SELECT id, workspace_name, workspace_path, branch_name, created_at, metadata, is_pinned FROM workspaces ORDER BY is_pinned DESC, branch_name COLLATE NOCASE ASC")
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
                is_pinned: row.get::<_, i64>(6)? != 0,
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
        "INSERT INTO workspaces (workspace_name, workspace_path, branch_name, created_at, metadata, is_pinned)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![workspace_name, workspace_path, branch_name, created_at, metadata, 0],
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

pub fn toggle_workspace_pin(repo_path: &str, id: i64) -> Result<bool, String> {
    let conn = get_connection(repo_path)?;

    // Get current pin status
    let mut stmt = conn
        .prepare("SELECT is_pinned FROM workspaces WHERE id = ?1")
        .map_err(|e| format!("Failed to prepare query: {}", e))?;

    let current_pinned: i64 = stmt
        .query_row([id], |row| row.get(0))
        .map_err(|e| format!("Failed to get pin status: {}", e))?;

    // Toggle it
    let new_pinned = if current_pinned != 0 { 0 } else { 1 };

    conn.execute(
        "UPDATE workspaces SET is_pinned = ?1 WHERE id = ?2",
        params![new_pinned, id],
    )
    .map_err(|e| format!("Failed to update pin status: {}", e))?;

    Ok(new_pinned != 0)
}

pub fn rebuild_workspaces_from_filesystem(repo_path: &str) -> Result<Vec<Workspace>, String> {
    let workspaces_dir = Path::new(repo_path).join(".treq").join("workspaces");

    // Clear existing workspaces in the database
    let conn = get_connection(repo_path)?;
    conn.execute("DELETE FROM workspaces", [])
        .map_err(|e| format!("Failed to clear workspaces: {}", e))?;

    // If the workspaces directory doesn't exist, return empty list
    if !workspaces_dir.exists() {
        return Ok(Vec::new());
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

        // Check if it's actually a git workspace (has .git file)
        let git_file = path.join(".git");
        if !git_file.exists() {
            continue;
        }

        // Get the branch name from git
        let branch_name = get_workspace_branch(&workspace_path).unwrap_or(workspace_name.clone());

        // Add to database
        let id = add_workspace(repo_path, workspace_name.clone(), workspace_path.clone(), branch_name.clone(), None)?;

        workspaces.push(Workspace {
            id,
            repo_path: repo_path.to_string(),
            workspace_name,
            workspace_path,
            branch_name,
            created_at: Utc::now().to_rfc3339(),
            metadata: None,
            is_pinned: false,
        });
    }

    Ok(workspaces)
}

/// Get the current branch of a workspace
fn get_workspace_branch(workspace_path: &str) -> Result<String, String> {
    use std::process::Command;

    let output = Command::new("git")
        .current_dir(workspace_path)
        .args(["rev-parse", "--abbrev-ref", "HEAD"])
        .output()
        .map_err(|e| e.to_string())?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
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
        .prepare("SELECT id, workspace_id, name, created_at, last_accessed, plan_title, model FROM sessions ORDER BY created_at ASC")
        .map_err(|e| format!("Failed to prepare sessions query: {}", e))?;

    let sessions = stmt
        .query_map([], |row| {
            Ok(Session {
                id: row.get(0)?,
                workspace_id: row.get(1)?,
                name: row.get(2)?,
                created_at: row.get(3)?,
                last_accessed: row.get(4)?,
                plan_title: row.get(5)?,
                model: row.get(6)?,
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
    plan_title: Option<String>,
) -> Result<i64, String> {
    let conn = get_connection(repo_path)?;
    let now = Utc::now().to_rfc3339();

    conn.execute(
        "INSERT INTO sessions (workspace_id, name, created_at, last_accessed, plan_title, model)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![workspace_id, name, now, now, plan_title, None::<String>],
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
