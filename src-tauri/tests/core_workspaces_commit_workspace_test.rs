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

#[test]
fn test_commit_home_repo_advances_branch() {
    let repo = TestRepo::new().expect("Failed to create test repo");

    let before = e2e_test_helpers::JjVerifier::get_bookmark_commit_id(&repo.repo_path, "main")
        .expect("query bookmark")
        .expect("main bookmark should exist after init");

    repo.create_file("home.txt", "home\n").expect("write home file");

    treq_lib::jj::jj_commit(&repo.repo_path, "home repo commit")
        .expect("jj_commit on home repo failed");

    let after = e2e_test_helpers::JjVerifier::get_bookmark_commit_id(&repo.repo_path, "main")
        .expect("query bookmark")
        .expect("main bookmark should still exist");

    assert_ne!(before, after, "main bookmark should advance after commit");

    let log = treq_lib::core::list_commits(&repo.repo_path, None, false, None, None)
        .expect("list_commits failed");
    assert!(
        log.commits.iter().any(|c| c.description.contains("home repo commit")),
        "expected 'home repo commit' in home repo log, got: {:?}",
        log.commits.iter().map(|c| &c.description).collect::<Vec<_>>()
    );
}

#[test]
fn test_commit_workspace_advances_branch() {
    let repo = TestRepo::new().expect("Failed to create test repo");
    let workspace = treq_lib::core::create_workspace(
        &repo.repo_path,
        "feat/commit-advance",
        Some("advance test".to_string()),
        None,
        None,
        None,
    )
    .expect("Failed to create workspace");

    let ws_dir = repo.workspaces_dir().join(&workspace.workspace_path);
    let ws_dir_str = ws_dir.to_string_lossy().to_string();

    let before = e2e_test_helpers::JjVerifier::get_bookmark_commit_id(&repo.repo_path, &workspace.branch_name)
        .expect("query bookmark")
        .expect("workspace bookmark should exist after create_workspace");

    e2e_test_helpers::TestRepo::write_workspace_file(&ws_dir_str, "data.txt", "hello\n")
        .expect("write workspace file");

    treq_lib::core::commit_workspace(&repo.repo_path, workspace.id, "workspace advance")
        .expect("commit_workspace failed");

    let after = e2e_test_helpers::JjVerifier::get_bookmark_commit_id(&repo.repo_path, &workspace.branch_name)
        .expect("query bookmark")
        .expect("workspace bookmark should still exist");

    assert_ne!(before, after, "workspace bookmark should advance after commit");

    let log = treq_lib::core::list_commits(&repo.repo_path, Some(workspace.id), false, None, None)
        .expect("list_commits failed");
    assert!(
        log.commits.iter().any(|c| c.description.contains("workspace advance")),
        "expected 'workspace advance' in workspace log, got: {:?}",
        log.commits.iter().map(|c| &c.description).collect::<Vec<_>>()
    );
}
