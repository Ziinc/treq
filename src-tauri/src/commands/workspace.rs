use crate::jj::{self, JjRebaseResult};
use crate::local_db::{self, Workspace};
use crate::AppState;
use serde_json;
use std::collections::HashSet;
use std::sync::{Mutex, OnceLock};
use tauri::State;

// Track which workspaces have been indexed this session
static INDEXED_WORKSPACES: OnceLock<Mutex<HashSet<String>>> = OnceLock::new();

#[tauri::command]
pub fn get_repo_branch(repo_path: String) -> Result<crate::core::RepoBranch, String> {
    crate::core::get_repo_branch(&repo_path)
}

#[tauri::command]
pub fn get_workspace_changed_files(
    repo_path: String,
    workspace_id: Option<i64>,
) -> Result<Vec<crate::jj::JjFileChange>, String> {
    crate::core::list_changed_files(&repo_path, workspace_id)
}

#[tauri::command]
pub fn get_workspaces(repo_path: String) -> Result<Vec<Workspace>, String> {
    crate::core::list_workspaces(&repo_path)
}

/// Combined command: creates jj workspace + adds to database atomically
/// Delegates to core::create_workspace() for all workspace creation logic
#[tauri::command]
pub fn create_workspace(
    state: State<AppState>,
    repo_path: String,
    branch_name: String,
    source_branch: Option<String>,
    metadata: Option<String>,
) -> Result<i64, String> {
    // Parse metadata JSON to extract intent and moved_files fields directly
    let (intent, moved_files) = metadata
        .and_then(|m| {
            serde_json::from_str::<serde_json::Value>(&m)
                .ok()
                .and_then(|obj| {
                    let intent = obj.get("intent").and_then(|v| v.as_str()).map(String::from);
                    let moved_files =
                        obj.get("moved_files")
                            .and_then(|v| v.as_array())
                            .map(|arr| {
                                arr.iter()
                                    .filter_map(|v| v.as_str().map(String::from))
                                    .collect::<Vec<_>>()
                            });
                    // Only return Some if moved_files has actual items
                    let moved_files = moved_files.filter(|v| !v.is_empty());
                    Some((intent, moved_files))
                })
        })
        .unwrap_or((None, None));

    // Read included_copy_files setting from DB
    let included_copy_files = {
        let db = state.db.lock().unwrap();
        db.get_repo_setting(&repo_path, "included_copy_files")
            .ok()
            .flatten()
            .map(|s| {
                s.lines()
                    .map(|l| l.trim().to_string())
                    .filter(|l| !l.is_empty())
                    .collect::<Vec<_>>()
            })
    };

    // Delegate to core layer for all workspace creation
    let workspace = crate::core::create_workspace(
        &repo_path,
        &branch_name,
        intent,
        moved_files,
        source_branch.as_deref(),
        included_copy_files,
    )?;

    // Initialize rebase flag to trigger rebase on first view
    local_db::update_workspace_last_rebased_commit(&repo_path, workspace.id, "")?;

    Ok(workspace.id)
}

/// Unified delete workspace command that handles both filesystem and DB cleanup
/// Delegates to core::delete_workspace which correctly constructs the full workspace path
#[tauri::command]
pub fn delete_workspace(repo_path: String, id: i64) -> Result<(), String> {
    crate::core::delete_workspace(&repo_path, &id).map(|_| ())
}

/// Push workspace to remote and update not_on_remote flag
#[tauri::command]
pub fn push_workspace_to_remote(
    repo_path: String,
    workspace_id: Option<i64>,
) -> Result<String, String> {
    crate::core::push_workspace_to_remote(&repo_path, workspace_id)
}

/// Merge a workspace into its target branch with a specified merge strategy
#[tauri::command]
pub fn merge_workspace(
    repo_path: String,
    workspace_id: i64,
    message: String,
    merge_strategy: String,
) -> Result<(), String> {
    use crate::core::MergeCommit;

    // Convert string to enum
    let strategy = match merge_strategy.as_str() {
        "merge" => MergeCommit::Merge,
        "squash" => MergeCommit::Squash,
        "rebase" => MergeCommit::Rebase,
        _ => return Err(format!("Invalid merge strategy: {}", merge_strategy)),
    };

    crate::core::merge_workspace(&repo_path, workspace_id, &message, strategy)
}

