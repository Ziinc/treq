mod e2e_test_helpers;

use e2e_test_helpers::TestRepo;

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
    TestRepo::write_workspace_file(workspace_path_str, "file_a.txt", "line 1\nline 2\nline 3\n")
        .expect("Failed to write file_a");
    TestRepo::write_workspace_file(
        workspace_path_str,
        "file_b.txt",
        "alpha\nbeta\ngamma\ndelta\nepsilon\n",
    )
    .expect("Failed to write file_b");

    treq_lib::core::commit_workspace(&repo.repo_path, workspace.id, "Add two files")
        .expect("Failed to commit");

    // Now call list_commits — this should correctly parse the multiline diff.stat() output
    let result =
        treq_lib::core::list_commits(&repo.repo_path, Some(workspace.id), false, None, None)
            .expect("Failed to list commits");

    // Filter out working copy commit to get only the committed change
    let commit = result
        .commits
        .iter()
        .find(|c| !c.is_working_copy && c.description == "Add two files")
        .expect("Should include 'Add two files' commit");
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
    TestRepo::write_workspace_file(
        workspace_path_str,
        "modify_me.txt",
        "original line 1\noriginal line 2\noriginal line 3\n",
    )
    .expect("Failed to write file");
    TestRepo::write_workspace_file(workspace_path_str, "another.txt", "content\n")
        .expect("Failed to write another file");
    treq_lib::core::commit_workspace(&repo.repo_path, workspace.id, "Initial files")
        .expect("Failed to commit");

    // Second commit: modify and delete lines across multiple files
    TestRepo::write_workspace_file(
        workspace_path_str,
        "modify_me.txt",
        "changed line 1\noriginal line 2\nnew line 3\nnew line 4\n",
    )
    .expect("Failed to modify file");
    TestRepo::remove_file_path(workspace_path.join("another.txt")).expect("Failed to delete file");
    treq_lib::core::commit_workspace(&repo.repo_path, workspace.id, "Modify and delete")
        .expect("Failed to commit");

    let result =
        treq_lib::core::list_commits(&repo.repo_path, Some(workspace.id), false, None, None)
            .expect("Failed to list commits");

    let committed: Vec<_> = result
        .commits
        .iter()
        .filter(|c| {
            !c.is_working_copy
                && (c.description == "Initial files" || c.description == "Modify and delete")
        })
        .collect();

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
    TestRepo::write_workspace_file(source_path_str, "moved.txt", "moved content")
        .expect("Failed to write file");
    treq_lib::core::commit_workspace(&repo.repo_path, source.id, "Commit to move")
        .expect("Failed to commit");

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
    TestRepo::write_workspace_file(workspace_path_str, "abandon-me.txt", "content")
        .expect("Failed to write");
    treq_lib::core::commit_workspace(&repo.repo_path, workspace.id, "Commit to abandon")
        .expect("Failed to commit");

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
    TestRepo::write_workspace_file(workspace_path_str, "hello.txt", "hello world\n")
        .expect("Failed to write file");
    TestRepo::write_workspace_file(workspace_path_str, "foo.txt", "foo\nbar\nbaz\n")
        .expect("Failed to write file");
    treq_lib::core::commit_workspace(&repo.repo_path, workspace.id, "Add two files")
        .expect("Failed to commit");

    // Get the commit's change_id from the log
    let log = treq_lib::core::list_commits(&repo.repo_path, Some(workspace.id), false, None, None)
        .expect("Failed to list commits");
    let committed = log
        .commits
        .iter()
        .find(|c| !c.is_working_copy && c.description == "Add two files")
        .expect("Should include commit 'Add two files'");
    let change_id = &committed.change_id;

    // Call get_commit_diff
    let diff = treq_lib::core::get_commit_diff_with_conflict_style(
        &repo.repo_path,
        Some(workspace.id),
        change_id,
        "git",
    )
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
    let workspace_path_str = workspace_path.to_str().unwrap();

    // First commit: create a file
    TestRepo::write_workspace_file(workspace_path_str, "data.txt", "line 1\nline 2\nline 3\n")
        .expect("Failed to write file");
    treq_lib::core::commit_workspace(&repo.repo_path, workspace.id, "Create data file")
        .expect("Failed to commit");

    // Second commit: modify the file
    TestRepo::write_workspace_file(
        workspace_path_str,
        "data.txt",
        "line 1\nchanged line 2\nline 3\nnew line 4\n",
    )
    .expect("Failed to write file");
    treq_lib::core::commit_workspace(&repo.repo_path, workspace.id, "Modify data file")
        .expect("Failed to commit");

    // Get commits
    let log = treq_lib::core::list_commits(&repo.repo_path, Some(workspace.id), false, None, None)
        .expect("Failed to list commits");
    // Find the modification commit
    let mod_commit = log
        .commits
        .iter()
        .find(|c| c.description == "Modify data file")
        .expect("Should find modification commit");

    let diff = treq_lib::core::get_commit_diff_with_conflict_style(
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
    TestRepo::write_workspace_file(workspace_path_str, "temp.txt", "temporary content\n")
        .expect("Failed to write file");
    treq_lib::core::commit_workspace(&repo.repo_path, workspace.id, "Add temp file")
        .expect("Failed to commit");

    // Second commit: delete the file
    TestRepo::remove_file_path(workspace_path.join("temp.txt")).expect("Failed to delete file");
    treq_lib::core::commit_workspace(&repo.repo_path, workspace.id, "Delete temp file")
        .expect("Failed to commit");

    // Get commits
    let log = treq_lib::core::list_commits(&repo.repo_path, Some(workspace.id), false, None, None)
        .expect("Failed to list commits");
    let committed: Vec<_> = log.commits.iter().filter(|c| !c.is_working_copy).collect();

    let del_commit = committed
        .iter()
        .find(|c| c.description == "Delete temp file")
        .expect("Should find deletion commit");

    let diff = treq_lib::core::get_commit_diff_with_conflict_style(
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

#[test]
fn test_commit_diff_defers_large_file_diffs() {
    let repo = TestRepo::new().expect("Failed to create test repo");

    let workspace = treq_lib::core::create_workspace(
        &repo.repo_path,
        "feat/commit-diff-large",
        Some("commit diff large test".to_string()),
        None,
        None,
        None,
    )
    .expect("Failed to create workspace");

    let workspace_path = repo.workspaces_dir().join(&workspace.workspace_path);
    let workspace_path_str = workspace_path.to_str().unwrap();

    let large_diff = (1..=501)
        .map(|idx| format!("large diff line {}", idx))
        .collect::<Vec<_>>()
        .join("\n")
        + "\n";
    TestRepo::write_workspace_file(workspace_path_str, "large.txt", &large_diff)
        .expect("Failed to write file");
    treq_lib::core::commit_workspace(&repo.repo_path, workspace.id, "Add large diff")
        .expect("Failed to commit");

    let log = treq_lib::core::list_commits(&repo.repo_path, Some(workspace.id), false, None, None)
        .expect("Failed to list commits");
    let large_commit = log
        .commits
        .iter()
        .find(|commit| commit.description == "Add large diff")
        .expect("Should find large diff commit");

    let diff = treq_lib::core::get_commit_diff_with_conflict_style(
        &repo.repo_path,
        Some(workspace.id),
        &large_commit.change_id,
        "git",
    )
    .expect("Failed to get commit diff");

    assert_eq!(diff.files.len(), 1);
    assert_eq!(diff.files[0].path, "large.txt");
    assert!(diff.files[0].diff_deferred);
    assert_eq!(diff.files[0].changed_line_count, 501);
    assert!(
        diff.hunks_by_file
            .iter()
            .all(|file_diff| file_diff.path != "large.txt"),
        "Large deferred file diff should not be returned in hunks_by_file"
    );
}

#[test]
fn test_commit_diff_blocks_rendering_when_commit_is_too_large() {
    let repo = TestRepo::new().expect("Failed to create test repo");

    let workspace = treq_lib::core::create_workspace(
        &repo.repo_path,
        "feat/commit-diff-too-large",
        Some("commit diff too large test".to_string()),
        None,
        None,
        None,
    )
    .expect("Failed to create workspace");

    let workspace_path = repo.workspaces_dir().join(&workspace.workspace_path);
    let workspace_path_str = workspace_path.to_str().unwrap();

    let huge_diff = (1..=10_001)
        .map(|idx| format!("huge diff line {}", idx))
        .collect::<Vec<_>>()
        .join("\n")
        + "\n";
    TestRepo::write_workspace_file(workspace_path_str, "huge.txt", &huge_diff)
        .expect("Failed to write file");
    treq_lib::core::commit_workspace(&repo.repo_path, workspace.id, "Add huge diff")
        .expect("Failed to commit");

    let log = treq_lib::core::list_commits(&repo.repo_path, Some(workspace.id), false, None, None)
        .expect("Failed to list commits");
    let huge_commit = log
        .commits
        .iter()
        .find(|commit| commit.description == "Add huge diff")
        .expect("Should find huge diff commit");

    let diff = treq_lib::core::get_commit_diff_with_conflict_style(
        &repo.repo_path,
        Some(workspace.id),
        &huge_commit.change_id,
        "git",
    )
    .expect("Failed to get commit diff");

    assert!(diff.too_large_to_render);
    assert_eq!(diff.files.len(), 0);
    assert_eq!(diff.hunks_by_file.len(), 0);
    assert_eq!(
        diff.render_block_reason.as_deref(),
        Some("This commit changes more than 10,000 lines and is too large to render.")
    );
}

#[test]
fn test_commit_file_diff_fetches_deferred_file_on_demand() {
    let repo = TestRepo::new().expect("Failed to create test repo");

    let workspace = treq_lib::core::create_workspace(
        &repo.repo_path,
        "feat/commit-file-diff",
        Some("commit file diff test".to_string()),
        None,
        None,
        None,
    )
    .expect("Failed to create workspace");

    let workspace_path = repo.workspaces_dir().join(&workspace.workspace_path);
    let workspace_path_str = workspace_path.to_str().unwrap();

    let large_diff = (1..=501)
        .map(|idx| format!("large diff line {}", idx))
        .collect::<Vec<_>>()
        .join("\n")
        + "\n";
    TestRepo::write_workspace_file(workspace_path_str, "large.txt", &large_diff)
        .expect("Failed to write file");
    treq_lib::core::commit_workspace(&repo.repo_path, workspace.id, "Add deferred diff")
        .expect("Failed to commit");

    let log = treq_lib::core::list_commits(&repo.repo_path, Some(workspace.id), false, None, None)
        .expect("Failed to list commits");
    let deferred_commit = log
        .commits
        .iter()
        .find(|commit| commit.description == "Add deferred diff")
        .expect("Should find deferred diff commit");

    let file_diff = treq_lib::core::get_commit_file_diff_with_conflict_style(
        &repo.repo_path,
        Some(workspace.id),
        &deferred_commit.change_id,
        "large.txt",
        "git",
    )
    .expect("Failed to fetch deferred file diff");

    assert_eq!(file_diff.path, "large.txt");
    assert!(!file_diff.hunks.is_empty());
    assert!(
        file_diff
            .hunks
            .iter()
            .flat_map(|hunk| hunk.lines.iter())
            .any(|line| line.contains("large diff line 501")),
        "Deferred file diff should include the lazily fetched file contents"
    );
}

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
    let result = treq_lib::core::get_commit_diff_with_conflict_style(
        &repo.repo_path,
        Some(workspace.id),
        "-r malicious",
        "git",
    );
    assert!(result.is_err(), "Should reject change_id starting with '-'");

    // Try with empty change_id
    let result = treq_lib::core::get_commit_diff_with_conflict_style(
        &repo.repo_path,
        Some(workspace.id),
        "",
        "git",
    );
    assert!(result.is_err(), "Should reject empty change_id");
}

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
    let workspace_path_str = workspace_path
        .to_str()
        .expect("workspace path should be utf-8");

    // First commit
    TestRepo::write_workspace_file(workspace_path_str, "hello.txt", "hello\n")
        .expect("Failed to write file");
    treq_lib::core::commit_workspace(&repo.repo_path, workspace.id, "Add hello")
        .expect("Failed to commit");

    // Second commit
    TestRepo::write_workspace_file(workspace_path_str, "world.txt", "world\n")
        .expect("Failed to write file");
    treq_lib::core::commit_workspace(&repo.repo_path, workspace.id, "Add world")
        .expect("Failed to commit");

    let result =
        treq_lib::core::list_commits(&repo.repo_path, Some(workspace.id), false, None, None)
            .expect("Failed to list commits");

    // Should have both committed workspace changes
    let committed: Vec<_> = result
        .commits
        .iter()
        .filter(|c| {
            !c.is_working_copy && (c.description == "Add hello" || c.description == "Add world")
        })
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

    // Should exclude working copy commits
    let wc: Vec<_> = result
        .commits
        .iter()
        .filter(|c| c.is_working_copy)
        .collect();
    assert_eq!(wc.len(), 0, "Should have no working copy commits");
}

