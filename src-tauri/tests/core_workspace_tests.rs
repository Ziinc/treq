mod e2e_test_helpers;

use e2e_test_helpers::{JjVerifier, TestRepo};
use std::fs;
use std::path::Path;
use std::process::Command;

use treq_lib::local_db::Workspace;

// =============================================================================
// Test: All treq_lib::core functionality - main entrypoint for core app functionality
// All glue code should only interact with treq_lib::core APIs.
// =============================================================================

#[test]
fn test_can_create_workspace() {
    let repo = TestRepo::new().expect("Failed to create test repo");

    assert!(
        &repo.workspaces_dir().exists(),
        "Workspaces directory should exist"
    );

    // Create workspace (new branch)
    let workspace = treq_lib::core::create_workspace(
        &repo.repo_path,
        "feat/test",
        Some("new feature"),
        None, // source_branch (defaults to current)
    )
    .expect("Failed to create workspace");

    // Verify workspace was created with correct fields
    assert!(workspace.id > 0, "Workspace should have valid database ID");
    assert_eq!(
        workspace.branch_name, "feat/test",
        "Branch name should match"
    );
    assert_eq!(
        workspace.repo_path, repo.repo_path,
        "Repo path should match"
    );
    assert_eq!(
        workspace.workspace_path, "feat-test",
        "Workspace path should be generated and sanitised correctly"
    );

    assert!(
        Path::new(&repo.workspaces_dir().join(&workspace.workspace_path)).exists(),
        "Workspace directory should exist"
    );

    let workspace_path = &repo.workspaces_dir().join(&workspace.workspace_path);
    assert!(
        workspace_path.join(".jj").exists(),
        ".jj directory should exist in workspace"
    );
    assert!(
        workspace_path.join("README.md").exists(),
        "README.md should exist in workspace"
    );
    assert!(
        !workspace_path.join(".treq").exists(),
        ".treq directory should not exist in workspace"
    );

    // verify workspace is valid jj workspace
    let jj_works = Command::new("jj")
        .current_dir(workspace_path)
        .args(["status"])
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false);
    assert!(
        jj_works,
        "Workspace should be valid jj workspace, got: {}",
        jj_works
    );

    eprintln!("workspace: {:?}", workspace);
    // JJ VERIFICATION: Verify workspace via jj workspace list (primary source of truth)
    let jj_workspaces =
        JjVerifier::list_workspaces(&repo.repo_path).expect("Failed to list jj workspaces");
    assert!(
        jj_workspaces.contains(&workspace.workspace_name),
        "jj workspace list should contain '{}', got: {:?}",
        workspace.branch_name,
        jj_workspaces
    );

    // JJ VERIFICATION: Verify bookmark was created
    let bookmarks = JjVerifier::list_bookmarks(workspace_path.to_str().unwrap())
        .expect("Failed to list bookmarks");
    assert!(
        bookmarks.iter().any(|b| b == &workspace.branch_name),
        "Bookmark '{}' should exist in workspace, got: {:?}",
        workspace.branch_name,
        bookmarks
    );
}

// =============================================================================
// Test: Can create a workspace from remote branch
// =============================================================================

// TODO: not yet refactored
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
    TestRepo::run_git(&repo.repo_path, &["checkout", "main"]).expect("Failed to checkout main");

    // Fetch to ensure jj knows about remote branches
    let _ = treq_lib::jj::jj_git_fetch(&repo.repo_path);

    // Ensure workspaces directory exists
    repo.ensure_workspaces_dir()
        .expect("Failed to create workspaces dir");

    // Create workspace from remote branch
    let workspace_name = treq_lib::jj::create_workspace(
        &repo.repo_path,
        "feature-remote",
        "feature-remote",
        false, // not new_branch - use existing
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
    let jj_workspaces =
        JjVerifier::list_workspaces(&repo.repo_path).expect("Failed to list jj workspaces");
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

    // Create first workspace
    let base: Workspace =
        treq_lib::core::create_workspace(&repo.repo_path, "feat/base", Some("feature-base"), None)
            .expect("Failed to create base workspace");

    let workspace1_path = repo.workspaces_dir().join(&base.workspace_path);

    // make an edit to the base workspace.
    let base_file = workspace1_path.join("base.txt");
    fs::write(&base_file, "base content").expect("Failed to write base file");

    // Create stacked workspace based on the first workspace's branch
    let stacked: Workspace = treq_lib::core::stack_workspace(
        &repo.repo_path,
        Some(&base),
        Some("feat/stacked"),
    )
    .expect("Failed to create stacked workspace");

    // Verify stacked workspace exists
    let stacked_path = repo.workspaces_dir().join(&stacked.workspace_path);
    assert!(stacked_path.exists(), "Stacked workspace should exist");

    // Verify it has the base file from the source branch
    assert!(
        stacked_path.join("base.txt").exists(),
        "Stacked workspace should have file from source branch"
    );

    let workspaces =
        treq_lib::core::list_workspaces(&repo.repo_path).expect("Failed to list workspaces");
    assert_eq!(
        workspaces.len(),
        2,
        "Should have 2 workspaces, got {}",
        workspaces.len()
    );
}

