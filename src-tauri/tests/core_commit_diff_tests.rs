mod e2e_test_helpers;

use e2e_test_helpers::TestRepo;
use std::fs;

// =============================================================================
// Test: jj_get_commit_diff returns diff for a single commit with added files
// =============================================================================

#[test]
fn test_commit_diff_added_files() {
    let repo = TestRepo::new().expect("Failed to create test repo");

    let workspace = treq_lib::core::create_workspace(
        &repo.repo_path,
        "feat/commit-diff-add",
        Some("commit diff add test".to_string()),
        None,
        None,
    )
    .expect("Failed to create workspace");

    let workspace_path = repo.workspaces_dir().join(&workspace.workspace_path);
    let workspace_path_str = workspace_path.to_str().unwrap();

    // Create files and commit
    fs::write(workspace_path.join("hello.txt"), "hello world\n")
        .expect("Failed to write file");
    fs::write(workspace_path.join("foo.txt"), "foo\nbar\nbaz\n")
        .expect("Failed to write file");
    treq_lib::jj::jj_commit(workspace_path_str, "Add two files")
        .expect("Failed to commit");

    // Get the commit's change_id from the log
    let log = treq_lib::jj::jj_get_log(workspace_path_str, "main", Some(false))
        .expect("Failed to get log");
    let committed: Vec<_> = log.commits.iter().filter(|c| !c.is_working_copy).collect();
    assert_eq!(committed.len(), 1);
    let change_id = &committed[0].change_id;

    // Call jj_get_commit_diff
    let diff = treq_lib::jj::jj_get_commit_diff(workspace_path_str, change_id, "git")
        .expect("Failed to get commit diff");

    // Should have 2 files in the summary
    assert_eq!(
        diff.files.len(),
        2,
        "Should have 2 changed files, got {}",
        diff.files.len()
    );

    // All files should be Added
    for file in &diff.files {
        assert_eq!(
            file.status, "A",
            "File {} should have status 'A', got '{}'",
            file.path, file.status
        );
    }

    // Should have hunks for both files
    assert_eq!(
        diff.hunks_by_file.len(),
        2,
        "Should have hunks for 2 files, got {}",
        diff.hunks_by_file.len()
    );

    // Each file's hunks should have content
    for file_diff in &diff.hunks_by_file {
        assert!(
            !file_diff.hunks.is_empty(),
            "File {} should have at least one hunk",
            file_diff.path
        );
    }
}

// =============================================================================
// Test: jj_get_commit_diff returns diff for a commit with modifications
// =============================================================================

#[test]
fn test_commit_diff_modified_files() {
    let repo = TestRepo::new().expect("Failed to create test repo");

    let workspace = treq_lib::core::create_workspace(
        &repo.repo_path,
        "feat/commit-diff-mod",
        Some("commit diff mod test".to_string()),
        None,
        None,
    )
    .expect("Failed to create workspace");

    let workspace_path = repo.workspaces_dir().join(&workspace.workspace_path);
    let workspace_path_str = workspace_path.to_str().unwrap();

    // First commit: create a file
    fs::write(workspace_path.join("data.txt"), "line 1\nline 2\nline 3\n")
        .expect("Failed to write file");
    treq_lib::jj::jj_commit(workspace_path_str, "Create data file")
        .expect("Failed to commit");

    // Second commit: modify the file
    fs::write(workspace_path.join("data.txt"), "line 1\nchanged line 2\nline 3\nnew line 4\n")
        .expect("Failed to write file");
    treq_lib::jj::jj_commit(workspace_path_str, "Modify data file")
        .expect("Failed to commit");

    // Get commits
    let log = treq_lib::jj::jj_get_log(workspace_path_str, "main", Some(false))
        .expect("Failed to get log");
    let committed: Vec<_> = log.commits.iter().filter(|c| !c.is_working_copy).collect();
    assert_eq!(committed.len(), 2);

    // Find the modification commit (most recent non-WC commit)
    let mod_commit = committed.iter().find(|c| c.description == "Modify data file")
        .expect("Should find modification commit");

    let diff = treq_lib::jj::jj_get_commit_diff(workspace_path_str, &mod_commit.change_id, "git")
        .expect("Failed to get commit diff");

    // Should have 1 modified file
    assert_eq!(diff.files.len(), 1);
    assert_eq!(diff.files[0].status, "M");
    assert_eq!(diff.files[0].path, "data.txt");

    // Should have hunks
    assert_eq!(diff.hunks_by_file.len(), 1);
    assert!(!diff.hunks_by_file[0].hunks.is_empty());
}

// =============================================================================
// Test: jj_get_commit_diff returns diff for a commit with deletions
// =============================================================================

#[test]
fn test_commit_diff_deleted_files() {
    let repo = TestRepo::new().expect("Failed to create test repo");

    let workspace = treq_lib::core::create_workspace(
        &repo.repo_path,
        "feat/commit-diff-del",
        Some("commit diff del test".to_string()),
        None,
        None,
    )
    .expect("Failed to create workspace");

    let workspace_path = repo.workspaces_dir().join(&workspace.workspace_path);
    let workspace_path_str = workspace_path.to_str().unwrap();

    // First commit: create a file
    fs::write(workspace_path.join("temp.txt"), "temporary content\n")
        .expect("Failed to write file");
    treq_lib::jj::jj_commit(workspace_path_str, "Add temp file")
        .expect("Failed to commit");

    // Second commit: delete the file
    fs::remove_file(workspace_path.join("temp.txt"))
        .expect("Failed to delete file");
    treq_lib::jj::jj_commit(workspace_path_str, "Delete temp file")
        .expect("Failed to commit");

    // Get commits
    let log = treq_lib::jj::jj_get_log(workspace_path_str, "main", Some(false))
        .expect("Failed to get log");
    let committed: Vec<_> = log.commits.iter().filter(|c| !c.is_working_copy).collect();

    let del_commit = committed.iter().find(|c| c.description == "Delete temp file")
        .expect("Should find deletion commit");

    let diff = treq_lib::jj::jj_get_commit_diff(workspace_path_str, &del_commit.change_id, "git")
        .expect("Failed to get commit diff");

    // Should have 1 deleted file
    assert_eq!(diff.files.len(), 1);
    assert_eq!(diff.files[0].status, "D");
    assert_eq!(diff.files[0].path, "temp.txt");

    // Should have hunks showing deletion
    assert_eq!(diff.hunks_by_file.len(), 1);
    assert!(!diff.hunks_by_file[0].hunks.is_empty());
}

// =============================================================================
// Test: jj_get_commit_diff rejects invalid change_id
// =============================================================================

#[test]
fn test_commit_diff_invalid_change_id() {
    let repo = TestRepo::new().expect("Failed to create test repo");

    let workspace = treq_lib::core::create_workspace(
        &repo.repo_path,
        "feat/commit-diff-invalid",
        Some("commit diff invalid test".to_string()),
        None,
        None,
    )
    .expect("Failed to create workspace");

    let workspace_path = repo.workspaces_dir().join(&workspace.workspace_path);
    let workspace_path_str = workspace_path.to_str().unwrap();

    // Try with a change_id starting with '-' (injection attempt)
    let result = treq_lib::jj::jj_get_commit_diff(workspace_path_str, "-r malicious", "git");
    assert!(result.is_err(), "Should reject change_id starting with '-'");

    // Try with empty change_id
    let result = treq_lib::jj::jj_get_commit_diff(workspace_path_str, "", "git");
    assert!(result.is_err(), "Should reject empty change_id");
}
