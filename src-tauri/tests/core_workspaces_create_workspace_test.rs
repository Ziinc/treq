mod e2e_test_helpers;

use e2e_test_helpers::{JjVerifier, TestRepo};
use std::fs;
use std::path::Path;
use std::process::Command;

use treq_lib::local_db::Workspace;

// =============================================================================
// Test: All treq_lib::core::create_workspace functionality
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
// Test: Can create a stacked workspace
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
// Test: create_workspace moves files from main repo into workspace
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
// Test: create_workspace moves files from one workspace into another
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
