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
pub fn get_workspaces(repo_path: String) -> Result<Vec<Workspace>, String> {
    crate::core::list_workspaces(&repo_path)
}

#[tauri::command]
pub fn add_workspace_to_db(
    repo_path: String,
    workspace_name: String,
    workspace_path: String,
    branch_name: String,
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

    local_db::add_workspace(
        &repo_path,
        workspace_name,
        workspace_path,
        branch_name,
        intent,
        moved_files,
    )
}

/// Combined command: creates jj workspace + adds to database atomically
/// Delegates to core::create_workspace() for all workspace creation logic
#[tauri::command]
pub fn create_workspace(
    _state: State<AppState>,
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

    // Delegate to core layer for all workspace creation
    let workspace = crate::core::create_workspace(
        &repo_path,
        &branch_name,
        intent,
        moved_files,
        source_branch.as_deref(),
    )?;

    // Initialize rebase flag to trigger rebase on first view
    local_db::update_workspace_last_rebased_commit(&repo_path, workspace.id, "")?;

    Ok(workspace.id)
}

#[tauri::command]
pub fn delete_workspace_from_db(repo_path: String, id: i64) -> Result<(), String> {
    // Cascade delete sessions (handled by DB foreign key constraint)
    local_db::delete_workspace(&repo_path, id)
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

/// Clean up stale workspace directories that don't have corresponding database entries
/// This should be called on app startup to clean up any orphaned directories
#[tauri::command]
pub fn cleanup_stale_workspaces(repo_path: String) -> Result<(), String> {
    use std::collections::HashSet;
    use std::path::Path;

    let workspaces_dir = Path::new(&repo_path).join(".treq").join("workspaces");

    // If workspaces directory doesn't exist, nothing to clean up
    if !workspaces_dir.exists() {
        return Ok(());
    }

    // Get all workspace paths from database
    let db_workspaces = local_db::get_workspaces(&repo_path)
        .map_err(|e| format!("Failed to get workspaces from database: {}", e))?;

    let db_workspace_paths: HashSet<String> = db_workspaces
        .into_iter()
        .map(|w| w.workspace_path)
        .collect();

    // Iterate through directories in .treq/workspaces
    let entries = std::fs::read_dir(&workspaces_dir)
        .map_err(|e| format!("Failed to read workspaces directory: {}", e))?;

    for entry in entries {
        let entry = match entry {
            Ok(e) => e,
            Err(e) => {
                eprintln!("Warning: Failed to read directory entry: {}", e);
                continue;
            }
        };

        let dir_path = entry.path();
        if !dir_path.is_dir() {
            continue;
        }

        let dir_name = entry.file_name().to_string_lossy().to_string();

        // If this directory doesn't have a corresponding DB entry, it's stale
        if !db_workspace_paths.contains(&dir_name) {
            let dir_path_display = dir_path.display();
            if let Err(e) = std::fs::remove_dir_all(&dir_path) {
                eprintln!(
                    "Warning: Failed to remove stale workspace directory {}: {}",
                    dir_path_display, e
                );
            } else {
                println!("Cleaned up stale workspace directory: {}", dir_path_display);
            }
        }
    }

    Ok(())
}

#[tauri::command]
pub fn get_workspace_status(
    workspace_path: String,
) -> Result<crate::core::WorkspaceStatus, String> {
    crate::core::workspace_status(&workspace_path)
}

#[tauri::command]
pub fn rebuild_workspaces(repo_path: String) -> Result<Vec<Workspace>, String> {
    local_db::rebuild_workspaces_from_filesystem(&repo_path)
}

#[tauri::command]
pub fn update_workspace_metadata(
    repo_path: String,
    id: i64,
    metadata: String,
) -> Result<(), String> {
    local_db::update_workspace_metadata(&repo_path, id, &metadata)
}

#[tauri::command]
pub fn update_workspace_not_on_remote(
    repo_path: String,
    workspace_id: i64,
    not_on_remote: bool,
) -> Result<(), String> {
    local_db::update_workspace_not_on_remote(&repo_path, workspace_id, not_on_remote)
}

#[tauri::command]
pub fn list_workspace_statuses(
    repo_path: String,
) -> Result<Vec<crate::core::WorkspacePartialStatus>, String> {
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

    // Validate workspace path exists
    if !std::path::Path::new(&workspace_path).exists() {
        return Err(format!(
            "Workspace path does not exist: {}. This likely means a short workspace name was passed instead of the full path.",
            workspace_path
        ));
    }

    let conflict_style = state.db.lock().unwrap()
        .get_setting("conflict_marker_style")
        .ok().flatten()
        .unwrap_or_else(|| "git".to_string());

    // Convert Git remote branch format (origin/main) to jj format (main@origin)
    let jj_branch_name =
        crate::jj::convert_git_branch_to_jj_format_public(&target_branch, &repo_path);

    // Perform rebase
    let rebase_result =
        jj::jj_rebase_onto(&workspace_path, &jj_branch_name, &conflict_style).map_err(|e| e.to_string())?;

    // If rebase succeeded, save the target branch (in Git format for UI)
    if rebase_result.success {
        local_db::update_workspace_target_branch(&repo_path, id, &target_branch)?;
    }

    Ok(rebase_result)
}

/// Result structure for single workspace rebase (serializable for frontend)
#[derive(serde::Serialize)]
pub struct SingleRebaseResult {
    pub rebased: bool,
    pub success: bool,
    pub message: String,
}

#[tauri::command]
pub fn check_and_rebase_workspaces(
    state: State<AppState>,
    repo_path: String,
    workspace_id: Option<i64>,
    default_branch: Option<String>,
    force: Option<bool>,
) -> Result<SingleRebaseResult, String> {
    let conflict_style = state.db.lock().unwrap()
        .get_setting("conflict_marker_style")
        .ok().flatten()
        .unwrap_or_else(|| "git".to_string());

    // If workspace_id provided, only rebase that workspace
    if let Some(id) = workspace_id {
        let default_branch = default_branch.unwrap_or_else(|| "main".to_string());
        let force = force.unwrap_or(false);
        let result =
            crate::auto_rebase::rebase_single_workspace(&repo_path, id, &default_branch, force, &conflict_style)?;

        match result {
            Some(auto_result) => Ok(SingleRebaseResult {
                rebased: true,
                success: auto_result.rebase_result.success,
                message: auto_result.rebase_result.message,
            }),
            None => Ok(SingleRebaseResult {
                rebased: false,
                success: true,
                message: "No rebase needed".to_string(),
            }),
        }
    } else {
        // Existing behavior: rebase all workspaces
        let results = crate::auto_rebase::check_and_rebase_all(&repo_path, &conflict_style)?;

        // Aggregate results
        let rebased_count: usize = results.iter().map(|r| r.workspaces_rebased.len()).sum();
        let all_success = results.iter().all(|r| r.rebase_result.success);

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
        })
    }
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

