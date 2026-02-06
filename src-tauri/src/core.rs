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

pub enum MaybeEmptyParam<T> {
    EmptyValue,
    Omitted,
    Some(T),
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct WorkspaceStatus {
    pub current: local_db::Workspace,
    pub target: Option<local_db::Workspace>,
    pub children: Vec<local_db::Workspace>,
    pub dag_nodes: Vec<WorkspaceNode>,
    pub conflicted_workspace_ids: Vec<i64>,
    pub commits_ahead_of_target: Vec<WorkspaceCommit>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct WorkspaceNode {
    pub workspace: local_db::Workspace,
    pub parent_id: Option<i64>,
    pub child_ids: Vec<i64>,
    pub depth: usize,
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
    intent: Option<&str>,
    source_branch: Option<&str>,
) -> Result<local_db::Workspace, String> {
    // snapshot working copy of repo
    let _ = jj::jj_get_changed_files(repo_path);

    let branches =
        jj::get_branches(repo_path).map_err(|e| format!("Failed to get branches: {}", e))?;

    let branch_exists: bool = branches.iter().any(|b| b.name == branch_name);

    // If branch doesn't exist locally and source_branch is None, check remotes
    let resolved_source_branch = if !branch_exists && source_branch.is_none() {
        // Check if branch exists on origin remote
        let remote_ref = format!("{}@origin", branch_name);
        if jj::check_remote_branch_exists(repo_path, &remote_ref)
            .map_err(|e| format!("Failed to check remote branch: {}", e))?
        {
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
        Some(intent.unwrap_or("").to_string()),
    )
    .map_err(|e| format!("Failed to add workspace to db: {}", e))?;
    let workspace = local_db::get_workspace_by_id(repo_path, workspace_id)
        .map_err(|e| format!("Failed to get workspace from db: {}", e))?;
    match workspace {
        Some(workspace) => Ok(workspace),
        _ => Err(format!(
            "Workspace not found in database after creation: {}",
            workspace_id
        )),
    }
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
            jj::remove_workspace(repo_path, &workspace_path.to_str().unwrap())
                .map_err(|e| format!("Failed to remove workspace: {}", e))?;
            local_db::delete_workspace(repo_path, *workspace_id)
                .map_err(|e| format!("Failed to delete workspace from db: {}", e))?;
            Ok(true)
        }
        _ => Err(format!("Workspace not found in database: {}", workspace_id)),
    }
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
        .map(|mut workspace| {
            let workspace_path = Path::new(repo_path)
                .join(".treq")
                .join("workspaces")
                .join(&workspace.workspace_path)
                .to_str()
                .expect("not a valid path")
                .to_string();

            let files = match jj::jj_get_changed_files(&workspace_path) {
                Ok(files) => files,
                Err(jj::JjError::IoError(e))
                    if e.contains("stale") || e.contains("not updated since operation") =>
                {
                    eprintln!("Stale working copy detected, updating: {}", workspace_path);
                    if let Err(update_err) = jj::jj_workspace_update_stale(&workspace_path) {
                        eprintln!("Failed to update stale workspace: {}", update_err);
                    }
                    jj::jj_get_changed_files(&workspace_path).unwrap_or_default()
                }
                Err(e) => {
                    eprintln!("Failed to get changed files: {}", e);
                    vec![]
                }
            };

            // Ensure workspace is fresh before conflict detection
            if let Ok(true) = jj::is_workspace_stale(&workspace_path) {
                let _ = jj::jj_workspace_update_stale(&workspace_path);
            }

            let conflicts =
                jj::get_conflicted_files(&workspace_path, workspace.target_branch.as_deref())
                    .unwrap_or_default();

            let has_conflicts = !conflicts.is_empty();

            if workspace.has_conflicts != has_conflicts {
                let _ = local_db::update_workspace_has_conflicts(
                    repo_path,
                    workspace.id,
                    has_conflicts,
                );
                workspace.has_conflicts = has_conflicts;
            }

            workspace
        })
        .collect();

    Ok(updated_workspaces)
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

    let mut workspace = create_workspace(repo_path, &target, None, Some(&base))?;

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

    // Find current workspace by workspace_path
    let current_workspace = all_workspaces
        .iter()
        .find(|w| w.workspace_path == workspace_name)
        .cloned()
        .ok_or("Workspace not found")?;

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
        .filter(|node| node.workspace.has_conflicts)
        .map(|node| node.workspace.id)
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

    Ok(WorkspaceStatus {
        current: current_workspace,
        target,
        children,
        dag_nodes,
        conflicted_workspace_ids,
        commits_ahead_of_target,
    })
}

fn build_dag_recursive(
    workspace: &local_db::Workspace,
    repo_path: &str,
    parent_id: Option<i64>,
    depth: usize,
    dag_nodes: &mut Vec<WorkspaceNode>,
    visited: &mut HashSet<i64>,
) -> Result<(), String> {
    if visited.contains(&workspace.id) {
        return Ok(());
    }

    visited.insert(workspace.id);

    // Find children of this workspace
    let children = local_db::get_workspaces_by_target_branch(repo_path, &workspace.branch_name)
        .unwrap_or_default();
    let child_ids: Vec<i64> = children.iter().map(|c| c.id).collect();

    dag_nodes.push(WorkspaceNode {
        workspace: workspace.clone(),
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
pub fn merge_workspace(repo_path: &str, workspace_id: i64, message: &str) -> Result<(), String> {
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

    // Create a merge commit between the workspace branch and target branch
    jj::jj_create_merge_commit(repo_path, &workspace.branch_name, target_branch, message)
        .map_err(|e| format!("Failed to create merge commit: {}", e))?;

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
        let current_metadata = workspace.metadata.as_deref().unwrap_or("{}");
        let mut meta: serde_json::Value =
            serde_json::from_str(current_metadata).unwrap_or(serde_json::json!({}));
        meta["intent"] = serde_json::Value::String(intent_str.to_string());
        let new_metadata = serde_json::to_string(&meta)
            .map_err(|e| format!("Failed to serialize metadata: {}", e))?;
        local_db::update_workspace_metadata(repo_path, workspace_id, &new_metadata)
            .map_err(|e| format!("Failed to update metadata: {}", e))?;
    }

    local_db::get_workspace_by_id(repo_path, workspace_id)
        .map_err(|e| format!("Failed to get updated workspace: {}", e))?
        .ok_or_else(|| "Workspace not found after update".to_string())
}
