use chrono::Utc;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fs;
use std::path::{Path, PathBuf};

// Re-export types from db module
use crate::db::{Session, Worktree};

#[derive(Debug, Serialize, Deserialize)]
pub struct PlanHistoryEntry {
    pub id: i64,
    pub worktree_id: i64,
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
            worktree_id INTEGER NOT NULL,
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

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_plans_worktree_id ON plans(worktree_id)",
        [],
    )
    .map_err(|e| format!("Failed to create worktree index: {}", e))?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_plans_executed_at ON plans(executed_at)",
        [],
    )
    .map_err(|e| format!("Failed to create executed_at index: {}", e))?;

    // Create worktrees table
    conn.execute(
        "CREATE TABLE IF NOT EXISTS worktrees (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            worktree_path TEXT NOT NULL UNIQUE,
            branch_name TEXT NOT NULL,
            created_at TEXT NOT NULL,
            metadata TEXT,
            is_pinned INTEGER DEFAULT 0
        )",
        [],
    )
    .map_err(|e| format!("Failed to create worktrees table: {}", e))?;

    // Migration: Add is_pinned column if it doesn't exist
    let _ = conn.execute(
        "ALTER TABLE worktrees ADD COLUMN is_pinned INTEGER DEFAULT 0",
        [],
    );

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_worktrees_branch ON worktrees(branch_name)",
        [],
    )
    .map_err(|e| format!("Failed to create worktrees branch index: {}", e))?;

    // Create sessions table
    conn.execute(
        "CREATE TABLE IF NOT EXISTS sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            worktree_id INTEGER,
            name TEXT NOT NULL,
            created_at TEXT NOT NULL,
            last_accessed TEXT NOT NULL,
            plan_title TEXT,
            model TEXT,
            FOREIGN KEY (worktree_id) REFERENCES worktrees(id) ON DELETE CASCADE
        )",
        [],
    )
    .map_err(|e| format!("Failed to create sessions table: {}", e))?;

    // Migration: Add model column if it doesn't exist
    let _ = conn.execute(
        "ALTER TABLE sessions ADD COLUMN model TEXT",
        [],
    );

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_sessions_worktree ON sessions(worktree_id)",
        [],
    )
    .map_err(|e| format!("Failed to create sessions worktree index: {}", e))?;

    Ok(())
}

fn get_connection(repo_path: &str) -> Result<Connection, String> {
    init_local_db(repo_path)?;
    let db_path = get_local_db_path(repo_path);
    Connection::open(db_path).map_err(|e| format!("Failed to open local db: {}", e))
}

pub fn save_executed_plan(
    repo_path: &str,
    worktree_id: i64,
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
        "INSERT INTO plans (worktree_id, title, type, content, created_at, executed_at, status)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![
            worktree_id,
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

pub fn get_worktree_plans(
    repo_path: &str,
    worktree_id: i64,
    limit: Option<i64>,
) -> Result<Vec<PlanHistoryEntry>, String> {
    let conn = get_connection(repo_path)?;
    let mut query = String::from(
        "SELECT id, worktree_id, title, type, content, created_at, executed_at, status
         FROM plans WHERE worktree_id = ?1
         ORDER BY datetime(executed_at) DESC, id DESC",
    );

    if let Some(limit) = limit {
        query.push_str(" LIMIT ?2");
        let mut stmt = conn
            .prepare(&query)
            .map_err(|e| format!("Failed to prepare plan query: {}", e))?;
        let rows = stmt
            .query_map(params![worktree_id, limit], |row| row_to_plan(row))
            .map_err(|e| format!("Failed to query plans: {}", e))?;
        return rows
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string());
    }

    let mut stmt = conn
        .prepare(&query)
        .map_err(|e| format!("Failed to prepare plan query: {}", e))?;
    let rows = stmt
        .query_map(params![worktree_id], |row| row_to_plan(row))
        .map_err(|e| format!("Failed to query plans: {}", e))?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())
}

pub fn get_all_worktree_plans(
    repo_path: &str,
    worktree_id: i64,
) -> Result<Vec<PlanHistoryEntry>, String> {
    get_worktree_plans(repo_path, worktree_id, None)
}

fn row_to_plan(row: &rusqlite::Row) -> rusqlite::Result<PlanHistoryEntry> {
    let content: String = row.get(4)?;
    let content_value = serde_json::from_str(&content).unwrap_or(Value::Null);

    Ok(PlanHistoryEntry {
        id: row.get(0)?,
        worktree_id: row.get(1)?,
        title: row.get(2)?,
        plan_type: row.get(3)?,
        content: content_value,
        created_at: row.get(5)?,
        executed_at: row.get(6)?,
        status: row.get(7)?,
    })
}

// ============================================================================
// Worktrees Functions
// ============================================================================

