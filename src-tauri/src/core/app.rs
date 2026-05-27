use std::path::Path;

use crate::auto_rebase;
use crate::core::workspaces;
use crate::db::Database;
use crate::jj;
use crate::local_db;

fn full_workspace_path(repo_path: &str, workspace_path: &str) -> String {
    if workspace_path.starts_with('/') {
        workspace_path.to_string()
    } else {
        Path::new(repo_path)
            .join(".treq")
            .join("workspaces")
            .join(workspace_path)
            .to_string_lossy()
            .to_string()
    }
}

pub fn ensure_workspace_rebased(
    repo_path: &str,
    workspace_id: i64,
    conflict_style: &str,
) -> Result<bool, String> {
    let workspace = local_db::get_workspace_by_id(repo_path, workspace_id)?
        .ok_or_else(|| format!("Workspace {} not found", workspace_id))?;

    let target_branch = workspace
        .target_branch
        .clone()
        .unwrap_or_else(|| "main".to_string());

    if workspace.branch_name == target_branch {
        return Ok(false);
    }

    let workspace_full_path = full_workspace_path(repo_path, &workspace.workspace_path);
    let is_descendant = match jj::jj_workspace_parent_descends_from_target(
        &workspace_full_path,
        &workspace.branch_name,
        &target_branch,
    ) {
        Ok(value) => value,
        Err(jj::JjError::IoError(message))
            if message.contains("could not be resolved")
                || message.contains("did not resolve to a commit") =>
        {
            return Ok(false);
        }
        Err(err) => return Err(format!("Failed to check workspace ancestry: {}", err)),
    };

    if is_descendant {
        return Ok(false);
    }

    let result = auto_rebase::rebase_single_workspace(
        repo_path,
        workspace_id,
        "main",
        false,
        conflict_style,
    )?;
    Ok(result.is_some())
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
    db.init()
        .map_err(|e| format!("Failed to initialize database: {}", e))?;

    let workspaces_dir = Path::new(repo_path).join(".treq").join("workspaces");
    std::fs::create_dir_all(&workspaces_dir)
        .map_err(|e| format!("Failed to create workspaces directory: {}", e))?;

    match jj::ensure_jj_initialized(&db, repo_path) {
        Ok(_already_initialized) => {
            let _ = workspaces::sync_workspaces(repo_path);
            let conflict_style = super::resolve_conflict_marker_style_from_db(&db);
            if let Ok(all_workspaces) = local_db::get_workspaces(repo_path) {
                for workspace in all_workspaces {
                    if let Err(err) =
                        ensure_workspace_rebased(repo_path, workspace.id, &conflict_style)
                    {
                        eprintln!(
                            "Init rebase warning: workspace '{}' ({}) failed: {}",
                            workspace.workspace_name, workspace.id, err
                        );
                    }
                }
            }
            Ok(true)
        }
        Err(_) => Ok(false),
    }
}