#[cfg(test)]
mod tests {
    use super::*;
    // TODO: Fix these broken tests - MockWorkspaceDb doesn't exist yet
    // use crate::local_db::{MockWorkspaceDb, WorkspaceDb};
    // use mockall::predicate::*;
    use std::fs;
    use tempfile::TempDir;

    /* Commented out - needs proper mocking setup
    #[test]
    fn test_create_workspace_adds_to_db() {
        // Setup temp directory to simulate repo
        let temp_dir = TempDir::new().unwrap();
        let repo_path = temp_dir.path().to_str().unwrap().to_string();

        // Create workspace directory (simulating jj::create_workspace success)
        let workspace_name = "test-workspace";
        let workspace_dir = temp_dir
            .path()
            .join(".treq")
            .join("workspaces")
            .join(workspace_name);
        fs::create_dir_all(&workspace_dir).unwrap();
        let workspace_path = workspace_dir.to_str().unwrap().to_string();

        // Verify directory exists
        assert!(
            workspace_dir.exists(),
            "Workspace directory should be created"
        );

        // Setup mock expectations
        let mut mock_db = MockWorkspaceDb::new();
        mock_db
            .expect_add_workspace()
            .with(
                eq(repo_path.clone()),
                eq(workspace_name.to_string()),
                eq(workspace_path.clone()),
                eq("test-branch".to_string()),
                eq(Some(r#"{"intent":"test"}"#.to_string())),
            )
            .times(1)
            .returning(|_, _, _, _, _| Ok(1));

        // Verify add_workspace is called with correct params
        let result = mock_db.add_workspace(
            &repo_path,
            workspace_name.to_string(),
            workspace_path.clone(),
            "test-branch".to_string(),
            Some(r#"{"intent":"test"}"#.to_string()),
        );

        assert!(result.is_ok());
        assert_eq!(result.unwrap(), 1);

        // Verify workspace can be retrieved
        mock_db
            .expect_get_workspaces()
            .with(eq(repo_path.clone()))
            .times(1)
            .returning(move |repo| {
                Ok(vec![Workspace {
                    id: 1,
                    repo_path: repo.to_string(),
                    workspace_name: "test-workspace".to_string(),
                    workspace_path: workspace_path.clone(),
                    branch_name: "test-branch".to_string(),
                    created_at: "2024-01-01T00:00:00Z".to_string(),
                    metadata: Some(r#"{"intent":"test"}"#.to_string()),
                    target_branch: None,
                    has_conflicts: false,
                }])
            });

        let workspaces = mock_db.get_workspaces(&repo_path).unwrap();
        assert_eq!(workspaces.len(), 1);
        assert_eq!(workspaces[0].workspace_name, "test-workspace");
    }

    #[test]
    fn test_create_workspace_fails_if_db_insert_fails() {
        let mut mock_db = MockWorkspaceDb::new();
        mock_db
            .expect_add_workspace()
            .returning(|_, _, _, _, _| Err("Database error".to_string()));

        let result = mock_db.add_workspace(
            "/fake/repo",
            "test".to_string(),
            "/fake/path".to_string(),
            "branch".to_string(),
            None,
        );

        assert!(result.is_err());
        assert_eq!(result.unwrap_err(), "Database error");
    }
    */

