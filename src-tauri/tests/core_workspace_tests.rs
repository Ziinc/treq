mod e2e_test_helpers;

use e2e_test_helpers::{JjVerifier, TestRepo};
use std::fs;
use std::path::Path;
use std::process::Command;

use treq_lib::core::MaybeEmptyParam;
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

#[test]
fn test_can_create_workspace_from_remote_branch() {
    let repo = TestRepo::with_remote().expect("Failed to create test repo with remote");

    // create workspace from a remote branch
    let workspace = treq_lib::core::create_workspace(
        &repo.repo_path,
        "feature-remote",
        Some("feature-remote"),
        None,
    )
    .expect("Failed to create workspace from remote branch");

    let workspace_name = workspace.workspace_name;
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

    // Verify workspace has correctly checked out the remote branch by checking the jj status
    let workspace_path_str = workspace_path.to_str().unwrap();

    // Execute jj status to verify workspace state
    let status_output = Command::new("jj")
        .current_dir(workspace_path_str)
        .args(["status"])
        .output()
        .expect("Failed to execute jj status");

    let status_str = String::from_utf8_lossy(&status_output.stdout);

    // Verify the status output contains the feature-remote branch name
    assert!(
        status_str.contains("feature-remote"),
        "JJ status should show 'feature-remote' bookmark, got: {}",
        status_str
    );
}

// TODO: create a workspace from non-default home repo branch

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
    let stacked: Workspace =
        treq_lib::core::stack_workspace(&repo.repo_path, Some(&base), Some("feat/stacked"))
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

    // Fetch workspace status for both workspaces
    let base_status = treq_lib::core::workspace_status(workspace1_path.to_str().unwrap())
        .expect("Failed to get base workspace status");
    let stacked_status = treq_lib::core::workspace_status(stacked_path.to_str().unwrap())
        .expect("Failed to get stacked workspace status");

    // Both should have the same DAG (shows full hierarchy)
    assert_eq!(
        base_status.dag_nodes.len(),
        stacked_status.dag_nodes.len(),
        "DAG should be the same for all workspaces in hierarchy"
    );
    assert_eq!(
        base_status.dag_nodes.len(),
        2,
        "DAG should contain 2 workspaces (base + stacked)"
    );

    // Base workspace should show stacked as a child
    assert_eq!(
        base_status.children.len(),
        1,
        "Base workspace should have 1 child"
    );
    assert_eq!(
        base_status.children[0].branch_name, "feat/stacked",
        "Child should be the stacked workspace"
    );
    assert!(
        base_status.target.is_none(),
        "Base workspace should have no target"
    );

    // Stacked workspace should show base as target
    assert!(
        stacked_status.target.is_some(),
        "Stacked workspace should have a target"
    );
    assert_eq!(
        stacked_status.target.as_ref().unwrap().branch_name,
        "feat/base",
        "Target should be the base workspace"
    );
    assert_eq!(
        stacked_status.children.len(),
        0,
        "Stacked workspace should have no children"
    );

    // Verify DAG structure
    let base_node = base_status
        .dag_nodes
        .iter()
        .find(|n| n.workspace.branch_name == "feat/base")
        .expect("Base should be in DAG");
    let stacked_node = base_status
        .dag_nodes
        .iter()
        .find(|n| n.workspace.branch_name == "feat/stacked")
        .expect("Stacked should be in DAG");

    assert_eq!(base_node.depth, 0, "Base should be at depth 0");
    assert_eq!(stacked_node.depth, 1, "Stacked should be at depth 1");
    assert!(base_node.parent_id.is_none(), "Base has no parent");
    assert_eq!(
        stacked_node.parent_id,
        Some(base.id),
        "Stacked parent_id should point to base"
    );
    assert_eq!(
        base_node.child_ids,
        vec![stacked.id],
        "Base child_ids should contain stacked"
    );
}

// =============================================================================
// Test: Can merge a workspace
// =============================================================================

