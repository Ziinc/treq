mod e2e_test_helpers;

use e2e_test_helpers::{JjVerifier, TestRepo};
use std::fs;

// =============================================================================
// Test: jj_get_log returns correct diff stats for multiline diff.stat() output
// =============================================================================

#[test]
fn test_jj_get_log_diff_stats_with_multiline_output() {
    let repo = TestRepo::new().expect("Failed to create test repo");

    // Create a workspace with a committed change that has insertions and deletions
    let workspace = treq_lib::core::create_workspace(
        &repo.repo_path,
        "feat/diff-stats",
        Some("diff stats test".to_string()),
        None,
        None,
    )
    .expect("Failed to create workspace");

    let workspace_path = repo.workspaces_dir().join(&workspace.workspace_path);
    let workspace_path_str = workspace_path.to_str().unwrap();

    // Create multiple files to trigger multiline diff.stat() output
    // (diff.stat() shows per-file stats + a summary line)
    fs::write(workspace_path.join("file_a.txt"), "line 1\nline 2\nline 3\n")
        .expect("Failed to write file_a");
    fs::write(workspace_path.join("file_b.txt"), "alpha\nbeta\ngamma\ndelta\nepsilon\n")
        .expect("Failed to write file_b");

    treq_lib::jj::jj_commit(workspace_path_str, "Add two files")
        .expect("Failed to commit");

    // Now call jj_get_log — this should correctly parse the multiline diff.stat() output
    let result = treq_lib::jj::jj_get_log(workspace_path_str, "main", Some(false))
        .expect("Failed to get log");

    // Filter out working copy commit to get only the committed change
    let committed: Vec<_> = result.commits.iter().filter(|c| !c.is_working_copy).collect();

    assert_eq!(
        committed.len(),
        1,
        "Should have exactly 1 non-working-copy commit, got {}",
        committed.len()
    );

    let commit = &committed[0];
    assert_eq!(commit.description, "Add two files");

    // file_a has 3 lines, file_b has 5 lines => 8 total insertions
    assert_eq!(
        commit.insertions, 8,
        "Should have 8 insertions (3 from file_a + 5 from file_b), got {}",
        commit.insertions
    );
    assert_eq!(
        commit.deletions, 0,
        "Should have 0 deletions, got {}",
        commit.deletions
    );
}

#[test]
fn test_jj_get_log_diff_stats_with_modifications() {
    let repo = TestRepo::new().expect("Failed to create test repo");

    let workspace = treq_lib::core::create_workspace(
        &repo.repo_path,
        "feat/diff-mods",
        Some("diff modifications test".to_string()),
        None,
        None,
    )
    .expect("Failed to create workspace");

    let workspace_path = repo.workspaces_dir().join(&workspace.workspace_path);
    let workspace_path_str = workspace_path.to_str().unwrap();

    // First commit: create files
    fs::write(workspace_path.join("modify_me.txt"), "original line 1\noriginal line 2\noriginal line 3\n")
        .expect("Failed to write file");
    fs::write(workspace_path.join("another.txt"), "content\n")
        .expect("Failed to write another file");
    treq_lib::jj::jj_commit(workspace_path_str, "Initial files")
        .expect("Failed to commit");

    // Second commit: modify and delete lines across multiple files
    fs::write(workspace_path.join("modify_me.txt"), "changed line 1\noriginal line 2\nnew line 3\nnew line 4\n")
        .expect("Failed to modify file");
    fs::remove_file(workspace_path.join("another.txt"))
        .expect("Failed to delete file");
    treq_lib::jj::jj_commit(workspace_path_str, "Modify and delete")
        .expect("Failed to commit");

    let result = treq_lib::jj::jj_get_log(workspace_path_str, "main", Some(false))
        .expect("Failed to get log");

    let committed: Vec<_> = result.commits.iter().filter(|c| !c.is_working_copy).collect();

    assert_eq!(
        committed.len(),
        2,
        "Should have 2 non-working-copy commits, got {}",
        committed.len()
    );

    // Sum up total insertions and deletions across all commits
    let total_insertions: u32 = committed.iter().map(|c| c.insertions).sum();
    let total_deletions: u32 = committed.iter().map(|c| c.deletions).sum();

    assert!(
        total_insertions > 0,
        "Total insertions should be > 0, got {}",
        total_insertions
    );
    assert!(
        total_deletions > 0,
        "Total deletions should be > 0 (modified lines + deleted file), got {}",
        total_deletions
    );
}

