mod e2e_test_helpers;

use e2e_test_helpers::{JjVerifier, TestRepo};
use std::fs;
use std::path::Path;
use std::process::Command;

use treq_lib::core::{MaybeEmptyParam, MergeCommit};
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
        treq_lib::core::create_workspace(&repo.repo_path, "feat/base", Some("feature-base".to_string()), None, None)
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
    )
    .expect("Failed to create workspace");

    let workspace_path = repo.workspaces_dir().join(&workspace.workspace_path);
    let workspace_path_str = workspace_path.to_str().unwrap();

    let feature_file = workspace_path.join("squash-feature.txt");
    fs::write(&feature_file, "squash feature content").expect("Failed to write feature file");
    treq_lib::jj::jj_commit(workspace_path_str, "Add squash feature")
        .expect("Failed to commit");

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

    treq_lib::core::create_workspace(&repo.repo_path, "feat/a", Some("feature-a".to_string()), None, None)
        .expect("Failed to create workspace");
    treq_lib::core::create_workspace(&repo.repo_path, "feat/b", Some("feature-b".to_string()), None, None)
        .expect("Failed to create workspace");
    treq_lib::core::create_workspace(&repo.repo_path, "feat/c", Some("feature-c".to_string()), None, None)
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
        treq_lib::core::create_workspace(&repo.repo_path, "base", Some("feature-base".to_string()), None, None)
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
    let statuses =
        treq_lib::core::list_workspace_statuses(&repo.repo_path).expect("Failed to list workspace statuses");
    let base_status_before = statuses.iter().find(|s| s.current.id == workspace.id).unwrap();
    let stacked_status_before = statuses.iter().find(|s| s.current.id == stacked_workspace.id).unwrap();
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

    // Write to stacked workspace README.md and verify has_changes flips to true
    fs::write(&stacked_workspace_path.join("README.md"), "stacked content")
        .expect("Failed to write file");
    let statuses =
        treq_lib::core::list_workspace_statuses(&repo.repo_path).expect("Failed to list workspace statuses");
    let stacked_status_with_change = statuses.iter().find(|s| s.current.id == stacked_workspace.id).unwrap();
    assert!(
        stacked_status_with_change.has_changes,
        "Stacked workspace should have changes after writing a file"
    );

    // Now create a modify-vs-modify conflict scenario:
    // Both workspaces modify README.md to different content
    fs::write(&stacked_workspace_path.join("README.md"), "stacked version of README")
        .expect("Failed to write stacked file");
    fs::write(&workspace_path.join("README.md"), "base version of README")
        .expect("Failed to write base file");

    // list_workspace_statuses should trigger jj snapshot for base workspace,
    // which makes the stacked workspace stale, then detect the conflict
    let statuses =
        treq_lib::core::list_workspace_statuses(&repo.repo_path).expect("Failed to list workspace statuses");
    let stacked_status = statuses
        .iter()
        .find(|s| s.current.workspace_path == stacked_workspace.workspace_path)
        .expect("Stacked workspace should exist");
    assert!(
        stacked_status.has_conflicts,
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
    let workspace_after_push = treq_lib::local_db::get_workspace_by_id(&repo.repo_path, workspace.id)
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
    let workspace_after_push = treq_lib::local_db::get_workspace_by_id(&repo.repo_path, workspace.id)
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
    )
    .expect("Failed to create workspace");

    // Verify workspace has moved_files set
    assert_eq!(
        workspace.moved_files, Some(moved_files.clone()),
        "Workspace should have moved_files set after creation"
    );

    // Verify workspace has intent set
    assert_eq!(
        workspace.intent, Some("refactor code".to_string()),
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
    let status = treq_lib::core::workspace_status(source_path.to_str().unwrap())
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
    let status = treq_lib::core::workspace_status(new_path.to_str().unwrap())
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
    let commits_ahead = treq_lib::jj::jj_get_commits_ahead(source_path_str, "main")
        .expect("Failed to get commits");

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
