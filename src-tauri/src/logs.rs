use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::fs::{self, OpenOptions};
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct WorkspaceLogRecord {
    pub session_id: String,
    pub workspace_key: String,
    pub workspace_id: Option<i64>,
    pub timestamp_ms: i64,
    pub source: String,
    pub level: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct WorkspaceLogSession {
    pub session_id: String,
    pub workspace_key: String,
    pub workspace_id: Option<i64>,
    pub first_timestamp_ms: i64,
    pub last_timestamp_ms: i64,
    pub log_count: usize,
    pub entries: Vec<WorkspaceLogRecord>,
}

fn logs_dir(repo_path: &str) -> PathBuf {
    Path::new(repo_path).join(".treq")
}

fn logs_path(repo_path: &str) -> PathBuf {
    logs_dir(repo_path).join("workspace-logs.jsonl")
}

pub fn append_workspace_log(
    repo_path: &str,
    workspace_id: Option<i64>,
    workspace_key: &str,
    session_id: &str,
    source: &str,
    level: &str,
    message: &str,
) -> Result<(), String> {
    if repo_path.trim().is_empty() {
        return Ok(());
    }

    let record = WorkspaceLogRecord {
        session_id: session_id.to_string(),
        workspace_key: workspace_key.to_string(),
        workspace_id,
        timestamp_ms: Utc::now().timestamp_millis(),
        source: source.to_string(),
        level: level.to_string(),
        message: message.to_string(),
    };

    fs::create_dir_all(logs_dir(repo_path)).map_err(|e| e.to_string())?;
    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(logs_path(repo_path))
        .map_err(|e| e.to_string())?;
    serde_json::to_writer(&mut file, &record).map_err(|e| e.to_string())?;
    file.write_all(b"\n").map_err(|e| e.to_string())?;
    Ok(())
}

pub fn query_workspace_logs(
    repo_path: &str,
    workspace_id: Option<i64>,
    workspace_key: Option<&str>,
) -> Result<Vec<WorkspaceLogSession>, String> {
    let path = logs_path(repo_path);
    if !path.exists() {
        return Ok(Vec::new());
    }

    let file = fs::File::open(path).map_err(|e| e.to_string())?;
    let reader = BufReader::new(file);
    let mut grouped: BTreeMap<String, Vec<WorkspaceLogRecord>> = BTreeMap::new();

    for line in reader.lines() {
        let Ok(line) = line else { continue };
        if line.trim().is_empty() {
            continue;
        }
        let Ok(record) = serde_json::from_str::<WorkspaceLogRecord>(&line) else {
            continue;
        };
        if workspace_id.is_some() && record.workspace_id != workspace_id {
            continue;
        }
        if let Some(key) = workspace_key {
            if record.workspace_key != key {
                continue;
            }
        }
        grouped.entry(record.session_id.clone()).or_default().push(record);
    }

    let mut sessions = grouped
        .into_iter()
        .map(|(session_id, mut entries)| {
            entries.sort_by_key(|entry| entry.timestamp_ms);
            let first_timestamp_ms = entries.first().map(|e| e.timestamp_ms).unwrap_or(0);
            let last_timestamp_ms = entries.last().map(|e| e.timestamp_ms).unwrap_or(0);
            let workspace_key = entries
                .first()
                .map(|e| e.workspace_key.clone())
                .unwrap_or_default();
            let workspace_id = entries.first().and_then(|e| e.workspace_id);
            WorkspaceLogSession {
                session_id,
                workspace_key,
                workspace_id,
                first_timestamp_ms,
                last_timestamp_ms,
                log_count: entries.len(),
                entries,
            }
        })
        .collect::<Vec<_>>();
    sessions.sort_by_key(|session| session.last_timestamp_ms);
    sessions.reverse();
    Ok(sessions)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn append_workspace_log_writes_single_json_line() {
        let temp_dir = TempDir::new().unwrap();
        let repo_path = temp_dir.path().to_string_lossy().to_string();

        append_workspace_log(
            &repo_path,
            Some(42),
            "/repo/workspace",
            "session-a",
            "pty",
            "info",
            "hello",
        )
        .unwrap();

        let contents = fs::read_to_string(logs_path(&repo_path)).unwrap();
        let lines: Vec<&str> = contents.lines().collect();
        assert_eq!(lines.len(), 1);
        let record: WorkspaceLogRecord = serde_json::from_str(lines[0]).unwrap();
        assert_eq!(record.session_id, "session-a");
        assert_eq!(record.workspace_id, Some(42));
        assert_eq!(record.workspace_key, "/repo/workspace");
        assert_eq!(record.source, "pty");
        assert_eq!(record.level, "info");
        assert_eq!(record.message, "hello");
    }

    #[test]
    fn query_workspace_logs_groups_by_session() {
        let temp_dir = TempDir::new().unwrap();
        let repo_path = temp_dir.path().to_string_lossy().to_string();
        fs::create_dir_all(logs_dir(&repo_path)).unwrap();
        let path = logs_path(&repo_path);
        let mut file = fs::File::create(&path).unwrap();
        let records = [
            WorkspaceLogRecord {
                session_id: "session-a".into(),
                workspace_key: "/repo/workspace".into(),
                workspace_id: Some(7),
                timestamp_ms: 1,
                source: "pty".into(),
                level: "info".into(),
                message: "first".into(),
            },
            WorkspaceLogRecord {
                session_id: "session-a".into(),
                workspace_key: "/repo/workspace".into(),
                workspace_id: Some(7),
                timestamp_ms: 2,
                source: "pty".into(),
                level: "warn".into(),
                message: "second".into(),
            },
            WorkspaceLogRecord {
                session_id: "session-b".into(),
                workspace_key: "/repo/workspace".into(),
                workspace_id: Some(7),
                timestamp_ms: 3,
                source: "pty".into(),
                level: "info".into(),
                message: "other".into(),
            },
        ];
        for record in records {
            serde_json::to_writer(&mut file, &record).unwrap();
            file.write_all(b"\n").unwrap();
        }

        let sessions = query_workspace_logs(&repo_path, Some(7), Some("/repo/workspace")).unwrap();
        assert_eq!(sessions.len(), 2);
        assert_eq!(sessions[0].session_id, "session-b");
        assert_eq!(sessions[0].log_count, 1);
        assert_eq!(sessions[1].session_id, "session-a");
        assert_eq!(sessions[1].log_count, 2);
        assert_eq!(sessions[1].entries[0].message, "first");
        assert_eq!(sessions[1].entries[1].message, "second");
    }

    #[test]
    fn query_workspace_logs_returns_empty_for_missing_file() {
        let temp_dir = TempDir::new().unwrap();
        let repo_path = temp_dir.path().to_string_lossy().to_string();
        assert!(
            query_workspace_logs(&repo_path, None, None)
                .unwrap()
                .is_empty()
        );
    }
}
