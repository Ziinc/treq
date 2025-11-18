use rusqlite::{params, Connection, Result};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use sha2::{Sha256, Digest};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Worktree {
    pub id: i64,
    pub repo_path: String,
    pub worktree_path: String,
    pub branch_name: String,
    pub created_at: String,
    pub metadata: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Command {
    pub id: i64,
    pub worktree_id: i64,
    pub command: String,
    pub created_at: String,
    pub status: String,
    pub output: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Session {
    pub id: i64,
    pub worktree_id: Option<i64>,
    pub session_type: String,
    pub name: String,
    pub created_at: String,
    pub last_accessed: String,
}

pub struct Database {
    conn: Connection,
}

impl Database {
    pub fn new(db_path: PathBuf) -> Result<Self> {
        let conn = Connection::open(db_path)?;
        Ok(Database { conn })
    }

    pub fn init(&self) -> Result<()> {
        self.conn.execute(
            "CREATE TABLE IF NOT EXISTS worktrees (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                repo_path TEXT NOT NULL,
                worktree_path TEXT NOT NULL,
                branch_name TEXT NOT NULL,
                created_at TEXT NOT NULL,
                metadata TEXT
            )",
            [],
        )?;

        self.conn.execute(
            "CREATE TABLE IF NOT EXISTS commands (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                worktree_id INTEGER NOT NULL,
                command TEXT NOT NULL,
                created_at TEXT NOT NULL,
                status TEXT NOT NULL,
                output TEXT,
                FOREIGN KEY (worktree_id) REFERENCES worktrees(id)
            )",
            [],
        )?;

        self.conn.execute(
            "CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            )",
            [],
        )?;

        self.conn.execute(
            "CREATE TABLE IF NOT EXISTS sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                worktree_id INTEGER,
                type TEXT NOT NULL,
                name TEXT NOT NULL,
                created_at TEXT NOT NULL,
                last_accessed TEXT NOT NULL,
                FOREIGN KEY (worktree_id) REFERENCES worktrees(id) ON DELETE CASCADE
            )",
            [],
        )?;

        Ok(())
    }

    pub fn add_worktree(&self, worktree: &Worktree) -> Result<i64> {
        self.conn.execute(
            "INSERT INTO worktrees (repo_path, worktree_path, branch_name, created_at, metadata)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            (
                &worktree.repo_path,
                &worktree.worktree_path,
                &worktree.branch_name,
                &worktree.created_at,
                &worktree.metadata,
            ),
        )?;
        Ok(self.conn.last_insert_rowid())
    }

    pub fn get_worktrees(&self) -> Result<Vec<Worktree>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, repo_path, worktree_path, branch_name, created_at, metadata 
             FROM worktrees ORDER BY created_at DESC",
        )?;

        let worktrees = stmt.query_map([], |row| {
            Ok(Worktree {
                id: row.get(0)?,
                repo_path: row.get(1)?,
                worktree_path: row.get(2)?,
                branch_name: row.get(3)?,
                created_at: row.get(4)?,
                metadata: row.get(5)?,
            })
        })?;

        worktrees.collect()
    }

    pub fn delete_worktree(&self, id: i64) -> Result<()> {
        self.conn.execute("DELETE FROM commands WHERE worktree_id = ?1", [id])?;
        self.conn.execute("DELETE FROM sessions WHERE worktree_id = ?1", [id])?;
        self.conn.execute("DELETE FROM worktrees WHERE id = ?1", [id])?;
        Ok(())
    }

    pub fn add_command(&self, cmd: &Command) -> Result<i64> {
        self.conn.execute(
            "INSERT INTO commands (worktree_id, command, created_at, status, output)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            (
                cmd.worktree_id,
                &cmd.command,
                &cmd.created_at,
                &cmd.status,
                &cmd.output,
            ),
        )?;
        Ok(self.conn.last_insert_rowid())
    }

    pub fn get_commands(&self, worktree_id: i64) -> Result<Vec<Command>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, worktree_id, command, created_at, status, output 
             FROM commands WHERE worktree_id = ?1 ORDER BY created_at DESC",
        )?;

        let commands = stmt.query_map([worktree_id], |row| {
            Ok(Command {
                id: row.get(0)?,
                worktree_id: row.get(1)?,
                command: row.get(2)?,
                created_at: row.get(3)?,
                status: row.get(4)?,
                output: row.get(5)?,
            })
        })?;

        commands.collect()
    }

    pub fn get_setting(&self, key: &str) -> Result<Option<String>> {
        let mut stmt = self.conn.prepare("SELECT value FROM settings WHERE key = ?1")?;
        let mut rows = stmt.query([key])?;
        
        if let Some(row) = rows.next()? {
            Ok(Some(row.get(0)?))
        } else {
            Ok(None)
        }
    }

    pub fn set_setting(&self, key: &str, value: &str) -> Result<()> {
        self.conn.execute(
            "INSERT OR REPLACE INTO settings (key, value) VALUES (?1, ?2)",
            [key, value],
        )?;
        Ok(())
    }

    // Helper function to create composite key for repo-specific settings
    fn make_repo_key(repo_path: &str, key: &str) -> String {
        let mut hasher = Sha256::new();
        hasher.update(repo_path.as_bytes());
        let hash = hasher.finalize();
        let hash_hex = format!("{:x}", hash);
        format!("repo_{}_{}", &hash_hex[..16], key) // Use first 16 chars of hash
    }

    pub fn get_repo_setting(&self, repo_path: &str, key: &str) -> Result<Option<String>> {
        let composite_key = Self::make_repo_key(repo_path, key);
        self.get_setting(&composite_key)
    }

    pub fn set_repo_setting(&self, repo_path: &str, key: &str, value: &str) -> Result<()> {
        let composite_key = Self::make_repo_key(repo_path, key);
        self.set_setting(&composite_key, value)
    }

    pub fn delete_repo_setting(&self, repo_path: &str, key: &str) -> Result<()> {
        let composite_key = Self::make_repo_key(repo_path, key);
        self.conn.execute(
            "DELETE FROM settings WHERE key = ?1",
            [composite_key],
        )?;
        Ok(())
    }

    pub fn add_session(&self, session: &Session) -> Result<i64> {
        self.conn.execute(
            "INSERT INTO sessions (worktree_id, type, name, created_at, last_accessed)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            (
                &session.worktree_id,
                &session.session_type,
                &session.name,
                &session.created_at,
                &session.last_accessed,
            ),
        )?;
        Ok(self.conn.last_insert_rowid())
    }

    pub fn get_sessions(&self) -> Result<Vec<Session>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, worktree_id, type, name, created_at, last_accessed 
             FROM sessions ORDER BY last_accessed DESC",
        )?;

        let sessions = stmt.query_map([], |row| {
            Ok(Session {
                id: row.get(0)?,
                worktree_id: row.get(1)?,
                session_type: row.get(2)?,
                name: row.get(3)?,
                created_at: row.get(4)?,
                last_accessed: row.get(5)?,
            })
        })?;

        sessions.collect()
    }

    pub fn get_sessions_by_worktree(&self, worktree_id: i64) -> Result<Vec<Session>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, worktree_id, type, name, created_at, last_accessed 
             FROM sessions WHERE worktree_id = ?1 ORDER BY last_accessed DESC",
        )?;

        let sessions = stmt.query_map([worktree_id], |row| {
            Ok(Session {
                id: row.get(0)?,
                worktree_id: row.get(1)?,
                session_type: row.get(2)?,
                name: row.get(3)?,
                created_at: row.get(4)?,
                last_accessed: row.get(5)?,
            })
        })?;

        sessions.collect()
    }

    pub fn get_main_repo_sessions(&self) -> Result<Vec<Session>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, worktree_id, type, name, created_at, last_accessed 
             FROM sessions WHERE worktree_id IS NULL ORDER BY last_accessed DESC",
        )?;

        let sessions = stmt.query_map([], |row| {
            Ok(Session {
                id: row.get(0)?,
                worktree_id: row.get(1)?,
                session_type: row.get(2)?,
                name: row.get(3)?,
                created_at: row.get(4)?,
                last_accessed: row.get(5)?,
            })
        })?;

        sessions.collect()
    }

    pub fn update_session_access(&self, id: i64, last_accessed: &str) -> Result<()> {
        self.conn.execute(
            "UPDATE sessions SET last_accessed = ?1 WHERE id = ?2",
            params![last_accessed, id],
        )?;
        Ok(())
    }

    pub fn delete_session(&self, id: i64) -> Result<()> {
        self.conn.execute("DELETE FROM sessions WHERE id = ?1", [id])?;
        Ok(())
    }
}
