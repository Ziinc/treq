mod e2e_test_helpers;

use e2e_test_helpers::{JjVerifier, TestRepo};
use std::path::Path;
use std::process::Command;

use treq_lib::core::{MaybeEmptyParam, MergeCommit, RemoteSyncStatus};
use treq_lib::jj;
use treq_lib::local_db::Workspace;

/// Create a workspace and set its target branch. Helper shared across rebase tests.
fn setup_workspace_with_target(
    repo: &TestRepo,
    branch: &str,
    target: &str,
) -> treq_lib::local_db::Workspace {
    let workspace = treq_lib::core::create_workspace(
        &repo.repo_path,
        branch,
        Some(format!("test workspace for {}", branch)),
        None,
        None,
        None,
    )
    .unwrap_or_else(|e| panic!("Failed to create workspace '{}': {}", branch, e));

    treq_lib::local_db::update_workspace_target_branch(&repo.repo_path, workspace.id, target)
        .unwrap_or_else(|e| panic!("Failed to set target branch: {}", e));

    treq_lib::local_db::get_workspace_by_id(&repo.repo_path, workspace.id)
        .expect("db lookup should succeed")
        .expect("workspace should exist after creation")
}

fn setup_workspace_with_source(
    repo: &TestRepo,
    branch: &str,
    source_branch: &str,
) -> treq_lib::local_db::Workspace {
    treq_lib::core::create_workspace(
        &repo.repo_path,
        branch,
        Some(format!("test workspace for {}", branch)),
        None,
        Some(source_branch),
        None,
    )
    .unwrap_or_else(|e| panic!("Failed to create workspace '{}': {}", branch, e))
}

#[test]
fn test_check_and_rebase_workspaces_all_succeeds() {
    let repo = TestRepo::new().expect("Failed to create test repo");
    let _ws = setup_workspace_with_target(&repo, "feat/rebase-all", "main");

    let result =
        treq_lib::core::check_and_rebase_workspaces(&repo.repo_path, None, None, None, "git")
            .expect("check_and_rebase_workspaces should not error");

    assert!(
        result.success,
        "rebase should succeed, message: {}",
        result.message
    );
    assert!(
        result.bookmark_conflicts.is_empty(),
        "no bookmark conflicts expected"
    );
}

#[test]
fn test_check_and_rebase_workspaces_single_workspace() {
    let repo = TestRepo::new().expect("Failed to create test repo");
    let ws = setup_workspace_with_target(&repo, "feat/single-rebase", "main");

    let result = treq_lib::core::check_and_rebase_workspaces(
        &repo.repo_path,
        Some(ws.id),
        Some("main".to_string()),
        None,
        "git",
    )
    .expect("single-workspace rebase should not error");

    assert!(
        result.success,
        "single rebase should succeed, message: {}",
        result.message
    );
}

#[test]
fn test_check_and_rebase_workspaces_force_bypasses_up_to_date() {
    let repo = TestRepo::new().expect("Failed to create test repo");
    let ws = setup_workspace_with_target(&repo, "feat/force-rebase", "main");

    // First call: marks workspace as up-to-date (last_rebased_commit = current main).
    treq_lib::core::check_and_rebase_workspaces(
        &repo.repo_path,
        Some(ws.id),
        Some("main".to_string()),
        None,
        "git",
    )
    .expect("first rebase should succeed");

    // Second call with force=true: should rebase even though nothing changed.
    let result = treq_lib::core::check_and_rebase_workspaces(
        &repo.repo_path,
        Some(ws.id),
        Some("main".to_string()),
        Some(true),
        "git",
    )
    .expect("forced rebase should not error");

    assert!(
        result.rebased,
        "force=true should trigger rebase even when already up-to-date"
    );
    assert!(result.success, "forced rebase should succeed");
}

#[test]
fn test_force_rebase_workspace_uses_rooted_subtree_scope_excluding_root() {
    let repo = TestRepo::new().expect("Failed to create test repo");
    let ws_a = setup_workspace_with_target(&repo, "feat/root-a", "main");
    let ws_b = setup_workspace_with_source(&repo, "feat/child-b", "feat/root-a");
    let ws_c = setup_workspace_with_source(&repo, "feat/grandchild-c", "feat/child-b");
    let ws_d = setup_workspace_with_source(&repo, "feat/sibling-d", "feat/root-a");

    let result = treq_lib::core::check_and_rebase_workspaces(
        &repo.repo_path,
        Some(ws_b.id),
        Some("main".to_string()),
        Some(true),
        "git",
    )
    .expect("forced rooted-subtree rebase should not error");

    assert!(result.success, "forced rooted-subtree should succeed");
    assert!(
        result.message.contains("Skipped root workspace"),
        "root workspace should be skipped: {}",
        result.message
    );
    assert!(
        result.message.contains("feat-child-b")
            && result.message.contains("feat-grandchild-c")
            && result.message.contains("feat-sibling-d"),
        "descendants/siblings should be included: {}",
        result.message
    );
    assert!(
        result.message.contains("wc refresh deferred"),
        "force rooted-subtree should report deferred working-copy refresh: {}",
        result.message
    );

    let a_last = treq_lib::local_db::get_workspace_last_rebased_commit(&repo.repo_path, ws_a.id)
        .ok()
        .flatten()
        .unwrap_or_default();
    let b_last = treq_lib::local_db::get_workspace_last_rebased_commit(&repo.repo_path, ws_b.id)
        .ok()
        .flatten()
        .unwrap_or_default();
    let c_last = treq_lib::local_db::get_workspace_last_rebased_commit(&repo.repo_path, ws_c.id)
        .ok()
        .flatten()
        .unwrap_or_default();
    let d_last = treq_lib::local_db::get_workspace_last_rebased_commit(&repo.repo_path, ws_d.id)
        .ok()
        .flatten()
        .unwrap_or_default();

    assert!(a_last.is_empty(), "root should not be rebased");
    assert!(!b_last.is_empty(), "child should be rebased");
    assert!(!c_last.is_empty(), "grandchild should be rebased");
    assert!(!d_last.is_empty(), "sibling should be rebased");
}

