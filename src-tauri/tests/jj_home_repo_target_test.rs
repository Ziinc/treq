mod e2e_test_helpers;

use e2e_test_helpers::TestRepo;
use treq_lib::core::list_commits;
use treq_lib::jj::{
    jj_dry_run_home_repo_rebase, jj_get_home_repo_diverged_log, jj_rebase_home_repo_branch,
};

// Helper: create a branch with one commit on top of another
fn create_branch_with_commit(
    repo: &TestRepo,
    branch: &str,
    base: &str,
    filename: &str,
    content: &str,
    message: &str,
) {
    TestRepo::run_git(&repo.repo_path, &["checkout", base]).expect("checkout base");
    TestRepo::run_git(&repo.repo_path, &["checkout", "-b", branch]).expect("create branch");
    repo.commit_file(filename, content, message)
        .expect("commit file");
}

/// When on a non-default branch, jj_get_home_repo_diverged_log should return:
/// - `commits` = commits unique to the current branch
/// - `target_branch_commits` = commits that target is ahead by
/// - `merge_base_id` = Some(...)
#[test]
fn test_diverged_log_splits_branch_and_target_commits() {
    let repo = TestRepo::new().expect("create repo");

    // Add a commit on main so it can be "ahead" later
    repo.commit_file("main_a.txt", "main A", "main commit A")
        .expect("main commit A");

    // Create feature branch from this point
    create_branch_with_commit(
        &repo,
        "feature",
        "main",
        "feat.txt",
        "feature content",
        "feature commit",
    );

    // Go back to main and add another commit (target is now ahead)
    TestRepo::run_git(&repo.repo_path, &["checkout", "main"]).expect("checkout main");
    repo.commit_file("main_b.txt", "main B", "main commit B")
        .expect("main commit B");

    // Back to feature to simulate home repo on feature branch
    TestRepo::run_git(&repo.repo_path, &["checkout", "feature"]).expect("checkout feature");

    let result = jj_get_home_repo_diverged_log(&repo.repo_path, "feature", "main", Some(20))
        .expect("diverged log should succeed");

    // Feature-unique commits should be in `commits`
    assert!(
        !result.commits.is_empty(),
        "should have branch-unique commits"
    );
    assert!(
        result
            .commits
            .iter()
            .any(|c| c.description.contains("feature commit")),
        "feature commit should be in commits"
    );
    assert!(
        result.commits.iter().all(|c| !c.on_target_only),
        "commits should not be marked on_target_only"
    );

    // Main-ahead commits should be in target_branch_commits
    assert!(
        !result.target_branch_commits.is_empty(),
        "should have target-ahead commits"
    );
    assert!(
        result
            .target_branch_commits
            .iter()
            .any(|c| c.description.contains("main commit B")),
        "main commit B should be in target_branch_commits"
    );
    assert!(
        result
            .target_branch_commits
            .iter()
            .all(|c| c.on_target_only),
        "target_branch_commits should all be marked on_target_only"
    );

    // merge_base_id should be populated
    assert!(
        result.merge_base_id.is_some(),
        "merge_base_id should be populated"
    );
}

/// When on the default branch itself, list_commits should return a normal history
/// (not the diverged view — no target_branch_commits and no merge_base_id).
#[test]
fn test_list_commits_on_default_branch_returns_normal_history() {
    let repo = TestRepo::new().expect("create repo");
    repo.commit_file("file.txt", "content", "extra commit")
        .expect("extra commit");

    let result = list_commits(&repo.repo_path, None, false, None, Some(10))
        .expect("list_commits should succeed");

    // On default branch: no target-ahead commits and no merge base
    assert!(
        result.target_branch_commits.is_empty(),
        "on default branch, target_branch_commits should be empty"
    );
    assert!(
        result.merge_base_id.is_none(),
        "on default branch, merge_base_id should be None"
    );
    assert!(
        !result.commits.is_empty(),
        "should have commits on default branch"
    );
}

