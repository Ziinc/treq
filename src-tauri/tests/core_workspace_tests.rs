mod e2e_test_helpers;

use e2e_test_helpers::{JjVerifier, TestRepo};
use std::fs;
use std::path::Path;
use std::process::Command;

use treq_lib::core::{MaybeEmptyParam, MergeCommit, RemoteSyncStatus};
use treq_lib::jj;
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
        Some("new feature".to_string()),
        None, // moved_files
        None, // source_branch (defaults to current)
        None,
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
        Some("feature-remote".to_string()),
        None, // moved_files
        None,
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
    let base: Workspace = treq_lib::core::create_workspace(
        &repo.repo_path,
        "feat/base",
        Some("feature-base".to_string()),
        None,
        None,
        None,
    )
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
    let base_status = treq_lib::core::workspace_status(&repo.repo_path, Some(base.id))
        .expect("Failed to get base workspace status");
    let stacked_status = treq_lib::core::workspace_status(&repo.repo_path, Some(stacked.id))
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
        .find(|n| n.status.current.branch_name == "feat/base")
        .expect("Base should be in DAG");
    let stacked_node = base_status
        .dag_nodes
        .iter()
        .find(|n| n.status.current.branch_name == "feat/stacked")
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
        Some("merging feature".to_string()),
        None,
        None,
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
    let status = treq_lib::core::workspace_status(&repo.repo_path, Some(workspace.id))
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
        MergeCommit::Merge,
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

#[test]
fn test_can_squash_merge_workspace_into_home_repo() {
    let repo = TestRepo::new().expect("Failed to create test repo");

    let workspace: Workspace = treq_lib::core::create_workspace(
        &repo.repo_path,
        "feature-squash",
        Some("squashing feature".to_string()),
        None,
        None,
        None,
    )
    .expect("Failed to create workspace");

    let workspace_path = repo.workspaces_dir().join(&workspace.workspace_path);
    let workspace_path_str = workspace_path.to_str().unwrap();

    let feature_file = workspace_path.join("squash-feature.txt");
    fs::write(&feature_file, "squash feature content").expect("Failed to write feature file");
    treq_lib::jj::jj_commit(workspace_path_str, "Add squash feature").expect("Failed to commit");

    treq_lib::core::merge_workspace(
        &repo.repo_path,
        workspace.id,
        "Squash feature-squash into main",
        MergeCommit::Squash,
    )
    .expect("Failed to squash merge workspace");

    let main_feature_file = Path::new(&repo.repo_path).join("squash-feature.txt");
    assert!(
        main_feature_file.exists(),
        "Feature file should exist in main repo after squash merge"
    );

    let git_log = Command::new("git")
        .current_dir(&repo.repo_path)
        .args(["log", "-1", "--pretty=%s"])
        .output()
        .expect("Failed to run git log");
    let git_log_str = String::from_utf8_lossy(&git_log.stdout);
    assert_eq!(
        git_log_str.trim(),
        "Squash feature-squash into main",
        "Git log should contain the squash commit message, got: {}",
        git_log_str
    );

    assert!(
        !workspace_path.exists(),
        "Workspace directory should be deleted after squash merge"
    );

    let workspaces =
        treq_lib::core::list_workspaces(&repo.repo_path).expect("Failed to list workspaces");
    assert!(
        !workspaces.iter().any(|w| w.id == workspace.id),
        "Squashed workspace should not appear in list_workspaces"
    );
}

