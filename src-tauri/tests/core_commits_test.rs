mod e2e_test_helpers;

use e2e_test_helpers::TestRepo;
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
