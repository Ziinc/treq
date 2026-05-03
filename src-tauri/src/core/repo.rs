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
    pub current_branch: String,
    pub default_branch: String,
}

/// Returns branch information for the home repo.
///
/// Imports colocated git refs into jj (same as [`list_repo_branches`]), then derives:
/// - current branch: prefers `.git/HEAD` via [`jj::resolve_home_repo_branch`] so git wins when several
///   bookmarks share a tip; falls back to jj `is_current` / `main` / `master`
/// - default branch: prefers `main`, then `master`, then current branch
pub fn get_repo_branch(repo_path: &str) -> Result<RepoBranch, String> {
    jj::jj_util_import_git_refs(repo_path).map_err(|e| e.to_string())?;
    let branches = jj::get_branches(repo_path).map_err(|e| e.to_string())?;

    let current_branch = jj::resolve_home_repo_branch(repo_path).unwrap_or_else(|_| {
        branches
            .iter()
            .find(|branch| branch.is_current)
            .map(|branch| branch.name.clone())
            .or_else(|| {
                branches
                    .iter()
                    .find(|branch| branch.name == "main" || branch.name == "master")
                    .map(|branch| branch.name.clone())
            })
            .or_else(|| {
                branches
                    .iter()
                    .find(|branch| branch.name == "master")
                    .map(|branch| branch.name.clone())
            })
            .unwrap_or_else(|| "main".to_string())
    });

    let default_branch = if branches.iter().any(|branch| branch.name == "main") {
        "main".to_string()
    } else if branches.iter().any(|branch| branch.name == "master") {
        "master".to_string()
    } else {
        current_branch.clone()
    };

    Ok(RepoBranch {
        current_branch,
        default_branch,
    })
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

    // Step 2: default branch for conflict/change checks
    let branch_info = get_repo_branch(repo_path).unwrap_or(RepoBranch {
        current_branch: "main".to_string(),
        default_branch: "main".to_string(),
    });
    let default_branch = branch_info.default_branch;

    // Step 3: uncommitted changes
    let has_changes = jj::jj_get_changed_files(repo_path)
        .map(|files| !files.is_empty())
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

/// Returns the list of local bookmarks (branches), after syncing colocated git into jj.
pub fn list_repo_branches(repo_path: &str) -> Result<Vec<jj::JjBranch>, String> {
    jj::jj_util_import_git_refs(repo_path).map_err(|e| e.to_string())?;
    jj::get_branches(repo_path).map_err(|e| e.to_string())
}

/// Switches the repository working copy to the given bookmark (branch).
pub fn switch_repo_branch(repo_path: &str, bookmark_name: &str) -> Result<String, String> {
    jj::jj_edit_bookmark(repo_path, bookmark_name).map_err(|e| e.to_string())
}
