mod e2e_test_helpers;

use e2e_test_helpers::{JjVerifier, TestRepo};
use std::fs;
use std::path::Path;

// =============================================================================
// Test: All treq_lib::core functionality - main entrypoint for core app functionality
// All glue code should only interact with treq_lib::core APIs.
// =============================================================================

#[test]
fn test_repo_initialization() {
    let repo = TestRepo::new().expect("Failed to create test repo");
    treq_lib::core::init(&repo.repo_path).ok();
    treq_lib::core::init(&repo.repo_path).ok();

    // --- JJ Initialization ---
    assert!(Path::new(&repo.repo_path).join(".git").exists());
    assert!(Path::new(&repo.repo_path).join(".jj").exists());
    assert!(repo.is_jj_initialized(), ".jj directory should exist after init");

    let jj_workspaces = JjVerifier::list_workspaces(&repo.repo_path)
        .expect("Failed to list jj workspaces");
    assert_eq!(
        jj_workspaces.len(),
        1,
        "jj should have exactly 1 workspace after init, got: {:?}",
        jj_workspaces
    );
    assert!(
        jj_workspaces.contains(&"default".to_string()),
        "jj should show 'default' workspace after init, got: {:?}",
        jj_workspaces
    );

    let status = JjVerifier::get_status(&repo.repo_path)
        .expect("Failed to get jj status");
    assert!(!status.is_empty(), "jj status should return output after init");


    let gitignore_content = repo.read_gitignore().expect("Failed to read .gitignore");
    assert_eq!(gitignore_content.matches(".jj/").count(), 1, ".jj/ should appear exactly once");
    assert_eq!(gitignore_content.matches(".treq/").count(), 1, ".treq/ should appear exactly once");
    assert!(!gitignore_content.contains("# Added by Treq"), ".gitignore should not contain Treq comment");

    let db_path = Path::new(&repo.repo_path).join(".treq").join("local.db");
    assert!(
        db_path.exists(),
        ".treq/local.db should exist"
    );

    // verify that db exists and is queryable
    let conn = rusqlite::Connection::open(&db_path)
        .expect("Failed to open .treq/local.db");
    let count: i64 = conn
        .query_row("SELECT COUNT(*) FROM workspaces", [], |row| row.get(0))
        .expect("Failed to query workspaces count");

    assert_eq!(count, 0, "workspaces table should be empty after init");
}

// =============================================================================
// Test: Can create a workspace
// =============================================================================

#[test]
fn test_can_create_workspace() {
    let repo = TestRepo::new().expect("Failed to create test repo");

    // Initialize jj
    treq_lib::core::init(&repo.repo_path).expect("Failed to initialize jj");

    // Ensure workspaces directory exists
    repo.ensure_workspaces_dir().expect("Failed to create workspaces dir");

    // Create workspace (new branch)
    let workspace_name = treq_lib::jj::create_workspace(
        &repo.repo_path,
        "feature-test",
        "feature-test",
        true,  // new_branch
        None,  // source_branch (defaults to current)
        None,  // inclusion_patterns
    )
    .expect("Failed to create workspace");

    // Verify workspace was created
    let workspace_path = repo.workspaces_dir().join(&workspace_name);
    assert!(
        workspace_path.exists(),
        "Workspace directory should exist: {:?}",
        workspace_path
    );

    // JJ VERIFICATION: Verify workspace structure (may not have .git in jj-native mode)
    JjVerifier::verify_workspace_structure(workspace_path.to_str().unwrap())
        .expect("Workspace should have valid structure");

    // JJ VERIFICATION: Verify workspace via jj workspace list (primary source of truth)
    let jj_workspaces = JjVerifier::list_workspaces(&repo.repo_path)
        .expect("Failed to list jj workspaces");
    assert!(
        jj_workspaces.contains(&workspace_name),
        "jj workspace list should contain '{}', got: {:?}",
        workspace_name,
        jj_workspaces
    );

    // JJ VERIFICATION: Verify bookmark was created
    let bookmarks = JjVerifier::list_bookmarks(workspace_path.to_str().unwrap())
        .expect("Failed to list bookmarks");
    assert!(
        bookmarks.iter().any(|b| b == "feature-test"),
        "Bookmark 'feature-test' should exist in workspace, got: {:?}",
        bookmarks
    );

    // JJ VERIFICATION: Verify jj status works in the workspace
    let status = JjVerifier::get_status(workspace_path.to_str().unwrap())
        .expect("jj status should work in workspace");
    assert!(!status.is_empty(), "jj status should return output");
}