#[test]
fn test_check_and_rebase_workspaces_skips_self_rebase() {
    let repo = TestRepo::new().expect("Failed to create test repo");
    // Set target_branch equal to branch_name — should be a no-op.
    let ws = setup_workspace_with_target(&repo, "feat/self-target", "feat/self-target");

    let result = treq_lib::core::check_and_rebase_workspaces(
        &repo.repo_path,
        Some(ws.id),
        Some("feat/self-target".to_string()),
        None,
        "git",
    )
    .expect("self-rebase call should not error");

    assert!(
        !result.rebased,
        "self-rebase (branch_name == target_branch) should be skipped"
    );
    assert!(
        result.success,
        "skipped self-rebase should still report success"
    );
}

#[test]
fn test_check_and_rebase_workspaces_all_skips_self_rebase() {
    let repo = TestRepo::new().expect("Failed to create test repo");
    // All workspaces target their own branch → nothing to rebase.
    let _ws = setup_workspace_with_target(&repo, "feat/self-all", "feat/self-all");

    let result =
        treq_lib::core::check_and_rebase_workspaces(&repo.repo_path, None, None, None, "git")
            .expect("check_and_rebase_all with only self-targeting workspaces should not error");

    assert!(
        !result.rebased,
        "all-rebase should skip workspaces where branch_name == target_branch"
    );
    assert!(result.success);
}

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

    // correctly updates description
    assert_eq!(
        updated.description,
        Some("develop different feature".to_string()),
        "Workspace description should be updated"
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
    TestRepo::run_git(&repo.repo_path, &["checkout", "-b", "develop"][..])
        .expect("Failed to create develop branch");

    // add a commit to the develop branch
    repo.commit_file("develop.txt", "develop content", "Develop commit")
        .expect("Failed to commit");

    // check out main branch on the home repo

    TestRepo::run_git(&repo.repo_path, &["checkout", "main"][..]).expect("Failed to checkout main");

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
        updated.description,
        Some("initial feature".to_string()),
        "Workspace description should remain unchanged from creation"
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

#[test]
fn test_update_workspace_target_branch_rebases_workspace_bookmark_lineage() {
    let repo = TestRepo::new().expect("Failed to create test repo");

    let workspace: Workspace = treq_lib::core::create_workspace(
        &repo.repo_path,
        "feat/bookmark-rebase",
        Some("bookmark rebase test".to_string()),
        None,
        None,
        None,
    )
    .expect("Failed to create workspace");

    let workspace_path = repo.workspaces_dir().join(&workspace.workspace_path);
    let workspace_path_str = workspace_path
        .to_str()
        .expect("workspace path should be utf-8");

    TestRepo::write_workspace_file(workspace_path_str, "feature.txt", "feature work\n")
        .expect("Failed to write workspace file");
    treq_lib::core::commit_workspace(&repo.repo_path, workspace.id, "Workspace feature commit")
        .expect("Failed to create workspace commit");
    let new_wc_output = Command::new("jj")
        .current_dir(workspace_path_str)
        .args(["new"])
        .output()
        .expect("Failed to run jj new");
    assert!(
        new_wc_output.status.success(),
        "jj new should create an empty workspace commit: {}",
        String::from_utf8_lossy(&new_wc_output.stderr)
    );

    TestRepo::run_git(&repo.repo_path, &["checkout", "-b", "develop"])
        .expect("Failed to create develop branch");
    repo.commit_file("develop.txt", "develop content", "Develop base commit")
        .expect("Failed to commit develop branch");
    let develop_tip = TestRepo::run_git(&repo.repo_path, &["rev-parse", "develop"])
        .expect("Failed to read develop tip")
        .trim()
        .to_string();
    TestRepo::run_git(&repo.repo_path, &["checkout", "main"]).expect("Failed to checkout main");

    let updated = treq_lib::core::update_workspace(
        &repo.repo_path,
        workspace.id,
        MaybeEmptyParam::Some("develop".to_string()),
        MaybeEmptyParam::Omitted,
    )
    .expect("Failed to update workspace target branch");
    assert_eq!(updated.target_branch.as_deref(), Some("develop"));

    let output = Command::new("jj")
        .current_dir(&repo.repo_path)
        .args([
            "log",
            "-r",
            &format!("ancestors({}) & {}", workspace.branch_name, develop_tip),
            "-n",
            "1",
            "--no-graph",
            "-T",
            "commit_id",
        ])
        .output()
        .expect("Failed to run jj log");
    assert!(
        output.status.success(),
        "jj log should succeed: {}",
        String::from_utf8_lossy(&output.stderr)
    );
    let overlap = String::from_utf8_lossy(&output.stdout).trim().to_string();
    assert!(
        !overlap.is_empty(),
        "workspace bookmark lineage should include develop tip after rebase; stdout={}",
        String::from_utf8_lossy(&output.stdout)
    );
}

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
    let workspace_path_str = workspace_path
        .to_str()
        .expect("workspace path should be utf-8");
    TestRepo::write_workspace_file(workspace_path_str, "test-push.txt", "test push content")
        .expect("Failed to write test file");
    treq_lib::core::commit_workspace(&repo.repo_path, workspace.id, "Add test push file")
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
    let source_path_str = source_path.to_str().unwrap();

    // Add files to source workspace
    TestRepo::write_workspace_file(source_path_str, "file1.txt", "content 1")
        .expect("Failed to write file1");
    TestRepo::write_workspace_file(source_path_str, "file2.txt", "content 2")
        .expect("Failed to write file2");
    TestRepo::write_workspace_file(source_path_str, "file3.txt", "content 3")
        .expect("Failed to write file3");

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
    let source_path_str = source_path.to_str().unwrap();

    TestRepo::write_workspace_file(source_path_str, "file1.txt", "content 1")
        .expect("Failed to write file1");
    TestRepo::write_workspace_file(source_path_str, "file2.txt", "content 2")
        .expect("Failed to write file2");

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
    let source_path_str = source_path.to_str().unwrap();

    TestRepo::write_workspace_file(source_path_str, "shared.txt", "shared content")
        .expect("Failed to write");
    TestRepo::write_workspace_file(source_path_str, "unique.txt", "unique content")
        .expect("Failed to write");

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
    let source_path_str = source_path.to_str().unwrap();

    TestRepo::write_workspace_file(source_path_str, "shared.txt", "shared content")
        .expect("Failed to write");

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
    TestRepo::write_workspace_file(source_path_str, "commit1.txt", "commit 1 content")
        .expect("Failed to write");
    treq_lib::core::commit_workspace(&repo.repo_path, source.id, "First commit")
        .expect("Failed to commit");

    TestRepo::write_workspace_file(source_path_str, "commit2.txt", "commit 2 content")
        .expect("Failed to write");
    treq_lib::core::commit_workspace(&repo.repo_path, source.id, "Second commit")
        .expect("Failed to commit");

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
    TestRepo::write_workspace_file(source_path_str, "early.txt", "early content")
        .expect("Failed to write");
    treq_lib::core::commit_workspace(&repo.repo_path, source.id, "Early commit")
        .expect("Failed to commit");

    TestRepo::write_workspace_file(source_path_str, "late.txt", "late content")
        .expect("Failed to write");
    treq_lib::core::commit_workspace(&repo.repo_path, source.id, "Late commit")
        .expect("Failed to commit");

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
    let result =
        treq_lib::core::rename_workspace(&repo.repo_path, workspace.id, "feat/new-name", true)
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
    let bookmarks = JjVerifier::list_bookmarks(&repo.repo_path).expect("Failed to list bookmarks");
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
    let result = treq_lib::core::rename_workspace(&repo.repo_path, ws_b.id, "feat/a", true)
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
    let result =
        treq_lib::core::rename_workspace(&repo.repo_path, workspace.id, "feat/original", true)
            .expect("Failed to dry-run rename workspace");

    assert!(
        !result.success,
        "Dry run should fail when renaming to the same name"
    );
}

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
    let result =
        treq_lib::core::rename_workspace(&repo.repo_path, workspace.id, "feat/renamed", false)
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
    let bookmarks = JjVerifier::list_bookmarks(&repo.repo_path).expect("Failed to list bookmarks");
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
    let child = treq_lib::core::create_workspace(
        &repo.repo_path,
        "feat/child",
        None,
        None,
        Some(&parent.branch_name),
        None,
    )
    .expect("Failed to create child workspace");

    // Verify child targets parent
    assert_eq!(
        child.target_branch.as_deref(),
        Some("feat/parent"),
        "Child should target parent"
    );

    // Rename parent
    let result =
        treq_lib::core::rename_workspace(&repo.repo_path, parent.id, "feat/parent-renamed", false)
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
    let result =
        treq_lib::core::rename_workspace(&repo.repo_path, workspace.id, "feat/renamed", false)
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