#[test]
fn test_jj_get_log_diff_stats_for_working_copy() {
    let repo = TestRepo::new().expect("Failed to create test repo");

    // Make changes in the home repo working copy (no workspace)
    fs::write(
        std::path::Path::new(&repo.repo_path).join("new_file.txt"),
        "line 1\nline 2\nline 3\nline 4\nline 5\n",
    )
    .expect("Failed to write file");

    // Call jj_get_log for the home repo with isHomeRepo=false
    // to use the workspace-style revset (main..@)
    let result = treq_lib::jj::jj_get_log(&repo.repo_path, "main", Some(false))
        .expect("Failed to get log");

    // Should include the working copy commit with diff stats
    assert!(
        !result.commits.is_empty(),
        "Should have at least 1 commit (the working copy)"
    );

    let wc_commit = result.commits.iter().find(|c| c.is_working_copy);
    assert!(
        wc_commit.is_some(),
        "Should have a working copy commit in the results"
    );

    let wc = wc_commit.unwrap();
    assert_eq!(
        wc.insertions, 5,
        "Working copy should have 5 insertions, got {}",
        wc.insertions
    );
    assert_eq!(
        wc.deletions, 0,
        "Working copy should have 0 deletions, got {}",
        wc.deletions
    );
}

// =============================================================================
// Test: move_commit_to_new_workspace
// =============================================================================

#[test]
fn test_move_commit_to_new_workspace() {
    let repo = TestRepo::new().expect("Failed to create test repo");

    // Create source workspace
    let source = treq_lib::core::create_workspace(
        &repo.repo_path,
        "feat/source",
        Some("source workspace".to_string()),
        None,
        None,
    )
    .expect("Failed to create source workspace");

    let source_path = repo.workspaces_dir().join(&source.workspace_path);
    let source_path_str = source_path.to_str().unwrap();

    // Add a file to the source workspace and commit it
    fs::write(source_path.join("moved.txt"), "moved content").expect("Failed to write file");
    treq_lib::jj::jj_commit(source_path_str, "Commit to move").expect("Failed to commit");

    // Get the change_id of the committed change
    let commits_ahead = treq_lib::jj::jj_get_commits_ahead(source_path_str, "main")
        .expect("Failed to get commits ahead");
    assert!(
        !commits_ahead.commits.is_empty(),
        "Should have at least 1 commit ahead of main"
    );
    let change_id = commits_ahead.commits.last().unwrap().change_id.clone();

    // Move commit to new workspace
    let new_workspace = treq_lib::core::move_commit_to_new_workspace(
        &repo.repo_path,
        source.id,
        &change_id,
        "feat/moved",
        Some("moved intent".to_string()),
    )
    .expect("Failed to move commit to new workspace");

    // Verify new workspace was created with correct branch name
    assert_eq!(
        new_workspace.branch_name, "feat/moved",
        "New workspace should have correct branch name"
    );

    // Verify new workspace appears in jj workspace list
    let jj_workspaces =
        JjVerifier::list_workspaces(&repo.repo_path).expect("Failed to list jj workspaces");
    assert!(
        jj_workspaces.contains(&new_workspace.workspace_name),
        "jj workspace list should contain '{}', got: {:?}",
        new_workspace.workspace_name,
        jj_workspaces
    );

    // Verify new workspace has the file from the moved commit
    let new_path = repo.workspaces_dir().join(&new_workspace.workspace_path);
    assert!(
        new_path.join("moved.txt").exists(),
        "moved.txt should exist in new workspace after commit was moved"
    );
}

// =============================================================================
// Test: move_commit_to_existing_workspace
// =============================================================================

