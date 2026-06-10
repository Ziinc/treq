mod e2e_test_helpers;

use e2e_test_helpers::{JjVerifier, TestRepo};
use treq_lib::core::{
    commit_repo, get_repo_branch, list_commits, list_repo_branches, repo_status,
    switch_repo_branch, RemoteSyncStatus,
};

#[test]
fn test_list_repo_branches_imports_git_refs() {
    let repo = TestRepo::new().expect("Failed to create test repo");
    let default_branch = repo.default_branch();

    let branches = list_repo_branches(&repo.repo_path).expect("list_repo_branches should succeed");
    assert!(
        branches.iter().any(|b| b.name == default_branch),
        "expected '{}' in branches, got: {:?}",
        default_branch,
        branches
    );

    TestRepo::run_git(&repo.repo_path, &["checkout", "-b", "feature-x"])
        .expect("Failed to create branch");
    TestRepo::run_git(&repo.repo_path, &["checkout", default_branch])
        .expect("Failed to switch back to default branch");

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
    let default_branch = repo.default_branch();

    let branch = get_repo_branch(&repo.repo_path).expect("get_repo_branch should succeed");

    assert_eq!(branch.current_branch, Some(default_branch.to_string()));
    assert_eq!(branch.display_ref, default_branch);
    assert!(!branch.is_detached);
    assert_eq!(branch.default_branch, default_branch);

    TestRepo::run_git(&repo.repo_path, &["checkout", "-b", "feature-x"])
        .expect("Failed to create branch");
    let branch = get_repo_branch(&repo.repo_path).expect("get_repo_branch should succeed");
    assert_eq!(branch.current_branch, Some("feature-x".to_string()));
    assert_eq!(branch.display_ref, "feature-x");
    assert!(!branch.is_detached);
    assert_eq!(branch.default_branch, default_branch);
}

#[test]
fn test_get_repo_branch_reports_detached_head_with_short_hash_display_ref() {
    let repo = TestRepo::new().expect("Failed to create test repo");
    repo.commit_file("detached.txt", "detached", "detached commit")
        .expect("Failed to create second commit");
    let first_commit =
        TestRepo::run_git(&repo.repo_path, &["rev-parse", "HEAD~1"]).expect("resolve HEAD~1");
    let first_commit = first_commit.trim().to_string();
    TestRepo::run_git(&repo.repo_path, &["checkout", &first_commit])
        .expect("checkout detached commit");

    let branch = get_repo_branch(&repo.repo_path).expect("get_repo_branch should succeed");
    assert!(branch.is_detached);
    assert_eq!(branch.current_branch, None);
    assert_eq!(branch.display_ref.len(), 12);
    assert!(
        branch.display_ref.chars().all(|c| c.is_ascii_hexdigit()),
        "display_ref should be a short hex hash, got {}",
        branch.display_ref
    );
    assert!(!branch.display_ref.is_empty());
}

#[test]
fn test_check_branch_exists_local_and_remote_flags() {
    let local_only = TestRepo::new().expect("Failed to create local-only repo");
    let local_default_branch = local_only.default_branch();
    let local_main = treq_lib::jj::check_branch_exists(&local_only.repo_path, local_default_branch)
        .expect("check_branch_exists should succeed");
    assert!(
        local_main.local_exists,
        "{local_default_branch} should exist locally"
    );
    assert!(
        !local_main.remote_exists,
        "{local_default_branch} should not exist on remote in local-only repo"
    );

    let with_remote = TestRepo::with_remote().expect("Failed to create repo with remote");
    let remote_default_branch = with_remote.default_branch();
    let remote_main =
        treq_lib::jj::check_branch_exists(&with_remote.repo_path, remote_default_branch)
            .expect("check_branch_exists should succeed");
    assert!(
        remote_main.local_exists,
        "{remote_default_branch} should exist locally"
    );
    assert!(
        remote_main.remote_exists,
        "{remote_default_branch} should exist on origin"
    );
    assert_eq!(remote_main.remote_name.as_deref(), Some("origin"));
    let expected_remote_ref = format!("origin/{remote_default_branch}");
    assert_eq!(
        remote_main.remote_ref.as_deref(),
        Some(expected_remote_ref.as_str())
    );
}

#[test]
fn test_get_default_branch_prefers_origin_head() {
    let repo = TestRepo::with_remote().expect("Failed to create test repo with remote");
    let default_branch =
        treq_lib::jj::get_default_branch(&repo.repo_path).expect("default branch should resolve");
    assert_eq!(default_branch, repo.default_branch());
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
fn test_repo_status_no_remote_has_no_fetch_error() {
    // Repo without remote — fetch is a no-op, status should have no fetch_error
    let repo = TestRepo::new().expect("Failed to create test repo");

    let status = repo_status(&repo.repo_path)
        .expect("repo_status should succeed even when there is no remote");

    assert!(
        status.fetch_error.is_none(),
        "no remote configured should not produce a fetch_error"
    );
}

#[test]
fn test_jj_git_fetch_no_remote_is_noop() {
    let repo = TestRepo::new().expect("Failed to create test repo");
    let result = treq_lib::jj::jj_git_fetch(&repo.repo_path);
    assert!(
        result.is_ok(),
        "fetch with no remote should be a no-op, got: {:?}",
        result
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
    TestRepo::run_git(&repo.repo_path, &["checkout", repo.default_branch()])
        .expect("Failed to return to default branch");

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

    let result = switch_repo_branch(&repo.repo_path, repo.default_branch());
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
    let default_branch = repo.default_branch();

    let before = JjVerifier::get_bookmark_commit_id(&repo.repo_path, default_branch)
        .expect("query bookmark")
        .expect("default branch bookmark should exist after init");

    repo.create_file("home_repo_commit.txt", "content\n")
        .expect("Failed to write file");

    let msg = commit_repo(&repo.repo_path, "core commit_repo message")
        .expect("commit_repo should succeed");
    assert!(
        msg.contains(default_branch) || msg.contains("Committed"),
        "unexpected success message: {}",
        msg
    );

    let after = JjVerifier::get_bookmark_commit_id(&repo.repo_path, default_branch)
        .expect("query bookmark")
        .expect("default branch bookmark should still exist");

    assert_ne!(
        before, after,
        "default branch bookmark should advance after commit_repo"
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

    // git head should be still on default branch
    let git_head_after = TestRepo::run_git(&repo.repo_path, &["rev-parse", "--abbrev-ref", "HEAD"])
        .expect("get git head after commit");
    assert_eq!(git_head_after.trim(), default_branch);

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
    let default_branch = repo.default_branch();

    treq_lib::core::create_workspace(
        &repo.repo_path,
        "feature-x",
        Some("feature-x".to_string()),
        None,
        None,
        None,
    )
    .expect("Failed to create workspace");
    let before = JjVerifier::get_bookmark_commit_id(&repo.repo_path, default_branch)
        .expect("query bookmark")
        .expect("default branch bookmark should exist after init");

    repo.create_file("home_repo_commit.txt", "content\n")
        .expect("Failed to write file");

    let msg = commit_repo(&repo.repo_path, "core commit_repo message")
        .expect("commit_repo should succeed");
    assert!(
        msg.contains(default_branch) || msg.contains("Committed"),
        "unexpected success message: {}",
        msg
    );

    let after = JjVerifier::get_bookmark_commit_id(&repo.repo_path, default_branch)
        .expect("query bookmark")
        .expect("default branch bookmark should still exist");

    assert_ne!(
        before, after,
        "default branch bookmark should advance after commit_repo"
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