#[test]
fn test_sync_workspaces_forget_deleted_directories() {
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

    TestRepo::remove_dir_all_path(&workspace_path).expect("Failed to delete workspace directory");

    treq_lib::core::sync_workspaces(&repo.repo_path).expect("Failed to sync workspaces");

    let workspaces =
        treq_lib::core::list_workspaces(&repo.repo_path).expect("Failed to list workspaces");
    assert!(workspaces.is_empty(), "Workspaces should be empty");

    assert!(
        !workspace_path.exists(),
        "Workspace directory should stay deleted"
    );

    let jj_workspaces =
        JjVerifier::list_workspaces(&repo.repo_path).expect("Failed to list jj workspaces");
    assert!(
        !jj_workspaces.contains(&workspace.workspace_name),
        "jj workspace list should not contain '{}', got: {:?}",
        workspace.workspace_name,
        jj_workspaces
    );
    assert_eq!(
        jj_workspaces.len(),
        1,
        "jj should only list the default workspace after sync forgets the deleted directory, got: {:?}",
        jj_workspaces
    );
    assert!(
        jj_workspaces.contains(&"default".to_string()),
        "jj workspace list should still include default, got: {:?}",
        jj_workspaces
    );
}

#[test]
fn test_sync_workspaces_delete_forgotten_directories() {
    let repo = TestRepo::new().expect("Failed to create test repo");
    let workspace = treq_lib::core::create_workspace(
        &repo.repo_path,
        "feat/test-forgotten",
        Some("forgotten test".to_string()),
        None,
        None,
        None,
    )
    .expect("Failed to create workspace");

    let workspace_path = repo.workspaces_dir().join(&workspace.workspace_path);

    let forget_output = Command::new("jj")
        .current_dir(&repo.repo_path)
        .args(["workspace", "forget", workspace.workspace_name.as_str()])
        .output()
        .expect("Failed to execute jj workspace forget");
    assert!(
        forget_output.status.success(),
        "jj workspace forget should succeed: {}",
        String::from_utf8_lossy(&forget_output.stderr)
    );

    treq_lib::core::sync_workspaces(&repo.repo_path).expect("Failed to sync workspaces");
    let workspaces =
        treq_lib::core::list_workspaces(&repo.repo_path).expect("Failed to list workspaces");
    assert!(workspaces.is_empty(), "Workspaces should be empty");

    assert!(
        !workspace_path.exists(),
        "Workspace directory should stay deleted"
    );

    let jj_workspaces =
        JjVerifier::list_workspaces(&repo.repo_path).expect("Failed to list jj workspaces");
    assert!(
        !jj_workspaces.contains(&workspace.workspace_name),
        "jj workspace list should not contain '{}', got: {:?}",
        workspace.workspace_name,
        jj_workspaces
    );
    assert_eq!(
        jj_workspaces.len(),
        1,
        "jj should only list the default workspace, got: {:?}",
        jj_workspaces
    );
    assert!(
        jj_workspaces.contains(&"default".to_string()),
        "jj workspace list should still include default, got: {:?}",
        jj_workspaces
    );
}