#[test]
fn test_can_merge_workspace_into_home_repo() {
    let repo = TestRepo::new().expect("Failed to create test repo");

    // Create workspace
    let workspace: Workspace = treq_lib::core::create_workspace(
        &repo.repo_path,
        "feature-merge",
        Some("merging feature"),
        None,
    )
    .expect("Failed to create workspace");

    let workspace_path = repo.workspaces_dir().join(&workspace.workspace_path);
    let workspace_path_str = workspace_path.to_str().unwrap();

    // Add a file to the workspace and commit
    let feature_file = workspace_path.join("merge-feature.txt");
    fs::write(&feature_file, "merge feature content").expect("Failed to write feature file");
    treq_lib::jj::jj_commit(workspace_path_str, "Add merge feature").expect("Failed to commit");

    // Get workspace status - should show commits ahead of target
    let status = treq_lib::core::workspace_status(workspace_path_str)
        .expect("Failed to get workspace status");
    assert_eq!(
        status.commits_ahead_of_target.len(),
        1,
        "Status should show 1 commit ahead of target"
    );
    assert!(
        !status.commits_ahead_of_target[0].timestamp.is_empty(),
        "Commit timestamp should be a non-empty string"
    );
    assert_ne!(
        status.commits_ahead_of_target[0].timestamp, "NaN",
        "Commit timestamp should not be NaN"
    );

    assert!(
        !status.commits_ahead_of_target[0].hash.is_empty(),
        "Commit hash should be a non-empty string"
    );
    assert!(
        !status.commits_ahead_of_target[0].message.is_empty(),
        "Commit message should be a non-empty string"
    );

    // Get the current branch before merge (should be on main)
    let initial_branch = Command::new("git")
        .current_dir(&repo.repo_path)
        .args(["rev-parse", "--abbrev-ref", "HEAD"])
        .output()
        .expect("Failed to get current branch");
    let initial_branch_str = String::from_utf8_lossy(&initial_branch.stdout)
        .trim()
        .to_string();

    // Perform the merge
    treq_lib::core::merge_workspace(
        &repo.repo_path,
        workspace.id,
        "Merge feature-merge into main",
    )
    .expect("Failed to merge workspace");

    // Verify the file is now present in the main repo
    let main_feature_file = Path::new(&repo.repo_path).join("merge-feature.txt");
    assert!(
        main_feature_file.exists(),
        "Feature file should exist in main repo after merge"
    );

    // Verify jj picks up the merge commit
    let log = JjVerifier::get_log(&repo.repo_path, 5).expect("Failed to get jj log");
    assert!(
        log.contains("Merge feature-merge into main") || log.contains("merge"),
        "JJ log should contain merge commit, got: {}",
        log
    );

    // Verify git picks up the merge commit
    let git_log = Command::new("git")
        .current_dir(&repo.repo_path)
        .args(["log", "--oneline", "-5"])
        .output()
        .expect("Failed to run git log");
    let git_log_str = String::from_utf8_lossy(&git_log.stdout);
    assert!(
        git_log_str.contains("Merge") || git_log_str.contains("merge"),
        "Git log should contain merge commit, got: {}",
        git_log_str
    );

    // Verify workspace directory is deleted
    assert!(
        !workspace_path.exists(),
        "Workspace directory should be deleted after merge"
    );

    // Verify workspace is removed from database (not in list_workspaces)
    let workspaces =
        treq_lib::core::list_workspaces(&repo.repo_path).expect("Failed to list workspaces");
    assert!(
        !workspaces.iter().any(|w| w.id == workspace.id),
        "Merged workspace should not appear in list_workspaces"
    );

    // Verify workspace is not in jj workspace list
    let jj_workspaces =
        JjVerifier::list_workspaces(&repo.repo_path).expect("Failed to list jj workspaces");
    assert!(
        !jj_workspaces.contains(&workspace.workspace_name),
        "Merged workspace should not appear in jj workspace list, got: {:?}",
        jj_workspaces
    );

    // Verify home repo is correctly checked out to the branch it was at prior to the merge
    // and is not in detached HEAD state
    let final_branch = Command::new("git")
        .current_dir(&repo.repo_path)
        .args(["rev-parse", "--abbrev-ref", "HEAD"])
        .output()
        .expect("Failed to get current branch after merge");
    let final_branch_str = String::from_utf8_lossy(&final_branch.stdout)
        .trim()
        .to_string();

    assert_eq!(
        final_branch_str, initial_branch_str,
        "Home repo should remain on the same branch after merge, was on '{}', now on '{}'",
        initial_branch_str, final_branch_str
    );

    assert!(
        final_branch_str != "HEAD",
        "Home repo should not be in detached HEAD state after merge"
    );
}

// TODO: rolling merge for stacked workspaces

// TODO: merge individual workspace into another workspace

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
fn test_can_update_workspace() {
    let repo = TestRepo::new().expect("Failed to create test repo");

    let workspace: Workspace = treq_lib::core::create_workspace(
        &repo.repo_path,
        "feat/update-test",
        Some("initial feature"),
        None,
    )
    .expect("Failed to create workspace");

    let updated = treq_lib::core::update_workspace(
        &repo.repo_path,
        workspace.id,
        MaybeEmptyParam::Omitted,
        MaybeEmptyParam::Some("develop different feature".to_string()),
    )
    .expect("Failed to update workspace");

    // correctly updates intent
    assert_eq!(
        updated.intent,
        Some("develop different feature".to_string()),
        "Workspace intent should be updated"
    );
    assert_eq!(
        updated.branch_name, workspace.branch_name,
        "Workspace branch name should remain unchanged after update"
    );
}

