mod e2e_test_helpers;

use e2e_test_helpers::{JjVerifier, TestRepo};
use treq_lib::core::{
    commit_repo, get_repo_branch, list_commits, list_repo_branches, repo_status,
    switch_repo_branch, RemoteSyncStatus,
};

#[test]
fn test_list_repo_branches_imports_git_refs() {
    let repo = TestRepo::new().expect("Failed to create test repo");

    let branches = list_repo_branches(&repo.repo_path).expect("list_repo_branches should succeed");
    assert!(
        branches.iter().any(|b| b.name == "main"),
        "expected 'main' in branches, got: {:?}",
        branches
    );

    TestRepo::run_git(&repo.repo_path, &["checkout", "-b", "feature-x"])
        .expect("Failed to create branch");
    TestRepo::run_git(&repo.repo_path, &["checkout", "main"])
        .expect("Failed to switch back to main");

    let branches = list_repo_branches(&repo.repo_path).expect("list_repo_branches should succeed");
    assert!(
        branches.iter().any(|b| b.name == "feature-x"),
        "expected 'feature-x' in branches, got: {:?}",
        branches
    );
}

#[test]
fn test_get_repo_branch_returns_current_and_default_branch() {
    let repo = TestRepo::new().expect("Failed to create test repo");

    let branch = get_repo_branch(&repo.repo_path).expect("get_repo_branch should succeed");

    assert_eq!(branch.current_branch, "main");
    assert_eq!(branch.default_branch, "main");

    TestRepo::run_git(&repo.repo_path, &["checkout", "-b", "feature-x"])
        .expect("Failed to create branch");
    let branch = get_repo_branch(&repo.repo_path).expect("get_repo_branch should succeed");
    assert_eq!(branch.current_branch, "feature-x");
    assert_eq!(branch.default_branch, "main");
}

#[test]
fn test_repo_status_returns_clean_status() {
    let repo = TestRepo::new().expect("Failed to create test repo");

    // core::init() creates .gitignore but doesn't commit it.
    // Commit it so jj sees a truly clean working copy.
    TestRepo::run_git(&repo.repo_path, &["add", ".gitignore"]).unwrap();
    TestRepo::run_git(&repo.repo_path, &["commit", "-m", "Add .gitignore"]).unwrap();

    let status = repo_status(&repo.repo_path).expect("repo_status should succeed");

    assert!(!status.has_conflicts, "clean repo should have no conflicts");
}

#[test]
fn test_repo_status_fetch_error_does_not_block() {
    // Repo without remote — fetch should fail but status still returns
    let repo = TestRepo::new().expect("Failed to create test repo");

    let status = repo_status(&repo.repo_path)
        .expect("repo_status should succeed even when there is no remote");

    assert!(
        status.fetch_error.is_some(),
        "should report fetch_error when no remote is configured"
    );
}

#[test]
fn test_repo_status_detects_changes() {
    let repo = TestRepo::new().expect("Failed to create test repo");

    // Write an untracked file so jj sees a working copy change
    repo.create_file("new_file.txt", "some content")
        .expect("Failed to write file");

    let status = repo_status(&repo.repo_path).expect("repo_status should succeed");

    assert!(status.has_changes, "repo with new file should have changes");
}

#[test]
fn test_repo_status_ignores_gitignored_noise() {
    let repo = TestRepo::new().expect("Failed to create test repo");
    let gitignore = repo.read_gitignore().expect("Failed to read .gitignore");
    repo.create_file(".gitignore", &format!("{gitignore}node_modules/\n"))
        .expect("Failed to update .gitignore");
    TestRepo::run_git(&repo.repo_path, &["add", ".gitignore"]).expect("Failed to stage .gitignore");
    TestRepo::run_git(&repo.repo_path, &["commit", "-m", "Ignore node_modules"])
        .expect("Failed to commit .gitignore");

    repo.create_file("node_modules/pkg/index.js", "console.log('ignored');\n")
        .expect("Failed to write node_modules file");
    repo.create_file(".treq/cache/tmp.txt", "ignored treq cache\n")
        .expect("Failed to write .treq cache file");
    repo.create_file(".jj-backup/state.txt", "ignored jj backup\n")
        .expect("Failed to write .jj-backup file");

    let status = repo_status(&repo.repo_path).expect("repo_status should succeed");

    assert!(
        !status.has_changes,
        "repo_status should ignore gitignored noise, got: {:?}",
        status
    );
}