#[test]
fn test_jj_get_changed_files_ignores_gitignored_noise_in_workspace() {
    let repo = TestRepo::new().expect("Failed to create test repo");
    let gitignore = repo.read_gitignore().expect("Failed to read .gitignore");
    repo.create_file(".gitignore", &format!("{gitignore}node_modules/\n"))
        .expect("Failed to update .gitignore");
    TestRepo::run_git(&repo.repo_path, &["add", ".gitignore"]).expect("Failed to stage .gitignore");
    TestRepo::run_git(&repo.repo_path, &["commit", "-m", "Ignore node_modules"])
        .expect("Failed to commit .gitignore");

    let workspace = treq_lib::core::create_workspace(
        &repo.repo_path,
        "feat/ignored-jj-noise",
        None,
        None,
        None,
        None,
    )
    .expect("Failed to create workspace");

    let workspace_path = repo.workspaces_dir().join(&workspace.workspace_path);
    let workspace_path_str = workspace_path.to_str().expect("utf-8");

    TestRepo::write_workspace_file(
        workspace_path_str,
        "node_modules/pkg/index.js",
        "console.log('ignored');\n",
    )
    .expect("Failed to write node_modules file");
    TestRepo::write_workspace_file(
        workspace_path_str,
        ".treq/cache/tmp.txt",
        "ignored treq cache\n",
    )
    .expect("Failed to write .treq cache file");
    TestRepo::write_workspace_file(
        workspace_path_str,
        ".jj-backup/state.txt",
        "ignored jj backup\n",
    )
    .expect("Failed to write .jj-backup file");

    let changed_files = treq_lib::jj::jj_get_changed_files(workspace_path_str)
        .expect("Failed to get changed files");

    assert!(
        changed_files.is_empty(),
        "Expected ignored noise to be excluded, got {:?}",
        changed_files
    );
}

#[test]
fn test_jj_get_changed_files_honors_nested_gitignore() {
    let repo = TestRepo::new().expect("Failed to create test repo");
    let workspace = treq_lib::core::create_workspace(
        &repo.repo_path,
        "feat/nested-gitignore",
        None,
        None,
        None,
        None,
    )
    .expect("Failed to create workspace");

    let workspace_path = repo.workspaces_dir().join(&workspace.workspace_path);
    let workspace_path_str = workspace_path.to_str().expect("utf-8");

    TestRepo::write_workspace_file(workspace_path_str, "generated/.gitignore", "ignored.txt\n")
        .expect("Failed to write nested .gitignore");
    TestRepo::write_workspace_file(
        workspace_path_str,
        "generated/ignored.txt",
        "nested ignored\n",
    )
    .expect("Failed to write ignored file");

    let changed_files = treq_lib::jj::jj_get_changed_files(workspace_path_str)
        .expect("Failed to get changed files");

    assert!(
        changed_files
            .iter()
            .all(|change| change.path != "generated/ignored.txt"),
        "Expected nested .gitignore to suppress ignored file, got {:?}",
        changed_files
    );
}

#[test]
fn test_jj_get_changed_files_keeps_tracked_files_visible_after_ignore_rule_added() {
    let repo = TestRepo::new().expect("Failed to create test repo");
    let workspace = treq_lib::core::create_workspace(
        &repo.repo_path,
        "feat/tracked-after-ignore",
        None,
        None,
        None,
        None,
    )
    .expect("Failed to create workspace");

    let workspace_path = repo.workspaces_dir().join(&workspace.workspace_path);
    let workspace_path_str = workspace_path.to_str().expect("utf-8");

    TestRepo::write_workspace_file(workspace_path_str, "tracked.txt", "version one\n")
        .expect("Failed to write tracked file");
    treq_lib::core::commit_workspace(&repo.repo_path, workspace.id, "Track file")
        .expect("Failed to commit tracked file");

    TestRepo::write_workspace_file(workspace_path_str, ".gitignore", "tracked.txt\n")
        .expect("Failed to write .gitignore");
    TestRepo::write_workspace_file(workspace_path_str, "tracked.txt", "version two\n")
        .expect("Failed to modify tracked file");

    let changed_files = treq_lib::jj::jj_get_changed_files(workspace_path_str)
        .expect("Failed to get changed files");

    assert!(
        changed_files
            .iter()
            .any(|change| change.path == "tracked.txt"),
        "Tracked file should remain visible after ignore rule, got {:?}",
        changed_files
    );
}