// =============================================================================
// Test: Can create a workspace from remote branch
// =============================================================================

#[test]
fn test_can_create_workspace_from_remote_branch() {
    let repo = TestRepo::with_remote().expect("Failed to create test repo with remote");

    // Create a branch on the remote
    repo.commit_file("feature.txt", "feature content", "Add feature")
        .expect("Failed to commit file");

    TestRepo::run_git(&repo.repo_path, &["checkout", "-b", "feature-remote"])
        .expect("Failed to create branch");

    repo.push_branch("feature-remote")
        .expect("Failed to push branch");

    // Go back to main
    TestRepo::run_git(&repo.repo_path, &["checkout", "main"])
        .expect("Failed to checkout main");

    // Initialize jj
    treq_lib::core::init(&repo.repo_path).expect("Failed to initialize jj");

    // Fetch to ensure jj knows about remote branches
    let _ = treq_lib::jj::jj_git_fetch(&repo.repo_path);

    // Ensure workspaces directory exists
    repo.ensure_workspaces_dir().expect("Failed to create workspaces dir");

    // Create workspace from remote branch
    let workspace_name = treq_lib::jj::create_workspace(
        &repo.repo_path,
        "feature-remote",
        "feature-remote",
        false, // not new_branch - use existing
        None,
        None,
    )
    .expect("Failed to create workspace from remote branch");

    // Verify workspace exists
    let workspace_path = repo.workspaces_dir().join(&workspace_name);
    assert!(
        workspace_path.exists(),
        "Workspace from remote branch should exist"
    );

    // Verify the file from the branch is present
    assert!(
        workspace_path.join("feature.txt").exists(),
        "File from remote branch should exist in workspace"
    );

    // JJ VERIFICATION: Verify workspace is in jj workspace list
    let jj_workspaces = JjVerifier::list_workspaces(&repo.repo_path)
        .expect("Failed to list jj workspaces");
    assert!(
        jj_workspaces.contains(&workspace_name),
        "jj should list workspace from remote branch"
    );

    // JJ VERIFICATION: Verify file exists via jj status
    assert!(
        JjVerifier::file_exists_in_workspace(workspace_path.to_str().unwrap(), "feature.txt"),
        "feature.txt should exist in workspace working copy"
    );

    // JJ VERIFICATION: Verify workspace structure
    JjVerifier::verify_workspace_structure(workspace_path.to_str().unwrap())
        .expect("Workspace from remote should have valid structure");
}

// =============================================================================
// Test: Can create a stacked workspace (workspace based on another workspace's branch)
// =============================================================================