#[test]
fn test_repo_status_with_remote_no_fetch_error() {
    let repo = TestRepo::with_remote().expect("Failed to create test repo with remote");

    let status = repo_status(&repo.repo_path).expect("repo_status should succeed with remote");

    assert!(
        status.fetch_error.is_none(),
        "fetch_error should be None when remote is reachable, got: {:?}",
        status.fetch_error
    );
}

#[test]
fn test_repo_status_with_remote_in_sync() {
    let repo = TestRepo::with_remote().expect("Failed to create test repo with remote");

    let status = repo_status(&repo.repo_path).expect("repo_status should succeed");

    // After TestRepo::with_remote(), main is pushed — should be in sync
    assert_eq!(
        status.remote_sync,
        RemoteSyncStatus::InSync,
        "repo should be in sync after push, got: {:?}",
        status.remote_sync
    );
}

#[test]
fn test_repo_status_with_remote_ahead() {
    let repo = TestRepo::with_remote().expect("Failed to create test repo with remote");

    // Make a local commit that hasn't been pushed
    repo.commit_file(
        "local_only.txt",
        "local content",
        "Local commit not yet pushed",
    )
    .expect("Failed to commit file");

    let status = repo_status(&repo.repo_path).expect("repo_status should succeed");

    match status.remote_sync {
        RemoteSyncStatus::Ahead { count } => {
            assert!(count > 0, "should be at least 1 commit ahead");
        }
        other => panic!("expected Ahead, got {:?}", other),
    }
}

#[test]
fn test_repo_status_with_remote_behind() {
    let repo = TestRepo::with_remote().expect("Failed to create test repo with remote");

    // Push a commit from the "remote" side only
    repo.remote_commit_file(
        "remote_only.txt",
        "remote content",
        "Remote commit not yet fetched",
    )
    .expect("Failed to create remote commit");

    // repo_status includes fetch, so it will pull the new remote commit info
    let status = repo_status(&repo.repo_path).expect("repo_status should succeed");

    match status.remote_sync {
        RemoteSyncStatus::Behind { count } => {
            assert!(count > 0, "should be at least 1 commit behind");
        }
        other => panic!("expected Behind, got {:?}", other),
    }
}

#[test]
fn test_switch_repo_branch_switches_to_existing_branch() {
    let repo = TestRepo::new().expect("Failed to create test repo");

    TestRepo::run_git(&repo.repo_path, &["checkout", "-b", "feature-x"])
        .expect("Failed to create branch");
    TestRepo::run_git(&repo.repo_path, &["checkout", "main"]).expect("Failed to return to main");

    let result = switch_repo_branch(&repo.repo_path, "feature-x");
    assert!(result.is_ok(), "Expected Ok, got: {:?}", result);
    let msg = result.unwrap();
    assert!(
        msg.contains("feature-x") || msg.contains("Switched") || msg.contains("Already"),
        "unexpected message: {}",
        msg
    );
}

#[test]
fn test_switch_repo_branch_already_on_branch() {
    let repo = TestRepo::new().expect("Failed to create test repo");

    let result = switch_repo_branch(&repo.repo_path, "main");
    assert!(result.is_ok(), "Expected Ok even when already on branch");
}

#[test]
fn test_switch_repo_branch_invalid_branch_returns_error() {
    let repo = TestRepo::new().expect("Failed to create test repo");

    let result = switch_repo_branch(&repo.repo_path, "nonexistent-branch-xyz");
    assert!(result.is_err(), "Expected Err for nonexistent branch");
}