#[test]
fn test_ensure_jj_initialized_reinits_when_jj_deleted() {
    let repo = TestRepo::new().expect("Failed to create test repo");

    // Verify .jj exists
    assert!(repo.is_jj_initialized(), ".jj should exist after init");

    // Delete .jj
    TestRepo::remove_dir_all_path(Path::new(&repo.repo_path).join(".jj"))
        .expect("Failed to remove .jj");
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
    TestRepo::write_workspace_file(workspace_path_str, "real.txt", "real content")
        .expect("Failed to write file");
    treq_lib::core::commit_workspace(&repo.repo_path, workspace.id, "Add real file")
        .expect("Failed to commit");

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
        commits_ahead.commits[0]
            .description
            .contains("Add real file"),
        "The commit should be the real one, got: {}",
        commits_ahead.commits[0].description
    );
}

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
    TestRepo::write_workspace_file(workspace_path_str, "feature.txt", "feature content")
        .expect("Failed to write file");
    treq_lib::core::commit_workspace(&repo.repo_path, workspace.id, "Add feature")
        .expect("Failed to commit");

    // Create empty commits
    Command::new("jj")
        .current_dir(workspace_path_str)
        .args(["new"])
        .output()
        .expect("Failed to run jj new");

    let log = treq_lib::core::list_commits(&repo.repo_path, Some(workspace.id), false, None, None)
        .expect("list_commits failed");
    assert_eq!(
        log.commits.len(),
        1,
        "list_commits should not include empty commits, got: {:?}",
        log.commits
            .iter()
            .map(|c| c.description.as_str())
            .collect::<Vec<_>>()
    );
    assert!(
        log.commits[0].description.contains("Add feature"),
        "Expected the real commit only, got: {:?}",
        log.commits[0].description
    );

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
    TestRepo::write_workspace_file(workspace_path_str, "squash.txt", "squash content")
        .expect("Failed to write file");
    treq_lib::core::commit_workspace(&repo.repo_path, workspace.id, "Add squash file")
        .expect("Failed to commit");

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
        MergeCommit::SquashAndMerge,
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
    TestRepo::write_workspace_file(workspace_path_str, "rebase.txt", "rebase content")
        .expect("Failed to write file");
    treq_lib::core::commit_workspace(&repo.repo_path, workspace.id, "Add rebase file")
        .expect("Failed to commit");

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
        MergeCommit::RebaseAndMerge,
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

    assert!(
        workspace.not_on_remote,
        "New workspace should be not_on_remote"
    );

    let status = treq_lib::core::workspace_status(&repo.repo_path, Some(workspace.id))
        .expect("workspace_status should succeed");

    assert_eq!(
        status.remote_sync,
        RemoteSyncStatus::NotOnRemote,
        "Unpushed workspace should have NotOnRemote sync status"
    );
}

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
    let workspace_path_str = workspace_path.to_str().unwrap();
    TestRepo::write_workspace_file(workspace_path_str, "file.txt", "content")
        .expect("Failed to write file");
    treq_lib::core::commit_workspace(&repo.repo_path, workspace.id, "Initial commit")
        .expect("Failed to commit");

    // Push to remote
    treq_lib::core::push_workspace_to_remote(&repo.repo_path, Some(workspace.id))
        .expect("Failed to push workspace");

    let status = treq_lib::core::workspace_status(&repo.repo_path, Some(workspace.id))
        .expect("workspace_status should succeed");

    assert_eq!(
        status.remote_sync,
        RemoteSyncStatus::InSync,
        "Pushed workspace with no new changes should be InSync"
    );
}

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
    TestRepo::write_workspace_file(workspace_path_str, "file1.txt", "content 1")
        .expect("Failed to write file");
    treq_lib::core::commit_workspace(&repo.repo_path, workspace.id, "Initial commit")
        .expect("Failed to commit");
    treq_lib::core::push_workspace_to_remote(&repo.repo_path, Some(workspace.id))
        .expect("Failed to push workspace");

    // Make a local commit without pushing
    TestRepo::write_workspace_file(workspace_path_str, "file2.txt", "content 2")
        .expect("Failed to write file");
    treq_lib::core::commit_workspace(&repo.repo_path, workspace.id, "Local only commit")
        .expect("Failed to commit");

    let status = treq_lib::core::workspace_status(&repo.repo_path, Some(workspace.id))
        .expect("workspace_status should succeed");

    assert_eq!(
        status.remote_sync,
        RemoteSyncStatus::Ahead { count: 1 },
        "Workspace with unpushed commit should be Ahead {{ count: 1 }}"
    );
}

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
    TestRepo::write_workspace_file(workspace_path_str, "file1.txt", "content 1")
        .expect("Failed to write file");
    treq_lib::core::commit_workspace(&repo.repo_path, workspace.id, "Initial commit")
        .expect("Failed to commit");
    treq_lib::core::push_workspace_to_remote(&repo.repo_path, Some(workspace.id))
        .expect("Failed to push workspace");

    // Clone the bare remote, commit and push from the clone to simulate remote-ahead
    let clone_dir = repo.temp_dir.path().join("clone");
    let clone_path_str = clone_dir.to_str().unwrap();
    let remote_dir = repo.temp_dir.path().join("remote.git");
    Command::new("git")
        .args(["clone", remote_dir.to_str().unwrap(), clone_path_str])
        .output()
        .expect("Failed to clone remote");
    Command::new("git")
        .current_dir(&clone_dir)
        .args(["checkout", &workspace.branch_name])
        .output()
        .expect("Failed to checkout branch in clone");
    TestRepo::write_workspace_file(clone_path_str, "remote-file.txt", "from remote")
        .expect("Failed to write file");
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

    let status = treq_lib::core::workspace_status(&repo.repo_path, Some(workspace.id))
        .expect("workspace_status should succeed");

    assert_eq!(
        status.remote_sync,
        RemoteSyncStatus::Behind { count: 1 },
        "Workspace should be Behind {{ count: 1 }} after remote commit"
    );
}

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
    TestRepo::write_workspace_file(workspace_path_str, "file1.txt", "content 1")
        .expect("Failed to write file");
    treq_lib::core::commit_workspace(&repo.repo_path, workspace.id, "Initial commit")
        .expect("Failed to commit");
    treq_lib::core::push_workspace_to_remote(&repo.repo_path, Some(workspace.id))
        .expect("Failed to push workspace");

    // Make a local commit (don't push)
    TestRepo::write_workspace_file(workspace_path_str, "local-file.txt", "local content")
        .expect("Failed to write file");
    treq_lib::core::commit_workspace(&repo.repo_path, workspace.id, "Local commit")
        .expect("Failed to commit");

    // Clone the bare remote, commit and push from the clone to simulate remote-ahead
    let clone_dir = repo.temp_dir.path().join("clone-diverged");
    let clone_path_str = clone_dir.to_str().unwrap();
    let remote_dir = repo.temp_dir.path().join("remote.git");
    Command::new("git")
        .args(["clone", remote_dir.to_str().unwrap(), clone_path_str])
        .output()
        .expect("Failed to clone remote");
    Command::new("git")
        .current_dir(&clone_dir)
        .args(["checkout", &workspace.branch_name])
        .output()
        .expect("Failed to checkout branch in clone");
    TestRepo::write_workspace_file(clone_path_str, "remote-file.txt", "from remote")
        .expect("Failed to write file");
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

    let status = treq_lib::core::workspace_status(&repo.repo_path, Some(workspace.id))
        .expect("workspace_status should succeed");

    assert_eq!(
        status.remote_sync,
        RemoteSyncStatus::Diverged {
            ahead: 1,
            behind: 1
        },
        "Workspace should be Diverged {{ ahead: 1, behind: 1 }}"
    );
}

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
    TestRepo::write_workspace_file(workspace_path_str, "file1.txt", "content 1")
        .expect("Failed to write file");
    treq_lib::core::commit_workspace(&repo.repo_path, workspace.id, "Commit B")
        .expect("Failed to commit");
    treq_lib::core::push_workspace_to_remote(&repo.repo_path, Some(workspace.id))
        .expect("Failed to push workspace");

    // Make local commit D (don't push)
    TestRepo::write_workspace_file(workspace_path_str, "local-file.txt", "local content")
        .expect("Failed to write file");
    treq_lib::core::commit_workspace(&repo.repo_path, workspace.id, "Local commit D")
        .expect("Failed to commit");

    // Clone the bare remote, commit C, push from clone to simulate remote-ahead
    let clone_dir = repo.temp_dir.path().join("clone-pull-diverged");
    let clone_path_str = clone_dir.to_str().unwrap();
    let remote_dir = repo.temp_dir.path().join("remote.git");
    Command::new("git")
        .args(["clone", remote_dir.to_str().unwrap(), clone_path_str])
        .output()
        .expect("Failed to clone remote");
    Command::new("git")
        .current_dir(&clone_dir)
        .args(["checkout", &workspace.branch_name])
        .output()
        .expect("Failed to checkout branch in clone");
    TestRepo::write_workspace_file(clone_path_str, "remote-file.txt", "from remote")
        .expect("Failed to write file");
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
    let status = treq_lib::core::workspace_status(&repo.repo_path, Some(workspace.id))
        .expect("workspace_status should succeed");

    assert!(
        !matches!(status.remote_sync, RemoteSyncStatus::Diverged { .. }),
        "Workspace should no longer be Diverged after pull, got: {:?}",
        status.remote_sync
    );
}

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
    TestRepo::write_workspace_file(workspace_path_str, "file1.txt", "content 1")
        .expect("Failed to write file");
    treq_lib::core::commit_workspace(&repo.repo_path, workspace.id, "Initial commit")
        .expect("Failed to commit");
    treq_lib::core::push_workspace_to_remote(&repo.repo_path, Some(workspace.id))
        .expect("Failed to push workspace");

    // No local changes — simulate remote advancing
    let clone_dir = repo.temp_dir.path().join("clone-pull-no-div");
    let clone_path_str = clone_dir.to_str().unwrap();
    let remote_dir = repo.temp_dir.path().join("remote.git");
    Command::new("git")
        .args(["clone", remote_dir.to_str().unwrap(), clone_path_str])
        .output()
        .expect("Failed to clone remote");
    Command::new("git")
        .current_dir(&clone_dir)
        .args(["checkout", &workspace.branch_name])
        .output()
        .expect("Failed to checkout branch in clone");
    TestRepo::write_workspace_file(clone_path_str, "remote-only.txt", "remote content")
        .expect("Failed to write file");
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
    TestRepo::write_workspace_file(workspace_path_str, "initial.txt", "initial content\n")
        .expect("Failed to write file");
    treq_lib::core::commit_workspace(&repo.repo_path, workspace.id, "Initial commit on branch")
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

    // Verify workspace_status shows InSync
    let status = treq_lib::core::workspace_status(&repo.repo_path, Some(workspace.id))
        .expect("workspace_status should succeed");
    assert_eq!(
        status.remote_sync,
        RemoteSyncStatus::InSync,
        "workspace_status should show InSync after push+pull, got {:?}",
        status.remote_sync
    );

    // Should be in sync (0, 0)
    let (ahead, behind) =
        treq_lib::jj::jj_get_sync_status(workspace_path_str, &workspace.branch_name, false)
            .expect("Failed to get sync status at baseline");
    assert_eq!(
        (ahead, behind),
        (0, 0),
        "After push, should be in sync (0, 0), got ({}, {})",
        ahead,
        behind
    );
}

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
    TestRepo::write_workspace_file(workspace_path_str, "initial.txt", "initial content\n")
        .expect("Failed to write file");
    treq_lib::core::commit_workspace(&repo.repo_path, workspace.id, "Initial commit on branch")
        .expect("Failed to commit");
    treq_lib::core::push_workspace_to_remote(&repo.repo_path, Some(workspace.id))
        .expect("Failed to push");
    treq_lib::core::pull_workspace_from_remote(&repo.repo_path, Some(workspace.id), "git")
        .expect("Failed to pull");

    // Make a local-only commit → expect (1, 0)
    TestRepo::write_workspace_file(workspace_path_str, "local_only.txt", "local content\n")
        .expect("Failed to write file");
    treq_lib::core::commit_workspace(&repo.repo_path, workspace.id, "Local only commit")
        .expect("Failed to commit");

    let (ahead, behind) =
        treq_lib::jj::jj_get_sync_status(workspace_path_str, &workspace.branch_name, false)
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
    TestRepo::write_workspace_file(workspace_path_str, "initial.txt", "initial content\n")
        .expect("Failed to write file");
    treq_lib::core::commit_workspace(&repo.repo_path, workspace.id, "Initial commit on branch")
        .expect("Failed to commit");
    treq_lib::core::push_workspace_to_remote(&repo.repo_path, Some(workspace.id))
        .expect("Failed to push");
    treq_lib::core::pull_workspace_from_remote(&repo.repo_path, Some(workspace.id), "git")
        .expect("Failed to pull");

    let branch_before = jj::get_workspace_branch(workspace_path_str)
        .expect("Failed to get git branch before local commit");

    // Make a local commit then push it
    TestRepo::write_workspace_file(workspace_path_str, "local_only.txt", "local content\n")
        .expect("Failed to write file");
    treq_lib::core::commit_workspace(&repo.repo_path, workspace.id, "Local only commit")
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

    // Verify workspace_status shows InSync
    let status = treq_lib::core::workspace_status(&repo.repo_path, Some(workspace.id))
        .expect("workspace_status should succeed");
    assert_eq!(
        status.remote_sync,
        RemoteSyncStatus::InSync,
        "workspace_status should show InSync after push+pull, got {:?}",
        status.remote_sync
    );

    // Should be back in sync (0, 0)
    let (ahead, behind) =
        treq_lib::jj::jj_get_sync_status(workspace_path_str, &workspace.branch_name, false)
            .expect("Failed to get sync status after push");
    assert_eq!(
        (ahead, behind),
        (0, 0),
        "After push+fetch, should be in sync (0, 0), got ({}, {})",
        ahead,
        behind
    );
}

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
    TestRepo::write_workspace_file(workspace_path_str, "initial.txt", "initial content\n")
        .expect("Failed to write file");
    treq_lib::core::commit_workspace(&repo.repo_path, workspace.id, "Initial commit on branch")
        .expect("Failed to commit");
    treq_lib::core::push_workspace_to_remote(&repo.repo_path, Some(workspace.id))
        .expect("Failed to push");
    treq_lib::core::pull_workspace_from_remote(&repo.repo_path, Some(workspace.id), "git")
        .expect("Failed to pull");

    // Make two local commits → expect (2, 0)
    TestRepo::write_workspace_file(workspace_path_str, "local_2.txt", "content 2\n")
        .expect("Failed to write file");
    treq_lib::core::commit_workspace(&repo.repo_path, workspace.id, "Second local commit")
        .expect("Failed to commit");
    TestRepo::write_workspace_file(workspace_path_str, "local_3.txt", "content 3\n")
        .expect("Failed to write file");
    treq_lib::core::commit_workspace(&repo.repo_path, workspace.id, "Third local commit")
        .expect("Failed to commit");

    let (ahead, behind) =
        treq_lib::jj::jj_get_sync_status(workspace_path_str, &workspace.branch_name, false)
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

    // Helper closure: get WorkspaceStatus for our workspace
    let get_status = |repo_path: &str, ws_id: i64| -> treq_lib::core::WorkspaceStatus {
        treq_lib::core::workspace_status(repo_path, Some(ws_id))
            .expect("workspace_status should succeed")
    };

    // Record git branch before any operations
    let branch_before = jj::get_workspace_branch(workspace_path_str)
        .expect("Failed to get git branch before operations");

    // Make a commit and push to establish the remote branch
    TestRepo::write_workspace_file(workspace_path_str, "initial.txt", "initial content\n")
        .expect("Failed to write file");
    treq_lib::core::commit_workspace(&repo.repo_path, workspace.id, "Initial commit on branch")
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
    TestRepo::write_workspace_file(workspace_path_str, "local_only.txt", "local content\n")
        .expect("Failed to write file");
    treq_lib::core::commit_workspace(&repo.repo_path, workspace.id, "Local only commit")
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
    TestRepo::write_workspace_file(workspace_path_str, "local_2.txt", "content 2\n")
        .expect("Failed to write file");
    treq_lib::core::commit_workspace(&repo.repo_path, workspace.id, "Second local commit")
        .expect("Failed to commit");
    TestRepo::write_workspace_file(workspace_path_str, "local_3.txt", "content 3\n")
        .expect("Failed to write file");
    treq_lib::core::commit_workspace(&repo.repo_path, workspace.id, "Third local commit")
        .expect("Failed to commit");

    let status = get_status(&repo.repo_path, workspace.id);
    assert_eq!(
        status.remote_sync,
        RemoteSyncStatus::Ahead { count: 2 },
        "After two local commits, should be Ahead {{ count: 2 }}, got {:?}",
        status.remote_sync
    );
}

