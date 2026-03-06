use std::path::Path;

use crate::jj;
use crate::local_db;

/// Lists commits for a workspace by its database ID, or for the home repo
/// when no workspace ID is provided.
///
/// # Arguments
/// * `repo_path`    - Path to the repository root
/// * `workspace_id` - ID of the workspace to list commits for, or `None` for the home repo
///
/// # Returns
/// The parsed log result on success, or an error string.
pub fn list_commits(
    repo_path: &str,
    workspace_id: Option<i64>,
    include_target_branch_history: bool,
    target_branch_limit: Option<usize>,
    limit: Option<usize>,
) -> Result<jj::JjLogResult, String> {
    match workspace_id {
        Some(id) => {
            let workspace = local_db::get_workspace_by_id(repo_path, id)
                .map_err(|e| format!("Failed to get workspace: {}", e))?
                .ok_or_else(|| format!("Workspace not found: {}", id))?;

            let workspace_dir = Path::new(repo_path)
                .join(".treq")
                .join("workspaces")
                .join(&workspace.workspace_path);
            let workspace_dir_str = workspace_dir
                .to_str()
                .ok_or("Failed to convert workspace path to string")?;

            let target_branch = workspace
                .target_branch
                .as_deref()
                .unwrap_or("main");

            let mut result = jj::jj_get_log(workspace_dir_str, target_branch, Some(false), None)
                .map_err(|e| format!("Failed to list commits: {}", e))?;

            if include_target_branch_history {
                let limit = target_branch_limit.unwrap_or(10);
                match jj::jj_get_target_branch_log(workspace_dir_str, target_branch, limit) {
                    Ok(target_commits) => {
                        result.target_branch_commits = target_commits;
                    }
                    Err(e) => {
                        eprintln!("[list_commits] Failed to get target branch history: {}", e);
                        // Non-fatal: leave target_branch_commits empty
                    }
                }
            }

            Ok(result)
        }
        None => {
            let branch = jj::get_workspace_branch(repo_path)
                .map_err(|e| format!("Failed to get active branch: {}", e))?;
            jj::jj_get_log(repo_path, &branch, Some(true), limit)
                .map_err(|e| format!("Failed to list commits: {}", e))
        }
    }
}

/// Moves a specific commit from a source workspace into a brand-new workspace.
///
/// Creates the new workspace (registering it in the DB), then squashes the
/// specified commit's changes into the new workspace's working copy.
///
/// # Arguments
/// * `repo_path`           - Path to the repository root
/// * `source_workspace_id` - ID of the workspace that owns the commit
/// * `commit_change_id`    - The short change-id of the commit to move
/// * `branch_name`         - Branch name for the new workspace
/// * `intent`              - Optional intent description for the new workspace
///
/// # Returns
/// The newly created `Workspace` on success, or an error string.
pub fn move_commit_to_new_workspace(
    repo_path: &str,
    source_workspace_id: i64,
    commit_change_id: &str,
    branch_name: &str,
    intent: Option<String>,
) -> Result<local_db::Workspace, String> {
    // Resolve full path of the source workspace
    let source = local_db::get_workspace_by_id(repo_path, source_workspace_id)
        .map_err(|e| format!("Failed to get source workspace: {}", e))?
        .ok_or_else(|| format!("Source workspace not found: {}", source_workspace_id))?;

    let source_full_path = Path::new(repo_path)
        .join(".treq")
        .join("workspaces")
        .join(&source.workspace_path);
    let source_full_path_str = source_full_path
        .to_str()
        .ok_or("Failed to convert source workspace path to string")?
        .to_string();

    // Create the new workspace
    let new_workspace = super::create_workspace(repo_path, branch_name, intent, None, None, None)?;

    // Squash the commit into the new workspace's working copy
    jj::squash_commit_to_workspace(
        &source_full_path_str,
        commit_change_id,
        &new_workspace.workspace_name,
    )
    .map_err(|e| format!("Failed to move commit to new workspace: {}", e))?;

    // Refresh the new workspace's working copy so it reflects the squash
    let new_workspace_dir = Path::new(repo_path)
        .join(".treq")
        .join("workspaces")
        .join(&new_workspace.workspace_path);
    jj::update_stale_workspace(&new_workspace_dir.to_string_lossy())
        .map_err(|e| format!("Failed to update new workspace working copy: {}", e))?;

    Ok(new_workspace)
}

