mod e2e_test_helpers;
use e2e_test_helpers::TestRepo;
use std::fs;

#[test]
fn test_create_commit_basic() {
    let repo = TestRepo::new().expect("Failed to create test repo");
    let workspace = treq_lib::core::create_workspace(
        &repo.repo_path,
        "feat/commit-basic",
        Some("basic commit".to_string()),
        None,
        None,
        None,
    )
    .expect("Failed to create workspace");

    let ws_dir = repo.workspaces_dir().join(&workspace.workspace_path);
    fs::write(ws_dir.join("data.txt"), "hello\n").expect("Failed to write file");

    treq_lib::core::commit_workspace(&repo.repo_path, workspace.id, "add data")
        .expect("create_commit failed");

    let log = treq_lib::core::list_commits(&repo.repo_path, Some(workspace.id), false, None, None)
        .expect("list_commits failed");
    assert!(
        log.commits.iter().any(|c| c.description.contains("add data")),
        "expected 'add data' in commit log, got: {:?}",
        log.commits.iter().map(|c| &c.description).collect::<Vec<_>>()
    );
}

#[test]
fn test_create_commit_unknown_workspace_errors() {
    let repo = TestRepo::new().expect("Failed to create test repo");
    let err = treq_lib::core::commit_workspace(&repo.repo_path, i64::MAX, "nope")
        .expect_err("should error on unknown workspace id");
    assert!(
        err.contains("Workspace not found"),
        "expected 'Workspace not found' in error, got: {err}"
    );
}

#[test]
fn test_create_commit_empty_workspace() {
    let repo = TestRepo::new().expect("Failed to create test repo");
    let workspace = treq_lib::core::create_workspace(
        &repo.repo_path,
        "feat/commit-empty",
        Some("empty commit test".to_string()),
        None,
        None,
        None,
    )
    .expect("Failed to create workspace");

    treq_lib::core::commit_workspace(&repo.repo_path, workspace.id, "empty commit")
        .expect("create_commit on empty workspace should succeed");
}
