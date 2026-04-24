mod e2e_test_helpers;

use e2e_test_helpers::TestRepo;
use treq_lib::core::{list_repo_branches, repo_status, switch_repo_branch, RemoteSyncStatus};

// =============================================================================
// Test: list_repo_branches
// =============================================================================

#[test]
fn test_list_repo_branches_includes_main() {
    let repo = TestRepo::new().expect("Failed to create test repo");

    let branches = list_repo_branches(&repo.repo_path)
        .expect("list_repo_branches should succeed");

    assert!(
        branches.iter().any(|b| b.name == "main"),
        "expected 'main' in branches, got: {:?}",
        branches
    );
}

#[test]
fn test_list_repo_branches_includes_created_branch() {
    let repo = TestRepo::new().expect("Failed to create test repo");

    // Create a new git branch so jj picks it up as a bookmark
    TestRepo::run_git(&repo.repo_path, &["checkout", "-b", "feature-x"])
        .expect("Failed to create branch");
    TestRepo::run_git(&repo.repo_path, &["checkout", "main"])
        .expect("Failed to switch back to main");

    let branches = list_repo_branches(&repo.repo_path)
        .expect("list_repo_branches should succeed");

    assert!(
        branches.iter().any(|b| b.name == "feature-x"),
        "expected 'feature-x' in branches, got: {:?}",
        branches
    );
}

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

// =============================================================================
// Test: switch_repo_branch
// =============================================================================

#[test]
fn test_switch_repo_branch_switches_to_existing_branch() {
    let repo = TestRepo::new().expect("Failed to create test repo");

    TestRepo::run_git(&repo.repo_path, &["checkout", "-b", "feature-x"])
        .expect("Failed to create branch");
    TestRepo::run_git(&repo.repo_path, &["checkout", "main"])
        .expect("Failed to return to main");

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
