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
        None,
    )
    .expect("Failed to create workspace");

    let workspace_path = repo.workspaces_dir().join(&workspace.workspace_path);
    let workspace_path_str = workspace_path.to_str().unwrap();

    // Create multiple files to trigger multiline diff.stat() output
    // (diff.stat() shows per-file stats + a summary line)
    fs::write(
        workspace_path.join("file_a.txt"),
        "line 1\nline 2\nline 3\n",
    )
    .expect("Failed to write file_a");
    fs::write(
        workspace_path.join("file_b.txt"),
        "alpha\nbeta\ngamma\ndelta\nepsilon\n",
    )
    .expect("Failed to write file_b");

    treq_lib::jj::jj_commit(workspace_path_str, "Add two files").expect("Failed to commit");

    // Now call list_commits — this should correctly parse the multiline diff.stat() output
    let result =
        treq_lib::core::list_commits(&repo.repo_path, Some(workspace.id), false, None, None)
            .expect("Failed to list commits");

    // Filter out working copy commit to get only the committed change
    let committed: Vec<_> = result
        .commits
        .iter()
        .filter(|c| !c.is_working_copy)
        .collect();

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
        None,
    )
    .expect("Failed to create workspace");

    let workspace_path = repo.workspaces_dir().join(&workspace.workspace_path);
    let workspace_path_str = workspace_path.to_str().unwrap();

    // First commit: create files
    fs::write(
        workspace_path.join("modify_me.txt"),
        "original line 1\noriginal line 2\noriginal line 3\n",
    )
    .expect("Failed to write file");
    fs::write(workspace_path.join("another.txt"), "content\n")
        .expect("Failed to write another file");
    treq_lib::jj::jj_commit(workspace_path_str, "Initial files").expect("Failed to commit");

    // Second commit: modify and delete lines across multiple files
    fs::write(
        workspace_path.join("modify_me.txt"),
        "changed line 1\noriginal line 2\nnew line 3\nnew line 4\n",
    )
    .expect("Failed to modify file");
    fs::remove_file(workspace_path.join("another.txt")).expect("Failed to delete file");
    treq_lib::jj::jj_commit(workspace_path_str, "Modify and delete").expect("Failed to commit");

    let result =
        treq_lib::core::list_commits(&repo.repo_path, Some(workspace.id), false, None, None)
            .expect("Failed to list commits");

    let committed: Vec<_> = result
        .commits
        .iter()
        .filter(|c| !c.is_working_copy)
        .collect();

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
        None,
    )
    .expect("Failed to create workspace");

    let workspace_path = repo.workspaces_dir().join(&workspace.workspace_path);
    let workspace_path_str = workspace_path.to_str().unwrap();

    // Create files and commit
    fs::write(workspace_path.join("hello.txt"), "hello world\n").expect("Failed to write file");
    fs::write(workspace_path.join("foo.txt"), "foo\nbar\nbaz\n").expect("Failed to write file");
    treq_lib::jj::jj_commit(workspace_path_str, "Add two files").expect("Failed to commit");

    // Get the commit's change_id from the log
    let log = treq_lib::core::list_commits(&repo.repo_path, Some(workspace.id), false, None, None)
        .expect("Failed to list commits");
    let committed: Vec<_> = log.commits.iter().filter(|c| !c.is_working_copy).collect();
    assert_eq!(committed.len(), 1);
    let change_id = &committed[0].change_id;

    // Call get_commit_diff
    let diff =
        treq_lib::core::get_commit_diff(&repo.repo_path, Some(workspace.id), change_id, "git")
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
        None,
    )
    .expect("Failed to create workspace");

    let workspace_path = repo.workspaces_dir().join(&workspace.workspace_path);

    // First commit: create a file
    fs::write(workspace_path.join("data.txt"), "line 1\nline 2\nline 3\n")
        .expect("Failed to write file");
    treq_lib::core::create_commit(&repo.repo_path, Some(workspace.id), "Create data file")
        .expect("Failed to commit");

    // Second commit: modify the file
    fs::write(
        workspace_path.join("data.txt"),
        "line 1\nchanged line 2\nline 3\nnew line 4\n",
    )
    .expect("Failed to write file");
    treq_lib::core::create_commit(&repo.repo_path, Some(workspace.id), "Modify data file")
        .expect("Failed to commit");

    // Get commits
    let log = treq_lib::core::list_commits(&repo.repo_path, Some(workspace.id), false, None, None)
        .expect("Failed to list commits");
    let committed: Vec<_> = log.commits.iter().filter(|c| !c.is_working_copy).collect();
    assert_eq!(committed.len(), 2);

    // Find the modification commit (most recent non-WC commit)
    let mod_commit = committed
        .iter()
        .find(|c| c.description == "Modify data file")
        .expect("Should find modification commit");

    let diff = treq_lib::core::get_commit_diff(
        &repo.repo_path,
        Some(workspace.id),
        &mod_commit.change_id,
        "git",
    )
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
        None,
    )
    .expect("Failed to create workspace");

    let workspace_path = repo.workspaces_dir().join(&workspace.workspace_path);
    let workspace_path_str = workspace_path.to_str().unwrap();

    // First commit: create a file
    fs::write(workspace_path.join("temp.txt"), "temporary content\n")
        .expect("Failed to write file");
    treq_lib::jj::jj_commit(workspace_path_str, "Add temp file").expect("Failed to commit");

    // Second commit: delete the file
    fs::remove_file(workspace_path.join("temp.txt")).expect("Failed to delete file");
    treq_lib::jj::jj_commit(workspace_path_str, "Delete temp file").expect("Failed to commit");

    // Get commits
    let log = treq_lib::core::list_commits(&repo.repo_path, Some(workspace.id), false, None, None)
        .expect("Failed to list commits");
    let committed: Vec<_> = log.commits.iter().filter(|c| !c.is_working_copy).collect();

    let del_commit = committed
        .iter()
        .find(|c| c.description == "Delete temp file")
        .expect("Should find deletion commit");

    let diff = treq_lib::core::get_commit_diff(
        &repo.repo_path,
        Some(workspace.id),
        &del_commit.change_id,
        "git",
    )
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
        None,
    )
    .expect("Failed to create workspace");

    // Try with a change_id starting with '-' (injection attempt)
    let result =
        treq_lib::core::get_commit_diff(&repo.repo_path, Some(workspace.id), "-r malicious", "git");
    assert!(result.is_err(), "Should reject change_id starting with '-'");

    // Try with empty change_id
    let result = treq_lib::core::get_commit_diff(&repo.repo_path, Some(workspace.id), "", "git");
    assert!(result.is_err(), "Should reject empty change_id");
}