#[test]
fn test_can_rebase_merge_workspace_into_home_repo() {
    let repo = TestRepo::new().expect("Failed to create test repo");

    let workspace: Workspace = treq_lib::core::create_workspace(
        &repo.repo_path,
        "feature-rebase",
        Some("rebasing feature".to_string()),
        None,
        None,
        None,
    )
    .expect("Failed to create workspace");

    let workspace_path = repo.workspaces_dir().join(&workspace.workspace_path);
    let workspace_path_str = workspace_path.to_str().unwrap();

    let feature_file = workspace_path.join("rebase-feature.txt");
    fs::write(&feature_file, "rebase feature content").expect("Failed to write feature file");
    treq_lib::jj::jj_commit(workspace_path_str, "Add rebase feature")
        .expect("Failed to commit");

    treq_lib::core::merge_workspace(
        &repo.repo_path,
        workspace.id,
        "Rebase feature-rebase onto main",
        MergeCommit::Rebase,
    )
    .expect("Failed to rebase merge workspace");

    let main_feature_file = Path::new(&repo.repo_path).join("rebase-feature.txt");
    assert!(
        main_feature_file.exists(),
        "Feature file should exist in main repo after rebase merge"
    );

    let git_log = Command::new("git")
        .current_dir(&repo.repo_path)
        .args(["log", "-1", "--pretty=%s"])
        .output()
        .expect("Failed to run git log");
    let git_log_str = String::from_utf8_lossy(&git_log.stdout);
    assert_eq!(
        git_log_str.trim(),
        "Add rebase feature",
        "Git log should contain the rebased commit message, got: {}",
        git_log_str
    );

    assert!(
        !workspace_path.exists(),
        "Workspace directory should be deleted after rebase merge"
    );

    let workspaces =
        treq_lib::core::list_workspaces(&repo.repo_path).expect("Failed to list workspaces");
    assert!(
        !workspaces.iter().any(|w| w.id == workspace.id),
        "Rebased workspace should not appear in list_workspaces"
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
        Some("delete feature".to_string()),
        None,
        None,
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
// Test: Deleting a parent workspace re-targets its direct children to default branch
// =============================================================================

#[test]
fn test_delete_workspace_retargets_children_to_default_branch() {
    let repo = TestRepo::new().expect("Failed to create test repo");

    // Create parent workspace
    let parent: Workspace = treq_lib::core::create_workspace(
        &repo.repo_path,
        "feat/parent",
        Some("parent feature".to_string()),
        None,
        None,
        None,
    )
    .expect("Failed to create parent workspace");

    // Stack two direct children on the parent
    let child1: Workspace =
        treq_lib::core::stack_workspace(&repo.repo_path, Some(&parent), Some("feat/child1"))
            .expect("Failed to create child1 workspace");

    let child2: Workspace =
        treq_lib::core::stack_workspace(&repo.repo_path, Some(&parent), Some("feat/child2"))
            .expect("Failed to create child2 workspace");

    // Stack a grandchild on child1 — should NOT be re-targeted
    let grandchild: Workspace =
        treq_lib::core::stack_workspace(&repo.repo_path, Some(&child1), Some("feat/grandchild"))
            .expect("Failed to create grandchild workspace");

    // Verify initial target branches
    assert_eq!(
        child1.target_branch,
        Some("feat/parent".to_string()),
        "child1 should target feat/parent"
    );
    assert_eq!(
        child2.target_branch,
        Some("feat/parent".to_string()),
        "child2 should target feat/parent"
    );
    assert_eq!(
        grandchild.target_branch,
        Some("feat/child1".to_string()),
        "grandchild should target feat/child1"
    );

    // Delete the parent workspace
    let result = treq_lib::core::delete_workspace(&repo.repo_path, &parent.id)
        .expect("Failed to delete parent workspace");
    assert!(result, "delete_workspace should return true");

    // Both direct children should now target the default branch
    let workspaces =
        treq_lib::local_db::get_workspaces(&repo.repo_path).expect("Failed to get workspaces");

    let updated_child1 = workspaces
        .iter()
        .find(|w| w.id == child1.id)
        .expect("child1 should still exist");
    let updated_child2 = workspaces
        .iter()
        .find(|w| w.id == child2.id)
        .expect("child2 should still exist");
    let updated_grandchild = workspaces
        .iter()
        .find(|w| w.id == grandchild.id)
        .expect("grandchild should still exist");

    assert_eq!(
        updated_child1.target_branch,
        Some("main".to_string()),
        "child1 target_branch should be re-targeted to main"
    );
    assert_eq!(
        updated_child2.target_branch,
        Some("main".to_string()),
        "child2 target_branch should be re-targeted to main"
    );
    // Grandchild must NOT be affected — it still targets child1
    assert_eq!(
        updated_grandchild.target_branch,
        Some("feat/child1".to_string()),
        "grandchild target_branch should remain feat/child1 (not re-targeted)"
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
        Some("initial feature".to_string()),
        None,
        None,
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
        Some("initial feature".to_string()),
        None,
        None,
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
    assert_eq!(
        updated.intent,
        Some("initial feature".to_string()),
        "Workspace intent should remain unchanged from creation"
    );

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

    treq_lib::core::create_workspace(
        &repo.repo_path,
        "feat/a",
        Some("feature-a".to_string()),
        None,
        None,
        None,
    )
    .expect("Failed to create workspace");
    treq_lib::core::create_workspace(
        &repo.repo_path,
        "feat/b",
        Some("feature-b".to_string()),
        None,
        None,
        None,
    )
    .expect("Failed to create workspace");
    treq_lib::core::create_workspace(
        &repo.repo_path,
        "feat/c",
        Some("feature-c".to_string()),
        None,
        None,
        None,
    )
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

    let workspace = treq_lib::core::create_workspace(
        &repo.repo_path,
        "base",
        Some("feature-base".to_string()),
        None,
        None,
        None,
    )
    .expect("Failed to create base workspace");

    let workspace_path = repo.workspaces_dir().join(&workspace.workspace_path);
    let file_path = workspace_path.join("README.md");
    fs::write(&file_path, "some content").expect("Failed to write base file");

    let stacked_workspace =
        treq_lib::core::stack_workspace(&repo.repo_path, Some(&workspace), Some("feat/stacked"))
            .expect("Failed to create stacked workspace");
    let stacked_workspace_path = repo
        .workspaces_dir()
        .join(&stacked_workspace.workspace_path);

    // Verify has_changes via list_workspace_statuses:
    // base has changes (wrote README.md), stacked does not yet
    let statuses = treq_lib::core::list_workspace_statuses(&repo.repo_path)
        .expect("Failed to list workspace statuses");
    let base_status_before = statuses
        .iter()
        .find(|s| s.current.id == workspace.id)
        .unwrap();
    let stacked_status_before = statuses
        .iter()
        .find(|s| s.current.id == stacked_workspace.id)
        .unwrap();
    assert!(
        !base_status_before.has_conflicts,
        "Base workspace should not be marked as conflicted"
    );
    assert!(
        !stacked_status_before.has_conflicts,
        "Stacked workspace should not be marked as conflicted"
    );
    assert!(
        base_status_before.has_changes,
        "Base workspace should have changes (wrote README.md)"
    );
    assert!(
        !stacked_status_before.has_changes,
        "Stacked workspace should not have changes yet"
    );
    // Both workspaces should have 0 commits ahead (no commits yet, only uncommitted changes)
    assert_eq!(
        base_status_before.commits_ahead, 0,
        "Base workspace should have 0 commits ahead (only uncommitted changes)"
    );
    assert_eq!(
        stacked_status_before.commits_ahead, 0,
        "Stacked workspace should have 0 commits ahead"
    );

    // Write to stacked workspace README.md and verify has_changes flips to true
    fs::write(&stacked_workspace_path.join("README.md"), "stacked content")
        .expect("Failed to write file");
    let statuses = treq_lib::core::list_workspace_statuses(&repo.repo_path)
        .expect("Failed to list workspace statuses");
    let stacked_status_with_change = statuses
        .iter()
        .find(|s| s.current.id == stacked_workspace.id)
        .unwrap();
    assert!(
        stacked_status_with_change.has_changes,
        "Stacked workspace should have changes after writing a file"
    );

    // Now create a modify-vs-modify conflict scenario:
    // Both workspaces modify README.md to different content
    fs::write(
        &stacked_workspace_path.join("README.md"),
        "stacked version of README",
    )
    .expect("Failed to write stacked file");
    fs::write(&workspace_path.join("README.md"), "base version of README")
        .expect("Failed to write base file");

    // list_workspace_statuses should trigger jj snapshot for base workspace,
    // which makes the stacked workspace stale, then detect the conflict
    let statuses = treq_lib::core::list_workspace_statuses(&repo.repo_path)
        .expect("Failed to list workspace statuses");
    let stacked_status = statuses
        .iter()
        .find(|s| s.current.workspace_path == stacked_workspace.workspace_path)
        .expect("Stacked workspace should exist");
    assert!(
        stacked_status.has_conflicts,
        "Stacked workspace should be marked as conflicted"
    );

    // Fetch workspace status
    let status = treq_lib::core::workspace_status(&repo.repo_path, Some(workspace.id))
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
        .find(|n| n.status.current.id == stacked_workspace.id)
        .expect("Stacked workspace should be in DAG");
    assert!(
        stacked_node.status.has_conflicts,
        "Stacked workspace node should have has_conflicts = true"
    );

    // Base workspace should not be conflicted
    let base_node = status
        .dag_nodes
        .iter()
        .find(|n| n.status.current.id == workspace.id)
        .expect("Base workspace should be in DAG");
    assert!(
        !base_node.status.has_conflicts,
        "Base workspace should not have conflicts"
    );
}

// =============================================================================
// Test: Push workspace to remote
// =============================================================================

#[test]
fn test_push_workspace_to_remote() {
    let repo = TestRepo::with_remote().expect("Failed to create test repo with remote");

    // Test 1: Invalid workspace_id fails
    let result = treq_lib::core::push_workspace_to_remote(&repo.repo_path, Some(99999));
    assert!(
        result.is_err(),
        "Push with invalid workspace_id should fail"
    );
    assert!(
        result.unwrap_err().to_lowercase().contains("not found"),
        "Error should indicate workspace not found"
    );

    // Test 2: Create workspace and verify it's marked as not_on_remote
    let workspace = treq_lib::core::create_workspace(
        &repo.repo_path,
        "test-workspace",
        Some("test workspace".to_string()),
        None,
        None,
        None,
    )
    .expect("Failed to create workspace");

    assert!(
        workspace.not_on_remote,
        "New workspace should be marked as not_on_remote"
    );

    // Test 3: Add a file and commit to the workspace
    let workspace_path = repo.workspaces_dir().join(&workspace.workspace_path);
    let test_file = workspace_path.join("test-push.txt");
    fs::write(&test_file, "test push content").expect("Failed to write test file");
    treq_lib::jj::jj_commit(workspace_path.to_str().unwrap(), "Add test push file")
        .expect("Failed to commit");

    // Test 4: Push workspace to remote (should succeed now)
    let result_push = treq_lib::core::push_workspace_to_remote(&repo.repo_path, Some(workspace.id));
    assert!(
        result_push.is_ok(),
        "Push should succeed with proper remote setup, got: {:?}",
        result_push.err()
    );

    // Test 5: Verify file was pushed to remote by checking remote branch
    let remote_dir = repo.temp_dir.path().join("remote.git");
    let verify_file = Command::new("git")
        .current_dir(&remote_dir)
        .args(["show", &format!("{}:test-push.txt", workspace.branch_name)])
        .output()
        .expect("Failed to verify file in remote");
    assert!(
        verify_file.status.success(),
        "File should exist in remote branch"
    );
    let remote_file_content = String::from_utf8_lossy(&verify_file.stdout);
    assert!(
        remote_file_content.contains("test push content"),
        "Remote file should contain correct content, got: {}",
        remote_file_content
    );

    // Test 6: Verify not_on_remote flag was cleared after successful push
    let workspace_after_push =
        treq_lib::local_db::get_workspace_by_id(&repo.repo_path, workspace.id)
            .expect("Failed to get workspace from db")
            .expect("Workspace should exist after push");
    assert!(
        !workspace_after_push.not_on_remote,
        "not_on_remote flag should be cleared after successful push"
    );
}

#[test]
fn test_push_home_repo_to_remote() {
    let repo = TestRepo::with_remote().expect("Failed to create test repo with remote");

    // Test 1: Create a workspace to verify home repo push doesn't affect workspace flags
    let workspace = treq_lib::core::create_workspace(
        &repo.repo_path,
        "workspace-for-home-test",
        Some("test".to_string()),
        None,
        None,
        None,
    )
    .expect("Failed to create workspace");

    assert!(
        workspace.not_on_remote,
        "Workspace should be marked as not_on_remote"
    );

    // Test 2: Test push home repo (None workspace_id) succeeds with remote setup
    let result_push = treq_lib::core::push_workspace_to_remote(&repo.repo_path, None);
    assert!(
        result_push.is_ok(),
        "Push home repo to remote should succeed with proper remote setup, got: {:?}",
        result_push.err()
    );

    // Test 3: Verify home repo push didn't affect workspace flags
    let workspace_after_push =
        treq_lib::local_db::get_workspace_by_id(&repo.repo_path, workspace.id)
            .expect("Failed to get workspace from db")
            .expect("Workspace should exist after push");

    assert!(
        workspace_after_push.not_on_remote,
        "Workspace not_on_remote flag should NOT be modified by home repo push"
    );
}

// =============================================================================
// Test: moved_files are stored correctly (main repo -> workspace)
// =============================================================================

#[test]
fn test_moved_files_from_main_repo() {
    let repo = TestRepo::new().expect("Failed to create test repo");

    // Create test files in the main repo
    let file1_path = Path::new(&repo.repo_path).join("feature1.rs");
    let file2_path = Path::new(&repo.repo_path).join("feature2.rs");
    fs::write(&file1_path, "// Feature 1 code").expect("Failed to create file1");
    fs::write(&file2_path, "// Feature 2 code").expect("Failed to create file2");

    // Verify files exist in main repo
    assert!(file1_path.exists(), "feature1.rs should exist in main repo");
    assert!(file2_path.exists(), "feature2.rs should exist in main repo");

    // jj auto-tracks files, no need to explicitly add them

    // Create workspace with moved_files metadata
    let moved_files = vec!["feature1.rs".to_string(), "feature2.rs".to_string()];
    let workspace = treq_lib::core::create_workspace(
        &repo.repo_path,
        "feat/refactor",
        Some("refactor code".to_string()),
        Some(moved_files.clone()),
        None,
        None,
    )
    .expect("Failed to create workspace");

    // Verify workspace has moved_files set
    assert_eq!(
        workspace.moved_files,
        Some(moved_files.clone()),
        "Workspace should have moved_files set after creation"
    );

    // Verify workspace has intent set
    assert_eq!(
        workspace.intent,
        Some("refactor code".to_string()),
        "Workspace should have intent set"
    );

    // Verify the workspace directory exists and is a valid jj workspace
    let workspace_path = Path::new(&repo.repo_path)
        .join(".treq")
        .join("workspaces")
        .join(&workspace.workspace_path);

    // Verify files are now in the workspace (moved by create_workspace when moved_files provided)
    let file1_in_workspace = workspace_path.join("feature1.rs");
    let file2_in_workspace = workspace_path.join("feature2.rs");
    assert!(
        file1_in_workspace.exists(),
        "feature1.rs should exist in workspace after create_workspace"
    );
    assert!(
        file2_in_workspace.exists(),
        "feature2.rs should exist in workspace after create_workspace"
    );

    // Verify files are no longer in main repo
    assert!(
        !file1_path.exists(),
        "feature1.rs should be removed from main repo after squash"
    );
    assert!(
        !file2_path.exists(),
        "feature2.rs should be removed from main repo after squash"
    );
}

// =============================================================================
// Test: Split workspace — move files after
// =============================================================================

#[test]
fn test_split_workspace_move_files_after() {
    use treq_lib::core::{SplitMode, SplitPosition};

    let repo = TestRepo::new().expect("Failed to create test repo");

    // Create source workspace with some files
    let source = treq_lib::core::create_workspace(
        &repo.repo_path,
        "feat/source",
        Some("source feature".to_string()),
        None,
        None,
        None,
    )
    .expect("Failed to create source workspace");

    let source_path = repo.workspaces_dir().join(&source.workspace_path);

    // Add files to source workspace
    fs::write(source_path.join("file1.txt"), "content 1").expect("Failed to write file1");
    fs::write(source_path.join("file2.txt"), "content 2").expect("Failed to write file2");
    fs::write(source_path.join("file3.txt"), "content 3").expect("Failed to write file3");

    // Split: move file1.txt and file2.txt to new workspace, positioned after source
    let new_workspace = treq_lib::core::split_workspace(
        &repo.repo_path,
        source.id,
        "feat/split-after",
        Some("split files".to_string()),
        Some(vec!["file1.txt".to_string(), "file2.txt".to_string()]),
        None,
        SplitMode::Move,
        SplitPosition::After,
    )
    .expect("Failed to split workspace");

    let new_path = repo.workspaces_dir().join(&new_workspace.workspace_path);

    // New workspace should have the selected files
    assert!(
        new_path.join("file1.txt").exists(),
        "file1.txt should exist in new workspace"
    );
    assert!(
        new_path.join("file2.txt").exists(),
        "file2.txt should exist in new workspace"
    );

    // Source should no longer have those files
    assert!(
        !source_path.join("file1.txt").exists(),
        "file1.txt should be removed from source"
    );
    assert!(
        !source_path.join("file2.txt").exists(),
        "file2.txt should be removed from source"
    );

    // Source should still have file3.txt
    assert!(
        source_path.join("file3.txt").exists(),
        "file3.txt should remain in source"
    );

    // New workspace's target_branch should point to source's branch_name
    assert_eq!(
        new_workspace.target_branch.as_deref(),
        Some("feat/source"),
        "New workspace target should be source's branch"
    );

    // Verify DAG structure
    let status = treq_lib::core::workspace_status(&repo.repo_path, Some(source.id))
        .expect("Failed to get workspace status");
    assert_eq!(
        status.children.len(),
        1,
        "Source should have 1 child (the new workspace)"
    );
    assert_eq!(
        status.children[0].branch_name, "feat/split-after",
        "Child should be the split workspace"
    );
}

// =============================================================================
// Test: Split workspace — move files before
// =============================================================================

#[test]
fn test_split_workspace_move_files_before() {
    use treq_lib::core::{SplitMode, SplitPosition};

    let repo = TestRepo::new().expect("Failed to create test repo");

    let source = treq_lib::core::create_workspace(
        &repo.repo_path,
        "feat/source-before",
        Some("source feature".to_string()),
        None,
        None,
        None,
    )
    .expect("Failed to create source workspace");

    let source_path = repo.workspaces_dir().join(&source.workspace_path);

    fs::write(source_path.join("file1.txt"), "content 1").expect("Failed to write file1");
    fs::write(source_path.join("file2.txt"), "content 2").expect("Failed to write file2");

    // Split: move file1.txt before source
    let new_workspace = treq_lib::core::split_workspace(
        &repo.repo_path,
        source.id,
        "feat/split-before",
        Some("split before".to_string()),
        Some(vec!["file1.txt".to_string()]),
        None,
        SplitMode::Move,
        SplitPosition::Before,
    )
    .expect("Failed to split workspace before");

    let new_path = repo.workspaces_dir().join(&new_workspace.workspace_path);

    // New workspace should have file1.txt
    assert!(
        new_path.join("file1.txt").exists(),
        "file1.txt should exist in new workspace"
    );

    // Source should no longer have file1.txt
    assert!(
        !source_path.join("file1.txt").exists(),
        "file1.txt should be removed from source"
    );

    // Source should still have file2.txt
    assert!(
        source_path.join("file2.txt").exists(),
        "file2.txt should remain in source"
    );

    // New workspace's target should be source's old target (main, since source had no target)
    assert_eq!(
        new_workspace.target_branch.as_deref(),
        Some("main"),
        "New workspace's target should be source's original target"
    );

    // Source's target should now point to new workspace's branch
    let updated_source = treq_lib::local_db::get_workspace_by_id(&repo.repo_path, source.id)
        .expect("Failed to get source")
        .expect("Source should exist");
    assert_eq!(
        updated_source.target_branch.as_deref(),
        Some("feat/split-before"),
        "Source target should be updated to new workspace's branch"
    );

    // Verify DAG: new workspace is between main and source
    let status = treq_lib::core::workspace_status(&repo.repo_path, Some(new_workspace.id))
        .expect("Failed to get workspace status");

    // New workspace should have source as child
    assert_eq!(
        status.children.len(),
        1,
        "New workspace should have 1 child (the source)"
    );
    assert_eq!(
        status.children[0].branch_name, "feat/source-before",
        "Child should be the original source"
    );
}

// =============================================================================
// Test: Split workspace — copy files after
// =============================================================================

#[test]
fn test_split_workspace_copy_files_after() {
    use treq_lib::core::{SplitMode, SplitPosition};

    let repo = TestRepo::new().expect("Failed to create test repo");

    let source = treq_lib::core::create_workspace(
        &repo.repo_path,
        "feat/copy-source",
        Some("copy source".to_string()),
        None,
        None,
        None,
    )
    .expect("Failed to create source workspace");

    let source_path = repo.workspaces_dir().join(&source.workspace_path);

    fs::write(source_path.join("shared.txt"), "shared content").expect("Failed to write");
    fs::write(source_path.join("unique.txt"), "unique content").expect("Failed to write");

    // Copy shared.txt to new workspace after source
    let new_workspace = treq_lib::core::split_workspace(
        &repo.repo_path,
        source.id,
        "feat/copy-after",
        None,
        Some(vec!["shared.txt".to_string()]),
        None,
        SplitMode::Copy,
        SplitPosition::After,
    )
    .expect("Failed to copy-split workspace");

    let new_path = repo.workspaces_dir().join(&new_workspace.workspace_path);

    // New workspace should have the copied file
    assert!(
        new_path.join("shared.txt").exists(),
        "shared.txt should exist in new workspace"
    );

    // Source should STILL have the file (copy, not move)
    assert!(
        source_path.join("shared.txt").exists(),
        "shared.txt should still exist in source (copy mode)"
    );
    assert!(
        source_path.join("unique.txt").exists(),
        "unique.txt should remain in source"
    );

    // Stacking should be correct
    assert_eq!(
        new_workspace.target_branch.as_deref(),
        Some("feat/copy-source"),
        "New workspace should be stacked on source"
    );
}

// =============================================================================
// Test: Split workspace — copy files before
// =============================================================================

#[test]
fn test_split_workspace_copy_files_before() {
    use treq_lib::core::{SplitMode, SplitPosition};

    let repo = TestRepo::new().expect("Failed to create test repo");

    let source = treq_lib::core::create_workspace(
        &repo.repo_path,
        "feat/copy-source-before",
        Some("copy before source".to_string()),
        None,
        None,
        None,
    )
    .expect("Failed to create source workspace");

    let source_path = repo.workspaces_dir().join(&source.workspace_path);

    fs::write(source_path.join("shared.txt"), "shared content").expect("Failed to write");

    let new_workspace = treq_lib::core::split_workspace(
        &repo.repo_path,
        source.id,
        "feat/copy-before",
        None,
        Some(vec!["shared.txt".to_string()]),
        None,
        SplitMode::Copy,
        SplitPosition::Before,
    )
    .expect("Failed to copy-split before");

    let new_path = repo.workspaces_dir().join(&new_workspace.workspace_path);

    // Both should have the file
    assert!(
        new_path.join("shared.txt").exists(),
        "shared.txt should exist in new workspace"
    );
    assert!(
        source_path.join("shared.txt").exists(),
        "shared.txt should still exist in source"
    );

    // New workspace target = source's old target (main)
    assert_eq!(
        new_workspace.target_branch.as_deref(),
        Some("main"),
        "New workspace's target should be main"
    );

    // Source's target should point to new workspace
    let updated_source = treq_lib::local_db::get_workspace_by_id(&repo.repo_path, source.id)
        .expect("Failed to get source")
        .expect("Source should exist");
    assert_eq!(
        updated_source.target_branch.as_deref(),
        Some("feat/copy-before"),
        "Source target should point to new workspace"
    );
}

// =============================================================================
// Test: Split workspace — move commits after
// =============================================================================

#[test]
fn test_split_workspace_move_commits_after() {
    use treq_lib::core::{SplitMode, SplitPosition};

    let repo = TestRepo::new().expect("Failed to create test repo");

    let source = treq_lib::core::create_workspace(
        &repo.repo_path,
        "feat/commit-source",
        Some("commit source".to_string()),
        None,
        None,
        None,
    )
    .expect("Failed to create source workspace");

    let source_path = repo.workspaces_dir().join(&source.workspace_path);
    let source_path_str = source_path.to_str().unwrap();

    // Create multiple commits in the source workspace
    fs::write(source_path.join("commit1.txt"), "commit 1 content").expect("Failed to write");
    treq_lib::jj::jj_commit(source_path_str, "First commit").expect("Failed to commit");

    fs::write(source_path.join("commit2.txt"), "commit 2 content").expect("Failed to write");
    treq_lib::jj::jj_commit(source_path_str, "Second commit").expect("Failed to commit");

    // Get commits ahead of main to extract change_ids
    let commits_ahead = treq_lib::jj::jj_get_commits_ahead(source_path_str, "main")
        .expect("Failed to get commits ahead");

    assert!(
        commits_ahead.commits.len() >= 2,
        "Should have at least 2 commits, got {}",
        commits_ahead.commits.len()
    );

    // Move the first commit to new workspace
    let first_commit_change_id = commits_ahead.commits.last().unwrap().change_id.clone();

    let new_workspace = treq_lib::core::split_workspace(
        &repo.repo_path,
        source.id,
        "feat/commit-split",
        Some("split commits".to_string()),
        None,
        Some(vec![first_commit_change_id]),
        SplitMode::Move,
        SplitPosition::After,
    )
    .expect("Failed to split commits");

    let new_path = repo.workspaces_dir().join(&new_workspace.workspace_path);

    // New workspace should have commit1.txt (from the moved commit)
    assert!(
        new_path.join("commit1.txt").exists(),
        "commit1.txt should exist in new workspace"
    );

    // Source should no longer have commit1.txt
    assert!(
        !source_path.join("commit1.txt").exists(),
        "commit1.txt should be removed from source"
    );

    // Source should still have commit2.txt
    assert!(
        source_path.join("commit2.txt").exists(),
        "commit2.txt should remain in source"
    );

    // Verify stacking
    assert_eq!(
        new_workspace.target_branch.as_deref(),
        Some("feat/commit-source"),
        "New workspace should be stacked on source"
    );
}

// =============================================================================
// Test: Split workspace — move commits before
// =============================================================================

#[test]
fn test_split_workspace_move_commits_before() {
    use treq_lib::core::{SplitMode, SplitPosition};

    let repo = TestRepo::new().expect("Failed to create test repo");

    let source = treq_lib::core::create_workspace(
        &repo.repo_path,
        "feat/commit-before-source",
        Some("commit before source".to_string()),
        None,
        None,
        None,
    )
    .expect("Failed to create source workspace");

    let source_path = repo.workspaces_dir().join(&source.workspace_path);
    let source_path_str = source_path.to_str().unwrap();

    // Create commits
    fs::write(source_path.join("early.txt"), "early content").expect("Failed to write");
    treq_lib::jj::jj_commit(source_path_str, "Early commit").expect("Failed to commit");

    fs::write(source_path.join("late.txt"), "late content").expect("Failed to write");
    treq_lib::jj::jj_commit(source_path_str, "Late commit").expect("Failed to commit");

    // Get commits
    let commits_ahead =
        treq_lib::jj::jj_get_commits_ahead(source_path_str, "main").expect("Failed to get commits");

    let early_commit_id = commits_ahead.commits.last().unwrap().change_id.clone();

    // Move early commit to new workspace positioned before source
    let new_workspace = treq_lib::core::split_workspace(
        &repo.repo_path,
        source.id,
        "feat/commit-before",
        None,
        None,
        Some(vec![early_commit_id]),
        SplitMode::Move,
        SplitPosition::Before,
    )
    .expect("Failed to split commits before");

    let new_path = repo.workspaces_dir().join(&new_workspace.workspace_path);

    // New workspace should have early.txt
    assert!(
        new_path.join("early.txt").exists(),
        "early.txt should exist in new workspace"
    );

    // Source should not have early.txt (moved)
    assert!(
        !source_path.join("early.txt").exists(),
        "early.txt should be removed from source"
    );

    // Source should still have late.txt
    assert!(
        source_path.join("late.txt").exists(),
        "late.txt should remain in source"
    );

    // New workspace target should be main (source's original target)
    assert_eq!(
        new_workspace.target_branch.as_deref(),
        Some("main"),
        "New workspace target should be main"
    );

    // Source's target should point to new workspace
    let updated_source = treq_lib::local_db::get_workspace_by_id(&repo.repo_path, source.id)
        .expect("Failed to get source")
        .expect("Source should exist");
    assert_eq!(
        updated_source.target_branch.as_deref(),
        Some("feat/commit-before"),
        "Source target should point to new workspace"
    );
}

// =============================================================================
// Test: moved_files are stored correctly (workspace -> workspace)
// =============================================================================

#[test]
fn test_moved_files_from_workspace_to_workspace() {
    let repo = TestRepo::new().expect("Failed to create test repo");

    // Create base workspace
    let base_workspace = treq_lib::core::create_workspace(
        &repo.repo_path,
        "feat/base",
        Some("base feature".to_string()),
        None,
        None,
        None,
    )
    .expect("Failed to create base workspace");

    let base_path = Path::new(&repo.repo_path)
        .join(".treq")
        .join("workspaces")
        .join(&base_workspace.workspace_path);

    // Create test files in the base workspace
    let file1_path = base_path.join("component1.ts");
    let file2_path = base_path.join("component2.ts");
    fs::write(&file1_path, "// Component 1").expect("Failed to create component1");
    fs::write(&file2_path, "// Component 2").expect("Failed to create component2");

    // jj auto-tracks files, no need to explicitly add them

    // Create stacked workspace with moved_files from base
    let moved_files = vec!["component1.ts".to_string(), "component2.ts".to_string()];
    let stacked_workspace = treq_lib::core::create_workspace(
        &repo.repo_path,
        "feat/components",
        Some("extract components".to_string()),
        Some(moved_files.clone()),
        Some("feat/base"),
        None,
    )
    .expect("Failed to create stacked workspace");

    // Verify the stacked workspace directory exists and is a valid jj workspace
    let stacked_path = Path::new(&repo.repo_path)
        .join(".treq")
        .join("workspaces")
        .join(&stacked_workspace.workspace_path);

    // Verify files are now in the stacked workspace (moved by create_workspace when moved_files provided)
    let file1_in_stacked = stacked_path.join("component1.ts");
    let file2_in_stacked = stacked_path.join("component2.ts");
    assert!(
        file1_in_stacked.exists(),
        "component1.ts should exist in stacked workspace after create_workspace"
    );
    assert!(
        file2_in_stacked.exists(),
        "component2.ts should exist in stacked workspace after create_workspace"
    );

    // Verify files are no longer in the base workspace
    assert!(
        !file1_path.exists(),
        "component1.ts should be removed from base workspace after create_workspace"
    );
    assert!(
        !file2_path.exists(),
        "component2.ts should be removed from base workspace after create_workspace"
    );
}

// =============================================================================
// Test: Rename workspace — dry run with valid name
// =============================================================================

#[test]
fn test_rename_workspace_dry_run_valid_name() {
    let repo = TestRepo::new().expect("Failed to create test repo");

    let workspace = treq_lib::core::create_workspace(
        &repo.repo_path,
        "feat/original",
        Some("original feature".to_string()),
        None,
        None,
        None,
    )
    .expect("Failed to create workspace");

    // Dry run should succeed with a valid new name
    let result = treq_lib::core::rename_workspace(
        &repo.repo_path,
        workspace.id,
        "feat/new-name",
        true,
    )
    .expect("Failed to dry-run rename workspace");

    assert!(result.success, "Dry run should succeed for valid name");

    // Verify workspace is unchanged in DB
    let db_workspace = treq_lib::local_db::get_workspace_by_id(&repo.repo_path, workspace.id)
        .expect("Failed to get workspace")
        .expect("Workspace should exist");
    assert_eq!(
        db_workspace.branch_name, "feat/original",
        "Branch name should be unchanged after dry run"
    );

    // Verify jj bookmarks are unchanged
    let bookmarks =
        JjVerifier::list_bookmarks(&repo.repo_path).expect("Failed to list bookmarks");
    assert!(
        bookmarks.iter().any(|b| b == "feat/original"),
        "Original bookmark should still exist after dry run, got: {:?}",
        bookmarks
    );
    assert!(
        !bookmarks.iter().any(|b| b == "feat/new-name"),
        "New bookmark should NOT exist after dry run, got: {:?}",
        bookmarks
    );
}

// =============================================================================
// Test: Rename workspace — dry run clashes with existing branch
// =============================================================================

#[test]
fn test_rename_workspace_dry_run_clashes_with_existing_branch() {
    let repo = TestRepo::new().expect("Failed to create test repo");

    let _ws_a = treq_lib::core::create_workspace(
        &repo.repo_path,
        "feat/a",
        Some("feature a".to_string()),
        None,
        None,
        None,
    )
    .expect("Failed to create workspace A");

    let ws_b = treq_lib::core::create_workspace(
        &repo.repo_path,
        "feat/b",
        Some("feature b".to_string()),
        None,
        None,
        None,
    )
    .expect("Failed to create workspace B");

    // Try to rename B to A's branch name (should fail)
    let result = treq_lib::core::rename_workspace(
        &repo.repo_path,
        ws_b.id,
        "feat/a",
        true,
    )
    .expect("Failed to dry-run rename workspace");

    assert!(
        !result.success,
        "Dry run should fail when name clashes with existing branch"
    );
    assert!(
        result.message.to_lowercase().contains("already exists")
            || result.message.to_lowercase().contains("clash"),
        "Message should indicate branch already exists, got: {}",
        result.message
    );
}

// =============================================================================
// Test: Rename workspace — dry run same name
// =============================================================================

#[test]
fn test_rename_workspace_dry_run_same_name() {
    let repo = TestRepo::new().expect("Failed to create test repo");

    let workspace = treq_lib::core::create_workspace(
        &repo.repo_path,
        "feat/original",
        Some("original feature".to_string()),
        None,
        None,
        None,
    )
    .expect("Failed to create workspace");

    // Renaming to same name should fail
    let result = treq_lib::core::rename_workspace(
        &repo.repo_path,
        workspace.id,
        "feat/original",
        true,
    )
    .expect("Failed to dry-run rename workspace");

    assert!(
        !result.success,
        "Dry run should fail when renaming to the same name"
    );
}

// =============================================================================
// Test: Rename workspace — success (non-dry-run)
// =============================================================================

#[test]
fn test_rename_workspace_success() {
    let repo = TestRepo::new().expect("Failed to create test repo");

    let workspace = treq_lib::core::create_workspace(
        &repo.repo_path,
        "feat/original",
        Some("original feature".to_string()),
        None,
        None,
        None,
    )
    .expect("Failed to create workspace");

    // Actual rename
    let result = treq_lib::core::rename_workspace(
        &repo.repo_path,
        workspace.id,
        "feat/renamed",
        false,
    )
    .expect("Failed to rename workspace");

    assert!(result.success, "Rename should succeed");
    assert_eq!(
        result.workspace.as_ref().unwrap().branch_name,
        "feat/renamed",
        "Result workspace should have new branch name"
    );

    // Verify DB is updated
    let db_workspace = treq_lib::local_db::get_workspace_by_id(&repo.repo_path, workspace.id)
        .expect("Failed to get workspace")
        .expect("Workspace should exist");
    assert_eq!(
        db_workspace.branch_name, "feat/renamed",
        "DB branch name should be updated"
    );

    // Verify jj bookmarks
    let bookmarks =
        JjVerifier::list_bookmarks(&repo.repo_path).expect("Failed to list bookmarks");
    assert!(
        bookmarks.iter().any(|b| b == "feat/renamed"),
        "New bookmark should exist, got: {:?}",
        bookmarks
    );
    assert!(
        !bookmarks.iter().any(|b| b == "feat/original"),
        "Old bookmark should NOT exist, got: {:?}",
        bookmarks
    );
}

// =============================================================================
// Test: Rename workspace — updates child target branches
// =============================================================================

#[test]
fn test_rename_workspace_updates_child_target_branches() {
    let repo = TestRepo::new().expect("Failed to create test repo");

    // Create parent workspace
    let parent = treq_lib::core::create_workspace(
        &repo.repo_path,
        "feat/parent",
        Some("parent feature".to_string()),
        None,
        None,
        None,
    )
    .expect("Failed to create parent workspace");

    // Create stacked workspace targeting parent
    let child =
        treq_lib::core::stack_workspace(&repo.repo_path, Some(&parent), Some("feat/child"))
            .expect("Failed to create child workspace");

    // Verify child targets parent
    assert_eq!(
        child.target_branch.as_deref(),
        Some("feat/parent"),
        "Child should target parent"
    );

    // Rename parent
    let result = treq_lib::core::rename_workspace(
        &repo.repo_path,
        parent.id,
        "feat/parent-renamed",
        false,
    )
    .expect("Failed to rename parent workspace");

    assert!(result.success, "Rename should succeed");
    assert!(
        result.updated_children_ids.contains(&child.id),
        "Child should be in updated_children_ids, got: {:?}",
        result.updated_children_ids
    );

    // Verify child's target_branch is updated
    let updated_child = treq_lib::local_db::get_workspace_by_id(&repo.repo_path, child.id)
        .expect("Failed to get child workspace")
        .expect("Child workspace should exist");
    assert_eq!(
        updated_child.target_branch.as_deref(),
        Some("feat/parent-renamed"),
        "Child's target_branch should be updated to new name"
    );
}

// =============================================================================
// Test: Rename workspace — sets not_on_remote
// =============================================================================

#[test]
fn test_rename_workspace_sets_not_on_remote() {
    let repo = TestRepo::new().expect("Failed to create test repo");

    let workspace = treq_lib::core::create_workspace(
        &repo.repo_path,
        "feat/original",
        Some("original feature".to_string()),
        None,
        None,
        None,
    )
    .expect("Failed to create workspace");

    // Rename workspace
    let result = treq_lib::core::rename_workspace(
        &repo.repo_path,
        workspace.id,
        "feat/renamed",
        false,
    )
    .expect("Failed to rename workspace");

    assert!(result.success, "Rename should succeed");

    // Verify not_on_remote is set to true
    let db_workspace = treq_lib::local_db::get_workspace_by_id(&repo.repo_path, workspace.id)
        .expect("Failed to get workspace")
        .expect("Workspace should exist");
    assert!(
        db_workspace.not_on_remote,
        "not_on_remote should be true after rename"
    );
}

// =============================================================================
// Test: Recover workspace after .jj reinit (recovery happens during core::init)
// =============================================================================

#[test]
fn test_recover_workspace_after_jj_reinit() {
    let repo = TestRepo::new().expect("Failed to create test repo");

    // Create workspace
    let workspace = treq_lib::core::create_workspace(
        &repo.repo_path,
        "feat/test-recover",
        Some("recovery test".to_string()),
        None,
        None,
        None,
    )
    .expect("Failed to create workspace");

    let workspace_path = repo.workspaces_dir().join(&workspace.workspace_path);

    // Add uncommitted file to workspace
    fs::write(workspace_path.join("uncommitted.txt"), "uncommitted content")
        .expect("Failed to write file");

    // Verify workspace is registered with jj
    let jj_workspaces_before =
        JjVerifier::list_workspaces(&repo.repo_path).expect("Failed to list jj workspaces");
    assert!(
        jj_workspaces_before.contains(&workspace.workspace_name),
        "Workspace should be in jj before reinit"
    );

    // Delete .jj and reinit — recovery should happen automatically during init
    fs::remove_dir_all(Path::new(&repo.repo_path).join(".jj")).expect("Failed to remove .jj");
    treq_lib::core::init(&repo.repo_path).expect("Failed to reinit");

    // After init: workspace should already be recovered in jj
    let jj_workspaces_recovered =
        JjVerifier::list_workspaces(&repo.repo_path).expect("Failed to list jj workspaces");
    assert!(
        jj_workspaces_recovered.contains(&workspace.workspace_name),
        "Workspace should be in jj after init recovery, got: {:?}",
        jj_workspaces_recovered
    );

    // Uncommitted file should still exist
    assert!(
        workspace_path.join("uncommitted.txt").exists(),
        "Uncommitted file should be preserved after recovery"
    );

    // jj status should succeed on workspace
    let status = Command::new("jj")
        .current_dir(&workspace_path)
        .args(["status"])
        .output()
        .expect("Failed to run jj status");
    assert!(
        status.status.success(),
        "jj status should succeed after recovery"
    );

    // jj should detect the uncommitted changes
    let changed_files = treq_lib::jj::jj_get_changed_files(workspace_path.to_str().unwrap())
        .expect("Failed to get changed files");
    assert!(
        !changed_files.is_empty(),
        "Should detect uncommitted changes after recovery"
    );
}

// =============================================================================
// Test: Recover multiple workspaces after .jj reinit
// =============================================================================

#[test]
fn test_recover_multiple_workspaces_after_jj_reinit() {
    let repo = TestRepo::new().expect("Failed to create test repo");

    // Create 2 workspaces
    let ws1 = treq_lib::core::create_workspace(
        &repo.repo_path,
        "feat/recover-a",
        Some("feature a".to_string()),
        None,
        None,
        None,
    )
    .expect("Failed to create workspace 1");

    let ws2 = treq_lib::core::create_workspace(
        &repo.repo_path,
        "feat/recover-b",
        Some("feature b".to_string()),
        None,
        None,
        None,
    )
    .expect("Failed to create workspace 2");

    let ws1_path = repo.workspaces_dir().join(&ws1.workspace_path);
    let ws2_path = repo.workspaces_dir().join(&ws2.workspace_path);

    // Add uncommitted files
    fs::write(ws1_path.join("ws1-file.txt"), "ws1 content").expect("Failed to write");
    fs::write(ws2_path.join("ws2-file.txt"), "ws2 content").expect("Failed to write");

    // Delete .jj and reinit — recovery should happen automatically during init
    fs::remove_dir_all(Path::new(&repo.repo_path).join(".jj")).expect("Failed to remove .jj");
    treq_lib::core::init(&repo.repo_path).expect("Failed to reinit");

    // Both should be back in jj after init
    let jj_workspaces =
        JjVerifier::list_workspaces(&repo.repo_path).expect("Failed to list jj workspaces");
    assert!(
        jj_workspaces.contains(&ws1.workspace_name),
        "Workspace 1 should be in jj after init recovery, got: {:?}",
        jj_workspaces
    );
    assert!(
        jj_workspaces.contains(&ws2.workspace_name),
        "Workspace 2 should be in jj after init recovery, got: {:?}",
        jj_workspaces
    );

    // Both should have their uncommitted changes
    assert!(
        ws1_path.join("ws1-file.txt").exists(),
        "Workspace 1 uncommitted file should be preserved"
    );
    assert!(
        ws2_path.join("ws2-file.txt").exists(),
        "Workspace 2 uncommitted file should be preserved"
    );
}

// =============================================================================
// Test: Recover workspace preserves bookmark
// =============================================================================

#[test]
fn test_recover_workspace_preserves_bookmark() {
    let repo = TestRepo::with_remote().expect("Failed to create test repo with remote");

    // Create workspace on branch "feat/test-bookmark"
    let workspace = treq_lib::core::create_workspace(
        &repo.repo_path,
        "feat/test-bookmark",
        Some("bookmark test".to_string()),
        None,
        None,
        None,
    )
    .expect("Failed to create workspace");

    let workspace_path = repo.workspaces_dir().join(&workspace.workspace_path);

    // Delete .jj and reinit — recovery should happen automatically during init
    fs::remove_dir_all(Path::new(&repo.repo_path).join(".jj")).expect("Failed to remove .jj");
    treq_lib::core::init(&repo.repo_path).expect("Failed to reinit");

    // Bookmark should exist and point to workspace's @
    let bookmarks = JjVerifier::list_bookmarks(workspace_path.to_str().unwrap())
        .expect("Failed to list bookmarks");
    assert!(
        bookmarks.iter().any(|b| b == "feat/test-bookmark"),
        "Bookmark 'feat/test-bookmark' should exist after init recovery, got: {:?}",
        bookmarks
    );
}

// =============================================================================
// Test: ensure_jj_initialized reinits when .jj deleted
// =============================================================================

#[test]
fn test_ensure_jj_initialized_reinits_when_jj_deleted() {
    let repo = TestRepo::new().expect("Failed to create test repo");

    // Verify .jj exists
    assert!(repo.is_jj_initialized(), ".jj should exist after init");

    // Delete .jj
    fs::remove_dir_all(Path::new(&repo.repo_path).join(".jj")).expect("Failed to remove .jj");
    assert!(!repo.is_jj_initialized(), ".jj should be gone");

    // Create a DB for ensure_jj_initialized
    let db = repo.create_db().expect("Failed to create db");

    // Set the flag to true (simulating already-configured state)
    db.set_repo_setting(&repo.repo_path, "jj_initialized", "true")
        .expect("Failed to set flag");

    // ensure_jj_initialized should detect missing .jj and reinit
    let result = treq_lib::jj::ensure_jj_initialized(&db, &repo.repo_path)
        .expect("ensure_jj_initialized failed");
    assert!(result, "Should return true after reinit");

    // .jj should exist again
    assert!(
        repo.is_jj_initialized(),
        ".jj should exist again after ensure_jj_initialized"
    );
}

// =============================================================================
// Test: Recover skips already registered workspaces (init is idempotent)
// =============================================================================

#[test]
fn test_recover_skips_already_registered_workspaces() {
    let repo = TestRepo::new().expect("Failed to create test repo");

    // Create workspace (registered with jj, .jj not deleted)
    let workspace = treq_lib::core::create_workspace(
        &repo.repo_path,
        "feat/already-registered",
        Some("already registered".to_string()),
        None,
        None,
        None,
    )
    .expect("Failed to create workspace");

    // Re-init without deleting .jj — workspace is already registered
    treq_lib::core::init(&repo.repo_path).expect("Failed to reinit");

    // Workspace should still work normally
    let jj_workspaces =
        JjVerifier::list_workspaces(&repo.repo_path).expect("Failed to list jj workspaces");
    assert!(
        jj_workspaces.contains(&workspace.workspace_name),
        "Workspace should still be in jj, got: {:?}",
        jj_workspaces
    );
}

// =============================================================================
// Test: Recover handles missing workspace directory
// =============================================================================

#[test]
fn test_recover_handles_missing_workspace_dir() {
    let repo = TestRepo::new().expect("Failed to create test repo");

    // Create workspace
    let workspace = treq_lib::core::create_workspace(
        &repo.repo_path,
        "feat/missing-dir",
        Some("missing dir test".to_string()),
        None,
        None,
        None,
    )
    .expect("Failed to create workspace");

    let workspace_path = repo.workspaces_dir().join(&workspace.workspace_path);

    // Delete .jj AND the workspace directory, then reinit
    fs::remove_dir_all(Path::new(&repo.repo_path).join(".jj")).expect("Failed to remove .jj");
    fs::remove_dir_all(&workspace_path).expect("Failed to remove workspace dir");

    // Init should not error even when workspace dir is missing
    treq_lib::core::init(&repo.repo_path).expect("Failed to reinit");

    // Workspace should NOT be in jj (dir was missing, so recovery skipped it)
    let jj_workspaces =
        JjVerifier::list_workspaces(&repo.repo_path).expect("Failed to list jj workspaces");
    assert!(
        !jj_workspaces.contains(&workspace.workspace_name),
        "Workspace with missing dir should not be recovered, got: {:?}",
        jj_workspaces
    );
}

// =============================================================================
// Test: Empty commits are excluded from commits ahead
// =============================================================================

#[test]
fn test_empty_commits_excluded_from_commits_ahead() {
    let repo = TestRepo::new().expect("Failed to create test repo");

    let workspace: Workspace = treq_lib::core::create_workspace(
        &repo.repo_path,
        "feat/empty-filter",
        Some("empty filter test".to_string()),
        None,
        None,
        None,
    )
    .expect("Failed to create workspace");

    let workspace_path = repo.workspaces_dir().join(&workspace.workspace_path);
    let workspace_path_str = workspace_path.to_str().unwrap();

    // Create a real commit with content
    fs::write(workspace_path.join("real.txt"), "real content").expect("Failed to write file");
    jj::jj_commit(workspace_path_str, "Add real file").expect("Failed to commit");

    // Create empty commits via `jj new` (these have no file changes)
    Command::new("jj")
        .current_dir(workspace_path_str)
        .args(["new"])
        .output()
        .expect("Failed to run jj new");
    Command::new("jj")
        .current_dir(workspace_path_str)
        .args(["new"])
        .output()
        .expect("Failed to run jj new");

    // Verify that jj_get_commits_ahead only returns the real commit
    let target_branch = workspace.target_branch.as_deref().unwrap_or("main");
    let commits_ahead = jj::jj_get_commits_ahead(workspace_path_str, target_branch)
        .expect("Failed to get commits ahead");

    assert_eq!(
        commits_ahead.total_count, 1,
        "Should only have 1 non-empty commit ahead, got {}",
        commits_ahead.total_count
    );
    assert!(
        commits_ahead.commits[0].description.contains("Add real file"),
        "The commit should be the real one, got: {}",
        commits_ahead.commits[0].description
    );
}

// =============================================================================
// Test: Merge abandons empty commits
// =============================================================================

#[test]
fn test_merge_abandons_empty_commits() {
    let repo = TestRepo::new().expect("Failed to create test repo");

    let workspace: Workspace = treq_lib::core::create_workspace(
        &repo.repo_path,
        "feat/merge-empty",
        Some("merge empty test".to_string()),
        None,
        None,
        None,
    )
    .expect("Failed to create workspace");

    let workspace_path = repo.workspaces_dir().join(&workspace.workspace_path);
    let workspace_path_str = workspace_path.to_str().unwrap();

    // Create a real commit
    fs::write(workspace_path.join("feature.txt"), "feature content")
        .expect("Failed to write file");
    jj::jj_commit(workspace_path_str, "Add feature").expect("Failed to commit");

    // Create empty commits
    Command::new("jj")
        .current_dir(workspace_path_str)
        .args(["new"])
        .output()
        .expect("Failed to run jj new");

    // Merge should succeed despite empty commits
    treq_lib::core::merge_workspace(
        &repo.repo_path,
        workspace.id,
        "Merge feat/merge-empty",
        MergeCommit::Merge,
    )
    .expect("Failed to merge workspace with empty commits");

    // Verify the file is in the main repo
    assert!(
        Path::new(&repo.repo_path).join("feature.txt").exists(),
        "Feature file should exist in main repo after merge"
    );

    // Verify workspace is cleaned up
    assert!(
        !workspace_path.exists(),
        "Workspace directory should be deleted after merge"
    );
}

// =============================================================================
// Test: Squash merge with empty commits
// =============================================================================

#[test]
fn test_squash_merge_with_empty_commits() {
    let repo = TestRepo::new().expect("Failed to create test repo");

    let workspace: Workspace = treq_lib::core::create_workspace(
        &repo.repo_path,
        "feat/squash-empty",
        Some("squash empty test".to_string()),
        None,
        None,
        None,
    )
    .expect("Failed to create workspace");

    let workspace_path = repo.workspaces_dir().join(&workspace.workspace_path);
    let workspace_path_str = workspace_path.to_str().unwrap();

    // Create a real commit
    fs::write(workspace_path.join("squash.txt"), "squash content").expect("Failed to write file");
    jj::jj_commit(workspace_path_str, "Add squash file").expect("Failed to commit");

    // Create empty commits
    Command::new("jj")
        .current_dir(workspace_path_str)
        .args(["new"])
        .output()
        .expect("Failed to run jj new");
    Command::new("jj")
        .current_dir(workspace_path_str)
        .args(["new"])
        .output()
        .expect("Failed to run jj new");

    // Squash merge should succeed
    treq_lib::core::merge_workspace(
        &repo.repo_path,
        workspace.id,
        "Squash feat/squash-empty",
        MergeCommit::Squash,
    )
    .expect("Failed to squash merge workspace with empty commits");

    assert!(
        Path::new(&repo.repo_path).join("squash.txt").exists(),
        "Squash file should exist in main repo after merge"
    );

    assert!(
        !workspace_path.exists(),
        "Workspace directory should be deleted after squash merge"
    );
}

// =============================================================================
// Test: Rebase merge with empty commits
// =============================================================================

#[test]
fn test_rebase_merge_with_empty_commits() {
    let repo = TestRepo::new().expect("Failed to create test repo");

    let workspace: Workspace = treq_lib::core::create_workspace(
        &repo.repo_path,
        "feat/rebase-empty",
        Some("rebase empty test".to_string()),
        None,
        None,
        None,
    )
    .expect("Failed to create workspace");

    let workspace_path = repo.workspaces_dir().join(&workspace.workspace_path);
    let workspace_path_str = workspace_path.to_str().unwrap();

    // Create a real commit
    fs::write(workspace_path.join("rebase.txt"), "rebase content").expect("Failed to write file");
    jj::jj_commit(workspace_path_str, "Add rebase file").expect("Failed to commit");

    // Create empty commits
    Command::new("jj")
        .current_dir(workspace_path_str)
        .args(["new"])
        .output()
        .expect("Failed to run jj new");

    // Rebase merge should succeed
    treq_lib::core::merge_workspace(
        &repo.repo_path,
        workspace.id,
        "Rebase feat/rebase-empty",
        MergeCommit::Rebase,
    )
    .expect("Failed to rebase merge workspace with empty commits");

    assert!(
        Path::new(&repo.repo_path).join("rebase.txt").exists(),
        "Rebase file should exist in main repo after merge"
    );

    assert!(
        !workspace_path.exists(),
        "Workspace directory should be deleted after rebase merge"
    );
}

// =============================================================================
// Test: list_workspace_statuses returns correct commits_ahead counts
// =============================================================================

#[test]
fn test_list_workspace_statuses_commits_ahead() {
    let repo = TestRepo::new().expect("Failed to create test repo");

    let workspace = treq_lib::core::create_workspace(
        &repo.repo_path,
        "feat/commits-ahead",
        Some("test commits ahead".to_string()),
        None,
        None,
        None,
    )
    .expect("Failed to create workspace");

    let workspace_path = repo.workspaces_dir().join(&workspace.workspace_path);
    let workspace_path_str = workspace_path.to_str().unwrap();

    // Fresh workspace should have 0 commits ahead
    let statuses = treq_lib::core::list_workspace_statuses(&repo.repo_path)
        .expect("Failed to list workspace statuses");
    let status = statuses
        .iter()
        .find(|s| s.current.id == workspace.id)
        .expect("Workspace should exist in statuses");
    assert_eq!(
        status.commits_ahead, 0,
        "Fresh workspace should have 0 commits ahead"
    );

    // Make first commit
    fs::write(workspace_path.join("file1.txt"), "content 1").expect("Failed to write file");
    treq_lib::jj::jj_commit(workspace_path_str, "First commit").expect("Failed to commit");

    let statuses = treq_lib::core::list_workspace_statuses(&repo.repo_path)
        .expect("Failed to list workspace statuses");
    let status = statuses
        .iter()
        .find(|s| s.current.id == workspace.id)
        .expect("Workspace should exist in statuses");
    assert_eq!(
        status.commits_ahead, 1,
        "Should have 1 commit ahead after first commit"
    );

    // Make second commit
    fs::write(workspace_path.join("file2.txt"), "content 2").expect("Failed to write file");
    treq_lib::jj::jj_commit(workspace_path_str, "Second commit").expect("Failed to commit");

    let statuses = treq_lib::core::list_workspace_statuses(&repo.repo_path)
        .expect("Failed to list workspace statuses");
    let status = statuses
        .iter()
        .find(|s| s.current.id == workspace.id)
        .expect("Workspace should exist in statuses");
    assert_eq!(
        status.commits_ahead, 2,
        "Should have 2 commits ahead after second commit"
    );
}

// =============================================================================
// Test: workspace remote_sync status - NotOnRemote
// =============================================================================

#[test]
fn test_workspace_status_not_on_remote() {
    let repo = TestRepo::with_remote().expect("Failed to create test repo with remote");

    let workspace = treq_lib::core::create_workspace(
        &repo.repo_path,
        "feat/not-on-remote",
        Some("test not on remote".to_string()),
        None,
        None,
        None,
    )
    .expect("Failed to create workspace");

    assert!(workspace.not_on_remote, "New workspace should be not_on_remote");

    let statuses = treq_lib::core::list_workspace_statuses(&repo.repo_path)
        .expect("Failed to list workspace statuses");
    let status = statuses
        .iter()
        .find(|s| s.current.id == workspace.id)
        .expect("Workspace should exist in statuses");

    assert_eq!(
        status.remote_sync,
        RemoteSyncStatus::NotOnRemote,
        "Unpushed workspace should have NotOnRemote sync status"
    );
}

// =============================================================================
// Test: workspace remote_sync status - InSync
// =============================================================================

#[test]
fn test_workspace_status_in_sync() {
    let repo = TestRepo::with_remote().expect("Failed to create test repo with remote");

    let workspace = treq_lib::core::create_workspace(
        &repo.repo_path,
        "feat/in-sync",
        Some("test in sync".to_string()),
        None,
        None,
        None,
    )
    .expect("Failed to create workspace");

    // Add a commit so there's something to push
    let workspace_path = repo.workspaces_dir().join(&workspace.workspace_path);
    fs::write(workspace_path.join("file.txt"), "content").expect("Failed to write file");
    treq_lib::jj::jj_commit(workspace_path.to_str().unwrap(), "Initial commit")
        .expect("Failed to commit");

    // Push to remote
    treq_lib::core::push_workspace_to_remote(&repo.repo_path, Some(workspace.id))
        .expect("Failed to push workspace");

    let statuses = treq_lib::core::list_workspace_statuses(&repo.repo_path)
        .expect("Failed to list workspace statuses");
    let status = statuses
        .iter()
        .find(|s| s.current.id == workspace.id)
        .expect("Workspace should exist in statuses");

    assert_eq!(
        status.remote_sync,
        RemoteSyncStatus::InSync,
        "Pushed workspace with no new changes should be InSync"
    );
}

// =============================================================================
// Test: workspace remote_sync status - Ahead
// =============================================================================

#[test]
fn test_workspace_status_ahead_of_remote() {
    let repo = TestRepo::with_remote().expect("Failed to create test repo with remote");

    let workspace = treq_lib::core::create_workspace(
        &repo.repo_path,
        "feat/ahead",
        Some("test ahead".to_string()),
        None,
        None,
        None,
    )
    .expect("Failed to create workspace");

    let workspace_path = repo.workspaces_dir().join(&workspace.workspace_path);
    let workspace_path_str = workspace_path.to_str().unwrap();

    // Add initial commit and push
    fs::write(workspace_path.join("file1.txt"), "content 1").expect("Failed to write file");
    treq_lib::jj::jj_commit(workspace_path_str, "Initial commit").expect("Failed to commit");
    treq_lib::core::push_workspace_to_remote(&repo.repo_path, Some(workspace.id))
        .expect("Failed to push workspace");

    // Make a local commit without pushing
    fs::write(workspace_path.join("file2.txt"), "content 2").expect("Failed to write file");
    treq_lib::jj::jj_commit(workspace_path_str, "Local only commit").expect("Failed to commit");

    let statuses = treq_lib::core::list_workspace_statuses(&repo.repo_path)
        .expect("Failed to list workspace statuses");
    let status = statuses
        .iter()
        .find(|s| s.current.id == workspace.id)
        .expect("Workspace should exist in statuses");

    assert_eq!(
        status.remote_sync,
        RemoteSyncStatus::Ahead { count: 1 },
        "Workspace with unpushed commit should be Ahead {{ count: 1 }}"
    );
}

// =============================================================================
// Test: workspace remote_sync status - Behind
// =============================================================================

#[test]
fn test_workspace_status_behind_remote() {
    let repo = TestRepo::with_remote().expect("Failed to create test repo with remote");

    let workspace = treq_lib::core::create_workspace(
        &repo.repo_path,
        "feat/behind",
        Some("test behind".to_string()),
        None,
        None,
        None,
    )
    .expect("Failed to create workspace");

    let workspace_path = repo.workspaces_dir().join(&workspace.workspace_path);
    let workspace_path_str = workspace_path.to_str().unwrap();

    // Add initial commit and push
    fs::write(workspace_path.join("file1.txt"), "content 1").expect("Failed to write file");
    treq_lib::jj::jj_commit(workspace_path_str, "Initial commit").expect("Failed to commit");
    treq_lib::core::push_workspace_to_remote(&repo.repo_path, Some(workspace.id))
        .expect("Failed to push workspace");

    // Clone the bare remote, commit and push from the clone to simulate remote-ahead
    let clone_dir = repo.temp_dir.path().join("clone");
    let remote_dir = repo.temp_dir.path().join("remote.git");
    Command::new("git")
        .args(["clone", remote_dir.to_str().unwrap(), clone_dir.to_str().unwrap()])
        .output()
        .expect("Failed to clone remote");
    Command::new("git")
        .current_dir(&clone_dir)
        .args(["checkout", &workspace.branch_name])
        .output()
        .expect("Failed to checkout branch in clone");
    fs::write(clone_dir.join("remote-file.txt"), "from remote").expect("Failed to write file");
    Command::new("git")
        .current_dir(&clone_dir)
        .args(["add", "remote-file.txt"])
        .output()
        .expect("Failed to git add");
    Command::new("git")
        .current_dir(&clone_dir)
        .args(["commit", "-m", "Remote commit"])
        .output()
        .expect("Failed to git commit");
    Command::new("git")
        .current_dir(&clone_dir)
        .args(["push", "origin", &workspace.branch_name])
        .output()
        .expect("Failed to push from clone");

    // Fetch in the main repo so jj knows about the remote commit.
    // Note: jj auto-fast-forwards the local bookmark to match remote on fetch.
    treq_lib::jj::jj_git_fetch(&repo.repo_path).expect("Failed to fetch");

    // Move the local bookmark back to simulate being behind remote.
    // After fetch, both local and remote point to the same commit.
    // Setting the bookmark to its parent puts local one commit behind remote.
    let set_output = Command::new("jj")
        .current_dir(workspace_path_str)
        .args([
            "bookmark",
            "set",
            &workspace.branch_name,
            "-r",
            &format!("{}@origin-", workspace.branch_name),
            "--allow-backwards",
        ])
        .output()
        .expect("Failed to set bookmark");
    assert!(
        set_output.status.success(),
        "Failed to set bookmark back: {}",
        String::from_utf8_lossy(&set_output.stderr)
    );

    let statuses = treq_lib::core::list_workspace_statuses(&repo.repo_path)
        .expect("Failed to list workspace statuses");
    let status = statuses
        .iter()
        .find(|s| s.current.id == workspace.id)
        .expect("Workspace should exist in statuses");

    assert_eq!(
        status.remote_sync,
        RemoteSyncStatus::Behind { count: 1 },
        "Workspace should be Behind {{ count: 1 }} after remote commit"
    );
}

// =============================================================================
// Test: workspace remote_sync status - Diverged
// =============================================================================

#[test]
fn test_workspace_status_diverged() {
    let repo = TestRepo::with_remote().expect("Failed to create test repo with remote");

    let workspace = treq_lib::core::create_workspace(
        &repo.repo_path,
        "feat/diverged",
        Some("test diverged".to_string()),
        None,
        None,
        None,
    )
    .expect("Failed to create workspace");

    let workspace_path = repo.workspaces_dir().join(&workspace.workspace_path);
    let workspace_path_str = workspace_path.to_str().unwrap();

    // Add initial commit and push
    fs::write(workspace_path.join("file1.txt"), "content 1").expect("Failed to write file");
    treq_lib::jj::jj_commit(workspace_path_str, "Initial commit").expect("Failed to commit");
    treq_lib::core::push_workspace_to_remote(&repo.repo_path, Some(workspace.id))
        .expect("Failed to push workspace");

    // Make a local commit (don't push)
    fs::write(workspace_path.join("local-file.txt"), "local content").expect("Failed to write file");
    treq_lib::jj::jj_commit(workspace_path_str, "Local commit").expect("Failed to commit");

    // Clone the bare remote, commit and push from the clone to simulate remote-ahead
    let clone_dir = repo.temp_dir.path().join("clone-diverged");
    let remote_dir = repo.temp_dir.path().join("remote.git");
    Command::new("git")
        .args(["clone", remote_dir.to_str().unwrap(), clone_dir.to_str().unwrap()])
        .output()
        .expect("Failed to clone remote");
    Command::new("git")
        .current_dir(&clone_dir)
        .args(["checkout", &workspace.branch_name])
        .output()
        .expect("Failed to checkout branch in clone");
    fs::write(clone_dir.join("remote-file.txt"), "from remote").expect("Failed to write file");
    Command::new("git")
        .current_dir(&clone_dir)
        .args(["add", "remote-file.txt"])
        .output()
        .expect("Failed to git add");
    Command::new("git")
        .current_dir(&clone_dir)
        .args(["commit", "-m", "Remote commit"])
        .output()
        .expect("Failed to git commit");
    Command::new("git")
        .current_dir(&clone_dir)
        .args(["push", "origin", &workspace.branch_name])
        .output()
        .expect("Failed to push from clone");

    // Fetch in the main repo so jj knows about the remote commit
    treq_lib::jj::jj_git_fetch(&repo.repo_path).expect("Failed to fetch");

    let statuses = treq_lib::core::list_workspace_statuses(&repo.repo_path)
        .expect("Failed to list workspace statuses");
    let status = statuses
        .iter()
        .find(|s| s.current.id == workspace.id)
        .expect("Workspace should exist in statuses");

    assert_eq!(
        status.remote_sync,
        RemoteSyncStatus::Diverged { ahead: 1, behind: 1 },
        "Workspace should be Diverged {{ ahead: 1, behind: 1 }}"
    );
}

// =============================================================================
// Test: pull_workspace_from_remote - resolves divergence
// =============================================================================

#[test]
fn test_pull_workspace_resolves_divergence() {
    let repo = TestRepo::with_remote().expect("Failed to create test repo with remote");

    let workspace = treq_lib::core::create_workspace(
        &repo.repo_path,
        "feat/pull-diverged",
        Some("test pull diverged".to_string()),
        None,
        None,
        None,
    )
    .expect("Failed to create workspace");

    let workspace_path = repo.workspaces_dir().join(&workspace.workspace_path);
    let workspace_path_str = workspace_path.to_str().unwrap();

    // Add initial commit B and push
    fs::write(workspace_path.join("file1.txt"), "content 1").expect("Failed to write file");
    jj::jj_commit(workspace_path_str, "Commit B").expect("Failed to commit");
    treq_lib::core::push_workspace_to_remote(&repo.repo_path, Some(workspace.id))
        .expect("Failed to push workspace");

    // Make local commit D (don't push)
    fs::write(workspace_path.join("local-file.txt"), "local content")
        .expect("Failed to write file");
    jj::jj_commit(workspace_path_str, "Local commit D").expect("Failed to commit");

    // Clone the bare remote, commit C, push from clone to simulate remote-ahead
    let clone_dir = repo.temp_dir.path().join("clone-pull-diverged");
    let remote_dir = repo.temp_dir.path().join("remote.git");
    Command::new("git")
        .args([
            "clone",
            remote_dir.to_str().unwrap(),
            clone_dir.to_str().unwrap(),
        ])
        .output()
        .expect("Failed to clone remote");
    Command::new("git")
        .current_dir(&clone_dir)
        .args(["checkout", &workspace.branch_name])
        .output()
        .expect("Failed to checkout branch in clone");
    fs::write(clone_dir.join("remote-file.txt"), "from remote").expect("Failed to write file");
    Command::new("git")
        .current_dir(&clone_dir)
        .args(["add", "remote-file.txt"])
        .output()
        .expect("Failed to git add");
    Command::new("git")
        .current_dir(&clone_dir)
        .args(["commit", "-m", "Remote commit C"])
        .output()
        .expect("Failed to git commit");
    Command::new("git")
        .current_dir(&clone_dir)
        .args(["push", "origin", &workspace.branch_name])
        .output()
        .expect("Failed to push from clone");

    // Call pull_workspace_from_remote to resolve the divergence
    let result =
        treq_lib::core::pull_workspace_from_remote(&repo.repo_path, Some(workspace.id), "git")
            .expect("pull_workspace_from_remote should succeed");

    assert!(result.success, "Pull should succeed");
    assert!(result.was_diverged, "Should detect divergence");
    assert_eq!(
        result.commits_rebased, 1,
        "Should rebase 1 local commit (D)"
    );

    // Verify bookmark is no longer conflicted
    assert!(
        !jj::jj_is_bookmark_conflicted(workspace_path_str, &workspace.branch_name),
        "Bookmark should no longer be conflicted after pull"
    );

    // Verify both files exist (remote-file.txt from C, local-file.txt from D)
    // Update stale first since rebase may have changed things
    let _ = jj::jj_workspace_update_stale(workspace_path_str);
    assert!(
        workspace_path.join("remote-file.txt").exists(),
        "remote-file.txt should exist from remote commit C"
    );
    assert!(
        workspace_path.join("local-file.txt").exists(),
        "local-file.txt should exist from rebased local commit D"
    );

    // Verify sync status is no longer Diverged
    let statuses = treq_lib::core::list_workspace_statuses(&repo.repo_path)
        .expect("Failed to list workspace statuses");
    let status = statuses
        .iter()
        .find(|s| s.current.id == workspace.id)
        .expect("Workspace should exist in statuses");

    assert!(
        !matches!(status.remote_sync, RemoteSyncStatus::Diverged { .. }),
        "Workspace should no longer be Diverged after pull, got: {:?}",
        status.remote_sync
    );
}

// =============================================================================
// Test: pull_workspace_from_remote - no divergence (fast-forward)
// =============================================================================

#[test]
fn test_pull_workspace_no_divergence() {
    let repo = TestRepo::with_remote().expect("Failed to create test repo with remote");

    let workspace = treq_lib::core::create_workspace(
        &repo.repo_path,
        "feat/pull-no-div",
        Some("test pull no divergence".to_string()),
        None,
        None,
        None,
    )
    .expect("Failed to create workspace");

    let workspace_path = repo.workspaces_dir().join(&workspace.workspace_path);
    let workspace_path_str = workspace_path.to_str().unwrap();

    // Add initial commit and push
    fs::write(workspace_path.join("file1.txt"), "content 1").expect("Failed to write file");
    jj::jj_commit(workspace_path_str, "Initial commit").expect("Failed to commit");
    treq_lib::core::push_workspace_to_remote(&repo.repo_path, Some(workspace.id))
        .expect("Failed to push workspace");

    // No local changes — simulate remote advancing
    let clone_dir = repo.temp_dir.path().join("clone-pull-no-div");
    let remote_dir = repo.temp_dir.path().join("remote.git");
    Command::new("git")
        .args([
            "clone",
            remote_dir.to_str().unwrap(),
            clone_dir.to_str().unwrap(),
        ])
        .output()
        .expect("Failed to clone remote");
    Command::new("git")
        .current_dir(&clone_dir)
        .args(["checkout", &workspace.branch_name])
        .output()
        .expect("Failed to checkout branch in clone");
    fs::write(clone_dir.join("remote-only.txt"), "remote content").expect("Failed to write file");
    Command::new("git")
        .current_dir(&clone_dir)
        .args(["add", "remote-only.txt"])
        .output()
        .expect("Failed to git add");
    Command::new("git")
        .current_dir(&clone_dir)
        .args(["commit", "-m", "Remote commit"])
        .output()
        .expect("Failed to git commit");
    Command::new("git")
        .current_dir(&clone_dir)
        .args(["push", "origin", &workspace.branch_name])
        .output()
        .expect("Failed to push from clone");

    // Call pull — should NOT be diverged (local has no unpushed commits)
    let result =
        treq_lib::core::pull_workspace_from_remote(&repo.repo_path, Some(workspace.id), "git")
            .expect("pull_workspace_from_remote should succeed");

    assert!(result.success, "Pull should succeed");
    assert!(!result.was_diverged, "Should NOT detect divergence");
    assert_eq!(result.commits_rebased, 0, "Should rebase 0 commits");
}

// =============================================================================
// Test: jj_get_sync_status baseline in sync after push+pull
// =============================================================================

#[test]
fn test_jj_get_sync_status_baseline_in_sync() {
    let repo = TestRepo::with_remote().expect("Failed to create test repo with remote");

    let workspace = treq_lib::core::create_workspace(
        &repo.repo_path,
        "feat/sync-baseline",
        Some("sync status baseline test".to_string()),
        None,
        None,
        None,
    )
    .expect("Failed to create workspace");

    let workspace_path = repo.workspaces_dir().join(&workspace.workspace_path);
    let workspace_path_str = workspace_path.to_str().unwrap();

    // Make a commit and push to establish the remote branch
    fs::write(workspace_path.join("initial.txt"), "initial content\n")
        .expect("Failed to write file");
    treq_lib::jj::jj_commit(workspace_path_str, "Initial commit on branch")
        .expect("Failed to commit");
    treq_lib::core::push_workspace_to_remote(&repo.repo_path, Some(workspace.id))
        .expect("Failed to push");

    // Pull to sync state
    treq_lib::core::pull_workspace_from_remote(&repo.repo_path, Some(workspace.id), "git")
        .expect("Failed to pull");

    // Verify branch is unchanged and not conflicted after push+pull
    let branch_after = jj::get_workspace_branch(workspace_path_str)
        .expect("Failed to get git branch after push+pull");
    assert_eq!(
        branch_after,
        jj::get_workspace_branch(workspace_path_str).unwrap(),
        "Git branch should remain stable after push+pull"
    );

    // Verify WorkspacePartialStatus shows InSync
    let statuses = treq_lib::core::list_workspace_statuses(&repo.repo_path)
        .expect("Failed to list workspace statuses");
    let status = statuses.iter().find(|s| s.current.id == workspace.id)
        .expect("Should find workspace in statuses");
    assert_eq!(
        status.remote_sync,
        RemoteSyncStatus::InSync,
        "WorkspacePartialStatus should show InSync after push+pull, got {:?}",
        status.remote_sync
    );

    // Should be in sync (0, 0)
    let (ahead, behind) = treq_lib::jj::jj_get_sync_status(
        workspace_path_str,
        &workspace.branch_name,
        false,
    )
    .expect("Failed to get sync status at baseline");
    assert_eq!(
        (ahead, behind),
        (0, 0),
        "After push, should be in sync (0, 0), got ({}, {})",
        ahead,
        behind
    );
}

// =============================================================================
// Test: jj_get_sync_status ahead after local commit
// =============================================================================

#[test]
fn test_jj_get_sync_status_ahead_after_local_commit() {
    let repo = TestRepo::with_remote().expect("Failed to create test repo with remote");

    let workspace = treq_lib::core::create_workspace(
        &repo.repo_path,
        "feat/sync-ahead",
        Some("sync status ahead test".to_string()),
        None,
        None,
        None,
    )
    .expect("Failed to create workspace");

    let workspace_path = repo.workspaces_dir().join(&workspace.workspace_path);
    let workspace_path_str = workspace_path.to_str().unwrap();

    // Establish remote branch
    fs::write(workspace_path.join("initial.txt"), "initial content\n")
        .expect("Failed to write file");
    treq_lib::jj::jj_commit(workspace_path_str, "Initial commit on branch")
        .expect("Failed to commit");
    treq_lib::core::push_workspace_to_remote(&repo.repo_path, Some(workspace.id))
        .expect("Failed to push");
    treq_lib::core::pull_workspace_from_remote(&repo.repo_path, Some(workspace.id), "git")
        .expect("Failed to pull");

    // Make a local-only commit → expect (1, 0)
    fs::write(workspace_path.join("local_only.txt"), "local content\n")
        .expect("Failed to write file");
    treq_lib::jj::jj_commit(workspace_path_str, "Local only commit")
        .expect("Failed to commit");

    let (ahead, behind) = treq_lib::jj::jj_get_sync_status(
        workspace_path_str,
        &workspace.branch_name,
        false,
    )
    .expect("Failed to get sync status after local commit");
    assert_eq!(
        ahead, 1,
        "After local commit, should be 1 ahead, got {}",
        ahead
    );
    assert_eq!(
        behind, 0,
        "After local commit, should be 0 behind, got {}",
        behind
    );
}

// =============================================================================
// Test: jj_get_sync_status returns to sync after push
// =============================================================================

#[test]
fn test_jj_get_sync_status_returns_to_sync_after_push() {
    let repo = TestRepo::with_remote().expect("Failed to create test repo with remote");

    let workspace = treq_lib::core::create_workspace(
        &repo.repo_path,
        "feat/sync-push",
        Some("sync status push test".to_string()),
        None,
        None,
        None,
    )
    .expect("Failed to create workspace");

    let workspace_path = repo.workspaces_dir().join(&workspace.workspace_path);
    let workspace_path_str = workspace_path.to_str().unwrap();

    // Establish remote branch
    fs::write(workspace_path.join("initial.txt"), "initial content\n")
        .expect("Failed to write file");
    treq_lib::jj::jj_commit(workspace_path_str, "Initial commit on branch")
        .expect("Failed to commit");
    treq_lib::core::push_workspace_to_remote(&repo.repo_path, Some(workspace.id))
        .expect("Failed to push");
    treq_lib::core::pull_workspace_from_remote(&repo.repo_path, Some(workspace.id), "git")
        .expect("Failed to pull");

    let branch_before = jj::get_workspace_branch(workspace_path_str)
        .expect("Failed to get git branch before local commit");

    // Make a local commit then push it
    fs::write(workspace_path.join("local_only.txt"), "local content\n")
        .expect("Failed to write file");
    treq_lib::jj::jj_commit(workspace_path_str, "Local only commit")
        .expect("Failed to commit");
    treq_lib::core::push_workspace_to_remote(&repo.repo_path, Some(workspace.id))
        .expect("Failed to push");
    treq_lib::core::pull_workspace_from_remote(&repo.repo_path, Some(workspace.id), "git")
        .expect("Failed to pull after push");

    // Verify branch is unchanged after push+pull
    let branch_after = jj::get_workspace_branch(workspace_path_str)
        .expect("Failed to get git branch after push+pull");
    assert_eq!(
        branch_after, branch_before,
        "Git branch should not change after push+pull, was '{}' now '{}'",
        branch_before, branch_after
    );

    // Verify WorkspacePartialStatus shows InSync
    let statuses = treq_lib::core::list_workspace_statuses(&repo.repo_path)
        .expect("Failed to list workspace statuses");
    let status = statuses.iter().find(|s| s.current.id == workspace.id)
        .expect("Should find workspace in statuses");
    assert_eq!(
        status.remote_sync,
        RemoteSyncStatus::InSync,
        "WorkspacePartialStatus should show InSync after push+pull, got {:?}",
        status.remote_sync
    );

    // Should be back in sync (0, 0)
    let (ahead, behind) = treq_lib::jj::jj_get_sync_status(
        workspace_path_str,
        &workspace.branch_name,
        false,
    )
    .expect("Failed to get sync status after push");
    assert_eq!(
        (ahead, behind),
        (0, 0),
        "After push+fetch, should be in sync (0, 0), got ({}, {})",
        ahead,
        behind
    );
}

// =============================================================================
// Test: jj_get_sync_status multiple commits ahead
// =============================================================================

#[test]
fn test_jj_get_sync_status_multiple_commits_ahead() {
    let repo = TestRepo::with_remote().expect("Failed to create test repo with remote");

    let workspace = treq_lib::core::create_workspace(
        &repo.repo_path,
        "feat/sync-multi",
        Some("sync status multiple ahead test".to_string()),
        None,
        None,
        None,
    )
    .expect("Failed to create workspace");

    let workspace_path = repo.workspaces_dir().join(&workspace.workspace_path);
    let workspace_path_str = workspace_path.to_str().unwrap();

    // Establish remote branch
    fs::write(workspace_path.join("initial.txt"), "initial content\n")
        .expect("Failed to write file");
    treq_lib::jj::jj_commit(workspace_path_str, "Initial commit on branch")
        .expect("Failed to commit");
    treq_lib::core::push_workspace_to_remote(&repo.repo_path, Some(workspace.id))
        .expect("Failed to push");
    treq_lib::core::pull_workspace_from_remote(&repo.repo_path, Some(workspace.id), "git")
        .expect("Failed to pull");

    // Make two local commits → expect (2, 0)
    fs::write(workspace_path.join("local_2.txt"), "content 2\n")
        .expect("Failed to write file");
    treq_lib::jj::jj_commit(workspace_path_str, "Second local commit")
        .expect("Failed to commit");
    fs::write(workspace_path.join("local_3.txt"), "content 3\n")
        .expect("Failed to write file");
    treq_lib::jj::jj_commit(workspace_path_str, "Third local commit")
        .expect("Failed to commit");

    let (ahead, behind) = treq_lib::jj::jj_get_sync_status(
        workspace_path_str,
        &workspace.branch_name,
        false,
    )
    .expect("Failed to get sync status after two local commits");
    assert_eq!(
        ahead, 2,
        "After two local commits, should be 2 ahead, got {}",
        ahead
    );
    assert_eq!(
        behind, 0,
        "After two local commits, should be 0 behind, got {}",
        behind
    );
}

// =============================================================================
// Test: workspace push/pull with sync status verified via WorkspacePartialStatus
// =============================================================================

#[test]
fn test_workspace_push_pull_with_workspace_status() {
    let repo = TestRepo::with_remote().expect("Failed to create test repo with remote");

    // Create a workspace and push it to establish baseline
    let workspace = treq_lib::core::create_workspace(
        &repo.repo_path,
        "feat/status-sync-test",
        Some("workspace status sync test".to_string()),
        None,
        None,
        None,
    )
    .expect("Failed to create workspace");

    let workspace_path = repo.workspaces_dir().join(&workspace.workspace_path);
    let workspace_path_str = workspace_path.to_str().unwrap();

    // Helper closure: get WorkspacePartialStatus for our workspace
    let get_status =
        |repo_path: &str, ws_id: i64| -> treq_lib::core::WorkspacePartialStatus {
            let statuses = treq_lib::core::list_workspace_statuses(repo_path)
                .expect("Failed to list workspace statuses");
            statuses
                .into_iter()
                .find(|s| s.current.id == ws_id)
                .expect("Should find workspace in statuses")
        };

    // Record git branch before any operations
    let branch_before = jj::get_workspace_branch(workspace_path_str)
        .expect("Failed to get git branch before operations");

    // Make a commit and push to establish the remote branch
    fs::write(workspace_path.join("initial.txt"), "initial content\n")
        .expect("Failed to write file");
    treq_lib::jj::jj_commit(workspace_path_str, "Initial commit on branch")
        .expect("Failed to commit");
    treq_lib::core::push_workspace_to_remote(&repo.repo_path, Some(workspace.id))
        .expect("Failed to push");

    // Pull to sync state
    treq_lib::core::pull_workspace_from_remote(&repo.repo_path, Some(workspace.id), "git")
        .expect("Failed to pull");

    // Verify baseline via WorkspacePartialStatus: should be InSync, not diverged
    let status = get_status(&repo.repo_path, workspace.id);
    assert_eq!(
        status.remote_sync,
        RemoteSyncStatus::InSync,
        "After push+pull, workspace should be InSync, got {:?}",
        status.remote_sync
    );

    // Verify git branch is unchanged (no checkout to different branch/tag)
    let branch_after = jj::get_workspace_branch(workspace_path_str)
        .expect("Failed to get git branch after push+pull");
    assert_eq!(
        branch_after, branch_before,
        "Git branch should not change after push+pull, was '{}' now '{}'",
        branch_before, branch_after
    );

    // Make a local-only commit → expect Ahead { count: 1 }
    fs::write(workspace_path.join("local_only.txt"), "local content\n")
        .expect("Failed to write file");
    treq_lib::jj::jj_commit(workspace_path_str, "Local only commit")
        .expect("Failed to commit");

    let status = get_status(&repo.repo_path, workspace.id);
    assert_eq!(
        status.remote_sync,
        RemoteSyncStatus::Ahead { count: 1 },
        "After local commit, should be Ahead {{ count: 1 }}, got {:?}",
        status.remote_sync
    );

    // Push + pull → should return to InSync
    treq_lib::core::push_workspace_to_remote(&repo.repo_path, Some(workspace.id))
        .expect("Failed to push");
    treq_lib::core::pull_workspace_from_remote(&repo.repo_path, Some(workspace.id), "git")
        .expect("Failed to pull after push");

    let status = get_status(&repo.repo_path, workspace.id);
    assert_eq!(
        status.remote_sync,
        RemoteSyncStatus::InSync,
        "After second push+pull, should be InSync, got {:?}",
        status.remote_sync
    );

    // Verify git branch is still unchanged
    let branch_after2 = jj::get_workspace_branch(workspace_path_str)
        .expect("Failed to get git branch after second push+pull");
    assert_eq!(
        branch_after2, branch_before,
        "Git branch should not change after second push+pull, was '{}' now '{}'",
        branch_before, branch_after2
    );

    // Make two more local commits → expect Ahead { count: 2 }
    fs::write(workspace_path.join("local_2.txt"), "content 2\n")
        .expect("Failed to write file");
    treq_lib::jj::jj_commit(workspace_path_str, "Second local commit")
        .expect("Failed to commit");
    fs::write(workspace_path.join("local_3.txt"), "content 3\n")
        .expect("Failed to write file");
    treq_lib::jj::jj_commit(workspace_path_str, "Third local commit")
        .expect("Failed to commit");

    let status = get_status(&repo.repo_path, workspace.id);
    assert_eq!(
        status.remote_sync,
        RemoteSyncStatus::Ahead { count: 2 },
        "After two local commits, should be Ahead {{ count: 2 }}, got {:?}",
        status.remote_sync
    );
}

// =============================================================================
// Test: pull_workspace_from_remote with None (home repo) pulls remote commits
// =============================================================================

#[test]
fn test_pull_home_repo_fetches_remote_commits() {
    let repo = TestRepo::with_remote().expect("Failed to create test repo with remote");

    // Record the git branch before pull
    let branch_before = jj::get_workspace_branch(&repo.repo_path)
        .expect("Failed to get git branch before pull");

    // Create a commit in the remote
    repo.remote_commit_file("remote-commit.txt", "from remote\n", "Remote commit on main")
        .expect("Failed to create remote commit");

    // Pull using home repo (workspace_id = None) — fetches remote refs
    let result = treq_lib::core::pull_workspace_from_remote(&repo.repo_path, None, "git")
        .expect("pull_workspace_from_remote(None) should succeed");
    assert!(result.success, "Home repo pull should succeed");

    // Verify the remote commit is visible via jj log (main@origin should have advanced)
    let log_output = Command::new("jj")
        .current_dir(&repo.repo_path)
        .args(["log", "-r", "main@origin", "--no-graph", "-T", r#"description"#])
        .output()
        .expect("Failed to run jj log");
    let log_str = String::from_utf8_lossy(&log_output.stdout);
    assert!(
        log_str.contains("Remote commit on main"),
        "main@origin should contain the remote commit after fetch, got: {}",
        log_str
    );

    // Verify pull did not change the git branch (no checkout to different branch/tag)
    let branch_after = jj::get_workspace_branch(&repo.repo_path)
        .expect("Failed to get git branch after pull");
    assert_eq!(
        branch_after, branch_before,
        "Pull should not change git branch, was '{}' before but '{}' after",
        branch_before, branch_after
    );
}

// =============================================================================
// Test: workspace_status with None returns home repo status
// =============================================================================

#[test]
fn test_workspace_status_home_repo() {
    let repo = TestRepo::with_remote().expect("Failed to create test repo with remote");

    // Get home repo status with workspace_id = None
    let status = treq_lib::core::workspace_status(&repo.repo_path, None)
        .expect("workspace_status(None) should succeed");

    // Should return a synthetic home workspace
    assert_eq!(status.partial.current.id, 0, "Home repo workspace id should be 0");
    assert_eq!(status.partial.current.workspace_name, "home");

    // Should be InSync with remote (no local-only commits)
    assert_eq!(
        status.partial.remote_sync,
        RemoteSyncStatus::InSync,
        "Home repo should be InSync initially, got {:?}",
        status.partial.remote_sync
    );

    // DAG should be empty for home repo
    assert!(status.dag_nodes.is_empty(), "Home repo should have no DAG nodes");
    assert!(status.children.is_empty(), "Home repo should have no children");
    assert!(status.target.is_none(), "Home repo should have no target");
}

// =============================================================================
// Test: workspace_status with Some(id) returns correct sync status
// =============================================================================

#[test]
fn test_workspace_status_with_workspace_id() {
    let repo = TestRepo::with_remote().expect("Failed to create test repo with remote");

    let workspace = treq_lib::core::create_workspace(
        &repo.repo_path,
        "feat/ws-status-test",
        Some("workspace status test".to_string()),
        None,
        None,
        None,
    )
    .expect("Failed to create workspace");

    let workspace_path = repo.workspaces_dir().join(&workspace.workspace_path);
    let workspace_path_str = workspace_path.to_str().unwrap();

    // Push initial commit to establish remote branch
    fs::write(workspace_path.join("initial.txt"), "initial\n").expect("Failed to write");
    treq_lib::jj::jj_commit(workspace_path_str, "Initial commit").expect("Failed to commit");
    treq_lib::core::push_workspace_to_remote(&repo.repo_path, Some(workspace.id))
        .expect("Failed to push");
    treq_lib::core::pull_workspace_from_remote(&repo.repo_path, Some(workspace.id), "git")
        .expect("Failed to pull");

    // Should be InSync after push+pull
    let status = treq_lib::core::workspace_status(&repo.repo_path, Some(workspace.id))
        .expect("workspace_status should succeed");
    assert_eq!(
        status.partial.remote_sync,
        RemoteSyncStatus::InSync,
        "Should be InSync after push+pull, got {:?}",
        status.partial.remote_sync
    );
    assert_eq!(status.partial.current.id, workspace.id);

    // Make a local commit → should be Ahead
    fs::write(workspace_path.join("local.txt"), "local\n").expect("Failed to write");
    treq_lib::jj::jj_commit(workspace_path_str, "Local commit").expect("Failed to commit");

    let status = treq_lib::core::workspace_status(&repo.repo_path, Some(workspace.id))
        .expect("workspace_status should succeed");
    assert_eq!(
        status.partial.remote_sync,
        RemoteSyncStatus::Ahead { count: 1 },
        "Should be Ahead {{ count: 1 }} after local commit, got {:?}",
        status.partial.remote_sync
    );

    // Push + pull → back to InSync
    treq_lib::core::push_workspace_to_remote(&repo.repo_path, Some(workspace.id))
        .expect("Failed to push");
    treq_lib::core::pull_workspace_from_remote(&repo.repo_path, Some(workspace.id), "git")
        .expect("Failed to pull");

    let status = treq_lib::core::workspace_status(&repo.repo_path, Some(workspace.id))
        .expect("workspace_status should succeed");
    assert_eq!(
        status.partial.remote_sync,
        RemoteSyncStatus::InSync,
        "Should be InSync after push+pull, got {:?}",
        status.partial.remote_sync
    );
}

// =============================================================================
// Test: create_workspace copies included files and directories
// =============================================================================

#[test]
fn test_create_workspace_copies_included_files() {
    let repo = TestRepo::new().expect("Failed to create test repo");

    // Create files in the repo root to be copied
    repo.create_file("node_modules/pkg/index.js", "module.exports = {}")
        .expect("Failed to create node_modules file");
    repo.create_file(".env", "SECRET=abc")
        .expect("Failed to create .env file");

    let patterns = vec!["node_modules".to_string(), ".env".to_string()];
    let workspace = treq_lib::core::create_workspace(
        &repo.repo_path,
        "feat/copy-test",
        Some("copy test".to_string()),
        None,
        None,
        Some(patterns),
    )
    .expect("Failed to create workspace");

    let ws_dir = repo.workspaces_dir().join(&workspace.workspace_path);

    // Verify files were copied
    assert!(
        ws_dir.join("node_modules/pkg/index.js").exists(),
        "node_modules/pkg/index.js should be copied to workspace"
    );
    assert_eq!(
        fs::read_to_string(ws_dir.join("node_modules/pkg/index.js")).unwrap(),
        "module.exports = {}"
    );
    assert!(
        ws_dir.join(".env").exists(),
        ".env should be copied to workspace"
    );
    assert_eq!(
        fs::read_to_string(ws_dir.join(".env")).unwrap(),
        "SECRET=abc"
    );
}

#[test]
fn test_create_workspace_copies_nested_directories() {
    let repo = TestRepo::new().expect("Failed to create test repo");

    repo.create_file("config/sub/file.toml", "[settings]\nkey = true")
        .expect("Failed to create nested config file");

    let patterns = vec!["config".to_string()];
    let workspace = treq_lib::core::create_workspace(
        &repo.repo_path,
        "feat/nested-copy",
        Some("nested copy test".to_string()),
        None,
        None,
        Some(patterns),
    )
    .expect("Failed to create workspace");

    let ws_dir = repo.workspaces_dir().join(&workspace.workspace_path);
    let copied = ws_dir.join("config/sub/file.toml");

    assert!(copied.exists(), "config/sub/file.toml should be copied to workspace");
    assert_eq!(
        fs::read_to_string(copied).unwrap(),
        "[settings]\nkey = true"
    );
}

#[test]
fn test_create_workspace_skips_missing_included_files() {
    let repo = TestRepo::new().expect("Failed to create test repo");

    let patterns = vec!["nonexistent".to_string()];
    let workspace = treq_lib::core::create_workspace(
        &repo.repo_path,
        "feat/skip-missing",
        Some("skip missing test".to_string()),
        None,
        None,
        Some(patterns),
    )
    .expect("Failed to create workspace");

    let ws_dir = repo.workspaces_dir().join(&workspace.workspace_path);

    // Workspace should exist but not contain the nonexistent pattern
    assert!(ws_dir.exists(), "Workspace directory should exist");
    assert!(
        !ws_dir.join("nonexistent").exists(),
        "nonexistent should not be in workspace"
    );
}

// =============================================================================
// Test: workspace_diff (merge diff) — only workspace changes, exclusions
// =============================================================================

fn merge_diff_new_workspace(repo: &TestRepo, branch: &str) -> Workspace {
    treq_lib::core::create_workspace(&repo.repo_path, branch, None, None, None, None).unwrap()
}

fn merge_diff_write_file(repo: &TestRepo, ws: &Workspace, path: &str, content: &str) {
    let dir = repo.workspaces_dir().join(&ws.workspace_path);
    let full = dir.join(path);
    fs::create_dir_all(full.parent().unwrap()).unwrap();
    fs::write(&full, content).unwrap();
}

fn merge_diff_commit(repo: &TestRepo, ws: &Workspace, msg: &str) {
    treq_lib::core::create_commit(&repo.repo_path, Some(ws.id), msg).unwrap();
}

fn merge_diff_paths(repo: &TestRepo, ws: &Workspace) -> Vec<String> {
    treq_lib::core::workspace_diff(&repo.repo_path, ws.id, "git")
        .unwrap()
        .files
        .iter()
        .map(|f| f.path.clone())
        .collect()
}

#[test]
fn test_only_shows_workspace_changes() {
    let repo = TestRepo::new().unwrap();
    repo.commit_file("base.txt", "base", "base").unwrap();
    let ws = merge_diff_new_workspace(&repo, "feat/ws-only");
    merge_diff_write_file(&repo, &ws, "new.txt", "new");
    merge_diff_commit(&repo, &ws, "add new");

    let paths = merge_diff_paths(&repo, &ws);
    assert!(paths.contains(&"new.txt".into()));
    assert!(!paths.contains(&"base.txt".into()));
    assert!(!paths.contains(&"README.md".into()));
}

#[test]
fn test_excludes_unmodified_target_files() {
    let repo = TestRepo::new().unwrap();
    for f in ["a.txt", "b.txt", "c.txt"] {
        repo.commit_file(f, f, f).unwrap();
    }
    let ws = merge_diff_new_workspace(&repo, "feat/mod-one");
    merge_diff_write_file(&repo, &ws, "b.txt", "modified");
    merge_diff_commit(&repo, &ws, "mod b");

    let paths = merge_diff_paths(&repo, &ws);
    assert_eq!(paths, vec!["b.txt"]);
}

#[test]
fn test_empty_when_no_commits() {
    let repo = TestRepo::new().unwrap();
    repo.commit_file("x.txt", "x", "x").unwrap();
    let ws = merge_diff_new_workspace(&repo, "feat/empty");
    assert!(merge_diff_paths(&repo, &ws).is_empty());
}

#[test]
fn test_multiple_workspace_commits() {
    let repo = TestRepo::new().unwrap();
    repo.commit_file("target.txt", "t", "t").unwrap();
    let ws = merge_diff_new_workspace(&repo, "feat/multi");
    merge_diff_write_file(&repo, &ws, "f1.txt", "1");
    merge_diff_commit(&repo, &ws, "add f1");
    merge_diff_write_file(&repo, &ws, "f2.txt", "2");
    merge_diff_commit(&repo, &ws, "add f2");

    let paths = merge_diff_paths(&repo, &ws);
    assert!(paths.contains(&"f1.txt".into()));
    assert!(paths.contains(&"f2.txt".into()));
    assert!(!paths.contains(&"target.txt".into()));
}

#[test]
fn test_excludes_uncommitted_changes() {
    let repo = TestRepo::new().unwrap();
    let ws = merge_diff_new_workspace(&repo, "feat/wc");
    merge_diff_write_file(&repo, &ws, "committed.txt", "c");
    merge_diff_commit(&repo, &ws, "add committed");
    merge_diff_write_file(&repo, &ws, "uncommitted.txt", "u");

    let paths = merge_diff_paths(&repo, &ws);
    assert!(paths.contains(&"committed.txt".into()));
    assert!(!paths.contains(&"uncommitted.txt".into()));
}

// =============================================================================
// Tests: Auto-rebase resolves bookmark conflicts
// =============================================================================

/// Helper: given a workspace's workspace_path (directory name), return the full path.
fn workspace_full_path(repo: &TestRepo, ws: &treq_lib::local_db::Workspace) -> String {
    repo.workspaces_dir()
        .join(&ws.workspace_path)
        .to_string_lossy()
        .to_string()
}

/// Helper: create a workspace, make a local commit, and push to remote.
/// Returns (workspace, full_path).
fn setup_workspace_with_pushed_commit(
    repo: &TestRepo,
    branch_name: &str,
    filename: &str,
    content: &str,
) -> treq_lib::local_db::Workspace {
    // Create workspace
    let ws = treq_lib::core::create_workspace(
        &repo.repo_path,
        branch_name,
        Some(branch_name.to_string()),
        None,
        None,
        None,
    )
    .expect("Failed to create workspace");

    let full_path = workspace_full_path(repo, &ws);

    // Make a local commit in the workspace directory via jj
    let file_path = std::path::Path::new(&full_path).join(filename);
    std::fs::write(&file_path, content).expect("Failed to write file");
    jj::jj_commit(&full_path, &format!("Add {}", filename))
        .expect("Failed to create commit");

    // Push branch to remote via jj (jj manages the git refs)
    jj::jj_push(&full_path).expect("Failed to push branch via jj");

    // Fetch so jj knows about origin tracking
    jj::jj_git_fetch(&repo.repo_path).expect("Failed to fetch");

    ws
}

#[test]
fn test_auto_rebase_resolves_bookmark_conflict() {
    let repo = TestRepo::with_remote().expect("Failed to create test repo with remote");

    // Create workspace and push a local commit on the workspace branch
    let ws = setup_workspace_with_pushed_commit(
        &repo,
        "feat/conflict-test",
        "local.txt",
        "local content",
    );

    let full_path = workspace_full_path(&repo, &ws);

    // Make another local commit BEFORE the remote diverges (so we have local-only commits)
    let local_file = std::path::Path::new(&full_path).join("local2.txt");
    std::fs::write(&local_file, "local2").expect("Failed to write file");
    jj::jj_commit(&full_path, "Add local2.txt")
        .expect("Failed to create local commit");

    // Now make a remote commit on the same branch to create divergence
    repo.remote_commit_on_branch(
        "feat/conflict-test",
        "remote.txt",
        "remote content",
        "Remote commit on feat/conflict-test",
    )
    .expect("Failed to make remote commit");

    // Fetch — this creates the bookmark conflict
    jj::jj_git_fetch(&repo.repo_path).expect("Failed to fetch");

    // Verify the bookmark is now conflicted
    assert!(
        jj::jj_is_bookmark_conflicted(&full_path, "feat/conflict-test"),
        "Bookmark should be conflicted after divergent fetch"
    );

    // Run rebase_single_workspace — it should resolve the conflict
    let result = treq_lib::auto_rebase::rebase_single_workspace(
        &repo.repo_path,
        ws.id,
        "main",
        true, // force
        "diff",
    )
    .expect("rebase_single_workspace should succeed");

    assert!(result.is_some(), "Should have performed a rebase");

    // Bookmark should no longer be conflicted
    assert!(
        !jj::jj_is_bookmark_conflicted(&full_path, "feat/conflict-test"),
        "Bookmark should not be conflicted after rebase"
    );
}

#[test]
fn test_auto_rebase_resolves_conflict_no_local_commits() {
    let repo = TestRepo::with_remote().expect("Failed to create test repo with remote");

    // Create workspace and push — no extra local commits after push
    let ws = setup_workspace_with_pushed_commit(
        &repo,
        "feat/no-local",
        "initial.txt",
        "initial content",
    );

    let full_path = workspace_full_path(&repo, &ws);

    // Make a remote-only commit to create divergence
    repo.remote_commit_on_branch(
        "feat/no-local",
        "remote_only.txt",
        "remote only",
        "Remote-only commit",
    )
    .expect("Failed to make remote commit");

    // Fetch — creates bookmark conflict (remote advanced, local didn't)
    jj::jj_git_fetch(&repo.repo_path).expect("Failed to fetch");

    // Run rebase — should resolve conflict even with no local commits to rebase
    let result = treq_lib::auto_rebase::rebase_single_workspace(
        &repo.repo_path,
        ws.id,
        "main",
        true,
        "diff",
    )
    .expect("rebase_single_workspace should succeed with no local commits");

    assert!(result.is_some(), "Should have performed a rebase");

    // Bookmark should not be conflicted
    assert!(
        !jj::jj_is_bookmark_conflicted(&full_path, "feat/no-local"),
        "Bookmark should not be conflicted after resolution"
    );
}

#[test]
fn test_auto_rebase_batch_resolves_bookmark_conflicts() {
    let repo = TestRepo::with_remote().expect("Failed to create test repo with remote");

    // Create two workspaces, push them, then add a local commit on each to enable divergence
    let ws1 = setup_workspace_with_pushed_commit(
        &repo,
        "feat/batch-ws1",
        "ws1.txt",
        "ws1 content",
    );
    let ws2 = setup_workspace_with_pushed_commit(
        &repo,
        "feat/batch-ws2",
        "ws2.txt",
        "ws2 content",
    );

    let full_path1 = workspace_full_path(&repo, &ws1);
    let full_path2 = workspace_full_path(&repo, &ws2);

    // Set target_branch on both workspaces so check_and_rebase_all processes them
    treq_lib::local_db::update_workspace_target_branch(&repo.repo_path, ws1.id, "origin/main")
        .expect("Failed to set target branch on ws1");
    treq_lib::local_db::update_workspace_target_branch(&repo.repo_path, ws2.id, "origin/main")
        .expect("Failed to set target branch on ws2");

    // Advance main on remote so workspaces need rebase
    repo.remote_commit_file("main_advance.txt", "advance main", "Advance main for batch test")
        .expect("Failed to advance main");

    // Add a local-only commit on each workspace (diverges from push point)
    let local1 = std::path::Path::new(&full_path1).join("local_ws1.txt");
    std::fs::write(&local1, "local ws1").expect("write");
    jj::jj_commit(&full_path1, "Local commit on ws1").expect("Failed to create local commit ws1");

    let local2 = std::path::Path::new(&full_path2).join("local_ws2.txt");
    std::fs::write(&local2, "local ws2").expect("write");
    jj::jj_commit(&full_path2, "Local commit on ws2").expect("Failed to create local commit ws2");

    // Make independent remote commits on both branches to create conflicts
    repo.remote_commit_on_branch("feat/batch-ws1", "r1.txt", "r1", "Remote on ws1")
        .expect("Failed to make remote commit on ws1");
    repo.remote_commit_on_branch("feat/batch-ws2", "r2.txt", "r2", "Remote on ws2")
        .expect("Failed to make remote commit on ws2");

    // Fetch to manifest conflicts (local and remote both diverged from push point)
    jj::jj_git_fetch(&repo.repo_path).expect("Failed to fetch");

    assert!(
        jj::jj_is_bookmark_conflicted(&full_path1, "feat/batch-ws1"),
        "ws1 bookmark should be conflicted after divergent fetch"
    );
    assert!(
        jj::jj_is_bookmark_conflicted(&full_path2, "feat/batch-ws2"),
        "ws2 bookmark should be conflicted after divergent fetch"
    );

    // Run check_and_rebase_all — should resolve both conflicts and rebase onto advanced main
    treq_lib::auto_rebase::check_and_rebase_all(&repo.repo_path, "diff")
        .expect("check_and_rebase_all should succeed");

    // Both workspaces should no longer be conflicted
    assert!(
        !jj::jj_is_bookmark_conflicted(&full_path1, "feat/batch-ws1"),
        "ws1 bookmark should not be conflicted after batch rebase"
    );
    assert!(
        !jj::jj_is_bookmark_conflicted(&full_path2, "feat/batch-ws2"),
        "ws2 bookmark should not be conflicted after batch rebase"
    );
}

#[test]
fn test_auto_rebase_no_conflict_still_works() {
    let repo = TestRepo::with_remote().expect("Failed to create test repo with remote");

    // Create workspace
    let ws = treq_lib::core::create_workspace(
        &repo.repo_path,
        "feat/no-conflict",
        Some("feat/no-conflict".to_string()),
        None,
        None,
        None,
    )
    .expect("Failed to create workspace");

    let full_path = workspace_full_path(&repo, &ws);

    // Make a local commit in the workspace
    let file_path = std::path::Path::new(&full_path).join("ws_file.txt");
    std::fs::write(&file_path, "workspace content").expect("Failed to write file");
    jj::jj_commit(&full_path, "Add ws_file.txt")
        .expect("Failed to create commit");

    // Advance the target (main) via a remote commit on main
    repo.remote_commit_file("main_advance.txt", "main advance", "Advance main")
        .expect("Failed to advance main");

    // Fetch main
    jj::jj_git_fetch(&repo.repo_path).expect("Failed to fetch");

    // No conflict on workspace branch
    assert!(
        !jj::jj_is_bookmark_conflicted(&full_path, "feat/no-conflict"),
        "Bookmark should not be conflicted"
    );

    // rebase_single_workspace should succeed normally (regression test)
    let result = treq_lib::auto_rebase::rebase_single_workspace(
        &repo.repo_path,
        ws.id,
        "main",
        true,
        "diff",
    )
    .expect("rebase_single_workspace should succeed on non-conflicted workspace");

    // After rebase, workspace should still not be conflicted
    assert!(
        !jj::jj_is_bookmark_conflicted(&full_path, "feat/no-conflict"),
        "Bookmark should not be conflicted after normal rebase"
    );

    let _ = result;
}
