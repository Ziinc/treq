use std::collections::HashMap;
use std::path::Path;
use std::sync::{Arc, Mutex, OnceLock};

use ignore::WalkBuilder;
use serde::{Deserialize, Serialize};

use crate::auto_rebase::{self, WorkspaceBookmarkConflict};
use crate::jj;
use crate::local_db;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct WorkspaceCommit {
    pub hash: String,
    pub timestamp: String,
    pub message: String,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
pub struct WorkspaceEntry {
    pub name: String,
    pub path: String,
    pub is_directory: bool,
}

/// Defines how a workspace is merged into its target branch.
#[derive(Debug, Serialize, Deserialize, Clone, Copy, PartialEq, Eq)]
pub enum MergeCommit {
    Merge,
    Squash,
    Rebase,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PullWorkspaceResult {
    pub success: bool,
    pub message: String,
    pub was_diverged: bool,
    pub commits_rebased: usize,
}

pub enum MaybeEmptyParam<T> {
    EmptyValue,
    Omitted,
    Some(T),
}

/// Defines whether files/commits are moved or copied during a split.
#[derive(Debug, Serialize, Deserialize, Clone, Copy, PartialEq, Eq)]
pub enum SplitMode {
    Move,
    Copy,
}

/// Defines where the new workspace is positioned relative to the source.
#[derive(Debug, Serialize, Deserialize, Clone, Copy, PartialEq, Eq)]
pub enum SplitPosition {
    Before,
    After,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RenameWorkspaceResult {
    pub success: bool,
    pub message: String,
    pub workspace: Option<local_db::Workspace>,
    pub updated_children_ids: Vec<i64>,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
#[serde(tag = "type", content = "data")]
pub enum RemoteSyncStatus {
    NotOnRemote,
    InSync,
    Ahead { count: usize },
    Behind { count: usize },
    Diverged { ahead: usize, behind: usize },
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct WorkspacePartialStatus {
    pub current: local_db::Workspace,
    pub has_conflicts: bool,
    pub has_changes: bool,
    pub commits_ahead: usize,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct WorkspaceSidebarStatus {
    pub current: local_db::Workspace,
    pub has_conflicts: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct WorkspaceStatus {
    #[serde(flatten)]
    pub partial: WorkspacePartialStatus,
    pub remote_sync: RemoteSyncStatus,
    pub target: Option<local_db::Workspace>,
    pub children: Vec<local_db::Workspace>,
    pub dag_nodes: Vec<WorkspaceNode>,
    pub conflicted_workspace_ids: Vec<i64>,
    pub commits_ahead_of_target: Vec<WorkspaceCommit>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct WorkspaceNode {
    pub status: WorkspacePartialStatus,
    pub parent_id: Option<i64>,
    pub child_ids: Vec<i64>,
    pub depth: usize,
}

/// Metadata for workspace creation, supporting both simple intent and complex metadata with files.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct WorkspaceMetadata {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub intent: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub moved_files: Option<Vec<String>>,
}

static REPO_COMMIT_LOCKS: OnceLock<Mutex<HashMap<String, Arc<Mutex<()>>>>> = OnceLock::new();

fn get_repo_commit_lock(repo_path: &str) -> Arc<Mutex<()>> {
    let locks = REPO_COMMIT_LOCKS.get_or_init(|| Mutex::new(HashMap::new()));
    let mut guard = locks.lock().unwrap();
    guard
        .entry(repo_path.to_string())
        .or_insert_with(|| Arc::new(Mutex::new(())))
        .clone()
}

fn resolve_workspace_root(repo_path: &str, workspace_id: Option<i64>) -> Result<String, String> {
    match workspace_id {
        Some(id) => {
            let workspace = local_db::get_workspace_by_id(repo_path, id)
                .map_err(|e| format!("Failed to get workspace: {}", e))?
                .ok_or_else(|| format!("Workspace not found: {}", id))?;
            let workspace_path = Path::new(repo_path)
                .join(".treq")
                .join("workspaces")
                .join(&workspace.workspace_path);
            Ok(workspace_path
                .to_str()
                .ok_or("Failed to convert workspace path to string")
                .map(|path| path.to_string())?)
        }
        None => Ok(repo_path.to_string()),
    }
}

pub fn ls_workspace(
    repo_path: &str,
    workspace_id: Option<i64>,
) -> Result<Vec<WorkspaceEntry>, String> {
    let workspace_root = resolve_workspace_root(repo_path, workspace_id)?;
    let base_path = Path::new(&workspace_root);
    let mut entries = Vec::new();

    let walker = WalkBuilder::new(&workspace_root)
        .max_depth(Some(1))
        .hidden(false)
        .git_ignore(true)
        .git_global(true)
        .git_exclude(true)
        .parents(true)
        .build();

    for entry in walker {
        let entry = entry.map_err(|e| e.to_string())?;
        let entry_path = entry.path();

        if entry_path == base_path {
            continue;
        }

        if let Some(name) = entry_path.file_name().and_then(|name| name.to_str()) {
            entries.push(WorkspaceEntry {
                name: name.to_string(),
                path: entry_path.to_string_lossy().to_string(),
                is_directory: entry_path.is_dir(),
            });
        }
    }

    entries.sort_by(|a, b| match (a.is_directory, b.is_directory) {
        (true, false) => std::cmp::Ordering::Less,
        (false, true) => std::cmp::Ordering::Greater,
        _ => a.name.cmp(&b.name),
    });

    Ok(entries)
}

pub fn get_workspace_readme(
    repo_path: &str,
    workspace_id: Option<i64>,
) -> Result<Option<String>, String> {
    let readme = ls_workspace(repo_path, workspace_id)?
        .into_iter()
        .find(|entry| !entry.is_directory && entry.name.eq_ignore_ascii_case("README.md"));

    match readme {
        Some(entry) => std::fs::read_to_string(&entry.path)
            .map(Some)
            .map_err(|e| format!("Failed to read workspace README '{}': {}", entry.path, e)),
        None => Ok(None),
    }
}

impl WorkspaceMetadata {
    /// Serialize metadata to JSON string for storage
    pub fn to_json(&self) -> String {
        serde_json::to_string(self).unwrap_or_else(|_| "{}".to_string())
    }
}

/// Creates a new workspace in the repository.
///
/// # Arguments
/// * `repo_path` - Path to the repository root
/// * `branch_name` - Name of the branch to create
/// * `intent` - Intent for the workspace
/// * `source_branch` - Source branch to create the workspace from
///
/// # Returns
/// Returns the workspace if successful, otherwise an error message.
pub fn create_workspace(
    repo_path: &str,
    branch_name: &str,
    intent: Option<String>,
    moved_files: Option<Vec<String>>,
    source_branch: Option<&str>,
    included_copy_files: Option<Vec<String>>,
) -> Result<local_db::Workspace, String> {
    let stacked_source_workspace = source_branch
        .map(|src_branch| {
            local_db::get_workspace_by_branch(repo_path, src_branch)
                .map_err(|e| format!("Failed to get source workspace: {}", e))
        })
        .transpose()?
        .flatten();

    if let Some(source_workspace) = &stacked_source_workspace {
        let source_workspace_path = Path::new(repo_path)
            .join(".treq")
            .join("workspaces")
            .join(&source_workspace.workspace_path);
        let _ = jj::jj_get_changed_files(&source_workspace_path.to_string_lossy());
    }

    let branches =
        jj::get_branches(repo_path).map_err(|e| format!("Failed to get branches: {}", e))?;

    let branch_exists: bool = branches.iter().any(|b| b.name == branch_name);

    // Always check if branch exists on remote
    let remote_ref = format!("{}@origin", branch_name);
    let branch_exists_on_remote = jj::check_remote_branch_exists(repo_path, &remote_ref)
        .map_err(|e| format!("Failed to check remote branch: {}", e))?;

    let resolved_source_branch = if !branch_exists && source_branch.is_none() {
        // New branch, check if we should create from remote
        if branch_exists_on_remote {
            Some(remote_ref)
        } else {
            None
        }
    } else {
        source_branch.map(|s| s.to_string())
    };

    let new_branch: bool = !branch_exists;
    let workspace_full_path = jj::create_workspace(
        repo_path,
        branch_name,
        branch_name,
        new_branch,
        resolved_source_branch.as_deref(),
    )
    .map_err(|e| format!("Failed to create workspace: {}", e))?;

    // Extract just the sanitized workspace name from the full path
    let workspace_path = Path::new(&workspace_full_path)
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or("Failed to extract workspace name from path")?
        .to_string();

    // Copy included files/directories from repo to new workspace
    if let Some(ref patterns) = included_copy_files {
        if !patterns.is_empty() {
            let ws_full = Path::new(repo_path)
                .join(".treq")
                .join("workspaces")
                .join(&workspace_path);
            copy_included_files(repo_path, ws_full.to_str().unwrap_or_default(), patterns)?;
        }
    }

    let workspace_id = local_db::add_workspace(
        repo_path,
        workspace_path.clone(),
        workspace_path.clone(),
        branch_name.to_string(),
        intent,
        moved_files.clone(),
    )
    .map_err(|e| format!("Failed to add workspace to db: {}", e))?;

    // Set not_on_remote flag if branch doesn't exist on remote
    if !branch_exists_on_remote {
        local_db::update_workspace_not_on_remote(repo_path, workspace_id, true)?;
    }

    if let Some(source_workspace) = &stacked_source_workspace {
        local_db::update_workspace_target_branch(
            repo_path,
            workspace_id,
            &source_workspace.branch_name,
        )
        .map_err(|e| format!("Failed to set target branch: {}", e))?;
    }

    let workspace = local_db::get_workspace_by_id(repo_path, workspace_id)
        .map_err(|e| format!("Failed to get workspace from db: {}", e))?;
    let workspace = match workspace {
        Some(workspace) => workspace,
        _ => {
            return Err(format!(
                "Workspace not found in database after creation: {}",
                workspace_id
            ))
        }
    };

    // If moved_files are specified, perform the squash operation
    if let Some(files) = moved_files.clone() {
        if !files.is_empty() {
            let source_workspace_path = if let Some(src_branch) = source_branch {
                // For stacked workspaces, squash from the source workspace
                match stacked_source_workspace.as_ref() {
                    Some(ws) => {
                        let workspace_dir = Path::new(repo_path)
                            .join(".treq")
                            .join("workspaces")
                            .join(&ws.workspace_path);
                        workspace_dir.to_string_lossy().to_string()
                    }
                    None => {
                        let source_ws = local_db::get_workspace_by_branch(repo_path, src_branch)
                            .map_err(|e| format!("Failed to get source workspace: {}", e))?;
                        match source_ws {
                            Some(ws) => {
                                let workspace_dir = Path::new(repo_path)
                                    .join(".treq")
                                    .join("workspaces")
                                    .join(&ws.workspace_path);
                                workspace_dir.to_string_lossy().to_string()
                            }
                            None => repo_path.to_string(),
                        }
                    }
                }
            } else {
                // For regular workspaces, squash from the repo root
                repo_path.to_string()
            };

            // Perform the squash operation
            jj::squash_to_workspace(
                &source_workspace_path,
                &workspace.workspace_name,
                Some(files),
            )
            .map_err(|e| format!("Failed to squash files to workspace: {}", e))?;

            let new_workspace_path = Path::new(repo_path)
                .join(".treq")
                .join("workspaces")
                .join(&workspace.workspace_path)
                .to_string_lossy()
                .to_string();
            let _ = jj::update_stale_workspace(&new_workspace_path);
            let _ = jj::update_stale_workspace(&source_workspace_path);
        }
    }

    Ok(workspace)
}

/// Deletes a workspace from the repository.
/// # Arguments
/// * `repo_path` - Path to the repository root
/// * `workspace_id` - ID of the workspace to delete
///
/// # Returns
/// Returns true if successful, false if workspace not found in database.
pub fn delete_workspace(repo_path: &str, workspace_id: &i64) -> Result<bool, String> {
    let workspace = local_db::get_workspace_by_id(repo_path, *workspace_id)
        .map_err(|e| format!("Failed to get workspace from db: {}", e))?;

    match workspace {
        Some(workspace) => {
            let workspace_path = Path::new(repo_path)
                .join(".treq")
                .join("workspaces")
                .join(&workspace.workspace_path);

            // Re-target direct children to the default branch
            let children =
                local_db::get_workspaces_by_target_branch(repo_path, &workspace.branch_name)
                    .map_err(|e| format!("Failed to get child workspaces: {}", e))?;
            if !children.is_empty() {
                let default_branch =
                    jj::get_default_branch(repo_path).unwrap_or_else(|_| "main".to_string());
                for child in &children {
                    local_db::update_workspace_target_branch(repo_path, child.id, &default_branch)
                        .map_err(|e| format!("Failed to update child target branch: {}", e))?;
                }
            }

            // Best effort only: DB cleanup must proceed even if jj/directory removal fails.
            if let Err(e) = jj::remove_workspace(repo_path, &workspace_path.to_str().unwrap()) {
                eprintln!("Warning: Failed to remove workspace directory: {}", e);
            }
            local_db::delete_workspace(repo_path, *workspace_id)
                .map_err(|e| format!("Failed to delete workspace from db: {}", e))?;
            Ok(true)
        }
        _ => Err(format!("Workspace not found in database: {}", workspace_id)),
    }
}

/// Push workspace to remote and update not_on_remote flag if successful.
/// # Arguments
/// * `repo_path` - Path to the repository root
/// * `workspace_id` - ID of the workspace (None to push home repo)
/// * `force` - Whether to force push
///
/// # Returns
/// Returns the push result message if successful, otherwise an error message.
pub fn push_workspace_to_remote(
    repo_path: &str,
    workspace_id: Option<i64>,
) -> Result<String, String> {
    // Determine the push path based on workspace_id
    let push_path = if let Some(id) = workspace_id {
        // For workspace, look up the path from database
        let workspace = local_db::get_workspace_by_id(repo_path, id)
            .map_err(|e| format!("Failed to get workspace: {}", e))?
            .ok_or_else(|| format!("Workspace not found: {}", id))?;
        let workspace_dir = Path::new(repo_path)
            .join(".treq")
            .join("workspaces")
            .join(&workspace.workspace_path);
        workspace_dir
            .to_str()
            .ok_or("Failed to convert workspace path to string")?
            .to_string()
    } else {
        // For home repo, use repo_path directly
        repo_path.to_string()
    };

    // Perform the push
    let result = jj::jj_push(&push_path).map_err(|e| format!("Push failed: {}", e))?;

    // Clear the not_on_remote flag after successful push (only for workspaces)
    if let Some(id) = workspace_id {
        local_db::update_workspace_not_on_remote(repo_path, id, false)?;
    }

    Ok(result)
}

pub fn list_workspaces(repo_path: &str) -> Result<Vec<local_db::Workspace>, String> {
    local_db::get_workspaces(repo_path).map_err(|e| format!("Failed to get workspaces: {}", e))
}

/// Lists the minimal workspace status needed by the sidebar.
/// This path is intentionally read-only and subprocess-free.
pub fn list_workspace_statuses(repo_path: &str) -> Result<Vec<WorkspaceSidebarStatus>, String> {
    let discovered = jj::discover_workspaces_with_conflicts(repo_path)
        .map_err(|e| format!("Failed to discover workspaces from jj: {}", e))?;
    let refreshed_at = chrono::Utc::now().to_rfc3339();
    let conflict_by_path: HashMap<String, bool> = discovered
        .iter()
        .map(|workspace| (workspace.workspace_path.clone(), workspace.has_conflicts))
        .collect();
    let persisted = local_db::sync_discovered_workspaces(repo_path, &discovered, &refreshed_at)?;

    persisted
        .into_iter()
        .map(|current| {
            let has_conflicts = conflict_by_path
                .get(&current.workspace_path)
                .copied()
                .ok_or_else(|| {
                    format!(
                        "Discovered workspace missing conflict state after sync: {}",
                        current.workspace_path
                    )
                })?;
            Ok(WorkspaceSidebarStatus {
                current,
                has_conflicts,
            })
        })
        .collect()
}

/// Gets the status of a workspace, including parent, children, and full DAG hierarchy.
///
/// # Arguments
/// * `workspace_path` - Full path to the workspace directory
///
/// # Returns
/// Returns a WorkspaceStatus containing the current workspace, parent, children, DAG nodes, and conflicted workspace IDs.
pub fn workspace_status(
    repo_path: &str,
    workspace_id: Option<i64>,
) -> Result<WorkspaceStatus, String> {
    // Home repo case: no workspace, build a minimal status
    let workspace_id = match workspace_id {
        Some(id) => id,
        None => {
            let default_branch =
                jj::get_default_branch(repo_path).unwrap_or_else(|_| "main".to_string());

            let has_changes = jj::jj_get_changed_files(repo_path)
                .map(|files| !files.is_empty())
                .unwrap_or(false);

            let has_conflicts = jj::get_conflicted_files(repo_path, Some(&default_branch))
                .map(|files| !files.is_empty())
                .unwrap_or(false);

            // Check sync status for all branches the home repo is on (not just default)
            let branches = jj::get_bookmarks_on_revision(repo_path, "@-").unwrap_or_default();
            // If no bookmarks on @-, fall back to the default branch
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

            // Synthesize a Workspace-like entry for the home repo
            let home_workspace = local_db::Workspace {
                id: 0,
                repo_path: repo_path.to_string(),
                workspace_name: "home".to_string(),
                workspace_path: repo_path.to_string(),
                branch_name: default_branch,
                created_at: String::new(),
                refreshed_at: None,
                metadata: None,
                target_branch: None,
                intent: None,
                moved_files: None,
                not_on_remote: false,
            };

            return Ok(WorkspaceStatus {
                partial: WorkspacePartialStatus {
                    current: home_workspace,
                    has_conflicts,
                    has_changes,
                    commits_ahead: 0,
                },
                remote_sync,
                target: None,
                children: Vec::new(),
                dag_nodes: Vec::new(),
                conflicted_workspace_ids: Vec::new(),
                commits_ahead_of_target: Vec::new(),
            });
        }
    };

    // Workspace case: look up from DB
    let all_workspaces = local_db::get_workspaces(repo_path)
        .map_err(|e| format!("Failed to get workspaces: {}", e))?;

    let current_workspace = all_workspaces
        .iter()
        .find(|w| w.id == workspace_id)
        .cloned()
        .ok_or_else(|| format!("Workspace not found: {}", workspace_id))?;

    let workspace_path = Path::new(repo_path)
        .join(".treq")
        .join("workspaces")
        .join(&current_workspace.workspace_path);
    let workspace_path_str = workspace_path
        .to_str()
        .ok_or("Failed to convert workspace path to string")?;

    // Build branch_name → Workspace lookup map
    let branch_map: HashMap<String, &local_db::Workspace> = all_workspaces
        .iter()
        .map(|w| (w.branch_name.clone(), w))
        .collect();

    // Find direct parent (workspace whose branch_name matches current.target_branch)
    let target = current_workspace
        .target_branch
        .as_ref()
        .and_then(|target| branch_map.get(target).map(|w| (*w).clone()));

    // Find direct children (workspaces where target_branch matches current.branch_name)
    let children: Vec<local_db::Workspace> =
        local_db::get_workspaces_by_target_branch(&repo_path, &current_workspace.branch_name)
            .unwrap_or_default();

    let dag_nodes = Vec::new();
    let conflicted_workspace_ids = Vec::new();

    // Calculate commits ahead of target
    let commits_ahead_of_target = if let Some(target_workspace) = &target {
        match jj::jj_get_commits_ahead(workspace_path_str, &target_workspace.branch_name) {
            Ok(commits_ahead) => commits_ahead
                .commits
                .iter()
                .map(|c| WorkspaceCommit {
                    hash: c.commit_id.clone(),
                    timestamp: c.timestamp.clone(),
                    message: c.description.clone(),
                })
                .collect(),
            Err(_) => Vec::new(),
        }
    } else {
        // No target branch, commits are ahead of main
        match jj::jj_get_commits_ahead(workspace_path_str, "main") {
            Ok(commits_ahead) => commits_ahead
                .commits
                .iter()
                .map(|c| WorkspaceCommit {
                    hash: c.commit_id.clone(),
                    timestamp: c.timestamp.clone(),
                    message: c.description.clone(),
                })
                .collect(),
            Err(_) => Vec::new(),
        }
    };

    let has_changes = jj::jj_get_changed_files(workspace_path_str)
        .map(|files| !files.is_empty())
        .unwrap_or(false);
    let has_conflicts = jj::get_conflicted_files(
        workspace_path_str,
        current_workspace.target_branch.as_deref(),
    )
    .map(|files| !files.is_empty())
    .unwrap_or(false);

    let commits_ahead_count = commits_ahead_of_target.len();

    let remote_sync = if current_workspace.not_on_remote {
        RemoteSyncStatus::NotOnRemote
    } else if jj::jj_is_bookmark_conflicted(workspace_path_str, &current_workspace.branch_name) {
        match jj::jj_get_diverged_sync_counts(workspace_path_str, &current_workspace.branch_name) {
            Ok((ahead, behind)) => RemoteSyncStatus::Diverged { ahead, behind },
            Err(_) => RemoteSyncStatus::Diverged {
                ahead: 0,
                behind: 0,
            },
        }
    } else {
        match jj::jj_get_sync_status(workspace_path_str, &current_workspace.branch_name, false) {
            Ok((ahead, behind)) => match (ahead, behind) {
                (0, 0) => RemoteSyncStatus::InSync,
                (a, 0) => RemoteSyncStatus::Ahead { count: a },
                (0, b) => RemoteSyncStatus::Behind { count: b },
                (a, b) => RemoteSyncStatus::Diverged {
                    ahead: a,
                    behind: b,
                },
            },
            Err(_) => RemoteSyncStatus::NotOnRemote,
        }
    };

    Ok(WorkspaceStatus {
        partial: WorkspacePartialStatus {
            current: current_workspace,
            has_conflicts,
            has_changes,
            commits_ahead: commits_ahead_count,
        },
        remote_sync,
        target,
        children,
        dag_nodes,
        conflicted_workspace_ids,
        commits_ahead_of_target,
    })
}

/// Merges a workspace's commits into the home repository and cleans up the workspace.
///
/// # Arguments
/// * `repo_path` - Path to the repository root
/// * `workspace_id` - ID of the workspace to merge
/// * `message` - Commit message for the merge
///
/// # Returns
/// Returns Ok(()) on success, or an error message on failure.
pub fn merge_workspace(
    repo_path: &str,
    workspace_id: i64,
    message: &str,
    merge_strategy: MergeCommit,
) -> Result<(), String> {
    // Get the workspace from the database
    let workspace = local_db::get_workspace_by_id(repo_path, workspace_id)
        .map_err(|e| format!("Failed to get workspace from db: {}", e))?
        .ok_or("Workspace not found in database")?;

    let workspace_path = Path::new(repo_path)
        .join(".treq")
        .join("workspaces")
        .join(&workspace.workspace_path);

    let workspace_path_str = workspace_path
        .to_str()
        .ok_or("Failed to convert workspace path to string")?;

    // Get target branch for comparison
    let target_branch = workspace.target_branch.as_deref().unwrap_or("main");

    // Abandon empty commits before merge to keep history clean
    let _ = jj::jj_abandon_empty_commits(workspace_path_str, target_branch);

    // Get commits ahead of target
    let commits_ahead = jj::jj_get_commits_ahead(workspace_path_str, target_branch)
        .map_err(|e| format!("Failed to get commits: {}", e))?;

    if commits_ahead.commits.is_empty() {
        return Err("No commits to merge".to_string());
    }

    match merge_strategy {
        MergeCommit::Merge => {
            jj::jj_create_merge_commit(
                workspace_path_str,
                &workspace.branch_name,
                target_branch,
                message,
                "diff",
            )
            .map_err(|e| format!("Failed to create merge commit: {}", e))?;
        }
        MergeCommit::Squash => {
            jj::jj_squash_merge_commit(
                workspace_path_str,
                &workspace.branch_name,
                target_branch,
                message,
            )
            .map_err(|e| format!("Failed to squash merge workspace: {}", e))?;
        }
        MergeCommit::Rebase => {
            let rebase_result = jj::jj_rebase_merge_commit(
                workspace_path_str,
                &workspace.branch_name,
                target_branch,
            )
            .map_err(|e| format!("Failed to rebase merge workspace: {}", e))?;

            if !rebase_result.success {
                return Err(format!("Rebase merge failed: {}", rebase_result.message));
            }
        }
    }

    // Update the home repo state to pick up the merged commits
    jj::jj_status(repo_path).map_err(|e| format!("Failed to update home repo status: {}", e))?;

    // Checkout the target branch to ensure we're not in detached HEAD state
    jj::checkout_branch(repo_path, target_branch)
        .map_err(|e| format!("Failed to checkout target branch: {}", e))?;

    // Remove the workspace from jj (also deletes the workspace directory)
    jj::remove_workspace(repo_path, workspace_path_str)
        .map_err(|e| format!("Failed to remove workspace from jj: {}", e))?;

    // Remove from database
    local_db::delete_workspace(repo_path, workspace_id)
        .map_err(|e| format!("Failed to delete workspace from db: {}", e))?;

    Ok(())
}

/// Updates a workspace's target branch and/or intent.
/// Rebases the workspace to the target branch and updates metadata.
/// The workspace's branch name remains unchanged.
pub fn update_workspace(
    repo_path: &str,
    workspace_id: i64,
    target_branch: MaybeEmptyParam<String>,
    intent: MaybeEmptyParam<String>,
) -> Result<local_db::Workspace, String> {
    let workspace = local_db::get_workspace_by_id(repo_path, workspace_id)
        .map_err(|e| format!("Failed to get workspace from db: {}", e))?
        .ok_or("Workspace not found in database")?;

    let workspace_path = Path::new(repo_path)
        .join(".treq")
        .join("workspaces")
        .join(&workspace.workspace_path);
    let workspace_path_str = workspace_path
        .to_str()
        .ok_or("Failed to convert workspace path to string")?;

    match target_branch {
        MaybeEmptyParam::EmptyValue => {
            local_db::update_workspace_target_branch(repo_path, workspace_id, "main")
                .map_err(|e| format!("Failed to update target branch: {}", e))?;
            jj::jj_rebase_onto(workspace_path_str, "main", "diff")
                .map_err(|e| format!("Failed to rebase workspace: {}", e))?;
        }
        MaybeEmptyParam::Some(branch) => {
            // // First, fetch in the main repo to ensure git branches are available
            let _ = jj::jj_git_fetch(repo_path);

            // Rebase workspace onto the target commit
            let rebase_result = jj::jj_rebase_onto(workspace_path_str, &branch, "diff")
                .map_err(|e| format!("Failed to rebase workspace: {}", e))?;

            if !rebase_result.success {
                return Err(format!("Rebase failed: {}", rebase_result.message));
            }

            // Update database with new target branch
            local_db::update_workspace_target_branch(repo_path, workspace_id, &branch)
                .map_err(|e| format!("Failed to update target branch: {}", e))?;
        }
        MaybeEmptyParam::Omitted => {}
    }

    if let MaybeEmptyParam::Some(intent_str) = intent {
        local_db::update_workspace_intent(repo_path, workspace_id, &intent_str)
            .map_err(|e| format!("Failed to update intent: {}", e))?;
    }

    local_db::get_workspace_by_id(repo_path, workspace_id)
        .map_err(|e| format!("Failed to get updated workspace: {}", e))?
        .ok_or_else(|| "Workspace not found after update".to_string())
}

/// Renames a workspace's jj bookmark/branch.
///
/// In dry_run mode, validates the new name (checks for clashes with existing local/remote
/// branches) without performing the rename.
///
/// # Arguments
/// * `repo_path` - Path to the repository root
/// * `workspace_id` - ID of the workspace to rename
/// * `new_branch_name` - The new branch name
/// * `dry_run` - If true, only validate without performing the rename
pub fn rename_workspace(
    repo_path: &str,
    workspace_id: i64,
    new_branch_name: &str,
    dry_run: bool,
) -> Result<RenameWorkspaceResult, String> {
    // 1. Look up workspace by ID
    let workspace = local_db::get_workspace_by_id(repo_path, workspace_id)
        .map_err(|e| format!("Failed to get workspace: {}", e))?
        .ok_or("Workspace not found")?;

    let old_branch_name = &workspace.branch_name;

    // 2. Check same-name
    if old_branch_name == new_branch_name {
        return Ok(RenameWorkspaceResult {
            success: false,
            message: "New name is the same as the current name".to_string(),
            workspace: None,
            updated_children_ids: vec![],
        });
    }

    // 3. Check local branch clash
    let branches =
        jj::get_branches(repo_path).map_err(|e| format!("Failed to get branches: {}", e))?;
    if branches.iter().any(|b| b.name == new_branch_name) {
        return Ok(RenameWorkspaceResult {
            success: false,
            message: format!("Branch '{}' already exists locally", new_branch_name),
            workspace: None,
            updated_children_ids: vec![],
        });
    }

    // 4. Check remote branch clash
    let remote_ref = format!("{}@origin", new_branch_name);
    let remote_exists = jj::check_remote_branch_exists(repo_path, &remote_ref)
        .map_err(|e| format!("Failed to check remote branch: {}", e))?;
    if remote_exists {
        return Ok(RenameWorkspaceResult {
            success: false,
            message: format!("Branch '{}' already exists on remote", new_branch_name),
            workspace: None,
            updated_children_ids: vec![],
        });
    }

    // 5. If dry_run, return success without performing the rename
    if dry_run {
        return Ok(RenameWorkspaceResult {
            success: true,
            message: format!("'{}' is available", new_branch_name),
            workspace: None,
            updated_children_ids: vec![],
        });
    }

    // 6. Construct full workspace path
    let workspace_path = Path::new(repo_path)
        .join(".treq")
        .join("workspaces")
        .join(&workspace.workspace_path);
    let workspace_path_str = workspace_path
        .to_str()
        .ok_or("Failed to convert workspace path to string")?;

    // 7. Check if old bookmark was tracked
    let was_tracked =
        jj::is_bookmark_tracked(workspace_path_str, old_branch_name, "origin").unwrap_or(false);

    // 8. Set new bookmark at same revision as old
    jj::jj_set_bookmark(workspace_path_str, new_branch_name, old_branch_name)
        .map_err(|e| format!("Failed to set new bookmark: {}", e))?;

    // 9. Delete old bookmark
    jj::jj_delete_bookmark(workspace_path_str, old_branch_name)
        .map_err(|e| format!("Failed to delete old bookmark: {}", e))?;

    // 10. If was tracked, best-effort track new bookmark
    if was_tracked {
        let _ = jj::jj_bookmark_track(workspace_path_str, new_branch_name, "origin");
    }

    // 11. Update branch name in DB
    local_db::update_workspace_branch_name(repo_path, workspace_id, new_branch_name)
        .map_err(|e| format!("Failed to update branch name in DB: {}", e))?;

    // 12. Mark as not_on_remote (new name hasn't been pushed)
    local_db::update_workspace_not_on_remote(repo_path, workspace_id, true)
        .map_err(|e| format!("Failed to update not_on_remote: {}", e))?;

    // 13. Update children targeting the old branch name
    let children = local_db::get_workspaces_by_target_branch(repo_path, old_branch_name)
        .map_err(|e| format!("Failed to get child workspaces: {}", e))?;

    let mut updated_children_ids = Vec::new();
    for child in &children {
        local_db::update_workspace_target_branch(repo_path, child.id, new_branch_name)
            .map_err(|e| format!("Failed to update child target branch: {}", e))?;
        updated_children_ids.push(child.id);
    }

    // 14. Return updated workspace
    let updated_workspace = local_db::get_workspace_by_id(repo_path, workspace_id)
        .map_err(|e| format!("Failed to get updated workspace: {}", e))?;

    Ok(RenameWorkspaceResult {
        success: true,
        message: format!("Renamed '{}' to '{}'", old_branch_name, new_branch_name),
        workspace: updated_workspace,
        updated_children_ids,
    })
}

/// Splits an existing workspace by moving or copying files/commits to a new workspace.
///
/// The new workspace can be positioned before or after the source in the stack.
/// All lower-level operations (workspace creation, file movement, rebasing) are
/// encapsulated within this function.
///
/// # Arguments
/// * `repo_path` - Path to the repository root
/// * `workspace_id` - ID of the source workspace to split from
/// * `branch_name` - Branch name for the new workspace
/// * `intent` - Optional intent/description for the new workspace
/// * `file_paths` - Files to split (mutually exclusive with commit_ids)
/// * `commit_ids` - Change IDs of commits to split (mutually exclusive with file_paths)
/// * `mode` - Move or Copy
/// * `position` - Before or After the source workspace
pub fn split_workspace(
    repo_path: &str,
    workspace_id: i64,
    branch_name: &str,
    intent: Option<String>,
    file_paths: Option<Vec<String>>,
    commit_ids: Option<Vec<String>>,
    mode: SplitMode,
    position: SplitPosition,
) -> Result<local_db::Workspace, String> {
    // 1. Get source workspace
    let source = local_db::get_workspace_by_id(repo_path, workspace_id)
        .map_err(|e| format!("Failed to get source workspace: {}", e))?
        .ok_or("Source workspace not found")?;

    let source_full_path = Path::new(repo_path)
        .join(".treq")
        .join("workspaces")
        .join(&source.workspace_path)
        .to_str()
        .ok_or("Failed to construct source workspace path")?
        .to_string();

    // Snapshot source working copy
    let _ = jj::jj_get_changed_files(&source_full_path);

    let has_files = file_paths.as_ref().map_or(false, |f| !f.is_empty());
    let has_commits = commit_ids.as_ref().map_or(false, |c| !c.is_empty());

    if !has_files && !has_commits {
        return Err("Must specify either file_paths or commit_ids to split".to_string());
    }
    if has_files && has_commits {
        return Err("Cannot specify both file_paths and commit_ids".to_string());
    }

    match position {
        SplitPosition::After => {
            // Create new workspace stacked on source
            let new_workspace = create_workspace(
                repo_path,
                branch_name,
                intent.clone(),
                None,
                Some(&source.branch_name),
                None,
            )?;

            let new_full_path = Path::new(repo_path)
                .join(".treq")
                .join("workspaces")
                .join(&new_workspace.workspace_path)
                .to_str()
                .ok_or("Failed to construct new workspace path")?
                .to_string();

            if has_files {
                let files = file_paths.unwrap();
                match mode {
                    SplitMode::Move => {
                        // Move files from source to new workspace
                        jj::squash_to_workspace(
                            &source_full_path,
                            &new_workspace.workspace_name,
                            Some(files),
                        )
                        .map_err(|e| format!("Failed to move files: {}", e))?;
                    }
                    SplitMode::Copy => {
                        // Copy files (filesystem level, jj auto-tracks)
                        jj::copy_files_between_workspaces(&source_full_path, &new_full_path, files)
                            .map_err(|e| format!("Failed to copy files: {}", e))?;
                    }
                }
            } else if has_commits {
                let commits = commit_ids.unwrap();
                for change_id in &commits {
                    jj::squash_commit_to_workspace(
                        &source_full_path,
                        change_id,
                        &new_workspace.workspace_name,
                    )
                    .map_err(|e| format!("Failed to move commit {}: {}", change_id, e))?;
                }
            }

            // Refresh working copies
            let _ = jj::update_stale_workspace(&new_full_path);
            let _ = jj::update_stale_workspace(&source_full_path);

            // Return updated workspace from DB
            local_db::get_workspace_by_id(repo_path, new_workspace.id)
                .map_err(|e| format!("Failed to get new workspace: {}", e))?
                .ok_or_else(|| "New workspace not found after split".to_string())
        }
        SplitPosition::Before => {
            // Create new workspace at source's parent level
            let source_target = source.target_branch.clone().unwrap_or("main".to_string());

            let new_workspace = create_workspace(
                repo_path,
                branch_name,
                intent.clone(),
                None,
                Some(&source_target),
                None,
            )?;

            let new_full_path = Path::new(repo_path)
                .join(".treq")
                .join("workspaces")
                .join(&new_workspace.workspace_path)
                .to_str()
                .ok_or("Failed to construct new workspace path")?
                .to_string();

            // Set new workspace's target_branch to source's old target
            local_db::update_workspace_target_branch(repo_path, new_workspace.id, &source_target)
                .map_err(|e| format!("Failed to set new workspace target: {}", e))?;

            // In Move mode, track files to remove from source after rebase to avoid inherited reappearance.
            let mut files_to_remove_from_source: Vec<String> = Vec::new();

            if has_files {
                let files = file_paths.unwrap();
                match mode {
                    SplitMode::Move => {
                        files_to_remove_from_source = files.clone();
                        jj::squash_to_workspace(
                            &source_full_path,
                            &new_workspace.workspace_name,
                            Some(files),
                        )
                        .map_err(|e| format!("Failed to move files: {}", e))?;
                    }
                    SplitMode::Copy => {
                        jj::copy_files_between_workspaces(&source_full_path, &new_full_path, files)
                            .map_err(|e| format!("Failed to copy files: {}", e))?;
                    }
                }
            } else if has_commits {
                let commits = commit_ids.unwrap();
                if matches!(mode, SplitMode::Move) {
                    // Collect files from commits before moving them
                    for change_id in &commits {
                        let commit_files =
                            jj::jj_diff_summary(&source_full_path, change_id).unwrap_or_default();
                        files_to_remove_from_source.extend(commit_files);
                    }
                }
                for change_id in &commits {
                    jj::squash_commit_to_workspace(
                        &source_full_path,
                        change_id,
                        &new_workspace.workspace_name,
                    )
                    .map_err(|e| format!("Failed to move commit {}: {}", change_id, e))?;
                }
            }

            // Repoint source's target to new workspace's branch
            local_db::update_workspace_target_branch(
                repo_path,
                source.id,
                &new_workspace.branch_name,
            )
            .map_err(|e| format!("Failed to update source target: {}", e))?;

            // Rebase source onto new workspace
            jj::jj_rebase_onto(&source_full_path, &new_workspace.branch_name, "diff")
                .map_err(|e| format!("Failed to rebase source: {}", e))?;

            // Refresh working copies
            let _ = jj::update_stale_workspace(&new_full_path);
            let _ = jj::update_stale_workspace(&source_full_path);

            // Remove moved files from source working copy to record explicit removals.
            if !files_to_remove_from_source.is_empty() {
                let source_dir = Path::new(&source_full_path);
                for file in &files_to_remove_from_source {
                    let file_path = source_dir.join(file);
                    if file_path.exists() {
                        let _ = std::fs::remove_file(&file_path);
                    }
                }
            }

            // Return updated workspace from DB
            local_db::get_workspace_by_id(repo_path, new_workspace.id)
                .map_err(|e| format!("Failed to get new workspace: {}", e))?
                .ok_or_else(|| "New workspace not found after split".to_string())
        }
    }
}

/// Pull a workspace from remote, automatically resolving divergence by rebasing
/// local mutable commits onto the remote tip.
///
/// When the local bookmark has diverged from its remote counterpart (both have
/// new commits), this function:
/// 1. Fetches remote changes
/// 2. Captures local-only commit IDs (before resolving the bookmark)
/// 3. Resolves the bookmark conflict by pointing to the remote tip
/// 4. Rebases local mutable commits onto the new bookmark tip
/// 5. Refreshes the working copy
pub fn pull_workspace_from_remote(
    repo_path: &str,
    workspace_id: Option<i64>,
    conflict_marker_style: &str,
) -> Result<PullWorkspaceResult, String> {
    // When workspace_id is None, do a simple pull for the home repo
    let workspace_id = match workspace_id {
        Some(id) => id,
        None => {
            // For home repo, just fetch — do not rebase, which would detach HEAD
            jj::jj_git_fetch(repo_path).map_err(|e| format!("Fetch failed: {}", e))?;
            return Ok(PullWorkspaceResult {
                success: true,
                message: "Fetched home repo".to_string(),
                was_diverged: false,
                commits_rebased: 0,
            });
        }
    };

    // Look up workspace from DB
    let workspace = local_db::get_workspace_by_id(repo_path, workspace_id)
        .map_err(|e| format!("Failed to get workspace: {}", e))?
        .ok_or_else(|| format!("Workspace not found: {}", workspace_id))?;

    let full_path = Path::new(repo_path)
        .join(".treq")
        .join("workspaces")
        .join(&workspace.workspace_path);
    let full_path_str = full_path
        .to_str()
        .ok_or("Failed to convert workspace path to string")?;

    let branch_name = &workspace.branch_name;

    // Step 1: Fetch remote changes
    jj::jj_git_fetch(repo_path).map_err(|e| format!("Fetch failed: {}", e))?;

    // Step 2: Check if bookmark is conflicted (diverged)
    let is_conflicted = jj::jj_is_bookmark_conflicted(full_path_str, branch_name);

    if !is_conflicted {
        // No divergence — try to sync working copy if safe
        let _ = jj::jj_workspace_update_stale(full_path_str);
        let _ = jj::jj_sync_working_copy_if_safe(full_path_str, branch_name);

        return Ok(PullWorkspaceResult {
            success: true,
            message: "Fetched remote changes (no divergence)".to_string(),
            was_diverged: false,
            commits_rebased: 0,
        });
    }

    // Step 3: Diverged — capture local-only commit IDs BEFORE resolving bookmark
    let remote_ref = format!("{}@origin", branch_name);
    let local_revset = format!("({}..@-) & mutable()", remote_ref);
    let local_commit_ids = jj::jj_log_revset_commit_ids(full_path_str, &local_revset)
        .map_err(|e| format!("Failed to capture local commits: {}", e))?;

    let commits_rebased = local_commit_ids.len();

    // Step 4: Resolve bookmark conflict — point local bookmark to remote tip
    jj::jj_set_bookmark(full_path_str, branch_name, &remote_ref)
        .map_err(|e| format!("Failed to resolve bookmark conflict: {}", e))?;

    // Step 5: Rebase local commits onto the new bookmark tip (if any)
    if !local_commit_ids.is_empty() {
        let ids_revset = local_commit_ids.join(" | ");
        let roots_revset = format!("roots({})", ids_revset);

        jj::jj_rebase_with_revset(
            full_path_str,
            &roots_revset,
            branch_name,
            branch_name,
            conflict_marker_style,
        )
        .map_err(|e| format!("Failed to rebase local commits: {}", e))?;
    }

    // Step 6: refresh stale working copy only; do not sync bookmark tip here.
    let _ = jj::jj_workspace_update_stale(full_path_str);

    Ok(PullWorkspaceResult {
        success: true,
        message: format!(
            "Resolved divergence: rebased {} local commit(s) onto remote tip",
            commits_rebased
        ),
        was_diverged: true,
        commits_rebased,
    })
}

/// Copies files/directories listed in `patterns` from `repo_path` into `workspace_dir`.
/// Each pattern is an exact file or directory name relative to the repo root.
/// Missing patterns are silently skipped.
pub fn copy_included_files(
    repo_path: &str,
    workspace_dir: &str,
    patterns: &[String],
) -> Result<(), String> {
    let repo = Path::new(repo_path);
    let workspace = Path::new(workspace_dir);

    for pattern in patterns {
        let source = repo.join(pattern);
        if !source.exists() {
            continue;
        }
        let dest = workspace.join(pattern);
        if source.is_file() {
            if let Some(parent) = dest.parent() {
                std::fs::create_dir_all(parent)
                    .map_err(|e| format!("Failed to create directory {:?}: {}", parent, e))?;
            }
            std::fs::copy(&source, &dest)
                .map_err(|e| format!("Failed to copy file {:?}: {}", source, e))?;
        } else if source.is_dir() {
            copy_dir_recursive(&source, &dest)?;
        }
    }
    Ok(())
}

/// Gets the combined diff of all workspace commits relative to the target branch.
///
/// This shows only the changes introduced by the workspace's own commits,
/// excluding changes already present on the target branch.
///
/// # Arguments
/// * `repo_path`              - Path to the repository root
/// * `workspace_id`           - ID of the workspace
/// * `db`                     - App database for reading settings
///
/// # Returns
/// The parsed revision diff on success, or an error string.
pub fn workspace_diff(
    repo_path: &str,
    workspace_id: i64,
    db: &std::sync::Mutex<crate::db::Database>,
) -> Result<jj::JjRevisionDiff, String> {
    let conflict_marker_style = db
        .lock()
        .unwrap()
        .get_setting("conflict_marker_style")
        .ok()
        .flatten()
        .unwrap_or_else(|| "git".to_string());

    workspace_diff_with_conflict_style(repo_path, workspace_id, &conflict_marker_style)
}

pub fn workspace_diff_with_conflict_style(
    repo_path: &str,
    workspace_id: i64,
    conflict_marker_style: &str,
) -> Result<jj::JjRevisionDiff, String> {
    let workspace = local_db::get_workspace_by_id(repo_path, workspace_id)
        .map_err(|e| format!("Failed to get workspace: {}", e))?
        .ok_or_else(|| format!("Workspace not found: {}", workspace_id))?;

    let target_branch = workspace.target_branch.as_deref().unwrap_or("main");

    let workspace_dir = Path::new(repo_path)
        .join(".treq")
        .join("workspaces")
        .join(&workspace.workspace_path);
    let workspace_dir_str = workspace_dir
        .to_str()
        .ok_or("Failed to convert workspace path to string")?;

    jj::jj_get_merge_diff(workspace_dir_str, target_branch, conflict_marker_style)
        .map_err(|e| format!("Failed to get workspace diff: {}", e))
}

fn copy_dir_recursive(src: &Path, dst: &Path) -> Result<(), String> {
    std::fs::create_dir_all(dst)
        .map_err(|e| format!("Failed to create directory {:?}: {}", dst, e))?;
    for entry in
        std::fs::read_dir(src).map_err(|e| format!("Failed to read directory {:?}: {}", src, e))?
    {
        let entry = entry.map_err(|e| format!("Failed to read entry: {}", e))?;
        let src_path = entry.path();
        let dst_path = dst.join(entry.file_name());
        if src_path.is_dir() {
            copy_dir_recursive(&src_path, &dst_path)?;
        } else {
            std::fs::copy(&src_path, &dst_path)
                .map_err(|e| format!("Failed to copy file {:?}: {}", src_path, e))?;
        }
    }
    Ok(())
}

// =============================================================================
// Rebase
// =============================================================================

/// Serializable result returned to callers (including the Tauri frontend).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SingleRebaseResult {
    pub rebased: bool,
    pub success: bool,
    pub message: String,
    pub bookmark_conflicts: Vec<WorkspaceBookmarkConflict>,
}

/// Check and optionally rebase workspaces against their target branch.
///
/// - `workspace_id = Some(id)` — rebase only that workspace (uses `default_branch` as fallback
///   when the workspace has no `target_branch` set, and respects `force`).
/// - `workspace_id = None` — rebase all workspaces in the repo that have a `target_branch`.
pub fn check_and_rebase_workspaces(
    repo_path: &str,
    workspace_id: Option<i64>,
    default_branch: Option<String>,
    force: Option<bool>,
    conflict_style: &str,
) -> Result<SingleRebaseResult, String> {
    if let Some(id) = workspace_id {
        let default_branch = default_branch.unwrap_or_else(|| "main".to_string());
        let force = force.unwrap_or(false);
        let result = auto_rebase::rebase_single_workspace(
            repo_path,
            id,
            &default_branch,
            force,
            conflict_style,
        )?;

        match result {
            Some(auto_result) => Ok(SingleRebaseResult {
                rebased: true,
                success: auto_result.rebase_result.success,
                message: auto_result.rebase_result.message,
                bookmark_conflicts: auto_result.bookmark_conflicts,
            }),
            None => Ok(SingleRebaseResult {
                rebased: false,
                success: true,
                message: "No rebase needed".to_string(),
                bookmark_conflicts: Vec::new(),
            }),
        }
    } else {
        let results = auto_rebase::check_and_rebase_all(repo_path, conflict_style)?;

        let rebased_count: usize = results.iter().map(|r| r.workspaces_rebased.len()).sum();
        let all_success = results.iter().all(|r| r.rebase_result.success);
        let bookmark_conflicts: Vec<WorkspaceBookmarkConflict> = results
            .iter()
            .flat_map(|r| r.bookmark_conflicts.clone())
            .collect();

        let mut summary = String::new();
        for result in &results {
            summary.push_str(&format!(
                "Target '{}': rebased {} workspace(s) - {}\n",
                result.target_branch,
                result.workspaces_rebased.len(),
                if result.rebase_result.success {
                    "success"
                } else {
                    "failed"
                }
            ));
        }
        if results.is_empty() {
            summary.push_str("No workspaces with target branches to rebase\n");
        }

        Ok(SingleRebaseResult {
            rebased: rebased_count > 0,
            success: all_success,
            message: summary,
            bookmark_conflicts,
        })
    }
}

pub fn commit_workspace<T>(
    repo_path: &str,
    workspace_id: T,
    message: &str,
) -> Result<String, String>
where
    T: Into<Option<i64>>,
{
    let workspace_id = workspace_id.into();
    let repo_commit_lock = get_repo_commit_lock(repo_path);
    let _repo_commit_guard = repo_commit_lock.lock().unwrap();
    let workspace_root = resolve_workspace_root(repo_path, workspace_id)?;

    let result = jj::jj_commit(&workspace_root, message)
        .map_err(|e| format!("Failed to create commit: {}", e))?;

    if let Some(id) = workspace_id {
        let workspace = local_db::get_workspace_by_id(repo_path, id)
            .map_err(|e| format!("Failed to get workspace: {}", e))?
            .ok_or_else(|| format!("Workspace not found: {}", id))?;
        let _ = auto_rebase::rebase_after_commit(repo_path, &workspace.branch_name);
    }

    Ok(result)
}
