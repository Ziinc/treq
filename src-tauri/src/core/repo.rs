use std::collections::HashMap;
use std::fs;
use std::path::Path;
use std::sync::{Arc, Mutex, OnceLock};

use serde::{Deserialize, Serialize};

use crate::jj;

use super::workspaces::RemoteSyncStatus;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RepoStatus {
    pub has_changes: bool,
    pub has_conflicts: bool,
    pub remote_sync: RemoteSyncStatus,
    pub fetch_error: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RepoBranch {
    pub current_branch: Option<String>,
    pub display_ref: String,
    pub is_detached: bool,
}

static REPO_COMMIT_LOCKS: OnceLock<Mutex<HashMap<String, Arc<Mutex<()>>>>> = OnceLock::new();

/// Mutex shared with `commit_repo` and `commit_workspace` so jj commits for one repo path never run concurrently.
pub(crate) fn commit_lock_for_repo(repo_path: &str) -> Arc<Mutex<()>> {
    let locks = REPO_COMMIT_LOCKS.get_or_init(|| Mutex::new(HashMap::new()));
    let mut guard = locks.lock().unwrap();
    guard
        .entry(repo_path.to_string())
        .or_insert_with(|| Arc::new(Mutex::new(())))
        .clone()
}

/// Create a new commit on the home repo from the current jj working copy (colocated layout).
pub fn commit_repo(repo_path: &str, message: &str) -> Result<String, String> {
    let lock = commit_lock_for_repo(repo_path);
    let _guard = lock.lock().unwrap();
    jj::jj_commit(repo_path, message).map_err(|e| format!("Failed to create commit: {}", e))
}

/// Returns the current checkout branch information for the home repo.
///
/// Imports colocated git refs into jj (same as [`list_repo_branches`]), then resolves the current
/// checkout strictly from the working copy state.
pub fn get_repo_current_branch(repo_path: &str) -> Result<RepoBranch, String> {
    jj::jj_util_import_git_refs(repo_path).map_err(|e| e.to_string())?;
    // A jj rewrite/ref export can occasionally leave colocated Git HEAD detached at the
    // default branch tip. Repair only that unambiguous case; preserve intentional detached
    // checkouts at any other commit.
    let _ =
        jj::repair_detached_home_head_at_default_branch(repo_path).map_err(|e| e.to_string())?;
    let resolved_branch = jj::resolve_home_repo_branch(repo_path).map_err(|e| e.to_string())?;
    let detached_head = read_detached_head_commit(repo_path)?;
    let is_detached = detached_head.is_some() || resolved_branch == "HEAD";

    let current_branch = if is_detached {
        None
    } else {
        Some(resolved_branch.clone())
    };

    let display_ref = if let Some(head) = detached_head {
        head
    } else if resolved_branch == "HEAD" {
        jj::jj_get_commit_id(repo_path, "@")
            .map_err(|e| e.to_string())?
            .chars()
            .take(12)
            .collect()
    } else {
        resolved_branch.clone()
    };

    Ok(RepoBranch {
        current_branch,
        display_ref,
        is_detached,
    })
}

/// Returns the repository default branch using jj's canonical resolver.
pub fn get_repo_default_branch(repo_path: &str) -> Result<String, String> {
    jj::get_default_branch(repo_path).map_err(|e| e.to_string())
}

fn read_detached_head_commit(repo_path: &str) -> Result<Option<String>, String> {
    let head_path = Path::new(repo_path).join(".git").join("HEAD");
    let content =
        fs::read_to_string(&head_path).map_err(|e| format!("Failed to read .git/HEAD: {e}"))?;
    let trimmed = content.trim();
    if trimmed.starts_with("ref: ") {
        return Ok(None);
    }
    let short: String = trimmed.chars().take(12).collect();
    if short.is_empty() {
        return Err("Failed to resolve detached HEAD commit".to_string());
    }
    Ok(Some(short))
}

/// Returns the current status of the repository, including a git fetch.
///
/// Performs `jj git fetch` first so that remote sync status reflects the
/// latest remote state. Fetch failures are captured in `fetch_error` and do
/// not prevent the rest of the status from being returned.
///
/// Also tracks remote bookmarks for all workspaces (best-effort, errors
/// are silently ignored).
pub fn repo_status(repo_path: &str) -> Result<RepoStatus, String> {
    // Step 1: fetch — capture error but continue
    let fetch_error = jj::jj_git_fetch(repo_path).err().map(|e| e.to_string());
    // Keep jj view aligned with colocated git state before status checks.
    let _ = jj::jj_util_import_git_refs(repo_path);

    // Step 2: default branch for conflict/change checks
    let default_branch = get_repo_default_branch(repo_path).unwrap_or_else(|_| "main".to_string());

    // Step 3: uncommitted changes
    let has_changes = jj::jj_get_changed_files(repo_path)
        .map(|files| files.iter().any(|file| !is_repo_noise_path(&file.path)))
        .unwrap_or(false);

    // Step 4: conflicts
    let has_conflicts = jj::get_conflicted_files(repo_path, Some(&default_branch))
        .map(|files| !files.is_empty())
        .unwrap_or(false);

    // Step 5: remote sync status (same logic as workspace_status home-repo path)
    let branches = jj::get_bookmarks_on_revision(repo_path, "@-").unwrap_or_default();
    let branches_to_check: Vec<String> = if branches.is_empty() {
        vec![default_branch.clone()]
    } else {
        branches
    };

    let mut total_ahead: usize = 0;
    let mut total_behind: usize = 0;
    let mut any_on_remote = false;
    for branch in &branches_to_check {
        if let Ok((ahead, behind)) = jj::jj_get_sync_status(repo_path, branch, false) {
            any_on_remote = true;
            total_ahead += ahead;
            total_behind += behind;
        }
    }

    let remote_sync = if !any_on_remote {
        RemoteSyncStatus::NotOnRemote
    } else {
        match (total_ahead, total_behind) {
            (0, 0) => RemoteSyncStatus::InSync,
            (a, 0) => RemoteSyncStatus::Ahead { count: a },
            (0, b) => RemoteSyncStatus::Behind { count: b },
            (a, b) => RemoteSyncStatus::Diverged {
                ahead: a,
                behind: b,
            },
        }
    };

    Ok(RepoStatus {
        has_changes,
        has_conflicts,
        remote_sync,
        fetch_error,
    })
}

fn is_repo_noise_path(path: &str) -> bool {
    path == "node_modules"
        || path.starts_with("node_modules/")
        || path == ".treq"
        || path.starts_with(".treq/")
        || path == ".jj"
        || path.starts_with(".jj/")
        || path.starts_with(".jj")
}

/// Returns the list of local bookmarks (branches), after syncing colocated git into jj.
pub fn list_repo_branches(repo_path: &str) -> Result<Vec<jj::JjBranch>, String> {
    jj::jj_util_import_git_refs(repo_path).map_err(|e| e.to_string())?;
    jj::get_branches(repo_path).map_err(|e| e.to_string())
}

/// Switches the repository working copy to the given bookmark (branch).
pub fn switch_repo_branch(repo_path: &str, bookmark_name: &str) -> Result<String, String> {
    jj::jj_edit_bookmark(repo_path, bookmark_name).map_err(|e| e.to_string())
}
