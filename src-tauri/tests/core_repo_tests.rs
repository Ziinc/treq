mod e2e_test_helpers;

use e2e_test_helpers::TestRepo;
use treq_lib::core::{repo_status, RemoteSyncStatus};

// =============================================================================
// Test: repo_status basics
// =============================================================================

#[test]
fn test_repo_status_returns_branch_and_clean_status() {
    let repo = TestRepo::new().expect("Failed to create test repo");

    // core::init() creates .gitignore but doesn't commit it.
    // Commit it so jj sees a truly clean working copy.
    TestRepo::run_git(&repo.repo_path, &["add", ".gitignore"]).unwrap();
    TestRepo::run_git(&repo.repo_path, &["commit", "-m", "Add .gitignore"]).unwrap();

    let status = repo_status(&repo.repo_path).expect("repo_status should succeed");

    assert_eq!(status.current_branch, "main");
    assert!(!status.has_changes, "clean repo should have no changes");
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
    assert_eq!(status.current_branch, "main");
}

#[test]
fn test_repo_status_detects_changes() {
    let repo = TestRepo::new().expect("Failed to create test repo");

    // Write an untracked file so jj sees a working copy change
    std::fs::write(
        std::path::Path::new(&repo.repo_path).join("new_file.txt"),
        "some content",
    )
    .expect("Failed to write file");

    let status = repo_status(&repo.repo_path).expect("repo_status should succeed");

    assert!(status.has_changes, "repo with new file should have changes");
}

// =============================================================================
// Test: repo_status with remote
// =============================================================================

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
    repo.commit_file("local_only.txt", "local content", "Local commit not yet pushed")
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
    repo.remote_commit_file("remote_only.txt", "remote content", "Remote commit not yet fetched")
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
