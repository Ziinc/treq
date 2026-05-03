mod e2e_test_helpers;

use e2e_test_helpers::{JjVerifier, TestRepo};
use std::fs;
use std::path::Path;
use std::process::Command;

use treq_lib::local_db::Workspace;

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

#[test]
fn test_can_create_workspace_with_same_source_branch() {
    let repo = TestRepo::new().expect("Failed to create test repo");

    assert!(
        &repo.workspaces_dir().exists(),
        "Workspaces directory should exist"
    );

    // Create workspace (new branch)
    let _workspace = treq_lib::core::create_workspace(
        &repo.repo_path,
        "feat/test1",
        Some("new feature".to_string()),
        None,         // moved_files
        Some("main"), // source_branch (defaults to current)
        None,
    )
    .expect("Failed to create workspace");

    // Create workspace (new branch)
    let workspace = treq_lib::core::create_workspace(
        &repo.repo_path,
        "feat/test2",
        Some("new feature2".to_string()),
        None,         // moved_files
        Some("main"), // source_branch (defaults to current)
        None,
    )
    .expect("Failed to create workspace");

    // JJ VERIFICATION: Verify workspace via jj workspace list (should contain the *second* branch)
    let jj_workspaces =
        JjVerifier::list_workspaces(&repo.repo_path).expect("Failed to list jj workspaces");
    assert!(
        jj_workspaces.contains(&workspace.workspace_name),
        "jj workspace list should contain '{}', got: {:?}",
        workspace.branch_name,
        jj_workspaces
    );

    // JJ VERIFICATION: Verify bookmark was created for the second workspace
    let bookmarks = JjVerifier::list_bookmarks(&repo.repo_path).expect("Failed to list bookmarks");
    assert!(
        bookmarks.iter().any(|b| b == &workspace.branch_name),
        "Bookmark '{}' should exist in workspace, got: {:?}",
        workspace.branch_name,
        bookmarks
    );
}
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
    TestRepo::write_workspace_file(
        workspace1_path.to_str().unwrap(),
        "base.txt",
        "base content",
    )
    .expect("Failed to write base file");

    // Create stacked workspace based on the first workspace's branch
    let stacked: Workspace = treq_lib::core::create_workspace(
        &repo.repo_path,
        "feat/stacked",
        None,
        None,
        Some(&base.branch_name),
        None,
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

    // Fetch workspace status for both workspaces
    let base_status = treq_lib::core::workspace_status(&repo.repo_path, Some(base.id))
        .expect("Failed to get base workspace status");
    let stacked_status = treq_lib::core::workspace_status(&repo.repo_path, Some(stacked.id))
        .expect("Failed to get stacked workspace status");

    // workspace_status no longer builds DAG data.
    assert_eq!(
        base_status.dag_nodes.len(),
        stacked_status.dag_nodes.len(),
        "dag_nodes should be consistently empty"
    );
    assert_eq!(
        base_status.dag_nodes.len(),
        0,
        "workspace_status should not include DAG nodes"
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

    assert!(
        base_status.conflicted_workspace_ids.is_empty(),
        "workspace_status should not include DAG-derived conflict ids"
    );
}

#[test]
fn test_list_workspaces_removes_db_workspace_missing_from_jj_state() {
    let repo = TestRepo::new().expect("Failed to create test repo");

    let workspace: Workspace = treq_lib::core::create_workspace(
        &repo.repo_path,
        "feat/stale-db-row",
        Some("stale db row".to_string()),
        None,
        None,
        None,
    )
    .expect("Failed to create workspace");

    TestRepo::run_git(
        &repo.repo_path,
        &["checkout", workspace.branch_name.as_str()],
    )
    .expect("Failed to checkout workspace branch in home repo");

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

    treq_lib::core::init(&repo.repo_path).expect("Failed to re-run repo init");

    let workspaces =
        treq_lib::core::list_workspaces(&repo.repo_path).expect("Failed to list workspaces");

    assert!(
        workspaces.is_empty(),
        "list_workspaces should omit workspaces that JJ no longer tracks"
    );
    assert!(
        !workspaces.iter().any(|ws| ws.id == workspace.id),
        "Workspace missing from JJ state should be removed from the database"
    );

    let db_workspace = treq_lib::local_db::get_workspace_by_id(&repo.repo_path, workspace.id)
        .expect("Failed to query workspace by id");
    assert!(
        db_workspace.is_none(),
        "Stale database row should be deleted after reconciliation"
    );
}

#[test]
fn test_moved_files_from_main_repo() {
    let repo = TestRepo::new().expect("Failed to create test repo");

    // Create test files in the main repo
    let file1_path = repo
        .create_file("feature1.rs", "// Feature 1 code")
        .expect("Failed to create file1");
    let file2_path = repo
        .create_file("feature2.rs", "// Feature 2 code")
        .expect("Failed to create file2");

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
    let file1_path = TestRepo::write_workspace_file(
        base_path.to_str().unwrap(),
        "component1.ts",
        "// Component 1",
    )
    .expect("Failed to create component1");
    let file2_path = TestRepo::write_workspace_file(
        base_path.to_str().unwrap(),
        "component2.ts",
        "// Component 2",
    )
    .expect("Failed to create component2");

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

    assert!(
        copied.exists(),
        "config/sub/file.toml should be copied to workspace"
    );
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