// =============================================================================
// Test: list_commits returns commits for a workspace
// =============================================================================

#[test]
fn test_list_commits() {
    let repo = TestRepo::new().expect("Failed to create test repo");

    let workspace = treq_lib::core::create_workspace(
        &repo.repo_path,
        "feat/list-commits",
        Some("list commits test".to_string()),
        None,
        None,
        None,
    )
    .expect("Failed to create workspace");

    let workspace_path = repo.workspaces_dir().join(&workspace.workspace_path);

    // First commit
    fs::write(workspace_path.join("hello.txt"), "hello\n").expect("Failed to write file");
    treq_lib::core::create_commit(&repo.repo_path, Some(workspace.id), "Add hello")
        .expect("Failed to commit");

    // Second commit
    fs::write(workspace_path.join("world.txt"), "world\n").expect("Failed to write file");
    treq_lib::core::create_commit(&repo.repo_path, Some(workspace.id), "Add world")
        .expect("Failed to commit");

    let result =
        treq_lib::core::list_commits(&repo.repo_path, Some(workspace.id), false, None, None)
            .expect("Failed to list commits");

    // Should have both committed changes
    let committed: Vec<_> = result
        .commits
        .iter()
        .filter(|c| !c.is_working_copy)
        .collect();
    assert_eq!(
        committed.len(),
        2,
        "Should have 2 non-working-copy commits, got {}",
        committed.len()
    );

    // Verify commit descriptions are present
    let descriptions: Vec<&str> = committed.iter().map(|c| c.description.as_str()).collect();
    assert!(
        descriptions.contains(&"Add hello"),
        "Should contain 'Add hello' commit"
    );
    assert!(
        descriptions.contains(&"Add world"),
        "Should contain 'Add world' commit"
    );

    // Should have exactly 1 working copy commit
    let wc: Vec<_> = result
        .commits
        .iter()
        .filter(|c| c.is_working_copy)
        .collect();
    assert_eq!(wc.len(), 1, "Should have 1 working copy commit");
}

// =============================================================================
// Test: list_commits excludes base branch commits made before workspace creation
// =============================================================================

