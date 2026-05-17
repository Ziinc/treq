use crate::{jj, local_db};
use std::path::Path;

fn resolve_workspace_dir(repo_path: &str, workspace_id: Option<i64>) -> Result<String, String> {
    match workspace_id {
        Some(id) => {
            let workspace = local_db::get_workspace_by_id(repo_path, id)
                .map_err(|e| format!("Failed to get workspace: {}", e))?
                .ok_or_else(|| format!("Workspace not found: {}", id))?;
            Ok(Path::new(repo_path)
                .join(".treq")
                .join("workspaces")
                .join(&workspace.workspace_path)
                .to_str()
                .ok_or("Invalid workspace path")?
                .to_string())
        }
        None => Ok(repo_path.to_string()),
    }
}

/// List changed files for a workspace (or the home repo when workspace_id is None).
pub fn list_changed_files(
    repo_path: &str,
    workspace_id: Option<i64>,
) -> Result<Vec<jj::JjFileChange>, String> {
    let path = resolve_workspace_dir(repo_path, workspace_id)?;
    jj::jj_get_changed_files(&path).map_err(|e| format!("Failed to list changed files: {}", e))
}

/// List conflicted files for a workspace (or home repo when workspace_id is None).
pub fn list_conflicted_files(
    repo_path: &str,
    workspace_id: Option<i64>,
) -> Result<Vec<String>, String> {
    let path = resolve_workspace_dir(repo_path, workspace_id)?;
    jj::get_conflicted_files(&path, None)
        .map_err(|e| format!("Failed to list conflicted files: {}", e))
}

/// Get diff hunks for a single file in a workspace.
pub fn list_file_hunks(
    repo_path: &str,
    workspace_id: Option<i64>,
    file_path: &str,
    conflict_marker_style: &str,
) -> Result<Vec<jj::JjDiffHunk>, String> {
    let path = resolve_workspace_dir(repo_path, workspace_id)?;
    jj::jj_get_file_hunks(&path, file_path, conflict_marker_style)
        .map_err(|e| format!("Failed to get file hunks: {}", e))
}

/// Get lines from a file in a workspace.
pub fn get_file_lines(
    repo_path: &str,
    workspace_id: Option<i64>,
    file_path: &str,
    from_parent: bool,
    start_line: usize,
    end_line: usize,
) -> Result<jj::JjFileLines, String> {
    let path = resolve_workspace_dir(repo_path, workspace_id)?;
    jj::jj_get_file_lines(&path, file_path, from_parent, start_line, end_line)
        .map_err(|e| format!("Failed to get file lines: {}", e))
}
