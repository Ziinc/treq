use chrono::Utc;
use rusqlite::{params, Connection, Result};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::path::PathBuf;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Worktree {
    pub id: i64,
    pub repo_path: String,
    pub worktree_path: String,
    pub branch_name: String,
    pub created_at: String,
    pub metadata: Option<String>,
    pub is_pinned: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Session {
    pub id: i64,
    pub worktree_id: Option<i64>,
    pub name: String,
    pub created_at: String,
    pub last_accessed: String,
    pub plan_title: Option<String>,
    pub model: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GitCacheEntry {
    pub id: i64,
    pub worktree_path: String,
    pub file_path: Option<String>,
    pub cache_type: String,
    pub data: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FileView {
    pub id: i64,
    pub worktree_path: String,
    pub file_path: String,
    pub viewed_at: String,
    pub content_hash: String,
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
                plan_title TEXT,
                model TEXT,
                FOREIGN KEY (worktree_id) REFERENCES worktrees(id) ON DELETE CASCADE
            )",
            [],
        )?;

        // Migration: Add plan_title column if it doesn't exist
        let _ = self
            .conn
            .execute("ALTER TABLE sessions ADD COLUMN plan_title TEXT", []);

        // Migration: Add model column if it doesn't exist
        let _ = self
            .conn
            .execute("ALTER TABLE sessions ADD COLUMN model TEXT", []);

        let _ = self.conn.execute(
            "DELETE FROM sessions WHERE type IS NULL OR type <> 'session'",
            [],
        );

        self.conn.execute(
            "CREATE TABLE IF NOT EXISTS git_cache (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                worktree_path TEXT NOT NULL,
                file_path TEXT,
                cache_type TEXT NOT NULL,
                data TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                UNIQUE(worktree_path, file_path, cache_type)
            )",
            [],
        )?;

        self.conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_git_cache_worktree ON git_cache(worktree_path)",
            [],
        )?;

        self.conn.execute(
            "CREATE TABLE IF NOT EXISTS file_views (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                worktree_path TEXT NOT NULL,
                file_path TEXT NOT NULL,
                viewed_at TEXT NOT NULL,
                content_hash TEXT NOT NULL DEFAULT '',
                UNIQUE(worktree_path, file_path)
            )",
            [],
        )?;

        // Migration: Add content_hash column if it doesn't exist
        let _ = self
            .conn
            .execute("ALTER TABLE file_views ADD COLUMN content_hash TEXT NOT NULL DEFAULT ''", []);

        self.conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_file_views_worktree ON file_views(worktree_path)",
            [],
        )?;

        Ok(())
    }

    #[allow(dead_code)]
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

    #[allow(dead_code)]
    pub fn get_worktrees(&self) -> Result<Vec<Worktree>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, repo_path, worktree_path, branch_name, created_at, metadata, is_pinned
             FROM worktrees ORDER BY is_pinned DESC, branch_name COLLATE NOCASE ASC",
        )?;

        let worktrees = stmt.query_map([], |row| {
            Ok(Worktree {
                id: row.get(0)?,
                repo_path: row.get(1)?,
                worktree_path: row.get(2)?,
                branch_name: row.get(3)?,
                created_at: row.get(4)?,
                metadata: row.get(5)?,
                is_pinned: row.get::<_, i64>(6)? != 0,
            })
        })?;

        worktrees.collect()
    }

    #[allow(dead_code)]
    pub fn delete_worktree(&self, id: i64) -> Result<()> {
        self.conn
            .execute("DELETE FROM sessions WHERE worktree_id = ?1", [id])?;
        self.conn
            .execute("DELETE FROM worktrees WHERE id = ?1", [id])?;
        Ok(())
    }

    pub fn get_setting(&self, key: &str) -> Result<Option<String>> {
        let mut stmt = self
            .conn
            .prepare("SELECT value FROM settings WHERE key = ?1")?;
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

    pub fn get_git_cache(
        &self,
        worktree_path: &str,
        file_path: Option<&str>,
        cache_type: &str,
    ) -> Result<Option<GitCacheEntry>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, worktree_path, file_path, cache_type, data, updated_at
             FROM git_cache
             WHERE worktree_path = ?1
               AND cache_type = ?3
               AND ((?2 IS NULL AND file_path IS NULL) OR file_path = ?2)
             LIMIT 1",
        )?;

        let mut rows = stmt.query(params![worktree_path, file_path, cache_type])?;

        if let Some(row) = rows.next()? {
            Ok(Some(GitCacheEntry {
                id: row.get(0)?,
                worktree_path: row.get(1)?,
                file_path: row.get(2)?,
                cache_type: row.get(3)?,
                data: row.get(4)?,
                updated_at: row.get(5)?,
            }))
        } else {
            Ok(None)
        }
    }

    pub fn set_git_cache(
        &self,
        worktree_path: &str,
        file_path: Option<&str>,
        cache_type: &str,
        data: &str,
    ) -> Result<()> {
        let updated_at = Utc::now().to_rfc3339();
        self.conn.execute(
            "INSERT INTO git_cache (worktree_path, file_path, cache_type, data, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5)
             ON CONFLICT(worktree_path, file_path, cache_type)
             DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at",
            params![worktree_path, file_path, cache_type, data, updated_at],
        )?;
        Ok(())
    }

    pub fn invalidate_git_cache(&self, worktree_path: &str) -> Result<()> {
        self.conn.execute(
            "DELETE FROM git_cache WHERE worktree_path = ?1",
            [worktree_path],
        )?;
        Ok(())
    }

    #[allow(dead_code)]
    pub fn get_all_cached_worktrees(&self) -> Result<Vec<String>> {
        let mut stmt = self
            .conn
            .prepare("SELECT DISTINCT worktree_path FROM git_cache ORDER BY worktree_path")?;
        let rows = stmt.query_map([], |row| row.get(0))?;
        rows.collect()
    }

    #[allow(dead_code)]
    pub fn add_session(&self, session: &Session) -> Result<i64> {
        self.conn.execute(
            "INSERT INTO sessions (worktree_id, type, name, created_at, last_accessed, plan_title, model)
             VALUES (?1, 'session', ?2, ?3, ?4, ?5, ?6)",
            (
                &session.worktree_id,
                &session.name,
                &session.created_at,
                &session.last_accessed,
                &session.plan_title,
                &session.model,
            ),
        )?;
        Ok(self.conn.last_insert_rowid())
    }

    #[allow(dead_code)]
    pub fn get_sessions(&self) -> Result<Vec<Session>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, worktree_id, name, created_at, last_accessed, plan_title, model
             FROM sessions ORDER BY created_at ASC",
        )?;

        let sessions = stmt.query_map([], |row| {
            Ok(Session {
                id: row.get(0)?,
                worktree_id: row.get(1)?,
                name: row.get(2)?,
                created_at: row.get(3)?,
                last_accessed: row.get(4)?,
                plan_title: row.get(5)?,
                model: row.get(6)?,
            })
        })?;

        sessions.collect()
    }

    #[allow(dead_code)]
    pub fn get_sessions_by_worktree(&self, worktree_id: i64) -> Result<Vec<Session>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, worktree_id, name, created_at, last_accessed, plan_title, model
             FROM sessions WHERE worktree_id = ?1 ORDER BY created_at ASC",
        )?;

        let sessions = stmt.query_map([worktree_id], |row| {
            Ok(Session {
                id: row.get(0)?,
                worktree_id: row.get(1)?,
                name: row.get(2)?,
                created_at: row.get(3)?,
                last_accessed: row.get(4)?,
                plan_title: row.get(5)?,
                model: row.get(6)?,
            })
        })?;

        sessions.collect()
    }

    #[allow(dead_code)]
    pub fn get_main_repo_sessions(&self) -> Result<Vec<Session>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, worktree_id, name, created_at, last_accessed, plan_title, model
             FROM sessions WHERE worktree_id IS NULL ORDER BY created_at ASC",
        )?;

        let sessions = stmt.query_map([], |row| {
            Ok(Session {
                id: row.get(0)?,
                worktree_id: row.get(1)?,
                name: row.get(2)?,
                created_at: row.get(3)?,
                last_accessed: row.get(4)?,
                plan_title: row.get(5)?,
                model: row.get(6)?,
            })
        })?;

        sessions.collect()
    }

    #[allow(dead_code)]
    pub fn update_session_access(&self, id: i64, last_accessed: &str) -> Result<()> {
        self.conn.execute(
            "UPDATE sessions SET last_accessed = ?1 WHERE id = ?2",
            params![last_accessed, id],
        )?;
        Ok(())
    }

    #[allow(dead_code)]
    pub fn update_session_name(&self, id: i64, name: &str) -> Result<()> {
        self.conn.execute(
            "UPDATE sessions SET name = ?1 WHERE id = ?2",
            params![name, id],
        )?;
        Ok(())
    }

    #[allow(dead_code)]
    pub fn delete_session(&self, id: i64) -> Result<()> {
        self.conn
            .execute("DELETE FROM sessions WHERE id = ?1", [id])?;
        Ok(())
    }

    // File view tracking methods
    pub fn mark_file_viewed(
        &self,
        worktree_path: &str,
        file_path: &str,
        content_hash: &str,
    ) -> Result<()> {
        let viewed_at = Utc::now().to_rfc3339();
        self.conn.execute(
            "INSERT INTO file_views (worktree_path, file_path, viewed_at, content_hash)
             VALUES (?1, ?2, ?3, ?4)
             ON CONFLICT(worktree_path, file_path)
             DO UPDATE SET viewed_at = excluded.viewed_at, content_hash = excluded.content_hash",
            params![worktree_path, file_path, viewed_at, content_hash],
        )?;
        Ok(())
    }

    pub fn unmark_file_viewed(&self, worktree_path: &str, file_path: &str) -> Result<()> {
        self.conn.execute(
            "DELETE FROM file_views WHERE worktree_path = ?1 AND file_path = ?2",
            params![worktree_path, file_path],
        )?;
        Ok(())
    }

    pub fn get_viewed_files(&self, worktree_path: &str) -> Result<Vec<FileView>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, worktree_path, file_path, viewed_at, content_hash
             FROM file_views
             WHERE worktree_path = ?1
             ORDER BY viewed_at DESC",
        )?;

        let views = stmt.query_map([worktree_path], |row| {
            Ok(FileView {
                id: row.get(0)?,
                worktree_path: row.get(1)?,
                file_path: row.get(2)?,
                viewed_at: row.get(3)?,
                content_hash: row.get(4)?,
            })
        })?;

        views.collect()
    }

    pub fn clear_all_viewed_files(&self, worktree_path: &str) -> Result<()> {
        self.conn.execute(
            "DELETE FROM file_views WHERE worktree_path = ?1",
            [worktree_path],
        )?;
        Ok(())
    }
}