#[test]
fn test_pull_home_repo_fetches_remote_commits() {
    let repo = TestRepo::with_remote().expect("Failed to create test repo with remote");

    // Record the git branch before pull
    let branch_before =
        jj::get_workspace_branch(&repo.repo_path).expect("Failed to get git branch before pull");

    // Create a commit in the remote
    repo.remote_commit_file(
        "remote-commit.txt",
        "from remote\n",
        "Remote commit on main",
    )
    .expect("Failed to create remote commit");

    // Pull using home repo (workspace_id = None) — fetches remote refs
    let result = treq_lib::core::pull_workspace_from_remote(&repo.repo_path, None, "git")
        .expect("pull_workspace_from_remote(None) should succeed");
    assert!(result.success, "Home repo pull should succeed");

    // Verify the remote commit is visible via jj log (main@origin should have advanced)
    let log_output = Command::new("jj")
        .current_dir(&repo.repo_path)
        .args([
            "log",
            "-r",
            "main@origin",
            "--no-graph",
            "-T",
            r#"description"#,
        ])
        .output()
        .expect("Failed to run jj log");
    let log_str = String::from_utf8_lossy(&log_output.stdout);
    assert!(
        log_str.contains("Remote commit on main"),
        "main@origin should contain the remote commit after fetch, got: {}",
        log_str
    );

    // Verify pull did not change the git branch (no checkout to different branch/tag)
    let branch_after =
        jj::get_workspace_branch(&repo.repo_path).expect("Failed to get git branch after pull");
    assert_eq!(
        branch_after, branch_before,
        "Pull should not change git branch, was '{}' before but '{}' after",
        branch_before, branch_after
    );
}