#[tauri::command]
pub fn get_workspace_status(
    repo_path: String,
    workspace_id: Option<i64>,
) -> Result<crate::core::WorkspaceStatus, String> {
    crate::core::workspace_status(&repo_path, workspace_id)
}

#[tauri::command]
pub fn list_workspace_statuses(
    repo_path: String,
) -> Result<Vec<crate::core::WorkspaceSidebarStatus>, String> {
    crate::core::list_workspace_statuses(&repo_path)
}

#[tauri::command]
pub fn ensure_workspace_indexed(
    repo_path: String,
    workspace_id: Option<i64>,
    workspace_path: String,
) -> Result<bool, String> {
    let indexed = INDEXED_WORKSPACES.get_or_init(|| Mutex::new(HashSet::new()));
    let mut guard = indexed.lock().unwrap();

    // Use workspace_path as the key
    if guard.contains(&workspace_path) {
        // Already indexed this session
        return Ok(false);
    }

    // Mark as indexed
    guard.insert(workspace_path.clone());
    drop(guard);

    // Trigger indexing
    crate::file_indexer::index_workspace_files(&repo_path, workspace_id, &workspace_path)?;

    Ok(true)
}

#[tauri::command]
pub fn update_workspace(
    repo_path: String,
    workspace_id: i64,
    target_branch: Option<String>,
    intent: Option<String>,
) -> Result<Workspace, String> {
    use crate::core::MaybeEmptyParam;

    let tb = match target_branch {
        Some(s) if s.is_empty() => MaybeEmptyParam::EmptyValue,
        Some(s) => MaybeEmptyParam::Some(s),
        None => MaybeEmptyParam::Omitted,
    };
    let int = match intent {
        Some(s) if s.is_empty() => MaybeEmptyParam::EmptyValue,
        Some(s) => MaybeEmptyParam::Some(s),
        None => MaybeEmptyParam::Omitted,
    };
    crate::core::update_workspace(&repo_path, workspace_id, tb, int)
}

#[tauri::command]
pub fn set_workspace_target_branch(
    state: State<AppState>,
    repo_path: String,
    workspace_path: String,
    id: i64,
    target_branch: String,
) -> Result<JjRebaseResult, String> {
    eprintln!(
        "[set_workspace_target_branch] repo_path={}, workspace_path={}, id={}, target_branch={}",
        repo_path, workspace_path, id, target_branch
    );

    if !std::path::Path::new(&workspace_path).exists() {
        let _ = jj::reconcile_workspaces_with_jj(&repo_path);
    }

    // Validate workspace path exists
    if !std::path::Path::new(&workspace_path).exists() {
        return Err(format!(
            "Workspace directory is missing on disk and could not be recovered from JJ state: {}",
            workspace_path
        ));
    }

    let conflict_style = state
        .db
        .lock()
        .unwrap()
        .get_setting("conflict_marker_style")
        .ok()
        .flatten()
        .unwrap_or_else(|| "git".to_string());

    // Convert Git remote branch format (origin/main) to jj format (main@origin)
    let jj_target_branch =
        crate::jj::convert_git_branch_to_jj_format_public(&target_branch, &repo_path);

    // Use workspace branch name to build a precise revset that avoids immutable history.
    let workspace = local_db::get_workspace_by_id(&repo_path, id).map_err(|e| e.to_string())?;

    let rebase_result = if let Some(ws) = workspace {
        // Convert workspace branch name to jj format as well
        let jj_workspace_branch =
            crate::jj::convert_git_branch_to_jj_format_public(&ws.branch_name, &repo_path);

        // Rebase only mutable commits and exclude @ so working copy stays anchored to branch history.
        let revset = format!(
            "roots(mutable() & ({}..{}) ~ @)",
            jj_target_branch, jj_workspace_branch
        );
        jj::jj_rebase_with_revset(
            &workspace_path,
            &revset,
            &jj_target_branch,
            &jj_workspace_branch,
            &conflict_style,
        )
        .map_err(|e| e.to_string())?
    } else {
        // Fallback if workspace not found in DB
        jj::jj_rebase_onto(&workspace_path, &jj_target_branch, &conflict_style)
            .map_err(|e| e.to_string())?
    };

    // If rebase succeeded, save the target branch (in Git format for UI)
    if rebase_result.success {
        local_db::update_workspace_target_branch(&repo_path, id, &target_branch)?;
    }

    Ok(rebase_result)
}

