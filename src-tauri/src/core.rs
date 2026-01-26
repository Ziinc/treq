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
    let branches =
        jj::get_branches(repo_path).map_err(|e| format!("Failed to get branches: {}", e))?;

    let branch_exists: bool = branches.iter().any(|b| b.name == branch_name);
    let new_branch: bool = !branch_exists;
    let workspace_path = jj::create_workspace(
        repo_path,
        branch_name,
        branch_name,
        new_branch,
        source_branch,
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
        .map_err(|e| format!("Failed to get workspaces from db: {}", e));
    match workspaces {
        Ok(workspaces) => Ok(workspaces),
        _ => Err(format!("Failed to get workspaces from db")),
    }
}

pub fn stack_workspace(
    repo_path: &str,
    source_branch: Option<&str>,
    target_branch: Option<&str>,
) -> Result<local_db::Workspace, String> {
    let base = match source_branch {
        Some(branch) => branch.to_string(),
        None => "main".to_string(),
    };

    let target = match target_branch {
        Some(branch) => branch.to_string(),
        None => format!("{}-1", base),
    };

    return create_workspace(repo_path, &target, None, Some(&base));
}