#[test]
fn test_commit_repo() {
    let repo = TestRepo::new().expect("Failed to create test repo");

    let before = JjVerifier::get_bookmark_commit_id(&repo.repo_path, "main")
        .expect("query bookmark")
        .expect("main bookmark should exist after init");

    repo.create_file("home_repo_commit.txt", "content\n")
        .expect("Failed to write file");

    let msg = commit_repo(&repo.repo_path, "core commit_repo message")
        .expect("commit_repo should succeed");
    assert!(
        msg.contains("main") || msg.contains("Committed"),
        "unexpected success message: {}",
        msg
    );

    let after = JjVerifier::get_bookmark_commit_id(&repo.repo_path, "main")
        .expect("query bookmark")
        .expect("main bookmark should still exist");

    assert_ne!(
        before, after,
        "main bookmark should advance after commit_repo"
    );

    let log = list_commits(&repo.repo_path, None, false, None, None).expect("list_commits");
    assert!(
        log.commits.len() == 2,
        "should have 2 commits, 1 initial commit, 1 new commit"
    );
    assert!(
        log.commits
            .iter()
            .any(|c| c.description.contains("core commit_repo message")),
        "expected commit message in home log, got: {:?}",
        log.commits
            .iter()
            .map(|c| &c.description)
            .collect::<Vec<_>>()
    );

    // git head should be still on main branch
    let git_head_after = TestRepo::run_git(&repo.repo_path, &["rev-parse", "--abbrev-ref", "HEAD"])
        .expect("get git head after commit");
    assert_eq!(git_head_after.trim(), "main");

    // No staged or unstaged changes should remain in the home repo after commit_repo.
    let staged = TestRepo::run_git(&repo.repo_path, &["diff", "--name-only", "--cached"])
        .expect("get staged diff");
    assert!(
        staged.trim().is_empty(),
        "expected no staged changes after commit_repo, got:\n{}",
        staged
    );
    let unstaged =
        TestRepo::run_git(&repo.repo_path, &["diff", "--name-only"]).expect("get unstaged diff");
    assert!(
        unstaged.trim().is_empty(),
        "expected no unstaged changes after commit_repo, got:\n{}",
        unstaged
    );
}

#[test]
fn test_commit_repo_after_create_workspace() {
    let repo = TestRepo::new().expect("Failed to create test repo");

    treq_lib::core::create_workspace(
        &repo.repo_path,
        "feature-x",
        Some("feature-x".to_string()),
        None,
        None,
        None,
    )
    .expect("Failed to create workspace");
    let before = JjVerifier::get_bookmark_commit_id(&repo.repo_path, "main")
        .expect("query bookmark")
        .expect("main bookmark should exist after init");

    repo.create_file("home_repo_commit.txt", "content\n")
        .expect("Failed to write file");

    let msg = commit_repo(&repo.repo_path, "core commit_repo message")
        .expect("commit_repo should succeed");
    assert!(
        msg.contains("main") || msg.contains("Committed"),
        "unexpected success message: {}",
        msg
    );

    let after = JjVerifier::get_bookmark_commit_id(&repo.repo_path, "main")
        .expect("query bookmark")
        .expect("main bookmark should still exist");

    assert_ne!(
        before, after,
        "main bookmark should advance after commit_repo"
    );

    let log = list_commits(&repo.repo_path, None, false, None, None).expect("list_commits");
    assert!(
        log.commits.len() == 2,
        "should have 2 commits, 1 initial commit, 1 new commit"
    );
    assert!(
        log.commits
            .iter()
            .any(|c| c.description.contains("core commit_repo message")),
        "expected commit message in home log, got: {:?}",
        log.commits
            .iter()
            .map(|c| &c.description)
            .collect::<Vec<_>>()
    );
    assert!(
        log.commits
            .iter()
            .any(|c| c.description.contains("Initial commit")),
        "expected initial commit in home log, got: {:?}",
        log.commits
            .iter()
            .map(|c| &c.description)
            .collect::<Vec<_>>()
    );
}