#[test]
fn test_move_commit_to_existing_workspace() {
    let repo = TestRepo::new().expect("Failed to create test repo");

    // Create source workspace
    let source = treq_lib::core::create_workspace(
        &repo.repo_path,
        "feat/source",
        Some("source workspace".to_string()),
        None,
        None,
    )
    .expect("Failed to create source workspace");

    let source_path = repo.workspaces_dir().join(&source.workspace_path);
    let source_path_str = source_path.to_str().unwrap();

    // Add a file to the source workspace and commit it
    fs::write(source_path.join("moved.txt"), "moved content").expect("Failed to write file");
    treq_lib::jj::jj_commit(source_path_str, "Commit to move").expect("Failed to commit");

    // Get the change_id of the committed change
    let commits_ahead = treq_lib::jj::jj_get_commits_ahead(source_path_str, "main")
        .expect("Failed to get commits ahead");
    assert!(
        !commits_ahead.commits.is_empty(),
        "Should have at least 1 commit ahead of main"
    );
    let change_id = commits_ahead.commits.last().unwrap().change_id.clone();

    // Create target workspace
    let target = treq_lib::core::create_workspace(
        &repo.repo_path,
        "feat/target",
        Some("target workspace".to_string()),
        None,
        None,
    )
    .expect("Failed to create target workspace");

    let target_path = repo.workspaces_dir().join(&target.workspace_path);

    // Move commit to existing workspace
    treq_lib::core::move_commit_to_existing_workspace(
        &repo.repo_path,
        source.id,
        &change_id,
        target.id,
    )
    .expect("Failed to move commit to existing workspace");

    // Verify target workspace has the file from the moved commit
    assert!(
        target_path.join("moved.txt").exists(),
        "moved.txt should exist in target workspace after commit was moved"
    );
}

#[test]
fn test_abandon_commit() {
    let repo = TestRepo::new().expect("Failed to create test repo");

    // Create workspace
    let workspace = treq_lib::core::create_workspace(
        &repo.repo_path,
        "feat/abandon-test",
        Some("abandon test".to_string()),
        None,
        None,
    )
    .expect("Failed to create workspace");

    let workspace_path = repo.workspaces_dir().join(&workspace.workspace_path);
    let workspace_path_str = workspace_path.to_str().unwrap();

    // Add a file and commit
    fs::write(workspace_path.join("abandon-me.txt"), "content").expect("Failed to write");
    treq_lib::jj::jj_commit(workspace_path_str, "Commit to abandon").expect("Failed to commit");

    // Get the change_id
    let commits_ahead = treq_lib::jj::jj_get_commits_ahead(workspace_path_str, "main")
        .expect("Failed to get commits ahead");
    assert!(
        !commits_ahead.commits.is_empty(),
        "Should have at least 1 commit"
    );
    let change_id = commits_ahead.commits.last().unwrap().change_id.clone();

    // Abandon the commit
    treq_lib::core::abandon_commit(&repo.repo_path, workspace.id, &change_id)
        .expect("Failed to abandon commit");

    // Verify commit is gone
    let commits_after = treq_lib::jj::jj_get_commits_ahead(workspace_path_str, "main")
        .expect("Failed to get commits after abandon");
    assert!(
        commits_after.commits.is_empty(),
        "Commit should be abandoned, but found {} commits",
        commits_after.commits.len()
    );

    // Verify file from abandoned commit is no longer in workspace
    assert!(
        !workspace_path.join("abandon-me.txt").exists(),
        "abandon-me.txt should not exist after commit was abandoned"
    );
}

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
    let diff = treq_lib::core::get_commit_diff(&repo.repo_path, workspace.id, change_id, "git")
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
    treq_lib::core::create_commit(&repo.repo_path, workspace.id, "Create data file")
        .expect("Failed to commit");

    // Second commit: modify the file
    fs::write(workspace_path.join("data.txt"), "line 1\nchanged line 2\nline 3\nnew line 4\n")
        .expect("Failed to write file");
    treq_lib::core::create_commit(&repo.repo_path, workspace.id, "Modify data file")
        .expect("Failed to commit");

    // Get commits
    let log = treq_lib::jj::jj_get_log(workspace_path_str, "main", Some(false))
        .expect("Failed to get log");
    let committed: Vec<_> = log.commits.iter().filter(|c| !c.is_working_copy).collect();
    assert_eq!(committed.len(), 2);

    // Find the modification commit (most recent non-WC commit)
    let mod_commit = committed.iter().find(|c| c.description == "Modify data file")
        .expect("Should find modification commit");

    let diff = treq_lib::core::get_commit_diff(&repo.repo_path, workspace.id, &mod_commit.change_id, "git")
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

    let diff = treq_lib::core::get_commit_diff(&repo.repo_path, workspace.id, &del_commit.change_id, "git")
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

    // Try with a change_id starting with '-' (injection attempt)
    let result = treq_lib::core::get_commit_diff(&repo.repo_path, workspace.id, "-r malicious", "git");
    assert!(result.is_err(), "Should reject change_id starting with '-'");

    // Try with empty change_id
    let result = treq_lib::core::get_commit_diff(&repo.repo_path, workspace.id, "", "git");
    assert!(result.is_err(), "Should reject empty change_id");
}