#[test]
fn test_list_commits_includes_base_branch_commits_for_non_default_workspace() {
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
    let workspace_path_str = workspace_path
        .to_str()
        .expect("workspace path should be utf-8");

    // Make a commit on the workspace branch
    TestRepo::write_workspace_file(workspace_path_str, "branch_file.txt", "branch content\n")
        .expect("Failed to write file");
    treq_lib::core::commit_workspace(&repo.repo_path, workspace.id, "Branch commit")
        .expect("Failed to commit");

    let result =
        treq_lib::core::list_commits(&repo.repo_path, Some(workspace.id), false, None, None)
            .expect("Failed to list commits");

    let committed: Vec<_> = result
        .commits
        .iter()
        .filter(|c| !c.is_working_copy)
        .collect();

    assert!(
        committed.iter().any(|c| c.description == "Branch commit"),
        "Should include branch commit, got {:?}",
        committed.iter().map(|c| &c.description).collect::<Vec<_>>()
    );

    // Verify base branch commits are included
    let descriptions: Vec<&str> = committed.iter().map(|c| c.description.as_str()).collect();
    assert!(
        descriptions.contains(&"Base commit 1"),
        "Should contain base branch commit 1"
    );
    assert!(
        descriptions.contains(&"Base commit 2"),
        "Should contain base branch commit 2"
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
    let workspace_path_str = workspace_path
        .to_str()
        .expect("workspace path should be utf-8");

    // Write a file but don't commit — it stays in the working copy
    TestRepo::write_workspace_file(
        workspace_path_str,
        "new_file.txt",
        "line 1\nline 2\nline 3\nline 4\nline 5\n",
    )
    .expect("Failed to write file");

    let result =
        treq_lib::core::list_commits(&repo.repo_path, Some(workspace.id), false, None, None)
            .expect("Failed to list commits");

    let wc_commit = result.commits.iter().find(|c| c.is_working_copy);
    assert!(
        wc_commit.is_none(),
        "Should exclude working copy commits in the results"
    );
}

#[test]
fn test_list_commits_home_repo() {
    let repo = TestRepo::new().expect("Failed to create test repo");

    // Create a file in the home repo to ensure there's a change
    repo.create_file("home_file.txt", "home content\n")
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

#[test]
fn test_list_commits_workspace_after_home_repo_jj_commits() {
    let repo = TestRepo::new().expect("Failed to create test repo");

    for idx in 0..13 {
        repo.commit_file(
            &format!("home_{}.txt", idx),
            &format!("home content {}\n", idx),
            &format!("Home commit {}", idx),
        )
        .expect("Failed to create home repo commit");
    }

    let workspace = treq_lib::core::create_workspace(
        &repo.repo_path,
        "feat/home-regression",
        Some("home regression".to_string()),
        None,
        None,
        None,
    )
    .expect("Failed to create workspace");

    let workspace_path = repo.workspaces_dir().join(&workspace.workspace_path);
    let workspace_path_str = workspace_path
        .to_str()
        .expect("workspace path should be utf-8");
    TestRepo::write_workspace_file(workspace_path_str, "workspace.txt", "workspace content\n")
        .expect("Failed to write workspace file");
    treq_lib::core::commit_workspace(&repo.repo_path, workspace.id, "Workspace commit")
        .expect("Failed to commit workspace change");

    let result =
        treq_lib::core::list_commits(&repo.repo_path, Some(workspace.id), true, None, None)
            .expect("Workspace list_commits should succeed after home repo jj commits");

    let descriptions: Vec<&str> = result
        .commits
        .iter()
        .filter(|c| !c.is_working_copy)
        .map(|c| c.description.as_str())
        .collect();
    assert!(
        descriptions.contains(&"Workspace commit"),
        "Should include workspace commit, got: {:?}",
        descriptions
    );

    let expanded_result =
        treq_lib::core::list_commits(&repo.repo_path, Some(workspace.id), true, Some(20), None)
            .expect("Expanded target branch history should succeed");
    let target_descriptions: Vec<&str> = expanded_result
        .target_branch_commits
        .iter()
        .map(|c| c.description.as_str())
        .collect();
    assert!(
        target_descriptions.contains(&"Home commit 0"),
        "Expanded target branch history should include oldest home commit, got: {:?}",
        target_descriptions,
    );
}

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
    let workspace_path_str = workspace_path
        .to_str()
        .expect("workspace path should be utf-8");

    // Make a commit on the workspace branch
    TestRepo::write_workspace_file(workspace_path_str, "branch_file.txt", "branch content\n")
        .expect("Failed to write file");
    treq_lib::core::commit_workspace(&repo.repo_path, workspace.id, "Branch commit")
        .expect("Failed to commit");

    // Call with include_target_branch_history=true
    let result =
        treq_lib::core::list_commits(&repo.repo_path, Some(workspace.id), true, None, None)
            .expect("Failed to list commits");

    // Workspace commits should only include the workspace-side history.
    let committed: Vec<_> = result
        .commits
        .iter()
        .filter(|c| !c.is_working_copy)
        .collect();
    let descriptions: Vec<&str> = committed.iter().map(|c| c.description.as_str()).collect();
    assert!(descriptions.contains(&"Branch commit"));
    assert!(
        !descriptions.contains(&"Base commit 1"),
        "workspace commits should not include target history, got: {:?}",
        descriptions
    );
    assert!(
        !descriptions.contains(&"Base commit 2"),
        "workspace commits should not include target history, got: {:?}",
        descriptions
    );

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
fn test_list_commits_keeps_workspace_and_target_histories_disjoint() {
    let repo = TestRepo::new().expect("Failed to create test repo");

    repo.commit_file("base.txt", "base\n", "Base commit")
        .expect("Failed to create base commit");
    repo.commit_file("target-only.txt", "target only\n", "Target only commit")
        .expect("Failed to create target-only commit");

    let workspace = treq_lib::core::create_workspace(
        &repo.repo_path,
        "feat/disjoint-history",
        Some("disjoint history test".to_string()),
        None,
        None,
        None,
    )
    .expect("Failed to create workspace");

    let workspace_path = repo.workspaces_dir().join(&workspace.workspace_path);
    let workspace_path_str = workspace_path
        .to_str()
        .expect("workspace path should be utf-8");
    TestRepo::write_workspace_file(
        workspace_path_str,
        "workspace-only.txt",
        "workspace only\n",
    )
    .expect("Failed to write workspace file");
    treq_lib::core::commit_workspace(&repo.repo_path, workspace.id, "Workspace only commit")
        .expect("Failed to commit workspace change");

    let result =
        treq_lib::core::list_commits(&repo.repo_path, Some(workspace.id), true, None, None)
            .expect("Failed to list commits");

    let workspace_descriptions: Vec<&str> = result
        .commits
        .iter()
        .filter(|c| !c.is_working_copy)
        .map(|c| c.description.as_str())
        .collect();
    let target_descriptions: Vec<&str> = result
        .target_branch_commits
        .iter()
        .map(|c| c.description.as_str())
        .collect();

    assert!(
        workspace_descriptions.contains(&"Workspace only commit"),
        "workspace commits should include the workspace-only commit, got: {:?}",
        workspace_descriptions
    );
    assert!(
        !workspace_descriptions.contains(&"Target only commit"),
        "workspace commits should not include target-only commits, got: {:?}",
        workspace_descriptions
    );
    assert!(
        target_descriptions.contains(&"Target only commit"),
        "target_branch_commits should include the target-only commit, got: {:?}",
        target_descriptions
    );

    let overlap: Vec<_> = workspace_descriptions
        .iter()
        .filter(|description| target_descriptions.contains(description))
        .copied()
        .collect();
    assert!(
        overlap.is_empty(),
        "workspace and target_branch_commits should be disjoint, overlap: {:?}",
        overlap
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

#[test]
fn test_list_commits_caches_commit_info_in_local_db() {
    let repo = TestRepo::new().expect("Failed to create test repo");

    let workspace = treq_lib::core::create_workspace(
        &repo.repo_path,
        "feat/cache-commit-info",
        Some("cache commit info test".to_string()),
        None,
        None,
        None,
    )
    .expect("Failed to create workspace");

    let workspace_path = repo.workspaces_dir().join(&workspace.workspace_path);
    let workspace_path_str = workspace_path
        .to_str()
        .expect("workspace path should be utf-8");

    TestRepo::write_workspace_file(
        workspace_path_str,
        "cached_file.txt",
        "line 1\nline 2\nline 3\n",
    )
    .expect("Failed to write file");
    treq_lib::core::commit_workspace(&repo.repo_path, workspace.id, "Cacheable commit")
        .expect("Failed to commit");

    // First call populates the cache as a side-effect.
    let first =
        treq_lib::core::list_commits(&repo.repo_path, Some(workspace.id), false, None, None)
            .expect("Failed to list commits");

    let original = first
        .commits
        .iter()
        .find(|c| !c.is_working_copy && c.description == "Cacheable commit")
        .expect("Should include 'Cacheable commit'");
    assert_eq!(original.description, "Cacheable commit");
    assert_eq!(original.insertions, 3);
    assert_eq!(original.deletions, 0);

    // Verify the commit_diff_stats cache table now has a row with the same metadata.
    let db_path = treq_lib::local_db::get_local_db_path(&repo.repo_path);
    let conn = rusqlite::Connection::open(&db_path).expect("Should open local db");
    let row_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM commit_diff_stats WHERE description = ?1",
            rusqlite::params!["Cacheable commit"],
            |row| row.get(0),
        )
        .expect("Should count cached rows");
    assert_eq!(
        row_count, 1,
        "list_commits should cache exactly one row for the committed change"
    );
}

#[test]
fn test_list_commits_target_branch_history_uses_local_bookmark_only() {
    let repo = TestRepo::with_remote().expect("Failed to create test repo with remote");

    // Create local-only advancement on main.
    repo.commit_file(
        "local_main_only.txt",
        "local-only main content\n",
        "Local main only commit",
    )
    .expect("Failed to create local main commit");

    // Create remote-only advancement on main so local `main` becomes conflicted after fetch.
    repo.remote_commit_file(
        "remote_main_only.txt",
        "remote-only main content\n",
        "Remote main only commit",
    )
    .expect("Failed to create remote main commit");
    treq_lib::jj::jj_git_fetch(&repo.repo_path).expect("Failed to fetch");

    let workspace = treq_lib::core::create_workspace(
        &repo.repo_path,
        "feat/local-target-main",
        Some("local target history".to_string()),
        None,
        None,
        None,
    )
    .expect("Failed to create workspace");

    let workspace_path = repo.workspaces_dir().join(&workspace.workspace_path);
    let workspace_path_str = workspace_path
        .to_str()
        .expect("workspace path should be utf-8");
    TestRepo::write_workspace_file(
        workspace_path_str,
        "workspace_only.txt",
        "workspace-only content\n",
    )
    .expect("Failed to write workspace file");
    treq_lib::core::commit_workspace(&repo.repo_path, workspace.id, "Workspace local commit")
        .expect("Failed to commit workspace change");

    let result =
        treq_lib::core::list_commits(&repo.repo_path, Some(workspace.id), true, Some(30), None)
            .expect("list_commits should succeed");

    let target_descriptions: Vec<&str> = result
        .target_branch_commits
        .iter()
        .map(|c| c.description.as_str())
        .collect();

    assert!(
        target_descriptions.contains(&"Local main only commit"),
        "target branch history should include local main commit, got: {:?}",
        target_descriptions
    );
    assert!(
        !target_descriptions.contains(&"Remote main only commit"),
        "target branch history should not fall back to remote main@git, got: {:?}",
        target_descriptions
    );
}

#[test]
fn test_default_branch_workspace_returns_full_history() {
    let repo = TestRepo::new().expect("Failed to create test repo");

    repo.commit_file("base_1.txt", "base 1\n", "Base commit 1")
        .expect("Failed to create base commit 1");
    repo.commit_file("base_2.txt", "base 2\n", "Base commit 2")
        .expect("Failed to create base commit 2");

    let workspace = treq_lib::core::create_workspace(
        &repo.repo_path,
        "main",
        Some("root main workspace".to_string()),
        None,
        None,
        None,
    )
    .expect("Failed to create main workspace");

    let result =
        treq_lib::core::list_commits(&repo.repo_path, Some(workspace.id), false, None, None)
            .expect("Failed to list commits");

    let committed_descriptions: Vec<&str> = result
        .commits
        .iter()
        .filter(|c| !c.is_working_copy)
        .map(|c| c.description.as_str())
        .collect();

    assert!(
        committed_descriptions.contains(&"Base commit 1"),
        "default-branch workspace should include base history, got: {:?}",
        committed_descriptions
    );
    assert!(
        committed_descriptions.contains(&"Base commit 2"),
        "default-branch workspace should include base history, got: {:?}",
        committed_descriptions
    );
}

#[test]
fn test_non_default_workspace_includes_target_history() {
    let repo = TestRepo::new().expect("Failed to create test repo");

    repo.commit_file("base_1.txt", "base 1\n", "Base commit 1")
        .expect("Failed to create base commit 1");
    repo.commit_file("base_2.txt", "base 2\n", "Base commit 2")
        .expect("Failed to create base commit 2");

    let workspace = treq_lib::core::create_workspace(
        &repo.repo_path,
        "feat/ahead-only",
        Some("ahead only workspace".to_string()),
        None,
        None,
        None,
    )
    .expect("Failed to create workspace");

    let workspace_path = repo.workspaces_dir().join(&workspace.workspace_path);
    let workspace_path_str = workspace_path
        .to_str()
        .expect("workspace path should be utf-8");
    TestRepo::write_workspace_file(workspace_path_str, "workspace_only.txt", "workspace\n")
        .expect("Failed to write workspace file");
    treq_lib::core::commit_workspace(&repo.repo_path, workspace.id, "Workspace commit")
        .expect("Failed to commit workspace change");

    let result =
        treq_lib::core::list_commits(&repo.repo_path, Some(workspace.id), false, None, None)
            .expect("Failed to list commits");

    let committed_descriptions: Vec<&str> = result
        .commits
        .iter()
        .filter(|c| !c.is_working_copy)
        .map(|c| c.description.as_str())
        .collect();

    assert!(
        committed_descriptions.contains(&"Workspace commit"),
        "workspace history should include its own commit, got: {:?}",
        committed_descriptions
    );
    assert!(
        committed_descriptions.contains(&"Base commit 1"),
        "non-default workspace should include target branch history, got: {:?}",
        committed_descriptions
    );
    assert!(
        committed_descriptions.contains(&"Base commit 2"),
        "non-default workspace should include target branch history, got: {:?}",
        committed_descriptions
    );
}

#[test]
fn test_non_default_workspace_empty_ahead_includes_target_history() {
    let repo = TestRepo::new().expect("Failed to create test repo");

    repo.commit_file("base_1.txt", "base 1\n", "Base commit 1")
        .expect("Failed to create base commit 1");
    repo.commit_file("base_2.txt", "base 2\n", "Base commit 2")
        .expect("Failed to create base commit 2");

    let workspace = treq_lib::core::create_workspace(
        &repo.repo_path,
        "feat/no-ahead",
        Some("no ahead workspace".to_string()),
        None,
        None,
        None,
    )
    .expect("Failed to create workspace");

    let result =
        treq_lib::core::list_commits(&repo.repo_path, Some(workspace.id), false, None, None)
            .expect("Failed to list commits");

    let committed_descriptions: Vec<&str> = result
        .commits
        .iter()
        .filter(|c| !c.is_working_copy)
        .map(|c| c.description.as_str())
        .collect();

    assert!(
        !committed_descriptions.is_empty(),
        "non-default workspace should include target history even with no ahead commits"
    );
    assert!(
        committed_descriptions.contains(&"Base commit 1"),
        "non-default workspace should include target branch history, got: {:?}",
        committed_descriptions
    );
    assert!(
        committed_descriptions.contains(&"Base commit 2"),
        "non-default workspace should include target branch history, got: {:?}",
        committed_descriptions
    );
}

#[test]
fn test_non_default_workspace_combined_history_has_no_duplicate_change_ids() {
    let repo = TestRepo::new().expect("Failed to create test repo");

    repo.commit_file("base_1.txt", "base 1\n", "Base commit 1")
        .expect("Failed to create base commit 1");
    repo.commit_file("base_2.txt", "base 2\n", "Base commit 2")
        .expect("Failed to create base commit 2");

    let workspace = treq_lib::core::create_workspace(
        &repo.repo_path,
        "feat/dedupe",
        Some("dedupe workspace".to_string()),
        None,
        None,
        None,
    )
    .expect("Failed to create workspace");

    let workspace_path = repo.workspaces_dir().join(&workspace.workspace_path);
    let workspace_path_str = workspace_path
        .to_str()
        .expect("workspace path should be utf-8");
    TestRepo::write_workspace_file(workspace_path_str, "workspace_only.txt", "workspace\n")
        .expect("Failed to write workspace file");
    treq_lib::core::commit_workspace(&repo.repo_path, workspace.id, "Workspace commit")
        .expect("Failed to commit workspace change");

    let result =
        treq_lib::core::list_commits(&repo.repo_path, Some(workspace.id), false, None, None)
            .expect("Failed to list commits");

    let committed_change_ids: Vec<&str> = result
        .commits
        .iter()
        .filter(|c| !c.is_working_copy)
        .map(|c| c.change_id.as_str())
        .collect();
    let unique_change_ids: std::collections::HashSet<&str> =
        committed_change_ids.iter().copied().collect();

    assert_eq!(
        unique_change_ids.len(),
        committed_change_ids.len(),
        "combined history should not contain duplicate change IDs: {:?}",
        committed_change_ids
    );
}

#[test]
fn test_no_main_assumption_for_non_main_default() {
    let repo = TestRepo::new_without_init().expect("Failed to create test repo");

    TestRepo::run_git(&repo.repo_path, &["branch", "-m", "trunk"])
        .expect("Failed to rename default branch to trunk");
    TestRepo::run_git(&repo.repo_path, &["checkout", "trunk"])
        .expect("Failed to checkout trunk branch");

    let remote_path = repo.temp_dir.path().join("remote.git");
    TestRepo::ensure_dir(&remote_path).expect("Failed to create remote directory");
    TestRepo::run_git(&remote_path.to_string_lossy(), &["init", "--bare"])
        .expect("Failed to initialize bare remote");
    TestRepo::run_git(
        &repo.repo_path,
        &[
            "remote",
            "add",
            "origin",
            remote_path.to_str().expect("remote path should be utf-8"),
        ],
    )
    .expect("Failed to add origin remote");
    TestRepo::run_git(&repo.repo_path, &["push", "-u", "origin", "trunk"])
        .expect("Failed to push trunk to remote");
    TestRepo::run_git(&repo.repo_path, &["remote", "set-head", "origin", "trunk"])
        .expect("Failed to set origin HEAD to trunk");

    treq_lib::core::init(&repo.repo_path).expect("Failed to initialize treq");

    repo.commit_file("trunk_1.txt", "trunk 1\n", "Trunk commit 1")
        .expect("Failed to create trunk commit 1");
    repo.commit_file("trunk_2.txt", "trunk 2\n", "Trunk commit 2")
        .expect("Failed to create trunk commit 2");

    let workspace = treq_lib::core::create_workspace(
        &repo.repo_path,
        "trunk",
        Some("root trunk workspace".to_string()),
        None,
        None,
        None,
    )
    .expect("Failed to create trunk workspace");

    let result =
        treq_lib::core::list_commits(&repo.repo_path, Some(workspace.id), false, None, None)
            .expect("Failed to list commits");

    let committed_descriptions: Vec<&str> = result
        .commits
        .iter()
        .filter(|c| !c.is_working_copy)
        .map(|c| c.description.as_str())
        .collect();

    assert!(
        committed_descriptions.contains(&"Trunk commit 1"),
        "trunk default-branch workspace should include trunk history, got: {:?}",
        committed_descriptions
    );
    assert!(
        committed_descriptions.contains(&"Trunk commit 2"),
        "trunk default-branch workspace should include trunk history, got: {:?}",
        committed_descriptions
    );
}

#[test]
fn test_non_default_workspace_uses_non_main_default_target_history() {
    let repo = TestRepo::new_without_init().expect("Failed to create test repo");

    TestRepo::run_git(&repo.repo_path, &["branch", "-m", "trunk"])
        .expect("Failed to rename default branch to trunk");
    TestRepo::run_git(&repo.repo_path, &["checkout", "trunk"])
        .expect("Failed to checkout trunk branch");

    let remote_path = repo.temp_dir.path().join("remote.git");
    TestRepo::ensure_dir(&remote_path).expect("Failed to create remote directory");
    TestRepo::run_git(&remote_path.to_string_lossy(), &["init", "--bare"])
        .expect("Failed to initialize bare remote");
    TestRepo::run_git(
        &repo.repo_path,
        &[
            "remote",
            "add",
            "origin",
            remote_path.to_str().expect("remote path should be utf-8"),
        ],
    )
    .expect("Failed to add origin remote");
    TestRepo::run_git(&repo.repo_path, &["push", "-u", "origin", "trunk"])
        .expect("Failed to push trunk to remote");
    TestRepo::run_git(&repo.repo_path, &["remote", "set-head", "origin", "trunk"])
        .expect("Failed to set origin HEAD to trunk");

    treq_lib::core::init(&repo.repo_path).expect("Failed to initialize treq");

    repo.commit_file("trunk_1.txt", "trunk 1\n", "Trunk commit 1")
        .expect("Failed to create trunk commit 1");
    repo.commit_file("trunk_2.txt", "trunk 2\n", "Trunk commit 2")
        .expect("Failed to create trunk commit 2");

    let workspace = treq_lib::core::create_workspace(
        &repo.repo_path,
        "feat/trunk-target",
        Some("feature on trunk default".to_string()),
        None,
        None,
        None,
    )
    .expect("Failed to create workspace");

    let workspace_path = repo.workspaces_dir().join(&workspace.workspace_path);
    let workspace_path_str = workspace_path
        .to_str()
        .expect("workspace path should be utf-8");
    TestRepo::write_workspace_file(workspace_path_str, "workspace_only.txt", "workspace\n")
        .expect("Failed to write workspace file");
    treq_lib::core::commit_workspace(&repo.repo_path, workspace.id, "Workspace trunk commit")
        .expect("Failed to commit workspace change");

    let result =
        treq_lib::core::list_commits(&repo.repo_path, Some(workspace.id), false, None, None)
            .expect("Failed to list commits");

    let committed_descriptions: Vec<&str> = result
        .commits
        .iter()
        .filter(|c| !c.is_working_copy)
        .map(|c| c.description.as_str())
        .collect();

    assert!(
        committed_descriptions.contains(&"Workspace trunk commit"),
        "workspace history should include its own commit, got: {:?}",
        committed_descriptions
    );
    assert!(
        committed_descriptions.contains(&"Trunk commit 1"),
        "non-default workspace should include trunk history, got: {:?}",
        committed_descriptions
    );
    assert!(
        committed_descriptions.contains(&"Trunk commit 2"),
        "non-default workspace should include trunk history, got: {:?}",
        committed_descriptions
    );
}