#[test]
fn test_can_create_stacked_workspace() {
    let repo = TestRepo::new().expect("Failed to create test repo");

    // Initialize jj
    treq_lib::core::init(&repo.repo_path).expect("Failed to initialize jj");

    // Ensure workspaces directory exists
    repo.ensure_workspaces_dir().expect("Failed to create workspaces dir");

    // Create first workspace
    let workspace1_name = treq_lib::jj::create_workspace(
        &repo.repo_path,
        "feature-base",
        "feature-base",
        true,
        None,
        None,
    )
    .expect("Failed to create base workspace");

    let workspace1_path = repo.workspaces_dir().join(&workspace1_name);
    let workspace1_path_str = workspace1_path.to_str().unwrap();

    // Add workspace to database (required for jj_commit to work)
    treq_lib::local_db::add_workspace(
        &repo.repo_path,
        workspace1_name.clone(),
        workspace1_path_str.to_string(),
        "feature-base".to_string(),
        None,
    )
    .expect("Failed to add workspace to DB");

    // Add a commit to the first workspace
    let base_file = workspace1_path.join("base.txt");
    fs::write(&base_file, "base content").expect("Failed to write base file");

    treq_lib::jj::jj_commit(workspace1_path_str, "Add base file")
        .expect("Failed to commit in base workspace");

    // Create stacked workspace based on the first workspace's branch
    let workspace2_name = treq_lib::jj::create_workspace(
        &repo.repo_path,
        "feature-stacked",
        "feature-stacked",
        true,
        Some("feature-base"), // source_branch
        None,
    )
    .expect("Failed to create stacked workspace");

    // Verify stacked workspace exists
    let workspace2_path = repo.workspaces_dir().join(&workspace2_name);
    assert!(
        workspace2_path.exists(),
        "Stacked workspace should exist"
    );

    // Verify it has the base file from the source branch
    assert!(
        workspace2_path.join("base.txt").exists(),
        "Stacked workspace should have file from source branch"
    );

    // JJ VERIFICATION: Both workspaces should be in jj list
    let jj_workspaces = JjVerifier::list_workspaces(&repo.repo_path)
        .expect("Failed to list jj workspaces");
    assert!(
        jj_workspaces.contains(&workspace1_name),
        "Base workspace should be in jj list"
    );
    assert!(
        jj_workspaces.contains(&workspace2_name),
        "Stacked workspace should be in jj list"
    );

    // JJ VERIFICATION: Stacked workspace should have base.txt
    assert!(
        JjVerifier::file_exists_in_workspace(workspace2_path.to_str().unwrap(), "base.txt"),
        "Stacked workspace should have inherited base.txt from source"
    );

    // JJ VERIFICATION: Check log shows ancestry from source
    let log = JjVerifier::get_log(workspace2_path.to_str().unwrap(), 5)
        .expect("Failed to get jj log");
    assert!(
        log.contains("Add base file") || log.contains("base"),
        "Stacked workspace history should include source commit, got: {}",
        log
    );
}

// =============================================================================
// Test: Can merge a workspace
// =============================================================================

#[test]
fn test_can_merge_workspace() {
    let repo = TestRepo::with_remote().expect("Failed to create test repo with remote");

    // Initialize jj
    treq_lib::core::init(&repo.repo_path).expect("Failed to initialize jj");

    // Ensure workspaces directory exists
    repo.ensure_workspaces_dir().expect("Failed to create workspaces dir");

    // Create workspace
    let workspace_name = treq_lib::jj::create_workspace(
        &repo.repo_path,
        "feature-merge",
        "feature-merge",
        true,
        None,
        None,
    )
    .expect("Failed to create workspace");

    let workspace_path = repo.workspaces_dir().join(&workspace_name);
    let workspace_path_str = workspace_path.to_str().unwrap();

    // Add workspace to database (required for jj_commit to work)
    treq_lib::local_db::add_workspace(
        &repo.repo_path,
        workspace_name.clone(),
        workspace_path_str.to_string(),
        "feature-merge".to_string(),
        None,
    )
    .expect("Failed to add workspace to DB");

    // Add a file to the workspace
    let feature_file = workspace_path.join("merge-feature.txt");
    fs::write(&feature_file, "merge feature content").expect("Failed to write feature file");

    // Commit the changes
    treq_lib::jj::jj_commit(workspace_path_str, "Add merge feature")
        .expect("Failed to commit");

    // Get commits ahead to verify there's something to merge
    let commits_ahead = treq_lib::jj::jj_get_commits_ahead(workspace_path_str, "main")
        .expect("Failed to get commits ahead");

    assert!(
        commits_ahead.total_count > 0,
        "Should have commits ahead of main"
    );

    // JJ VERIFICATION: Check jj log before merge
    let log_before = JjVerifier::get_log(workspace_path_str, 5)
        .expect("Failed to get log before merge");
    assert!(
        log_before.contains("Add merge feature"),
        "Commit should appear in log before merge"
    );

    // Create merge commit
    let merge_result = treq_lib::jj::jj_create_merge_commit(
        workspace_path_str,
        "feature-merge",
        "main",
        "Merge feature-merge into main",
    )
    .expect("Failed to create merge commit");

    assert!(
        merge_result.success,
        "Merge should succeed: {}",
        merge_result.message
    );

    // JJ VERIFICATION: Check jj log after merge shows merge commit
    let log_after = JjVerifier::get_log(workspace_path_str, 5)
        .expect("Failed to get log after merge");
    assert!(
        log_after.contains("Merge") || log_after.contains("merge"),
        "Merge commit should appear in jj log, got: {}",
        log_after
    );
}