#[test]
fn test_list_commits_excludes_base_branch_commits() {
    let repo = TestRepo::new().expect("Failed to create test repo");

    // Add commits to main (the base branch) BEFORE creating the workspace.
    // Use git directly since main is the git branch.
    repo.commit_file("base_file_1.txt", "base content 1\n", "Base commit 1")
        .expect("Failed to create base commit 1");
    repo.commit_file("base_file_2.txt", "base content 2\n", "Base commit 2")
        .expect("Failed to create base commit 2");

    // Now create a workspace — it branches off current main
    let workspace = treq_lib::core::create_workspace(
        &repo.repo_path,
        "feat/after-base",
        Some("test base exclusion".to_string()),
        None,
        None,
        None,
    )
    .expect("Failed to create workspace");

    let workspace_path = repo.workspaces_dir().join(&workspace.workspace_path);

    // Make a commit on the workspace branch
    fs::write(workspace_path.join("branch_file.txt"), "branch content\n")
        .expect("Failed to write file");
    treq_lib::core::create_commit(&repo.repo_path, Some(workspace.id), "Branch commit")
        .expect("Failed to commit");

    let result =
        treq_lib::core::list_commits(&repo.repo_path, Some(workspace.id), false, None, None)
            .expect("Failed to list commits");

    let committed: Vec<_> = result
        .commits
        .iter()
        .filter(|c| !c.is_working_copy)
        .collect();

    // Should only include the commit made AFTER the branch was created
    assert_eq!(
        committed.len(),
        1,
        "Should have only 1 commit (branch commit), not base branch commits. Got {}: {:?}",
        committed.len(),
        committed.iter().map(|c| &c.description).collect::<Vec<_>>()
    );
    assert_eq!(committed[0].description, "Branch commit");

    // Verify base branch commits are NOT included
    let descriptions: Vec<&str> = committed.iter().map(|c| c.description.as_str()).collect();
    assert!(
        !descriptions.contains(&"Base commit 1"),
        "Should not contain base branch commit 1"
    );
    assert!(
        !descriptions.contains(&"Base commit 2"),
        "Should not contain base branch commit 2"
    );
}

#[test]
fn test_list_commits_invalid_workspace() {
    let repo = TestRepo::new().expect("Failed to create test repo");

    let result = treq_lib::core::list_commits(&repo.repo_path, Some(99999), false, None, None);
    assert!(
        result.is_err(),
        "Should return error for non-existent workspace"
    );
}

// =============================================================================
// Test: list_commits returns diff stats for working copy changes
// =============================================================================

