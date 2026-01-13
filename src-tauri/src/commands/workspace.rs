use crate::jj::{self, JjRebaseResult};
use crate::local_db::{self, Workspace};
use crate::AppState;
use std::collections::HashSet;
use std::path::Path;
use std::sync::{Mutex, OnceLock};
use tauri::State;

// Track which workspaces have been indexed this session
static INDEXED_WORKSPACES: OnceLock<Mutex<HashSet<String>>> = OnceLock::new();

#[tauri::command]
pub fn get_workspaces(repo_path: String) -> Result<Vec<Workspace>, String> {
    // Auto-recover stale workspaces when loading a repo
    match check_and_update_stale_workspaces(repo_path.clone()) {
        Ok(updated) if !updated.is_empty() => {
            log::info!(
                "Auto-recovered {} stale workspace(s) on repo open: {:?}",
                updated.len(),
                updated
            );
        }
        Err(e) => {
            log::warn!("Failed to check/update stale workspaces: {}", e);
            // Don't fail the repo open operation
        }
        _ => {} // No stale workspaces found
    }

    local_db::get_workspaces(&repo_path)
}

#[tauri::command]
pub fn add_workspace_to_db(
    repo_path: String,
    workspace_name: String,
    workspace_path: String,
    branch_name: String,
    metadata: Option<String>,
) -> Result<i64, String> {
    local_db::add_workspace(
        &repo_path,
        workspace_name,
        workspace_path,
        branch_name,
        metadata,
    )
}

/// Combined command: creates jj workspace + adds to database atomically
#[tauri::command]
pub fn create_workspace(
    state: State<AppState>,
    repo_path: String,
    branch_name: String,
    new_branch: bool,
    source_branch: Option<String>,
    metadata: Option<String>,
) -> Result<i64, String> {
    // Load inclusion patterns from database
    let inclusion_patterns = {
        let db = state.db.lock().unwrap();
        db.get_repo_setting(&repo_path, "included_copy_files")
            .ok()
            .flatten()
            .map(|patterns_str| {
                patterns_str
                    .lines()
                    .map(|s| s.trim().to_string())
                    .filter(|s| !s.is_empty())
                    .collect::<Vec<String>>()
            })
    };

    // Create the jj workspace (returns sanitized workspace name)
    let workspace_name = jj::create_workspace(
        &repo_path,
        &branch_name, // Use branch name as workspace name
        &branch_name,
        new_branch,
        source_branch.as_deref(),
        inclusion_patterns,
    )
    .map_err(|e| e.to_string())?;

    // Derive workspace path
    let workspace_path = Path::new(&repo_path)
        .join(".treq")
        .join("workspaces")
        .join(&workspace_name)
        .to_string_lossy()
        .to_string();

    // Add to database
    let workspace_id = local_db::add_workspace(
        &repo_path,
        workspace_name,
        workspace_path,
        branch_name,
        metadata,
    )?;

    // Initialize rebase flag to empty string (will trigger rebase on first view)
    local_db::update_workspace_last_rebased_commit(
        &repo_path,
        workspace_id,
        "",  // Empty = will trigger rebase
    )?;

    Ok(workspace_id)
}

#[tauri::command]
pub fn delete_workspace_from_db(repo_path: String, id: i64) -> Result<(), String> {
    // Cascade delete sessions (handled by DB foreign key constraint)
    local_db::delete_workspace(&repo_path, id)
}

/// Unified delete workspace command that handles both filesystem and DB cleanup
/// This is the new recommended way to delete workspaces - it ensures cleanup happens
/// even if individual steps fail
#[tauri::command]
pub fn delete_workspace(repo_path: String, workspace_path: String, id: i64) -> Result<(), String> {
    // Step 1: Try to remove workspace files (best effort - log but don't fail)
    if let Err(e) = jj::remove_workspace(&repo_path, &workspace_path) {
        eprintln!("Warning: Failed to remove workspace directory: {}", e);
        // Continue anyway - we still want to clean up DB
    }

    // Step 2: Always delete from database (cascade deletes sessions via foreign key)
    local_db::delete_workspace(&repo_path, id)
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

        let dir_path_str = dir_path.to_string_lossy().to_string();

        // If this directory doesn't have a corresponding DB entry, it's stale
        if !db_workspace_paths.contains(&dir_path_str) {
            if let Err(e) = std::fs::remove_dir_all(&dir_path) {
                eprintln!(
                    "Warning: Failed to remove stale workspace directory {}: {}",
                    dir_path_str, e
                );
            } else {
                println!("Cleaned up stale workspace directory: {}", dir_path_str);
            }
        }
    }

    Ok(())
}