#[test]
fn test_workspace_status_home_repo() {
    let repo = TestRepo::with_remote().expect("Failed to create test repo with remote");

    // Get home repo status with workspace_id = None
    let status = treq_lib::core::workspace_status(&repo.repo_path, None)
        .expect("workspace_status(None) should succeed");

    // Should return a synthetic home workspace
    assert_eq!(
        status.partial.current.id, 0,
        "Home repo workspace id should be 0"
    );
    assert_eq!(status.partial.current.workspace_name, "home");

    // Should be InSync with remote (no local-only commits)
    assert_eq!(
        status.remote_sync,
        RemoteSyncStatus::InSync,
        "Home repo should be InSync initially, got {:?}",
        status.remote_sync
    );

    // DAG should be empty for home repo
    assert!(
        status.dag_nodes.is_empty(),
        "Home repo should have no DAG nodes"
    );
    assert!(
        status.children.is_empty(),
        "Home repo should have no children"
    );
    assert!(status.target.is_none(), "Home repo should have no target");
}

#[test]
fn test_workspace_status_ignores_gitignored_noise() {
    let repo = TestRepo::new().expect("Failed to create test repo");
    let gitignore = repo.read_gitignore().expect("Failed to read .gitignore");
    repo.create_file(".gitignore", &format!("{gitignore}node_modules/\n"))
        .expect("Failed to update .gitignore");
    TestRepo::run_git(&repo.repo_path, &["add", ".gitignore"]).expect("Failed to stage .gitignore");
    TestRepo::run_git(&repo.repo_path, &["commit", "-m", "Ignore node_modules"])
        .expect("Failed to commit .gitignore");

    let workspace = treq_lib::core::create_workspace(
        &repo.repo_path,
        "feat/workspace-ignored-noise",
        None,
        None,
        None,
        None,
    )
    .expect("Failed to create workspace");

    let workspace_path = repo.workspaces_dir().join(&workspace.workspace_path);
    let workspace_path_str = workspace_path.to_str().expect("utf-8");

    TestRepo::write_workspace_file(
        workspace_path_str,
        "node_modules/pkg/index.js",
        "console.log('ignored');\n",
    )
    .expect("Failed to write node_modules file");
    TestRepo::write_workspace_file(
        workspace_path_str,
        ".treq/cache/tmp.txt",
        "ignored treq cache\n",
    )
    .expect("Failed to write .treq cache file");
    TestRepo::write_workspace_file(
        workspace_path_str,
        ".jj-backup/state.txt",
        "ignored jj backup\n",
    )
    .expect("Failed to write .jj-backup file");

    let status = treq_lib::core::workspace_status(&repo.repo_path, Some(workspace.id))
        .expect("workspace_status should succeed");

    assert!(
        !status.partial.has_changes,
        "workspace_status should ignore gitignored noise, got {:?}",
        status.partial
    );
}

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
    TestRepo::write_workspace_file(workspace_path_str, "initial.txt", "initial\n")
        .expect("Failed to write");
    treq_lib::core::commit_workspace(&repo.repo_path, workspace.id, "Initial commit")
        .expect("Failed to commit");
    treq_lib::core::push_workspace_to_remote(&repo.repo_path, Some(workspace.id))
        .expect("Failed to push");
    treq_lib::core::pull_workspace_from_remote(&repo.repo_path, Some(workspace.id), "git")
        .expect("Failed to pull");

    // Should be InSync after push+pull
    let status = treq_lib::core::workspace_status(&repo.repo_path, Some(workspace.id))
        .expect("workspace_status should succeed");
    assert_eq!(
        status.remote_sync,
        RemoteSyncStatus::InSync,
        "Should be InSync after push+pull, got {:?}",
        status.remote_sync
    );
    assert_eq!(status.partial.current.id, workspace.id);

    // Make a local commit → should be Ahead
    TestRepo::write_workspace_file(workspace_path_str, "local.txt", "local\n")
        .expect("Failed to write");
    treq_lib::core::commit_workspace(&repo.repo_path, workspace.id, "Local commit")
        .expect("Failed to commit");

    let status = treq_lib::core::workspace_status(&repo.repo_path, Some(workspace.id))
        .expect("workspace_status should succeed");
    assert_eq!(
        status.remote_sync,
        RemoteSyncStatus::Ahead { count: 1 },
        "Should be Ahead {{ count: 1 }} after local commit, got {:?}",
        status.remote_sync
    );

    // Push + pull → back to InSync
    treq_lib::core::push_workspace_to_remote(&repo.repo_path, Some(workspace.id))
        .expect("Failed to push");
    treq_lib::core::pull_workspace_from_remote(&repo.repo_path, Some(workspace.id), "git")
        .expect("Failed to pull");

    let status = treq_lib::core::workspace_status(&repo.repo_path, Some(workspace.id))
        .expect("workspace_status should succeed");
    assert_eq!(
        status.remote_sync,
        RemoteSyncStatus::InSync,
        "Should be InSync after push+pull, got {:?}",
        status.remote_sync
    );
    assert!(
        status.dag_nodes.is_empty(),
        "workspace_status should not build DAG nodes"
    );
    assert!(
        status.conflicted_workspace_ids.is_empty(),
        "workspace_status should not return DAG-derived conflict IDs"
    );
}
