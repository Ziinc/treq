use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::path::Path;

use crate::db::Database;
use crate::jj;
use crate::local_db;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct WorkspaceCommit {
    pub hash: String,
    pub timestamp: String,
    pub message: String,
}

/// Defines how a workspace is merged into its target branch.
#[derive(Debug, Serialize, Deserialize, Clone, Copy, PartialEq, Eq)]
pub enum MergeCommit {
    Merge,
    Squash,
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

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct WorkspacePartialStatus {
    pub current: local_db::Workspace,
    pub has_conflicts: bool,
    pub has_changes: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct WorkspaceStatus {
    #[serde(flatten)]
    pub partial: WorkspacePartialStatus,
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

impl WorkspaceMetadata {
    /// Serialize metadata to JSON string for storage
    pub fn to_json(&self) -> String {
        serde_json::to_string(self).unwrap_or_else(|_| "{}".to_string())
    }
}

/// Initializes a repository for use with Treq.
///
/// Sets up both the local database (per-repo) and ensures JJ is initialized.
/// Creates the .treq/workspaces directory if it doesn't exist.
///
/// # Arguments
/// * `repo_path` - Path to the repository root
///
/// # Returns
/// Returns true if successful or already initialized, false if JJ initialization failed.
pub fn init(repo_path: &str) -> Result<bool, String> {
    let db_path = local_db::init_local_db(repo_path)?;
    let db = Database::new(db_path).map_err(|e| format!("Failed to open database: {}", e))?;

    let workspaces_dir = Path::new(repo_path).join(".treq").join("workspaces");
    std::fs::create_dir_all(&workspaces_dir)
        .map_err(|e| format!("Failed to create workspaces directory: {}", e))?;

    match jj::ensure_jj_initialized(&db, repo_path) {
        Ok(_already_initialized) => Ok(true),
        Err(_) => Ok(false),
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
) -> Result<local_db::Workspace, String> {
    // snapshot working copy of repo
    let _ = jj::jj_get_changed_files(repo_path);

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

            // Update the workspace's working copy to reflect the squash
            let workspace_dir = Path::new(repo_path)
                .join(".treq")
                .join("workspaces")
                .join(&workspace.workspace_path);
            jj::update_stale_workspace(&workspace_dir.to_string_lossy())
                .map_err(|e| format!("Failed to update workspace working copy: {}", e))?;
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
            // Best effort: log but don't fail if jj/directory removal fails
            // The DB cleanup must always proceed
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

/// Lists all workspaces in the repository.
/// # Arguments
/// * `repo_path` - Path to the repository root
///
/// # Returns
/// Returns a vector of workspaces if successful, otherwise an error message.
pub fn list_workspaces(repo_path: &str) -> Result<Vec<local_db::Workspace>, String> {
    let workspaces = local_db::get_workspaces(repo_path)
        .map_err(|e| format!("Failed to get workspaces from db: {}", e))?;

    let updated_workspaces: Vec<local_db::Workspace> = workspaces
        .into_iter()
        .map(|workspace| {
            let workspace_path = Path::new(repo_path)
                .join(".treq")
                .join("workspaces")
                .join(&workspace.workspace_path)
                .to_str()
                .expect("not a valid path")
                .to_string();

            // Snapshot working copy by running jj status.
            // Then check for staleness (can occur if another workspace was snapshotted
            // above, rewriting a parent commit and making this workspace stale).
            let _ = jj::jj_get_changed_files(&workspace_path);
            if let Ok(true) = jj::is_workspace_stale(&workspace_path) {
                if let Err(update_err) = jj::jj_workspace_update_stale(&workspace_path) {
                    eprintln!("Failed to update stale workspace: {}", update_err);
                }
            }

            workspace
        })
        .collect();

    Ok(updated_workspaces)
}

/// Lists all workspaces with their computed conflict and change status.
/// Consolidates what was previously 3 separate calls (list_workspaces, list_conflicted_workspace_ids, list_workspaces_with_changes).
pub fn list_workspace_statuses(repo_path: &str) -> Result<Vec<WorkspacePartialStatus>, String> {
    let workspaces = list_workspaces(repo_path)?;

    let statuses: Vec<WorkspacePartialStatus> = workspaces
        .into_iter()
        .map(|workspace| {
            let workspace_path = Path::new(repo_path)
                .join(".treq")
                .join("workspaces")
                .join(&workspace.workspace_path)
                .to_str()
                .expect("not a valid path")
                .to_string();

            let has_changes = jj::jj_get_changed_files(&workspace_path)
                .map(|files| !files.is_empty())
                .unwrap_or(false);

            let has_conflicts =
                jj::get_conflicted_files(&workspace_path, workspace.target_branch.as_deref())
                    .map(|files| !files.is_empty())
                    .unwrap_or(false);

            WorkspacePartialStatus {
                current: workspace,
                has_conflicts,
                has_changes,
            }
        })
        .collect();

    Ok(statuses)
}

pub fn stack_workspace(
    repo_path: &str,
    source_workspace: Option<&local_db::Workspace>,
    branch_name: Option<&str>,
) -> Result<local_db::Workspace, String> {
    let base = match source_workspace {
        Some(workspace) => {
            let workspace_path = Path::new(repo_path)
                .join(".treq")
                .join("workspaces")
                .join(&workspace.workspace_path)
                .to_str()
                .expect("not a valid path")
                .to_string();
            let _ = jj::jj_get_changed_files(&workspace_path);
            workspace.branch_name.clone()
        }
        None => "main".to_string(),
    };

    let target = match branch_name {
        Some(branch) => branch.to_string(),
        None => format!("{}-1", base),
    };

    let mut workspace = create_workspace(repo_path, &target, None, None, Some(&base))?;

    // Set the target_branch to the parent workspace's branch for conflict detection
    local_db::update_workspace_target_branch(repo_path, workspace.id, &base)
        .map_err(|e| format!("Failed to set target branch: {}", e))?;

    // Update the workspace object to reflect the change
    workspace.target_branch = Some(base);

    Ok(workspace)
}

/// Gets the status of a workspace, including parent, children, and full DAG hierarchy.
///
/// # Arguments
/// * `workspace_path` - Full path to the workspace directory
///
/// # Returns
/// Returns a WorkspaceStatus containing the current workspace, parent, children, DAG nodes, and conflicted workspace IDs.
pub fn workspace_status(workspace_path: &str) -> Result<WorkspaceStatus, String> {
    // Extract workspace name from path (last component)
    let path = Path::new(workspace_path);
    let workspace_name = path
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or("Invalid workspace path")?;

    // Derive repo_path by going up 3 levels (.../workspaces/name -> ../../..)
    let repo_path = path
        .parent() // .../workspaces
        .and_then(|p| p.parent()) // .../.treq
        .and_then(|p| p.parent()) // ...
        .ok_or("Invalid workspace path structure")?
        .to_str()
        .ok_or("Failed to convert repo path")?
        .to_string();

    // Get all workspaces in the repo
    let all_workspaces = local_db::get_workspaces(&repo_path)
        .map_err(|e| format!("Failed to get workspaces: {}", e))?;

    // Find current workspace by workspace_path (handle both short name and full path)
    let current_workspace = all_workspaces
        .iter()
        .find(|w| w.workspace_path == workspace_name || w.workspace_path == workspace_path)
        .cloned()
        .ok_or_else(|| format!("Workspace not found for path: {}", workspace_path))?;

    // Build branch_name → Workspace lookup map
    let branch_map: HashMap<String, &local_db::Workspace> = all_workspaces
        .iter()
        .map(|w| (w.branch_name.clone(), w))
        .collect();

    // Find root of hierarchy by tracing upward
    let mut root_workspace = current_workspace.clone();
    let mut visited = HashSet::new();
    visited.insert(root_workspace.id);

    while let Some(target_branch) = &root_workspace.target_branch {
        if let Some(parent) = branch_map.get(target_branch) {
            if visited.contains(&parent.id) {
                // Circular dependency detected, stop tracing
                break;
            }
            visited.insert(parent.id);
            root_workspace = (*parent).clone();
        } else {
            // No parent found, this is a root
            break;
        }
    }

    // Build complete DAG recursively from root
    let mut dag_nodes = Vec::new();
    let mut visited = HashSet::new();
    build_dag_recursive(
        &root_workspace,
        &repo_path,
        None,
        0,
        &mut dag_nodes,
        &mut visited,
    )?;

    // Find direct parent (workspace whose branch_name matches current.target_branch)
    let target = current_workspace
        .target_branch
        .as_ref()
        .and_then(|target| branch_map.get(target).map(|w| (*w).clone()));

    // Find direct children (workspaces where target_branch matches current.branch_name)
    let children: Vec<local_db::Workspace> =
        local_db::get_workspaces_by_target_branch(&repo_path, &current_workspace.branch_name)
            .unwrap_or_default();

    // Collect conflicted workspace IDs from DAG nodes
    let conflicted_workspace_ids: Vec<i64> = dag_nodes
        .iter()
        .filter(|node| node.status.has_conflicts)
        .map(|node| node.status.current.id)
        .collect();

    // Calculate commits ahead of target
    let commits_ahead_of_target = if let Some(target_workspace) = &target {
        match jj::jj_get_commits_ahead(workspace_path, &target_workspace.branch_name) {
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
        match jj::jj_get_commits_ahead(workspace_path, "main") {
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

    // Reuse status already computed by build_dag_recursive instead of spawning duplicate jj calls
    let (has_changes, has_conflicts) = dag_nodes
        .iter()
        .find(|node| node.status.current.id == current_workspace.id)
        .map(|node| (node.status.has_changes, node.status.has_conflicts))
        .unwrap_or((false, false));

    Ok(WorkspaceStatus {
        partial: WorkspacePartialStatus {
            current: current_workspace,
            has_conflicts,
            has_changes,
        },
        target,
        children,
        dag_nodes,
        conflicted_workspace_ids,
        commits_ahead_of_target,
    })
}

const MAX_DAG_DEPTH: usize = 10;

fn build_dag_recursive(
    workspace: &local_db::Workspace,
    repo_path: &str,
    parent_id: Option<i64>,
    depth: usize,
    dag_nodes: &mut Vec<WorkspaceNode>,
    visited: &mut HashSet<i64>,
) -> Result<(), String> {
    if depth >= MAX_DAG_DEPTH {
        eprintln!(
            "Warning: DAG depth limit ({}) reached at workspace '{}', stopping recursion",
            MAX_DAG_DEPTH, workspace.branch_name
        );
        return Ok(());
    }

    if visited.contains(&workspace.id) {
        return Ok(());
    }

    visited.insert(workspace.id);

    // Find children of this workspace
    let children = local_db::get_workspaces_by_target_branch(repo_path, &workspace.branch_name)
        .unwrap_or_default();
    let child_ids: Vec<i64> = children.iter().map(|c| c.id).collect();

    // Compute status for this node
    let workspace_path = Path::new(repo_path)
        .join(".treq")
        .join("workspaces")
        .join(&workspace.workspace_path)
        .to_str()
        .expect("not a valid path")
        .to_string();

    let has_changes = jj::jj_get_changed_files(&workspace_path)
        .map(|files| !files.is_empty())
        .unwrap_or(false);
    let has_conflicts =
        jj::get_conflicted_files(&workspace_path, workspace.target_branch.as_deref())
            .map(|files| !files.is_empty())
            .unwrap_or(false);

    dag_nodes.push(WorkspaceNode {
        status: WorkspacePartialStatus {
            current: workspace.clone(),
            has_conflicts,
            has_changes,
        },
        parent_id,
        child_ids: child_ids.clone(),
        depth,
    });

    // Recursively process children
    for child in children {
        build_dag_recursive(
            &child,
            repo_path,
            Some(workspace.id),
            depth + 1,
            dag_nodes,
            visited,
        )?;
    }

    Ok(())
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

    // Get commits ahead of target
    let commits_ahead = jj::jj_get_commits_ahead(workspace_path_str, target_branch)
        .map_err(|e| format!("Failed to get commits: {}", e))?;

    if commits_ahead.commits.is_empty() {
        return Err("No commits to merge".to_string());
    }

    match merge_strategy {
        MergeCommit::Merge => {
            jj::jj_create_merge_commit(repo_path, &workspace.branch_name, target_branch, message)
                .map_err(|e| format!("Failed to create merge commit: {}", e))?;
        }
        MergeCommit::Squash => {
            jj::jj_squash_merge_commit(repo_path, &workspace.branch_name, target_branch, message)
                .map_err(|e| format!("Failed to squash merge workspace: {}", e))?;
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
            jj::jj_rebase_onto(workspace_path_str, "main")
                .map_err(|e| format!("Failed to rebase workspace: {}", e))?;
        }
        MaybeEmptyParam::Some(branch) => {
            // // First, fetch in the main repo to ensure git branches are available
            let _ = jj::jj_git_fetch(repo_path);

            // Rebase workspace onto the target commit
            let rebase_result = jj::jj_rebase_onto(workspace_path_str, &branch)
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
            message: format!(
                "Branch '{}' already exists locally",
                new_branch_name
            ),
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
            message: format!(
                "Branch '{}' already exists on remote",
                new_branch_name
            ),
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
        message: format!(
            "Renamed '{}' to '{}'",
            old_branch_name, new_branch_name
        ),
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
            let new_workspace = stack_workspace(repo_path, Some(&source), Some(branch_name))?;

            let new_full_path = Path::new(repo_path)
                .join(".treq")
                .join("workspaces")
                .join(&new_workspace.workspace_path)
                .to_str()
                .ok_or("Failed to construct new workspace path")?
                .to_string();

            // Update intent if provided
            if let Some(ref intent_str) = intent {
                local_db::update_workspace_intent(repo_path, new_workspace.id, intent_str)
                    .map_err(|e| format!("Failed to update intent: {}", e))?;
            }

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

            if has_files {
                let files = file_paths.unwrap();
                match mode {
                    SplitMode::Move => {
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
            jj::jj_rebase_onto(&source_full_path, &new_workspace.branch_name)
                .map_err(|e| format!("Failed to rebase source: {}", e))?;

            // Refresh working copies
            let _ = jj::update_stale_workspace(&new_full_path);
            let _ = jj::update_stale_workspace(&source_full_path);

            // Return updated workspace from DB
            local_db::get_workspace_by_id(repo_path, new_workspace.id)
                .map_err(|e| format!("Failed to get new workspace: {}", e))?
                .ok_or_else(|| "New workspace not found after split".to_string())
        }
    }
}
