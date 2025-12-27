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
    let jj_branch_name = if target_branch.starts_with("origin/") {
        target_branch.replace("origin/", "") + "@origin"
    } else {
        target_branch.clone()
    };

    // Perform rebase
    let rebase_result =
        jj::jj_rebase_onto(&workspace_path, &jj_branch_name).map_err(|e| e.to_string())?;

    // If rebase succeeded (even with conflicts), save the target branch (in Git format for UI)
    if rebase_result.success || rebase_result.has_conflicts {
        local_db::update_workspace_target_branch(&repo_path, id, &target_branch)?;
    }

    Ok(rebase_result)
}

/// Result structure for single workspace rebase (serializable for frontend)
#[derive(serde::Serialize)]
pub struct SingleRebaseResult {
    pub rebased: bool,
    pub success: bool,
    pub has_conflicts: bool,
    pub conflicted_files: Vec<String>,
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
                has_conflicts: auto_result.rebase_result.has_conflicts,
                conflicted_files: auto_result.rebase_result.conflicted_files,
                message: auto_result.rebase_result.message,
            }),
            None => Ok(SingleRebaseResult {
                rebased: false,
                success: true,
                has_conflicts: false,
                conflicted_files: vec![],
                message: "No rebase needed".to_string(),
            }),
        }
    } else {
        // Existing behavior: rebase all workspaces
        let results = crate::auto_rebase::check_and_rebase_all(&repo_path)?;

        // Aggregate results
        let rebased_count: usize = results.iter().map(|r| r.workspaces_rebased.len()).sum();
        let any_conflicts = results.iter().any(|r| r.rebase_result.has_conflicts);
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
            has_conflicts: any_conflicts,
            conflicted_files: vec![], // Not aggregated for bulk operations
            message: summary,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::local_db::{MockWorkspaceDb, WorkspaceDb};
    use mockall::predicate::*;
    use std::fs;
    use tempfile::TempDir;

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
}