/// Moves a specific commit from a source workspace into an existing target workspace.
///
/// Squashes the specified commit's changes into the target workspace's working copy.
///
/// # Arguments
/// * `repo_path`            - Path to the repository root
/// * `source_workspace_id`  - ID of the workspace that owns the commit
/// * `commit_change_id`     - The short change-id of the commit to move
/// * `target_workspace_id`  - ID of the destination workspace
///
/// # Returns
/// `Ok(())` on success, or an error string.
pub fn move_commit_to_existing_workspace(
    repo_path: &str,
    source_workspace_id: i64,
    commit_change_id: &str,
    target_workspace_id: i64,
) -> Result<(), String> {
    // Resolve full path of the source workspace
    let source = local_db::get_workspace_by_id(repo_path, source_workspace_id)
        .map_err(|e| format!("Failed to get source workspace: {}", e))?
        .ok_or_else(|| format!("Source workspace not found: {}", source_workspace_id))?;

    // Resolve target workspace
    let target = local_db::get_workspace_by_id(repo_path, target_workspace_id)
        .map_err(|e| format!("Failed to get target workspace: {}", e))?
        .ok_or_else(|| format!("Target workspace not found: {}", target_workspace_id))?;

    let source_full_path = Path::new(repo_path)
        .join(".treq")
        .join("workspaces")
        .join(&source.workspace_path);
    let source_full_path_str = source_full_path
        .to_str()
        .ok_or("Failed to convert source workspace path to string")?
        .to_string();

    // Squash the commit into the target workspace's working copy
    jj::squash_commit_to_workspace(
        &source_full_path_str,
        commit_change_id,
        &target.workspace_name,
    )
    .map_err(|e| format!("Failed to move commit to target workspace: {}", e))?;

    // Refresh the target workspace's working copy so it reflects the squash
    let target_workspace_dir = Path::new(repo_path)
        .join(".treq")
        .join("workspaces")
        .join(&target.workspace_path);
    jj::update_stale_workspace(&target_workspace_dir.to_string_lossy())
        .map_err(|e| format!("Failed to update target workspace working copy: {}", e))?;

    Ok(())
}

/// Abandons a specific commit from a workspace by change-id.
///
/// # Arguments
/// * `repo_path`         - Path to the repository root
/// * `workspace_id`      - ID of the workspace that owns the commit
/// * `commit_change_id`  - The short change-id of the commit to abandon
///
/// # Returns
/// `Ok(())` on success, or an error string.
pub fn abandon_commit(
    repo_path: &str,
    workspace_id: i64,
    commit_change_id: &str,
) -> Result<(), String> {
    let workspace = local_db::get_workspace_by_id(repo_path, workspace_id)
        .map_err(|e| format!("Failed to get workspace: {}", e))?
        .ok_or_else(|| format!("Workspace not found: {}", workspace_id))?;

    let workspace_dir = Path::new(repo_path)
        .join(".treq")
        .join("workspaces")
        .join(&workspace.workspace_path);
    let workspace_dir_str = workspace_dir
        .to_str()
        .ok_or("Failed to convert workspace path to string")?;

    jj::jj_abandon(workspace_dir_str, commit_change_id)
        .map_err(|e| format!("Failed to abandon commit: {}", e))?;

    jj::update_stale_workspace(workspace_dir_str)
        .map_err(|e| format!("Failed to update workspace working copy: {}", e))?;

    Ok(())
}

/// Returns the diff for a specific commit in a workspace.
///
/// # Arguments
/// * `repo_path`              - Path to the repository root
/// * `workspace_id`           - ID of the workspace that owns the commit
/// * `commit_change_id`       - The short change-id of the commit to diff
/// * `conflict_marker_style`  - Conflict marker style (e.g. "git")
///
/// # Returns
/// The parsed revision diff on success, or an error string.
pub fn get_commit_diff(
    repo_path: &str,
    workspace_id: i64,
    commit_change_id: &str,
    conflict_marker_style: &str,
) -> Result<jj::JjRevisionDiff, String> {
    let workspace = local_db::get_workspace_by_id(repo_path, workspace_id)
        .map_err(|e| format!("Failed to get workspace: {}", e))?
        .ok_or_else(|| format!("Workspace not found: {}", workspace_id))?;

    let workspace_dir = Path::new(repo_path)
        .join(".treq")
        .join("workspaces")
        .join(&workspace.workspace_path);
    let workspace_dir_str = workspace_dir
        .to_str()
        .ok_or("Failed to convert workspace path to string")?;

    jj::jj_get_commit_diff(workspace_dir_str, commit_change_id, conflict_marker_style)
        .map_err(|e| format!("Failed to get commit diff: {}", e))
}

/// Creates a commit in a workspace with the given message.
///
/// # Arguments
/// * `repo_path`    - Path to the repository root
/// * `workspace_id` - ID of the workspace to commit in
/// * `message`      - Commit message
///
/// # Returns
/// The commit output string on success, or an error string.
pub fn create_commit(
    repo_path: &str,
    workspace_id: Option<i64>,
    message: &str,
) -> Result<String, String> {
    match workspace_id {
        Some(id) => {
            let workspace = local_db::get_workspace_by_id(repo_path, id)
                .map_err(|e| format!("Failed to get workspace: {}", e))?
                .ok_or_else(|| format!("Workspace not found: {}", id))?;

            let workspace_dir = Path::new(repo_path)
                .join(".treq")
                .join("workspaces")
                .join(&workspace.workspace_path);
            let workspace_dir_str = workspace_dir
                .to_str()
                .ok_or("Failed to convert workspace path to string")?;

            let result = jj::jj_commit(workspace_dir_str, message)
                .map_err(|e| format!("Failed to create commit: {}", e))?;

            // Run auto-rebase synchronously so jj state is settled before returning
            if let Ok(branch) = jj::get_workspace_branch(workspace_dir_str) {
                let _ = crate::auto_rebase::rebase_after_commit(repo_path, &branch);
            }

            Ok(result)
        }
        None => {
            let result = jj::jj_commit(repo_path, message)
                .map_err(|e| format!("Failed to create commit: {}", e))?;
            Ok(result)
        }
    }
}
