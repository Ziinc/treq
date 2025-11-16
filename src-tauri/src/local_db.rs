use chrono::Utc;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fs;
use std::path::{Path, PathBuf};

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

    let conn = Connection::open(db_path)
        .map_err(|e| format!("Failed to open local db: {}", e))?;

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
    let status = plan_data
        .status
        .unwrap_or_else(|| "executed".to_string());
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
        return rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string());
    }

    let mut stmt = conn
        .prepare(&query)
        .map_err(|e| format!("Failed to prepare plan query: {}", e))?;
    let rows = stmt
        .query_map(params![worktree_id], |row| row_to_plan(row))
        .map_err(|e| format!("Failed to query plans: {}", e))?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

pub fn get_all_worktree_plans(repo_path: &str, worktree_id: i64) -> Result<Vec<PlanHistoryEntry>, String> {
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