/// Check all workspaces in a repo and update any with stale working copies
/// Returns list of workspace names that were updated
/// Called automatically when a repo is opened, or manually via UI command
pub fn check_and_update_stale_workspaces(
    repo_path: String,
) -> Result<Vec<String>, String> {
    let workspaces = local_db::get_workspaces(&repo_path)?;
    let mut updated_workspaces = Vec::new();

    for workspace in workspaces {
        match jj::is_workspace_stale(&workspace.workspace_path) {
            Ok(true) => {
                // Workspace is stale, try to update it
                match jj::jj_workspace_update_stale(&workspace.workspace_path) {
                    Ok(msg) => {
                        log::info!(
                            "Updated stale workspace '{}': {}",
                            workspace.workspace_name,
                            msg
                        );
                        updated_workspaces.push(workspace.workspace_name);
                    }
                    Err(e) => {
                        log::warn!(
                            "Failed to update stale workspace '{}': {}",
                            workspace.workspace_name,
                            e
                        );
                        // Continue with other workspaces even if one fails
                    }
                }
            }
            Ok(false) => {
                // Not stale, skip
            }
            Err(e) => {
                log::warn!(
                    "Failed to check staleness for workspace '{}': {}",
                    workspace.workspace_name,
                    e
                );
                // Continue with other workspaces
            }
        }
    }

    Ok(updated_workspaces)
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
pub fn update_workspace_conflicts(
    repo_path: String,
    workspace_id: i64,
    has_conflicts: bool,
) -> Result<(), String> {
    local_db::update_workspace_has_conflicts(&repo_path, workspace_id, has_conflicts)
}

/// Get list of workspace IDs that currently have conflicts
/// Checks directly against jj, does not use stale database state
#[tauri::command]
pub fn list_conflicted_workspace_ids(repo_path: String) -> Result<Vec<i64>, String> {
    let workspaces = local_db::get_workspaces(&repo_path)?;
    let mut conflicted_ids = Vec::new();

    for workspace in workspaces {
        // Check actual conflict status from jj directly
        let conflicted_files = jj::get_conflicted_files(
            &workspace.workspace_path,
            workspace.target_branch.as_deref()
        ).unwrap_or_default();

        if !conflicted_files.is_empty() {
            conflicted_ids.push(workspace.id);
        }
    }

    Ok(conflicted_ids)
}

/// Get list of workspace IDs that currently have uncommitted changes
/// Checks directly against jj, does not use stale database state
#[tauri::command]
pub fn list_workspaces_with_changes(repo_path: String) -> Result<Vec<i64>, String> {
    let workspaces = local_db::get_workspaces(&repo_path)?;
    let mut changed_ids = Vec::new();

    for workspace in workspaces {
        // Check actual change status from jj directly
        let changed_files = jj::jj_get_changed_files(&workspace.workspace_path)
            .unwrap_or_default();

        if !changed_files.is_empty() {
            changed_ids.push(workspace.id);
        }
    }

    Ok(changed_ids)
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
    repo_path: String,
    workspace_path: String,
    id: i64,
    target_branch: String,
) -> Result<JjRebaseResult, String> {
    // Convert Git remote branch format (origin/main) to jj format (main@origin)
    let jj_branch_name = crate::jj::convert_git_branch_to_jj_format_public(&target_branch, &repo_path);

    // Perform rebase
    let rebase_result =
        jj::jj_rebase_onto(&workspace_path, &jj_branch_name).map_err(|e| e.to_string())?;

    // If rebase succeeded, save the target branch (in Git format for UI)
    if rebase_result.success {
        local_db::update_workspace_target_branch(&repo_path, id, &target_branch)?;

        // Check for conflicts after rebase and update status in database
        let conflicted_files = jj::get_conflicted_files(&workspace_path, Some(&target_branch)).unwrap_or_default();
        local_db::update_workspace_has_conflicts(&repo_path, id, !conflicted_files.is_empty())?;
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
    repo_path: String,
    workspace_id: Option<i64>,
    default_branch: Option<String>,
    force: Option<bool>,
) -> Result<SingleRebaseResult, String> {
    // If workspace_id provided, only rebase that workspace
    if let Some(id) = workspace_id {
        let default_branch = default_branch.unwrap_or_else(|| "main".to_string());
        let force = force.unwrap_or(false);
        let result = crate::auto_rebase::rebase_single_workspace(&repo_path, id, &default_branch, force)?;

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
        let results = crate::auto_rebase::check_and_rebase_all(&repo_path)?;

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

    // New tests for unified delete_workspace command
    #[test]
    fn test_delete_workspace_removes_directory_and_db_entry() {
        use crate::local_db;

        // Setup: Create a temp directory with a fake workspace
        let temp_dir = TempDir::new().unwrap();
        let repo_path = temp_dir.path().to_str().unwrap();
        let workspace_dir = temp_dir.path().join("test_workspace");
        fs::create_dir_all(&workspace_dir).unwrap();
        let workspace_path = workspace_dir.to_str().unwrap().to_string();

        // Create a test file to ensure directory removal is tested
        let test_file = workspace_dir.join("test.txt");
        fs::write(&test_file, "test").unwrap();

        // Setup: Initialize database and add workspace
        let db_path = temp_dir.path().join(".treq").join("local.db");
        fs::create_dir_all(db_path.parent().unwrap()).unwrap();

        // Add workspace to DB
        local_db::add_workspace(
            repo_path,
            "test".to_string(),
            workspace_path.clone(),
            "test-branch".to_string(),
            None,
        ).unwrap();

        // Get the workspace ID
        let workspaces = local_db::get_workspaces(repo_path).unwrap();
        assert_eq!(workspaces.len(), 1);
        let workspace_id = workspaces[0].id;

        // Act: Delete the workspace
        let result = delete_workspace(
            repo_path.to_string(),
            workspace_path.clone(),
            workspace_id,
        );

        // Assert: Should succeed
        assert!(result.is_ok(), "delete_workspace should succeed: {:?}", result);

        // Assert: Directory should be removed
        assert!(!workspace_dir.exists(), "Workspace directory should be removed");

        // Assert: DB entry should be removed
        let workspaces_after = local_db::get_workspaces(repo_path).unwrap();
        assert_eq!(workspaces_after.len(), 0, "Workspace should be removed from database");
    }

    #[test]
    fn test_delete_workspace_removes_db_even_if_directory_missing() {
        use crate::local_db;

        // Setup: Create a temp directory for the repo
        let temp_dir = TempDir::new().unwrap();
        let repo_path = temp_dir.path().to_str().unwrap();

        // Don't create the workspace directory (simulating already deleted or never created)
        let workspace_path = temp_dir.path().join("nonexistent_workspace").to_str().unwrap().to_string();

        // Setup: Initialize database and add workspace (orphaned entry)
        let db_path = temp_dir.path().join(".treq").join("local.db");
        fs::create_dir_all(db_path.parent().unwrap()).unwrap();

        local_db::add_workspace(
            repo_path,
            "test".to_string(),
            workspace_path.clone(),
            "test-branch".to_string(),
            None,
        ).unwrap();

        let workspaces = local_db::get_workspaces(repo_path).unwrap();
        assert_eq!(workspaces.len(), 1);
        let workspace_id = workspaces[0].id;

        // Act: Delete the workspace (directory doesn't exist)
        let result = delete_workspace(
            repo_path.to_string(),
            workspace_path,
            workspace_id,
        );

        // Assert: Should still succeed
        assert!(result.is_ok(), "delete_workspace should succeed even when directory missing: {:?}", result);

        // Assert: DB entry should be removed
        let workspaces_after = local_db::get_workspaces(repo_path).unwrap();
        assert_eq!(workspaces_after.len(), 0, "Workspace should be removed from database even if directory was missing");
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
            workspace1_dir.to_str().unwrap().to_string(),
            "branch1".to_string(),
            None,
        ).unwrap();

        // Verify all 3 directories exist before cleanup
        assert!(workspace1_dir.exists(), "workspace1 should exist");
        assert!(workspace2_dir.exists(), "workspace2 should exist");
        assert!(workspace3_dir.exists(), "workspace3 should exist");

        // Act: Clean up stale workspaces
        let result = cleanup_stale_workspaces(repo_path.to_string());

        // Assert: Should succeed
        assert!(result.is_ok(), "cleanup should succeed: {:?}", result);

        // Assert: workspace1 (in DB) should still exist
        assert!(workspace1_dir.exists(), "workspace1 should still exist (it's in DB)");

        // Assert: workspace2 and workspace3 (not in DB) should be removed
        assert!(!workspace2_dir.exists(), "workspace2 should be removed (stale)");
        assert!(!workspace3_dir.exists(), "workspace3 should be removed (stale)");
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
        assert!(result.is_ok(), "cleanup should succeed with empty directory: {:?}", result);
    }

    #[test]
    fn test_cleanup_stale_workspaces_handles_missing_workspaces_dir() {
        // Setup: Create temp directory without workspaces dir
        let temp_dir = TempDir::new().unwrap();
        let repo_path = temp_dir.path().to_str().unwrap();

        // Act: Clean up when workspaces dir doesn't exist
        let result = cleanup_stale_workspaces(repo_path.to_string());

        // Assert: Should succeed gracefully
        assert!(result.is_ok(), "cleanup should succeed when workspaces dir missing: {:?}", result);
    }
}