// =============================================================================
// Test: Can merge a workspace
// =============================================================================

#[test]
// TODO: not yet refactored
fn test_can_merge_workspace() {
    let repo = TestRepo::with_remote().expect("Failed to create test repo with remote");

    // Ensure workspaces directory exists
    repo.ensure_workspaces_dir()
        .expect("Failed to create workspaces dir");

    // Create workspace
    let workspace_name = treq_lib::jj::create_workspace(
        &repo.repo_path,
        "feature-merge",
        "feature-merge",
        true,
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
    treq_lib::jj::jj_commit(workspace_path_str, "Add merge feature").expect("Failed to commit");

    // Get commits ahead to verify there's something to merge
    let commits_ahead = treq_lib::jj::jj_get_commits_ahead(workspace_path_str, "main")
        .expect("Failed to get commits ahead");

    assert!(
        commits_ahead.total_count > 0,
        "Should have commits ahead of main"
    );

    // JJ VERIFICATION: Check jj log before merge
    let log_before =
        JjVerifier::get_log(workspace_path_str, 5).expect("Failed to get log before merge");
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
    let log_after =
        JjVerifier::get_log(workspace_path_str, 5).expect("Failed to get log after merge");
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

    let workspace: Workspace = treq_lib::core::create_workspace(
        &repo.repo_path,
        "feat/delete",
        Some("delete feature"),
        None,
    )
    .expect("Failed to create workspace");
    let workspace_name = workspace.workspace_name;

    let workspace_path = repo.workspaces_dir().join(&workspace.workspace_path);

    let result = treq_lib::core::delete_workspace(&repo.repo_path, &workspace.id)
        .expect("Failed to delete workspace");
    assert_eq!(result, true, "Workspace should be deleted");

    assert!(
        !workspace_path.exists(),
        "Workspace directory should be removed"
    );

    // bookmark is preserved

    let bookmarks = JjVerifier::list_bookmarks(&repo.repo_path).expect("Failed to list bookmarks");
    eprintln!("bookmarks: {:?}", bookmarks);
    assert!(
        bookmarks.iter().any(|b| b == &workspace.branch_name),
        "Bookmark '{}' should exist in workspace, got: {:?}",
        workspace.branch_name,
        bookmarks
    );

    // jj workspace is removed
    let jj_workspaces_after = JjVerifier::list_workspaces(&repo.repo_path)
        .expect("Failed to list jj workspaces after deletion");
    assert!(
        !jj_workspaces_after.contains(&workspace_name),
        "Workspace should NOT be in jj list after deletion, got: {:?}",
        jj_workspaces_after
    );

    // Verify database entry is removed
    let workspaces =
        treq_lib::local_db::get_workspaces(&repo.repo_path).expect("Failed to get workspaces");

    assert!(
        !workspaces.iter().any(|w| w.id == workspace.id),
        "Workspace should be removed from database"
    );
}

// =============================================================================
// Test: Can change a workspace target branch
// =============================================================================

#[test]
// TODO: not yet refactored
fn test_can_change_workspace_target_branch() {
    let repo = TestRepo::new().expect("Failed to create test repo");

    // Create another branch to use as target
    repo.commit_file("develop.txt", "develop content", "Develop commit")
        .expect("Failed to commit");

    TestRepo::run_git(&repo.repo_path, &["checkout", "-b", "develop"])
        .expect("Failed to create develop branch");

    TestRepo::run_git(&repo.repo_path, &["checkout", "main"]).expect("Failed to checkout main");

    // Ensure workspaces directory exists
    repo.ensure_workspaces_dir()
        .expect("Failed to create workspaces dir");

    // Create workspace
    let workspace_name = treq_lib::jj::create_workspace(
        &repo.repo_path,
        "feature-target",
        "feature-target",
        true,
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
    treq_lib::local_db::update_workspace_target_branch(&repo.repo_path, workspace_id, "main")
        .expect("Failed to set initial target branch");

    // Verify initial target branch
    let workspaces =
        treq_lib::local_db::get_workspaces(&repo.repo_path).expect("Failed to get workspaces");

    let workspace = workspaces.iter().find(|w| w.id == workspace_id).unwrap();
    assert_eq!(workspace.target_branch.as_deref(), Some("main"));

    // JJ VERIFICATION: Get parent before rebase
    let parent_before = JjVerifier::get_parent_info(workspace_path_str).unwrap_or_default();

    // Rebase onto develop branch
    let rebase_result =
        treq_lib::jj::jj_rebase_onto(workspace_path_str, "develop").expect("Failed to rebase");

    assert!(rebase_result.success, "Rebase should succeed");

    // JJ VERIFICATION: After rebase, the file from develop branch should be accessible
    // (workspace is now based on develop)
    let log_after =
        JjVerifier::get_log(workspace_path_str, 5).expect("Failed to get log after rebase");
    assert!(
        log_after.contains("Develop") || log_after.contains("develop"),
        "Log should show develop branch history after rebase, got: {}",
        log_after
    );

    // Update target branch
    treq_lib::local_db::update_workspace_target_branch(&repo.repo_path, workspace_id, "develop")
        .expect("Failed to update target branch");

    // Verify target branch was changed
    let workspaces =
        treq_lib::local_db::get_workspaces(&repo.repo_path).expect("Failed to get workspaces");

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

    treq_lib::core::create_workspace(&repo.repo_path, "feat/a", Some("feature-a"), None)
        .expect("Failed to create workspace");
    treq_lib::core::create_workspace(&repo.repo_path, "feat/b", Some("feature-b"), None)
        .expect("Failed to create workspace");
    treq_lib::core::create_workspace(&repo.repo_path, "feat/c", Some("feature-c"), None)
        .expect("Failed to create workspace");

    // JJ VERIFICATION: Verify via jj workspace list command directly (primary source of truth)
    let jj_workspaces =
        JjVerifier::list_workspaces(&repo.repo_path).expect("Failed to list jj workspaces");

    // Should have default + 3 created workspaces
    assert_eq!(
        jj_workspaces.len(),
        4,
        "jj should list 4 workspaces, got {}",
        jj_workspaces.len()
    );
    let workspaces =
        treq_lib::core::list_workspaces(&repo.repo_path).expect("Failed to list workspaces");
    assert_eq!(
        workspaces.len(),
        3,
        "Should have 3 workspaces, got {}",
        workspaces.len()
    );
}

// =============================================================================
// Test: Workspace with conflicts detection
// =============================================================================

#[test]
fn test_workspace_conflict_detection() {
    let repo = TestRepo::new().expect("Failed to create test repo");


    let workspace = treq_lib::core::create_workspace(&repo.repo_path, "base", Some("feature-base"), None).expect("Failed to create base workspace");
    

    let workspace_path = repo.workspaces_dir().join(&workspace.workspace_path);
    let file_path = workspace_path.join("README.md");
    fs::write(&file_path, "some content").expect("Failed to write base file");


    let stacked_workspace = treq_lib::core::stack_workspace(&repo.repo_path, Some(&workspace), Some("feat/stacked")).expect("Failed to create stacked workspace");
    // before, not conflicted
    let workspaces = treq_lib::core::list_workspaces(&repo.repo_path).expect("Failed to list workspaces");
    assert_eq!(workspaces[0].has_conflicts, false, "Workspace should not be marked as conflicted");
    assert_eq!(workspaces[1].has_conflicts, false, "Workspace should not be marked as conflicted");


    let stacked_workspace_path = repo.workspaces_dir().join(&stacked_workspace.workspace_path);
    fs::write(&stacked_workspace_path.join("README.md"), "different stacked content").expect("Failed to write  file");


    fs::remove_file(&workspace_path.join("README.md")).expect("Failed to delete workspace file");


    let workspaces = treq_lib::core::list_workspaces(&repo.repo_path).expect("Failed to list workspaces");
    let stacked = workspaces.iter().find(|w| w.workspace_path == stacked_workspace.workspace_path)
        .expect("Stacked workspace should exist");
    assert_eq!(stacked.has_conflicts, true, "Stacked workspace should be marked as conflicted");
}


