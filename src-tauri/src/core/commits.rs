use std::collections::HashSet;
use std::path::Path;

use crate::jj;
use crate::local_db;

fn append_target_branch_commits(result: &mut jj::JjLogResult, target_commits: Vec<jj::JjLogCommit>) {
    let existing_ids: HashSet<String> = result
        .commits
        .iter()
        .map(|c| c.commit_id.clone())
        .collect();

    for mut commit in target_commits {
        if existing_ids.contains(&commit.commit_id) {
            continue;
        }
        commit.on_target_only = true;
        result.commits.push(commit);
    }
}

/// Lists commits for a workspace by its database ID, or for the home repo
/// when no workspace ID is provided.
///
/// # Arguments
/// * `repo_path`                     - Path to the repository root
/// * `workspace_id`                  - ID of the workspace to list commits for, or `None` for the home repo
/// * `include_target_branch_history` - When true, append target-branch history after the
///   current-branch commits (marked with `on_target_only = true`). Applies to both
///   workspace and home-repo listings.
///
/// Returns a single `commits` list: current-branch history first, then optional
/// target-branch history when `include_target_branch_history` is true.
/// * `target_branch_limit`           - Max commits to load for target-branch history; defaults to 10 when `include_target_branch_history` is true
/// * `limit`                         - Max commits for the home-repo log only; ignored when `workspace_id` is set
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
            let default_branch = jj::get_default_branch(repo_path)
                .map_err(|e| format!("Failed to resolve default branch: {}", e))?;

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
                .unwrap_or(&default_branch);
            let is_default_branch_workspace = workspace.branch_name == default_branch;

            let mut result = jj::jj_get_log(
                workspace_dir_str,
                target_branch,
                Some(is_default_branch_workspace),
                None,
            )
            .map_err(|e| format!("Failed to list commits: {}", e))?;

            if include_target_branch_history && !is_default_branch_workspace {
                let target_limit = target_branch_limit.unwrap_or(10);
                let target_commits =
                    jj::jj_get_target_branch_log(repo_path, target_branch, target_limit)
                        .map_err(|e| format!("Failed to list target branch history: {}", e))?;
                append_target_branch_commits(&mut result, target_commits);
            }

            Ok(result)
        }
        None => {
            let branch = jj::resolve_home_repo_branch(repo_path)
                .map_err(|e| format!("Failed to get active branch: {}", e))?;
            let default_branch = jj::get_default_branch(repo_path)
                .map_err(|e| format!("Failed to resolve default branch: {}", e))?;
            if branch != default_branch {
                let mut result = jj::jj_get_home_repo_diverged_log(
                    repo_path,
                    &branch,
                    &default_branch,
                    limit,
                )
                .map_err(|e| format!("Failed to list commits: {}", e))?;
                if !include_target_branch_history {
                    result.commits.retain(|c| !c.on_target_only);
                }
                Ok(result)
            } else {
                jj::jj_get_log(repo_path, &branch, Some(true), limit)
                    .map_err(|e| format!("Failed to list commits: {}", e))
            }
        }
    }
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
/// * `workspace_id`           - Optional workspace ID that owns the commit
/// * `commit_change_id`       - The short change-id of the commit to diff
/// Conflict marker style is resolved from app settings, defaulting to "git".
///
/// # Returns
/// The parsed revision diff on success, or an error string.
pub fn get_commit_diff(
    db: &std::sync::Mutex<crate::db::Database>,
    repo_path: &str,
    workspace_id: Option<i64>,
    commit_change_id: &str,
) -> Result<jj::JjRevisionDiff, String> {
    let conflict_marker_style = crate::core::resolve_conflict_marker_style(db);

    get_commit_diff_with_conflict_style(
        repo_path,
        workspace_id,
        commit_change_id,
        &conflict_marker_style,
    )
}

pub fn get_commit_diff_with_conflict_style(
    repo_path: &str,
    workspace_id: Option<i64>,
    commit_change_id: &str,
    conflict_marker_style: &str,
) -> Result<jj::JjRevisionDiff, String> {
    let workspace_dir = match workspace_id {
        Some(workspace_id) => {
            let workspace = local_db::get_workspace_by_id(repo_path, workspace_id)
                .map_err(|e| format!("Failed to get workspace: {}", e))?
                .ok_or_else(|| format!("Workspace not found: {}", workspace_id))?;
            Path::new(repo_path)
                .join(".treq")
                .join("workspaces")
                .join(&workspace.workspace_path)
        }
        None => Path::new(repo_path).to_path_buf(),
    };
    let workspace_dir_str = workspace_dir
        .to_str()
        .ok_or("Failed to convert workspace path to string")?;

    jj::jj_get_commit_diff(workspace_dir_str, commit_change_id, conflict_marker_style)
        .map_err(|e| format!("Failed to get commit diff: {}", e))
}

pub fn get_commit_file_diff(
    db: &std::sync::Mutex<crate::db::Database>,
    repo_path: &str,
    workspace_id: Option<i64>,
    commit_change_id: &str,
    file_path: &str,
) -> Result<jj::JjFileDiff, String> {
    let conflict_marker_style = crate::core::resolve_conflict_marker_style(db);

    get_commit_file_diff_with_conflict_style(
        repo_path,
        workspace_id,
        commit_change_id,
        file_path,
        &conflict_marker_style,
    )
}

pub fn get_commit_file_diff_with_conflict_style(
    repo_path: &str,
    workspace_id: Option<i64>,
    commit_change_id: &str,
    file_path: &str,
    conflict_marker_style: &str,
) -> Result<jj::JjFileDiff, String> {
    let workspace_dir = match workspace_id {
        Some(workspace_id) => {
            let workspace = local_db::get_workspace_by_id(repo_path, workspace_id)
                .map_err(|e| format!("Failed to get workspace: {}", e))?
                .ok_or_else(|| format!("Workspace not found: {}", workspace_id))?;
            Path::new(repo_path)
                .join(".treq")
                .join("workspaces")
                .join(&workspace.workspace_path)
        }
        None => Path::new(repo_path).to_path_buf(),
    };
    let workspace_dir_str = workspace_dir
        .to_str()
        .ok_or("Failed to convert workspace path to string")?;

    jj::jj_get_commit_file_diff(
        workspace_dir_str,
        commit_change_id,
        file_path,
        conflict_marker_style,
    )
    .map_err(|e| format!("Failed to get commit file diff: {}", e))
}