#[tauri::command]
pub fn check_and_rebase_workspaces(
    state: State<AppState>,
    repo_path: String,
    workspace_id: Option<i64>,
    default_branch: Option<String>,
    force: Option<bool>,
) -> Result<crate::core::SingleRebaseResult, String> {
    let conflict_style = state
        .db
        .lock()
        .unwrap()
        .get_setting("conflict_marker_style")
        .ok()
        .flatten()
        .unwrap_or_else(|| "git".to_string());

    crate::core::check_and_rebase_workspaces(
        &repo_path,
        workspace_id,
        default_branch,
        force,
        &conflict_style,
    )
}

/// Pull workspace from remote, automatically resolving divergence
#[tauri::command]
pub fn pull_workspace_from_remote(
    state: State<AppState>,
    repo_path: String,
    workspace_id: Option<i64>,
) -> Result<crate::core::PullWorkspaceResult, String> {
    let conflict_style = state
        .db
        .lock()
        .unwrap()
        .get_setting("conflict_marker_style")
        .ok()
        .flatten()
        .unwrap_or_else(|| "git".to_string());

    crate::core::pull_workspace_from_remote(&repo_path, workspace_id, &conflict_style)
}

/// Resolve a conflicted bookmark by setting it to a user-selected revision
#[tauri::command]
pub fn resolve_workspace_bookmark_conflict(
    repo_path: String,
    workspace_id: i64,
    workspace_path: String,
    branch_name: String,
    revision_id: String,
) -> Result<JjRebaseResult, String> {
    if workspace_path.is_empty() {
        return Err("Workspace path does not exist".to_string());
    }

    jj::jj_set_bookmark(&workspace_path, &branch_name, &revision_id).map_err(|e| e.to_string())?;

    if let Err(e) =
        local_db::update_workspace_last_rebased_commit(&repo_path, workspace_id, &revision_id)
    {
        eprintln!(
            "Warning: Failed to update last rebased commit for workspace {}: {}",
            workspace_id, e
        );
    }

    if let Err(e) = jj::jj_workspace_update_stale(&workspace_path) {
        eprintln!(
            "Warning: Failed to refresh working copy after resolving bookmark conflict: {}",
            e
        );
    }

    Ok(JjRebaseResult {
        success: true,
        message: format!(
            "Bookmark '{}' now points to revision {}",
            branch_name, revision_id
        ),
    })
}

/// Rename a workspace's branch/bookmark.
/// Supports dry_run mode for validation without performing the rename.
#[tauri::command]
pub fn rename_workspace(
    repo_path: String,
    workspace_id: i64,
    new_branch_name: String,
    dry_run: bool,
) -> Result<crate::core::RenameWorkspaceResult, String> {
    crate::core::rename_workspace(&repo_path, workspace_id, &new_branch_name, dry_run)
}

/// Split a workspace by moving or copying files/commits to a new workspace.
/// Delegates to core::split_workspace() for all logic.
#[tauri::command]
pub fn split_workspace(
    repo_path: String,
    workspace_id: i64,
    branch_name: String,
    intent: Option<String>,
    file_paths: Option<Vec<String>>,
    commit_ids: Option<Vec<String>>,
    mode: String,
    position: String,
) -> Result<i64, String> {
    use crate::core::{SplitMode, SplitPosition};

    let mode = match mode.as_str() {
        "copy" => SplitMode::Copy,
        _ => SplitMode::Move,
    };
    let position = match position.as_str() {
        "before" => SplitPosition::Before,
        _ => SplitPosition::After,
    };

    let workspace = crate::core::split_workspace(
        &repo_path,
        workspace_id,
        &branch_name,
        intent,
        file_paths,
        commit_ids,
        mode,
        position,
    )?;

    Ok(workspace.id)
}