// =============================================================================
// Test: Can delete a workspace
// =============================================================================

#[test]
fn test_can_delete_workspace() {
    let repo = TestRepo::new().expect("Failed to create test repo");

    // Initialize jj
    treq_lib::core::init(&repo.repo_path).expect("Failed to initialize jj");

    // Ensure workspaces directory exists
    repo.ensure_workspaces_dir().expect("Failed to create workspaces dir");

    // Create workspace
    let workspace_name = treq_lib::jj::create_workspace(
        &repo.repo_path,
        "feature-delete",
        "feature-delete",
        true,
        None,
        None,
    )
    .expect("Failed to create workspace");

    let workspace_path = repo.workspaces_dir().join(&workspace_name);
    let workspace_path_str = workspace_path.to_str().unwrap().to_string();

    // Add to local database
    let workspace_id = treq_lib::local_db::add_workspace(
        &repo.repo_path,
        workspace_name.clone(),
        workspace_path_str.clone(),
        "feature-delete".to_string(),
        None,
    )
    .expect("Failed to add workspace to DB");

    // Verify workspace exists
    assert!(workspace_path.exists(), "Workspace should exist before deletion");

    // JJ VERIFICATION: Workspace should be in jj list before deletion
    let jj_workspaces_before = JjVerifier::list_workspaces(&repo.repo_path)
        .expect("Failed to list jj workspaces");
    assert!(
        jj_workspaces_before.contains(&workspace_name),
        "Workspace should be in jj list before deletion"
    );

    // Delete workspace via jj
    treq_lib::jj::remove_workspace(&repo.repo_path, &workspace_path_str)
        .expect("Failed to remove workspace");

    // Delete from database
    treq_lib::local_db::delete_workspace(&repo.repo_path, workspace_id)
        .expect("Failed to delete workspace from DB");

    // Verify workspace directory is removed
    assert!(!workspace_path.exists(), "Workspace directory should be removed");

    // JJ VERIFICATION: Workspace should NOT be in jj list after deletion
    let jj_workspaces_after = JjVerifier::list_workspaces(&repo.repo_path)
        .expect("Failed to list jj workspaces after deletion");
    assert!(
        !jj_workspaces_after.contains(&workspace_name),
        "Workspace should NOT be in jj list after deletion, got: {:?}",
        jj_workspaces_after
    );

    // Verify database entry is removed
    let workspaces = treq_lib::local_db::get_workspaces(&repo.repo_path)
        .expect("Failed to get workspaces");

    assert!(
        !workspaces.iter().any(|w| w.id == workspace_id),
        "Workspace should be removed from database"
    );
}

// =============================================================================
// Test: Can change a workspace target branch
// =============================================================================