/// When on a non-default branch, list_commits should return the diverged view.
#[test]
fn test_list_commits_on_feature_branch_returns_diverged_view() {
    let repo = TestRepo::new().expect("create repo");

    // Add commit to main
    repo.commit_file("main_extra.txt", "main extra", "main extra commit")
        .expect("main extra");

    // Create feature branch with a commit
    create_branch_with_commit(
        &repo,
        "my-feature",
        "main",
        "feature_file.txt",
        "feature content",
        "feature work",
    );

    // Advance main beyond the feature branch point
    TestRepo::run_git(&repo.repo_path, &["checkout", "main"]).expect("checkout main");
    repo.commit_file("main_new.txt", "main new", "main new commit")
        .expect("main new commit");

    // Switch to feature branch (simulating home repo on feature branch)
    TestRepo::run_git(&repo.repo_path, &["checkout", "my-feature"])
        .expect("checkout feature branch");

    let result = list_commits(&repo.repo_path, None, false, None, Some(20))
        .expect("list_commits should succeed");

    // Should have the diverged view
    assert!(
        result
            .commits
            .iter()
            .any(|c| c.description.contains("feature work")),
        "feature work should appear in commits"
    );
    assert!(
        result
            .target_branch_commits
            .iter()
            .any(|c| c.description.contains("main new commit")),
        "main new commit should appear in target_branch_commits"
    );
    assert!(
        result.merge_base_id.is_some(),
        "merge_base_id should be set on non-default branch"
    );
}

/// Rebasing a home repo branch onto the default branch should succeed.
#[test]
fn test_rebase_home_repo_branch_onto_main() {
    let repo = TestRepo::new().expect("create repo");

    // Create feature branch
    create_branch_with_commit(
        &repo,
        "rebase-me",
        "main",
        "feature.txt",
        "feature content",
        "feature commit for rebase",
    );

    // Advance main
    TestRepo::run_git(&repo.repo_path, &["checkout", "main"]).expect("checkout main");
    repo.commit_file("main_advance.txt", "advance", "advance main")
        .expect("advance main");

    // Switch to feature
    TestRepo::run_git(&repo.repo_path, &["checkout", "rebase-me"]).expect("checkout rebase-me");

    // Rebase
    let result = jj_rebase_home_repo_branch(&repo.repo_path, "rebase-me", "main")
        .expect("rebase should succeed");
    assert!(result.success, "rebase should succeed: {}", result.message);

    // After rebase, the feature branch should be based on the advanced main
    let log = jj_get_home_repo_diverged_log(&repo.repo_path, "rebase-me", "main", Some(20))
        .expect("diverged log after rebase");
    assert!(
        log.target_branch_commits.is_empty(),
        "after rebase, target should not be ahead"
    );
}

/// Dry-run should detect potential conflicts when both sides modify the same file.
#[test]
fn test_dry_run_detects_conflicting_changes() {
    let repo = TestRepo::new().expect("create repo");

    // Create base file on main
    repo.commit_file("shared.txt", "base content", "base commit")
        .expect("base commit");

    // Create feature branch modifying shared.txt
    create_branch_with_commit(
        &repo,
        "conflict-branch",
        "main",
        "shared.txt",
        "feature modification",
        "feature modifies shared",
    );

    // Advance main with a conflicting change to shared.txt
    TestRepo::run_git(&repo.repo_path, &["checkout", "main"]).expect("checkout main");
    repo.commit_file("shared.txt", "main modification", "main modifies shared")
        .expect("main modification");

    // Switch to conflict branch
    TestRepo::run_git(&repo.repo_path, &["checkout", "conflict-branch"])
        .expect("checkout conflict-branch");

    let dry_run = jj_dry_run_home_repo_rebase(&repo.repo_path, "conflict-branch", "main")
        .expect("dry run should not fail");
    assert!(
        dry_run.would_conflict,
        "dry run should detect conflict: {:?}",
        dry_run.conflicted_files
    );
    assert!(
        !dry_run.conflicted_files.is_empty(),
        "conflicted files should list shared.txt"
    );
}

/// Dry-run should report no conflicts when changes are on disjoint files.
#[test]
fn test_dry_run_no_conflict_with_disjoint_changes() {
    let repo = TestRepo::new().expect("create repo");

    // Create feature branch modifying feature-only file
    create_branch_with_commit(
        &repo,
        "clean-branch",
        "main",
        "feature_only.txt",
        "feature content",
        "feature adds file",
    );

    // Advance main with a different file
    TestRepo::run_git(&repo.repo_path, &["checkout", "main"]).expect("checkout main");
    repo.commit_file("main_only.txt", "main content", "main adds file")
        .expect("main only file");

    // Switch to clean branch
    TestRepo::run_git(&repo.repo_path, &["checkout", "clean-branch"]).expect("checkout clean");

    let dry_run = jj_dry_run_home_repo_rebase(&repo.repo_path, "clean-branch", "main")
        .expect("dry run should not fail");
    assert!(
        !dry_run.would_conflict,
        "dry run should not detect conflict for disjoint changes"
    );
}