#[test]
fn test_list_commits_working_copy_diff_stats() {
    let repo = TestRepo::new().expect("Failed to create test repo");

    let workspace = treq_lib::core::create_workspace(
        &repo.repo_path,
        "feat/wc-diff-stats",
        Some("working copy diff stats test".to_string()),
        None,
        None,
        None,
    )
    .expect("Failed to create workspace");

    let workspace_path = repo.workspaces_dir().join(&workspace.workspace_path);

    // Write a file but don't commit — it stays in the working copy
    fs::write(
        workspace_path.join("new_file.txt"),
        "line 1\nline 2\nline 3\nline 4\nline 5\n",
    )
    .expect("Failed to write file");

    let result =
        treq_lib::core::list_commits(&repo.repo_path, Some(workspace.id), false, None, None)
            .expect("Failed to list commits");

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
// Test: list_commits with None workspace_id returns home repo commits
// =============================================================================

#[test]
fn test_list_commits_home_repo() {
    let repo = TestRepo::new().expect("Failed to create test repo");

    // Create a file in the home repo to ensure there's a change
    fs::write(
        std::path::Path::new(&repo.repo_path).join("home_file.txt"),
        "home content\n",
    )
    .expect("Failed to write file");

    let result = treq_lib::core::list_commits(&repo.repo_path, None, false, None, None)
        .expect("Failed to list commits for home repo");

    // Should have at least 1 commit (the working copy or initial commits)
    assert!(
        !result.commits.is_empty(),
        "Should have at least 1 commit for home repo"
    );
}

#[test]
fn test_list_commits_home_repo_with_committed_changes() {
    let repo = TestRepo::new().expect("Failed to create test repo");

    // Make a git commit on the home repo
    repo.commit_file(
        "committed_file.txt",
        "committed content\n",
        "Home repo commit",
    )
    .expect("Failed to create commit");

    let result = treq_lib::core::list_commits(&repo.repo_path, None, false, None, None)
        .expect("Failed to list commits for home repo");

    // Should include the committed change
    let committed: Vec<_> = result
        .commits
        .iter()
        .filter(|c| !c.is_working_copy)
        .collect();
    assert!(
        !committed.is_empty(),
        "Should have at least 1 committed change in home repo"
    );

    let descriptions: Vec<&str> = committed.iter().map(|c| c.description.as_str()).collect();
    assert!(
        descriptions.contains(&"Home repo commit"),
        "Should contain 'Home repo commit', got: {:?}",
        descriptions
    );
}

// =============================================================================
// Test: list_commits with include_target_branch_history returns target branch commits
// =============================================================================

#[test]
fn test_list_commits_with_target_branch_history() {
    let repo = TestRepo::new().expect("Failed to create test repo");

    // Add commits to main (the base branch) BEFORE creating the workspace.
    repo.commit_file("base_file_1.txt", "base content 1\n", "Base commit 1")
        .expect("Failed to create base commit 1");
    repo.commit_file("base_file_2.txt", "base content 2\n", "Base commit 2")
        .expect("Failed to create base commit 2");

    // Create a workspace branching off current main
    let workspace = treq_lib::core::create_workspace(
        &repo.repo_path,
        "feat/target-history",
        Some("target history test".to_string()),
        None,
        None,
        None,
    )
    .expect("Failed to create workspace");

    let workspace_path = repo.workspaces_dir().join(&workspace.workspace_path);

    // Make a commit on the workspace branch
    fs::write(workspace_path.join("branch_file.txt"), "branch content\n")
        .expect("Failed to write file");
    treq_lib::core::create_commit(&repo.repo_path, Some(workspace.id), "Branch commit")
        .expect("Failed to commit");

    // Call with include_target_branch_history=true
    let result =
        treq_lib::core::list_commits(&repo.repo_path, Some(workspace.id), true, None, None)
            .expect("Failed to list commits");

    // Active commits should only include the branch commit
    let committed: Vec<_> = result
        .commits
        .iter()
        .filter(|c| !c.is_working_copy)
        .collect();
    assert_eq!(
        committed.len(),
        1,
        "Should have only 1 active commit, got {}",
        committed.len()
    );
    assert_eq!(committed[0].description, "Branch commit");

    // Target branch commits should include the base commits
    assert!(
        !result.target_branch_commits.is_empty(),
        "target_branch_commits should not be empty"
    );
    let target_descriptions: Vec<&str> = result
        .target_branch_commits
        .iter()
        .map(|c| c.description.as_str())
        .collect();
    assert!(
        target_descriptions.contains(&"Base commit 1"),
        "target_branch_commits should contain 'Base commit 1', got: {:?}",
        target_descriptions
    );
    assert!(
        target_descriptions.contains(&"Base commit 2"),
        "target_branch_commits should contain 'Base commit 2', got: {:?}",
        target_descriptions
    );
}

#[test]
fn test_list_commits_target_branch_history_limits_to_10() {
    let repo = TestRepo::new().expect("Failed to create test repo");

    // Create >10 commits on main before workspace
    for i in 1..=15 {
        repo.commit_file(
            &format!("file_{}.txt", i),
            &format!("content {}\n", i),
            &format!("Main commit {}", i),
        )
        .expect(&format!("Failed to create commit {}", i));
    }

    let workspace = treq_lib::core::create_workspace(
        &repo.repo_path,
        "feat/limit-test",
        Some("limit test".to_string()),
        None,
        None,
        None,
    )
    .expect("Failed to create workspace");

    let result =
        treq_lib::core::list_commits(&repo.repo_path, Some(workspace.id), true, None, None)
            .expect("Failed to list commits");

    assert!(
        result.target_branch_commits.len() <= 10,
        "target_branch_commits should be limited to 10, got {}",
        result.target_branch_commits.len()
    );
}

#[test]
fn test_list_commits_without_target_branch_history() {
    let repo = TestRepo::new().expect("Failed to create test repo");

    repo.commit_file("base.txt", "base\n", "Base commit")
        .expect("Failed to create base commit");

    let workspace = treq_lib::core::create_workspace(
        &repo.repo_path,
        "feat/no-history",
        Some("no history test".to_string()),
        None,
        None,
        None,
    )
    .expect("Failed to create workspace");

    // Call with include_target_branch_history=false (backward compatible)
    let result =
        treq_lib::core::list_commits(&repo.repo_path, Some(workspace.id), false, None, None)
            .expect("Failed to list commits");

    assert!(
        result.target_branch_commits.is_empty(),
        "target_branch_commits should be empty when include_target_branch_history=false, got {}",
        result.target_branch_commits.len()
    );
}