pub fn get_worktrees(repo_path: &str) -> Result<Vec<Worktree>, String> {
    let conn = get_connection(repo_path)?;
    let mut stmt = conn
        .prepare("SELECT id, worktree_path, branch_name, created_at, metadata, is_pinned FROM worktrees ORDER BY is_pinned DESC, branch_name COLLATE NOCASE ASC")
        .map_err(|e| format!("Failed to prepare worktrees query: {}", e))?;

    let worktrees = stmt
        .query_map([], |row| {
            Ok(Worktree {
                id: row.get(0)?,
                repo_path: repo_path.to_string(), // Add repo_path from function parameter
                worktree_path: row.get(1)?,
                branch_name: row.get(2)?,
                created_at: row.get(3)?,
                metadata: row.get(4)?,
                is_pinned: row.get::<_, i64>(5)? != 0,  // Convert INTEGER to bool
            })
        })
        .map_err(|e| format!("Failed to query worktrees: {}", e))?;

    worktrees
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())
}

pub fn add_worktree(
    repo_path: &str,
    worktree_path: String,
    branch_name: String,
    metadata: Option<String>,
) -> Result<i64, String> {
    let conn = get_connection(repo_path)?;
    let created_at = Utc::now().to_rfc3339();

    conn.execute(
        "INSERT INTO worktrees (worktree_path, branch_name, created_at, metadata, is_pinned)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        params![worktree_path, branch_name, created_at, metadata, 0],
    )
    .map_err(|e| format!("Failed to insert worktree: {}", e))?;

    Ok(conn.last_insert_rowid())
}

pub fn delete_worktree(repo_path: &str, id: i64) -> Result<(), String> {
    let conn = get_connection(repo_path)?;
    conn.execute("DELETE FROM worktrees WHERE id = ?1", [id])
        .map_err(|e| format!("Failed to delete worktree: {}", e))?;
    Ok(())
}

pub fn toggle_worktree_pin(repo_path: &str, id: i64) -> Result<bool, String> {
    let conn = get_connection(repo_path)?;

    // Get current pin status
    let mut stmt = conn
        .prepare("SELECT is_pinned FROM worktrees WHERE id = ?1")
        .map_err(|e| format!("Failed to prepare query: {}", e))?;

    let current_pinned: i64 = stmt
        .query_row([id], |row| row.get(0))
        .map_err(|e| format!("Failed to get pin status: {}", e))?;

    // Toggle it
    let new_pinned = if current_pinned != 0 { 0 } else { 1 };

    conn.execute(
        "UPDATE worktrees SET is_pinned = ?1 WHERE id = ?2",
        params![new_pinned, id],
    )
    .map_err(|e| format!("Failed to update pin status: {}", e))?;

    Ok(new_pinned != 0)
}

pub fn rebuild_worktrees_from_filesystem(repo_path: &str) -> Result<Vec<Worktree>, String> {
    let worktrees_dir = Path::new(repo_path).join(".treq").join("worktrees");

    // Clear existing worktrees in the database
    let conn = get_connection(repo_path)?;
    conn.execute("DELETE FROM worktrees", [])
        .map_err(|e| format!("Failed to clear worktrees: {}", e))?;

    // If the worktrees directory doesn't exist, return empty list
    if !worktrees_dir.exists() {
        return Ok(Vec::new());
    }

    let mut worktrees = Vec::new();

    // Read the worktrees directory
    let entries = fs::read_dir(&worktrees_dir)
        .map_err(|e| format!("Failed to read worktrees directory: {}", e))?;

    for entry in entries {
        let entry = entry.map_err(|e| format!("Failed to read directory entry: {}", e))?;
        let path = entry.path();

        // Skip if not a directory
        if !path.is_dir() {
            continue;
        }

        // Get the branch name from the directory name
        let branch_name = path
            .file_name()
            .and_then(|n| n.to_str())
            .ok_or_else(|| "Invalid directory name".to_string())?
            .to_string();

        let worktree_path = path
            .to_str()
            .ok_or_else(|| "Invalid worktree path".to_string())?
            .to_string();

        // Check if it's actually a git worktree (has .git file)
        let git_file = path.join(".git");
        if !git_file.exists() {
            continue;
        }

        // Add to database
        let id = add_worktree(repo_path, worktree_path.clone(), branch_name.clone(), None)?;

        worktrees.push(Worktree {
            id,
            repo_path: repo_path.to_string(),
            worktree_path,
            branch_name,
            created_at: Utc::now().to_rfc3339(),
            metadata: None,
            is_pinned: false,
        });
    }

    Ok(worktrees)
}

// ============================================================================
// Sessions Functions
// ============================================================================

pub fn get_sessions(repo_path: &str) -> Result<Vec<Session>, String> {
    let conn = get_connection(repo_path)?;
    let mut stmt = conn
        .prepare("SELECT id, worktree_id, name, created_at, last_accessed, plan_title, model FROM sessions ORDER BY created_at ASC")
        .map_err(|e| format!("Failed to prepare sessions query: {}", e))?;

    let sessions = stmt
        .query_map([], |row| {
            Ok(Session {
                id: row.get(0)?,
                worktree_id: row.get(1)?,
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
    worktree_id: Option<i64>,
    name: String,
    plan_title: Option<String>,
) -> Result<i64, String> {
    let conn = get_connection(repo_path)?;
    let now = Utc::now().to_rfc3339();

    conn.execute(
        "INSERT INTO sessions (worktree_id, name, created_at, last_accessed, plan_title, model)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![worktree_id, name, now, now, plan_title, None::<String>],
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