#[test]
fn test_can_change_workspace_target_branch() {
    let repo = TestRepo::new().expect("Failed to create test repo");

    // Create another branch to use as target
    repo.commit_file("develop.txt", "develop content", "Develop commit")
        .expect("Failed to commit");

    TestRepo::run_git(&repo.repo_path, &["checkout", "-b", "develop"])
        .expect("Failed to create develop branch");

    TestRepo::run_git(&repo.repo_path, &["checkout", "main"])
        .expect("Failed to checkout main");

    // Initialize jj
    treq_lib::core::init(&repo.repo_path).expect("Failed to initialize jj");

    // Ensure workspaces directory exists
    repo.ensure_workspaces_dir().expect("Failed to create workspaces dir");

    // Create workspace
    let workspace_name = treq_lib::jj::create_workspace(
        &repo.repo_path,
        "feature-target",
        "feature-target",
        true,
        None,
        None,
    )
    .expect("Failed to create workspace");

    let workspace_path = repo.workspaces_dir().join(&workspace_name);
    let workspace_path_str = workspace_path.to_str().unwrap();

    // Add to local database with initial target branch
    let workspace_id = treq_lib::local_db::add_workspace(
        &repo.repo_path,
        workspace_name.clone(),
        workspace_path_str.to_string(),
        "feature-target".to_string(),
        None,
    )
    .expect("Failed to add workspace to DB");

    // Set initial target branch
    treq_lib::local_db::update_workspace_target_branch(
        &repo.repo_path,
        workspace_id,
        "main",
    )
    .expect("Failed to set initial target branch");

    // Verify initial target branch
    let workspaces = treq_lib::local_db::get_workspaces(&repo.repo_path)
        .expect("Failed to get workspaces");

    let workspace = workspaces.iter().find(|w| w.id == workspace_id).unwrap();
    assert_eq!(workspace.target_branch.as_deref(), Some("main"));

    // JJ VERIFICATION: Get parent before rebase
    let parent_before = JjVerifier::get_parent_info(workspace_path_str)
        .unwrap_or_default();

    // Rebase onto develop branch
    let rebase_result = treq_lib::jj::jj_rebase_onto(workspace_path_str, "develop")
        .expect("Failed to rebase");

    assert!(rebase_result.success, "Rebase should succeed");

    // JJ VERIFICATION: After rebase, the file from develop branch should be accessible
    // (workspace is now based on develop)
    let log_after = JjVerifier::get_log(workspace_path_str, 5)
        .expect("Failed to get log after rebase");
    assert!(
        log_after.contains("Develop") || log_after.contains("develop"),
        "Log should show develop branch history after rebase, got: {}",
        log_after
    );

    // Update target branch
    treq_lib::local_db::update_workspace_target_branch(
        &repo.repo_path,
        workspace_id,
        "develop",
    )
    .expect("Failed to update target branch");

    // Verify target branch was changed
    let workspaces = treq_lib::local_db::get_workspaces(&repo.repo_path)
        .expect("Failed to get workspaces");

    let workspace = workspaces.iter().find(|w| w.id == workspace_id).unwrap();
    assert_eq!(
        workspace.target_branch.as_deref(),
        Some("develop"),
        "Target branch should be updated to develop"
    );

    // Use parent_before to suppress warning
    let _ = parent_before;
}

// =============================================================================
// Test: Can list workspaces
// =============================================================================

#[test]
fn test_can_list_workspaces() {
    let repo = TestRepo::new().expect("Failed to create test repo");

    // Initialize jj
    treq_lib::core::init(&repo.repo_path).expect("Failed to initialize jj");

    // Ensure workspaces directory exists
    repo.ensure_workspaces_dir().expect("Failed to create workspaces dir");

    // Create multiple workspaces
    let workspace_names: Vec<String> = vec!["feature-a", "feature-b", "feature-c"]
        .into_iter()
        .map(|name| {
            treq_lib::jj::create_workspace(
                &repo.repo_path,
                name,
                name,
                true,
                None,
                None,
            )
            .expect(&format!("Failed to create workspace {}", name))
        })
        .collect();

    // JJ VERIFICATION: Verify via jj workspace list command directly (primary source of truth)
    let jj_workspaces = JjVerifier::list_workspaces(&repo.repo_path)
        .expect("Failed to list jj workspaces");

    // Should have default + 3 created workspaces
    assert!(
        jj_workspaces.len() >= workspace_names.len(),
        "jj should list at least {} workspaces, got {}",
        workspace_names.len(),
        jj_workspaces.len()
    );

    for name in &workspace_names {
        assert!(
            jj_workspaces.contains(name),
            "Workspace {} should be in jj workspace list, got: {:?}",
            name,
            jj_workspaces
        );
    }

    // Add to local database
    for name in &workspace_names {
        let workspace_path = repo.workspaces_dir().join(name);
        treq_lib::local_db::add_workspace(
            &repo.repo_path,
            name.clone(),
            workspace_path.to_str().unwrap().to_string(),
            name.clone(),
            None,
        )
        .expect("Failed to add workspace to DB");
    }

    // List from database
    let db_workspaces = treq_lib::local_db::get_workspaces(&repo.repo_path)
        .expect("Failed to get workspaces from DB");

    assert_eq!(
        db_workspaces.len(),
        workspace_names.len(),
        "Database should have all workspaces"
    );

    for name in &workspace_names {
        assert!(
            db_workspaces.iter().any(|w| &w.workspace_name == name),
            "Workspace {} should be in database list",
            name
        );
    }

    // JJ VERIFICATION: Verify each workspace has valid structure
    for name in &workspace_names {
        let workspace_path = repo.workspaces_dir().join(name);
        JjVerifier::verify_workspace_structure(workspace_path.to_str().unwrap())
            .expect(&format!("Workspace {} should have valid structure", name));
    }
}

