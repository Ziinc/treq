mod e2e_test_helpers;
use e2e_test_helpers::{JjVerifier, TestRepo};
use std::fs;

// =============================================================================
// Test: move_commit_to_new_workspace
// =============================================================================

#[test]
fn test_move_commit_to_new_workspace() {
    let repo = TestRepo::new().expect("Failed to create test repo");

    // Create source workspace
    let source = treq_lib::core::create_workspace(
        &repo.repo_path,
        "feat/source",
        Some("source workspace".to_string()),
        None,
        None,
    )
    .expect("Failed to create source workspace");

    let source_path = repo.workspaces_dir().join(&source.workspace_path);
    let source_path_str = source_path.to_str().unwrap();

    // Add a file to the source workspace and commit it
    fs::write(source_path.join("moved.txt"), "moved content").expect("Failed to write file");
    treq_lib::jj::jj_commit(source_path_str, "Commit to move").expect("Failed to commit");

    // Get the change_id of the committed change
    let commits_ahead = treq_lib::jj::jj_get_commits_ahead(source_path_str, "main")
        .expect("Failed to get commits ahead");
    assert!(
        !commits_ahead.commits.is_empty(),
        "Should have at least 1 commit ahead of main"
    );
    let change_id = commits_ahead.commits.last().unwrap().change_id.clone();

    // Move commit to new workspace
    let new_workspace = treq_lib::core::move_commit_to_new_workspace(
        &repo.repo_path,
        source.id,
        &change_id,
        "feat/moved",
        Some("moved intent".to_string()),
    )
    .expect("Failed to move commit to new workspace");

    // Verify new workspace was created with correct branch name
    assert_eq!(
        new_workspace.branch_name, "feat/moved",
        "New workspace should have correct branch name"
    );

    // Verify new workspace appears in jj workspace list
    let jj_workspaces =
        JjVerifier::list_workspaces(&repo.repo_path).expect("Failed to list jj workspaces");
    assert!(
        jj_workspaces.contains(&new_workspace.workspace_name),
        "jj workspace list should contain '{}', got: {:?}",
        new_workspace.workspace_name,
        jj_workspaces
    );

    // Verify new workspace has the file from the moved commit
    let new_path = repo.workspaces_dir().join(&new_workspace.workspace_path);
    assert!(
        new_path.join("moved.txt").exists(),
        "moved.txt should exist in new workspace after commit was moved"
    );
}

// =============================================================================
// Test: move_commit_to_existing_workspace
// =============================================================================

#[test]
fn test_move_commit_to_existing_workspace() {
    let repo = TestRepo::new().expect("Failed to create test repo");

    // Create source workspace
    let source = treq_lib::core::create_workspace(
        &repo.repo_path,
        "feat/source",
        Some("source workspace".to_string()),
        None,
        None,
    )
    .expect("Failed to create source workspace");

    let source_path = repo.workspaces_dir().join(&source.workspace_path);
    let source_path_str = source_path.to_str().unwrap();

    // Add a file to the source workspace and commit it
    fs::write(source_path.join("moved.txt"), "moved content").expect("Failed to write file");
    treq_lib::jj::jj_commit(source_path_str, "Commit to move").expect("Failed to commit");

    // Get the change_id of the committed change
    let commits_ahead = treq_lib::jj::jj_get_commits_ahead(source_path_str, "main")
        .expect("Failed to get commits ahead");
    assert!(
        !commits_ahead.commits.is_empty(),
        "Should have at least 1 commit ahead of main"
    );
    let change_id = commits_ahead.commits.last().unwrap().change_id.clone();

    // Create target workspace
    let target = treq_lib::core::create_workspace(
        &repo.repo_path,
        "feat/target",
        Some("target workspace".to_string()),
        None,
        None,
    )
    .expect("Failed to create target workspace");

    let target_path = repo.workspaces_dir().join(&target.workspace_path);

    // Move commit to existing workspace
    treq_lib::core::move_commit_to_existing_workspace(
        &repo.repo_path,
        source.id,
        &change_id,
        target.id,
    )
    .expect("Failed to move commit to existing workspace");

    // Verify target workspace has the file from the moved commit
    assert!(
        target_path.join("moved.txt").exists(),
        "moved.txt should exist in target workspace after commit was moved"
    );
}

#[test]
fn test_abandon_commit() {
    let repo = TestRepo::new().expect("Failed to create test repo");

    // Create workspace
    let workspace = treq_lib::core::create_workspace(
        &repo.repo_path,
        "feat/abandon-test",
        Some("abandon test".to_string()),
        None,
        None,
    )
    .expect("Failed to create workspace");

    let workspace_path = repo.workspaces_dir().join(&workspace.workspace_path);
    let workspace_path_str = workspace_path.to_str().unwrap();

    // Add a file and commit
    fs::write(workspace_path.join("abandon-me.txt"), "content").expect("Failed to write");
    treq_lib::jj::jj_commit(workspace_path_str, "Commit to abandon").expect("Failed to commit");

    // Get the change_id
    let commits_ahead = treq_lib::jj::jj_get_commits_ahead(workspace_path_str, "main")
        .expect("Failed to get commits ahead");
    assert!(
        !commits_ahead.commits.is_empty(),
        "Should have at least 1 commit"
    );
    let change_id = commits_ahead.commits.last().unwrap().change_id.clone();

    // Abandon the commit
    treq_lib::core::abandon_commit(&repo.repo_path, workspace.id, &change_id)
        .expect("Failed to abandon commit");

    // Verify commit is gone
    let commits_after = treq_lib::jj::jj_get_commits_ahead(workspace_path_str, "main")
        .expect("Failed to get commits after abandon");
    assert!(
        commits_after.commits.is_empty(),
        "Commit should be abandoned, but found {} commits",
        commits_after.commits.len()
    );

    // Verify file from abandoned commit is no longer in workspace
    assert!(
        !workspace_path.join("abandon-me.txt").exists(),
        "abandon-me.txt should not exist after commit was abandoned"
    );
}