#[test]
fn test_update_workspace_target_branch_perform_rebase() {
    let repo = TestRepo::new().expect("Failed to create test repo");

    // base is
    let workspace: Workspace = treq_lib::core::create_workspace(
        &repo.repo_path,
        "feat/initial",
        Some("initial feature"),
        None,
    )
    .expect("Failed to create workspace");

    // create the develop branch
    let create_branch_args: &[&str] = &["checkout", "-b", "develop"];
    TestRepo::run_git(&repo.repo_path, create_branch_args)
        .expect("Failed to create develop branch");

    // add a commit to the develop branch
    repo.commit_file("develop.txt", "develop content", "Develop commit")
        .expect("Failed to commit");

    // check out main branch on the home repo

    let checkout_args: &[&str] = &["checkout", "main"];
    TestRepo::run_git(&repo.repo_path, checkout_args).expect("Failed to checkout main");

    // change the target branch of the workspace to the develop branch
    let updated = treq_lib::core::update_workspace(
        &repo.repo_path,
        workspace.id,
        MaybeEmptyParam::Some("develop".to_string()),
        MaybeEmptyParam::Omitted,
    )
    .expect("Failed to update workspace");

    assert_eq!(
        updated.target_branch,
        Some("develop".to_string()),
        "Workspace target branch should be updated to develop"
    );
    assert_eq!(
        updated.branch_name,
        "feat/initial".to_string(),
        "Workspace branch name should remain unchanged after update"
    );
    assert_eq!(updated.intent, None, "Workspace intent should be unchanged");

    // verify that the workspace is rebased onto the develop branch, check that develop.txt is present in workspace
    let workspace_path = repo.workspaces_dir().join(&workspace.workspace_path);
    let develop_file_path = workspace_path.join("develop.txt");
    assert!(
        develop_file_path.exists(),
        "develop.txt should exist in workspace after rebase"
    );

    // verify jj that Develop commit is in jj log
    let log = JjVerifier::get_log_previous_commit(&workspace_path.to_str().unwrap())
        .expect("Failed to get jj log");
    assert!(
        log.contains("Develop commit"),
        "JJ log should contain develop commit, got: {}",
        log
    );
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

    let workspace =
        treq_lib::core::create_workspace(&repo.repo_path, "base", Some("feature-base"), None)
            .expect("Failed to create base workspace");

    let workspace_path = repo.workspaces_dir().join(&workspace.workspace_path);
    let file_path = workspace_path.join("README.md");
    fs::write(&file_path, "some content").expect("Failed to write base file");

    let stacked_workspace =
        treq_lib::core::stack_workspace(&repo.repo_path, Some(&workspace), Some("feat/stacked"))
            .expect("Failed to create stacked workspace");
    // before, not conflicted
    let workspaces =
        treq_lib::core::list_workspaces(&repo.repo_path).expect("Failed to list workspaces");
    assert_eq!(
        workspaces[0].has_conflicts, false,
        "Workspace should not be marked as conflicted"
    );
    assert_eq!(
        workspaces[1].has_conflicts, false,
        "Workspace should not be marked as conflicted"
    );

    let stacked_workspace_path = repo
        .workspaces_dir()
        .join(&stacked_workspace.workspace_path);
    fs::write(
        &stacked_workspace_path.join("README.md"),
        "different stacked content",
    )
    .expect("Failed to write  file");

    fs::remove_file(&workspace_path.join("README.md")).expect("Failed to delete workspace file");

    let workspaces =
        treq_lib::core::list_workspaces(&repo.repo_path).expect("Failed to list workspaces");
    let stacked = workspaces
        .iter()
        .find(|w| w.workspace_path == stacked_workspace.workspace_path)
        .expect("Stacked workspace should exist");
    assert_eq!(
        stacked.has_conflicts, true,
        "Stacked workspace should be marked as conflicted"
    );

    // Fetch workspace status
    let status = treq_lib::core::workspace_status(workspace_path.to_str().unwrap())
        .expect("Failed to get workspace status");

    // Workspace list in status should correctly indicate conflicts
    assert_eq!(
        status.conflicted_workspace_ids.len(),
        1,
        "Should have 1 conflicted workspace"
    );
    assert!(
        status
            .conflicted_workspace_ids
            .contains(&stacked_workspace.id),
        "Stacked workspace should be marked as conflicted"
    );

    // Verify DAG reflects conflict status
    let stacked_node = status
        .dag_nodes
        .iter()
        .find(|n| n.workspace.id == stacked_workspace.id)
        .expect("Stacked workspace should be in DAG");
    assert!(
        stacked_node.workspace.has_conflicts,
        "Stacked workspace node should have has_conflicts = true"
    );

    // Base workspace should not be conflicted
    let base_node = status
        .dag_nodes
        .iter()
        .find(|n| n.workspace.id == workspace.id)
        .expect("Base workspace should be in DAG");
    assert!(
        !base_node.workspace.has_conflicts,
        "Base workspace should not have conflicts"
    );
}