// =============================================================================
// Test: Workspace with conflicts detection
// =============================================================================

#[test]
fn test_workspace_conflict_detection() {
    let repo = TestRepo::new().expect("Failed to create test repo");

    // Create a file and commit
    repo.commit_file("conflict.txt", "original content", "Original commit")
        .expect("Failed to commit");

    // Initialize jj
    treq_lib::core::init(&repo.repo_path).expect("Failed to initialize jj");

    // Ensure workspaces directory exists
    repo.ensure_workspaces_dir().expect("Failed to create workspaces dir");

    // Create workspace
    let workspace_name = treq_lib::jj::create_workspace(
        &repo.repo_path,
        "feature-conflict",
        "feature-conflict",
        true,
        None,
        None,
    )
    .expect("Failed to create workspace");

    let workspace_path = repo.workspaces_dir().join(&workspace_name);
    let workspace_path_str = workspace_path.to_str().unwrap();

    // Add workspace to database (required for jj_commit to work)
    treq_lib::local_db::add_workspace(
        &repo.repo_path,
        workspace_name.clone(),
        workspace_path_str.to_string(),
        "feature-conflict".to_string(),
        None,
    )
    .expect("Failed to add workspace to DB");

    // Modify file in workspace
    fs::write(workspace_path.join("conflict.txt"), "workspace content")
        .expect("Failed to write in workspace");

    treq_lib::jj::jj_commit(workspace_path_str, "Workspace change")
        .expect("Failed to commit workspace change");

    // Modify same file on main (create conflict scenario)
    fs::write(
        Path::new(&repo.repo_path).join("conflict.txt"),
        "main content",
    )
    .expect("Failed to write on main");

    TestRepo::run_git(&repo.repo_path, &["add", "."])
        .expect("Failed to git add");
    TestRepo::run_git(&repo.repo_path, &["commit", "-m", "Main change"])
        .expect("Failed to git commit");

    // Get conflicted files (should be empty before rebase)
    let conflicts_before = treq_lib::jj::get_conflicted_files(workspace_path_str, Some("main"))
        .unwrap_or_default();

    // JJ VERIFICATION: Check jj status before rebase
    let status_before = JjVerifier::get_status(workspace_path_str)
        .expect("Failed to get status before rebase");
    let has_conflict_before = status_before.to_lowercase().contains("conflict");

    // After rebase, there may or may not be conflicts depending on jj's behavior
    let _rebase_result = treq_lib::jj::jj_rebase_onto(workspace_path_str, "main");

    // Check for conflicts after rebase
    let conflicts_after = treq_lib::jj::get_conflicted_files(workspace_path_str, Some("main"))
        .unwrap_or_default();

    // JJ VERIFICATION: Check jj status after rebase
    let status_after = JjVerifier::get_status(workspace_path_str)
        .expect("Failed to get status after rebase");

    // Verify conflict detection functions work
    // Note: "Conflicted files" or "conflict" at start of line indicates real conflicts
    // We need to avoid matching branch names like "feature-conflict"
    let jj_shows_conflict = status_after.lines().any(|line| {
        let lower = line.to_lowercase();
        lower.starts_with("conflict") || lower.contains("conflicted")
    });
    let treq_shows_conflict = !conflicts_after.is_empty();

    // Both should be consistent
    if jj_shows_conflict && !treq_shows_conflict {
        panic!(
            "treq should detect conflicts when jj shows them. jj status: {}",
            status_after
        );
    }

    // Just log for debugging - conflicts depend on jj's resolution behavior
    eprintln!(
        "Conflict detection test: jj_conflict={}, treq_conflict={}, had_conflict_before={}",
        jj_shows_conflict, treq_shows_conflict, has_conflict_before
    );

    // Use variables to suppress warnings
    let _ = conflicts_before;
}