    // Unit tests for delete_workspace command (DB cleanup only - no jj repo).
    // Full directory + DB cleanup is tested in e2e test: test_can_delete_workspace
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

        // Act: Delete the workspace (delegates to core::delete_workspace)
        // Note: jj workspace forget will fail (no jj repo) but is best-effort
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

    #[test]
    fn test_cleanup_stale_workspaces_removes_orphaned_directories() {
        use crate::local_db;

        // Setup: Create temp directory with workspaces dir
        let temp_dir = TempDir::new().unwrap();
        let repo_path = temp_dir.path().to_str().unwrap();
        let workspaces_dir = temp_dir.path().join(".treq").join("workspaces");
        fs::create_dir_all(&workspaces_dir).unwrap();

        // Create 3 workspace directories
        let workspace1_dir = workspaces_dir.join("workspace1");
        let workspace2_dir = workspaces_dir.join("workspace2");
        let workspace3_dir = workspaces_dir.join("workspace3");

        fs::create_dir_all(&workspace1_dir).unwrap();
        fs::create_dir_all(&workspace2_dir).unwrap();
        fs::create_dir_all(&workspace3_dir).unwrap();

        // Add test files to ensure they need cleanup
        fs::write(workspace1_dir.join("test.txt"), "test").unwrap();
        fs::write(workspace2_dir.join("test.txt"), "test").unwrap();
        fs::write(workspace3_dir.join("test.txt"), "test").unwrap();

        // Initialize database and add only workspace1 to DB (workspace2 and workspace3 are stale)
        local_db::add_workspace(
            repo_path,
            "workspace1".to_string(),
            "workspace1".to_string(),
            "branch1".to_string(),
            None,
            None,
        )
        .unwrap();

        // Verify all 3 directories exist before cleanup
        assert!(workspace1_dir.exists(), "workspace1 should exist");
        assert!(workspace2_dir.exists(), "workspace2 should exist");
        assert!(workspace3_dir.exists(), "workspace3 should exist");

        // Act: Clean up stale workspaces
        let result = cleanup_stale_workspaces(repo_path.to_string());

        // Assert: Should succeed
        assert!(result.is_ok(), "cleanup should succeed: {:?}", result);

        // Assert: workspace1 (in DB) should still exist
        assert!(
            workspace1_dir.exists(),
            "workspace1 should still exist (it's in DB)"
        );

        // Assert: workspace2 and workspace3 (not in DB) should be removed
        assert!(
            !workspace2_dir.exists(),
            "workspace2 should be removed (stale)"
        );
        assert!(
            !workspace3_dir.exists(),
            "workspace3 should be removed (stale)"
        );
    }

    #[test]
    fn test_cleanup_stale_workspaces_handles_empty_workspaces_dir() {
        // Setup: Create temp directory with empty workspaces dir
        let temp_dir = TempDir::new().unwrap();
        let repo_path = temp_dir.path().to_str().unwrap();
        let workspaces_dir = temp_dir.path().join(".treq").join("workspaces");
        fs::create_dir_all(&workspaces_dir).unwrap();

        // Act: Clean up with no workspaces
        let result = cleanup_stale_workspaces(repo_path.to_string());

        // Assert: Should succeed with no errors
        assert!(
            result.is_ok(),
            "cleanup should succeed with empty directory: {:?}",
            result
        );
    }

    #[test]
    fn test_cleanup_stale_workspaces_handles_missing_workspaces_dir() {
        // Setup: Create temp directory without workspaces dir
        let temp_dir = TempDir::new().unwrap();
        let repo_path = temp_dir.path().to_str().unwrap();

        // Act: Clean up when workspaces dir doesn't exist
        let result = cleanup_stale_workspaces(repo_path.to_string());

        // Assert: Should succeed gracefully
        assert!(
            result.is_ok(),
            "cleanup should succeed when workspaces dir missing: {:?}",
            result
        );
    }
}