#[tauri::command]
pub fn move_commit_to_existing_workspace(
    repo_path: String,
    source_workspace_id: i64,
    commit_change_id: String,
    target_workspace_id: i64,
) -> Result<(), String> {
    crate::core::move_commit_to_existing_workspace(
        &repo_path,
        source_workspace_id,
        &commit_change_id,
        target_workspace_id,
    )
}

#[tauri::command]
pub fn abandon_commit(
    repo_path: String,
    workspace_id: i64,
    commit_change_id: String,
) -> Result<(), String> {
    crate::core::abandon_commit(&repo_path, workspace_id, &commit_change_id)
}

#[cfg(test)]
mod tests {
    use super::*;
    // TODO: Add unit tests when a mockable workspace DB abstraction exists.
    use std::fs;
    use tempfile::TempDir;

    // Unit tests cover DB cleanup only; full jj+directory cleanup is e2e-tested.
    #[test]
    fn test_delete_workspace_cleans_up_db_entry() {
        use crate::local_db;

        // Setup: Create a temp directory with a fake workspace under .treq/workspaces/
        let temp_dir = TempDir::new().unwrap();
        let repo_path = temp_dir.path().to_str().unwrap();
        let workspaces_dir = temp_dir.path().join(".treq").join("workspaces");
        let workspace_dir = workspaces_dir.join("test_workspace");
        fs::create_dir_all(&workspace_dir).unwrap();

        // Add workspace to DB with just the directory name (matching production behavior)
        local_db::add_workspace(
            repo_path,
            "test".to_string(),
            "test_workspace".to_string(),
            "test-branch".to_string(),
            None,
            None,
        )
        .unwrap();

        // Get the workspace ID
        let workspaces = local_db::get_workspaces(repo_path).unwrap();
        assert_eq!(workspaces.len(), 1);
        let workspace_id = workspaces[0].id;

        // Act: delete workspace; jj forget is expected best-effort without a real jj repo.
        let result = delete_workspace(repo_path.to_string(), workspace_id);

        // Assert: Should succeed (jj errors are non-fatal)
        assert!(
            result.is_ok(),
            "delete_workspace should succeed: {:?}",
            result
        );

        // Assert: DB entry should be removed
        let workspaces_after = local_db::get_workspaces(repo_path).unwrap();
        assert_eq!(
            workspaces_after.len(),
            0,
            "Workspace should be removed from database"
        );
    }

    #[test]
    fn test_delete_workspace_removes_db_even_if_directory_missing() {
        use crate::local_db;

        // Setup: Create a temp directory for the repo
        let temp_dir = TempDir::new().unwrap();
        let repo_path = temp_dir.path().to_str().unwrap();

        // Create .treq/workspaces/ but NOT the workspace directory itself
        let workspaces_dir = temp_dir.path().join(".treq").join("workspaces");
        fs::create_dir_all(&workspaces_dir).unwrap();

        // Add workspace to DB with just the directory name (orphaned entry - directory doesn't exist)
        local_db::add_workspace(
            repo_path,
            "test".to_string(),
            "nonexistent_workspace".to_string(),
            "test-branch".to_string(),
            None,
            None,
        )
        .unwrap();

        let workspaces = local_db::get_workspaces(repo_path).unwrap();
        assert_eq!(workspaces.len(), 1);
        let workspace_id = workspaces[0].id;

        // Act: Delete the workspace (directory doesn't exist)
        let result = delete_workspace(repo_path.to_string(), workspace_id);

        // Assert: Should still succeed (core::delete_workspace handles missing directories)
        assert!(
            result.is_ok(),
            "delete_workspace should succeed even when directory missing: {:?}",
            result
        );

        // Assert: DB entry should be removed
        let workspaces_after = local_db::get_workspaces(repo_path).unwrap();
        assert_eq!(
            workspaces_after.len(),
            0,
            "Workspace should be removed from database even if directory was missing"
        );
    }
}
