use std::path::Path;

use crate::db::Database;
use crate::jj;
use crate::local_db;

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
    let workspace_path = jj::create_workspace(
        repo_path,
        branch_name,
        branch_name,
        new_branch,
        resolved_source_branch.as_deref(),
    )
    .map_err(|e| format!("Failed to create workspace: {}", e))?;

    let workspace_id = local_db::add_workspace(
        repo_path,
        workspace_path.to_string(),
        workspace_path.to_string(),
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
