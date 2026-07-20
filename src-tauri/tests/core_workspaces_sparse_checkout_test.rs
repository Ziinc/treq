mod e2e_test_helpers;

use e2e_test_helpers::TestRepo;

/// Creating a workspace with sparse patterns materializes only matching paths.
#[test]
fn sparse_workspace_materializes_only_matching_paths() {
    let repo = TestRepo::new().expect("Failed to create test repo");
    repo.commit_file("src/lib.rs", "pub fn lib() {}\n", "add src/lib.rs")
        .expect("Failed to commit src/lib.rs");
    repo.commit_file("docs/guide.md", "# Guide\n", "add docs/guide.md")
        .expect("Failed to commit docs/guide.md");

    let workspace = treq_lib::core::create_workspace(
        &repo.repo_path,
        "feat/sparse",
        Some("sparse workspace".to_string()),
        None, // moved_files
        None, // source_branch
        None, // included_copy_files
        Some(vec!["src".to_string()]),
    )
    .expect("Failed to create sparse workspace");

    let ws = repo.workspaces_dir().join(&workspace.workspace_path);
    assert!(
        ws.join("src/lib.rs").exists(),
        "src/lib.rs should be materialized in sparse workspace"
    );
    assert!(
        !ws.join("docs").exists(),
        "docs/ should not be materialized in sparse workspace"
    );
    assert!(
        !ws.join("README.md").exists(),
        "README.md should not be materialized in sparse workspace"
    );
    assert!(ws.join(".jj").exists(), ".jj directory should exist");

    // Workspace must be a valid jj workspace with a clean working copy.
    let status = TestRepo::run_jj(ws.to_str().unwrap(), &["status"])
        .expect("Workspace should be a valid jj workspace");
    assert!(
        !status.contains("Working copy changes:"),
        "Sparse workspace should have a clean working copy, got: {}",
        status
    );
}

/// `None` and an empty pattern list both mean a full checkout — never jj's
/// "empty patterns = materialize nothing" behavior.
#[test]
fn none_or_empty_sparse_patterns_full_checkout() {
    let repo = TestRepo::new().expect("Failed to create test repo");
    repo.commit_file("src/lib.rs", "pub fn lib() {}\n", "add src/lib.rs")
        .expect("Failed to commit src/lib.rs");
    repo.commit_file("docs/guide.md", "# Guide\n", "add docs/guide.md")
        .expect("Failed to commit docs/guide.md");

    for (branch, sparse) in [
        ("feat/full-none", None),
        ("feat/full-empty", Some(Vec::new())),
    ] {
        let workspace = treq_lib::core::create_workspace(
            &repo.repo_path,
            branch,
            None,
            None,
            None,
            None,
            sparse,
        )
        .unwrap_or_else(|e| panic!("Failed to create workspace '{}': {}", branch, e));

        let ws = repo.workspaces_dir().join(&workspace.workspace_path);
        for file in ["src/lib.rs", "docs/guide.md", "README.md"] {
            assert!(
                ws.join(file).exists(),
                "{} should be materialized in full workspace '{}'",
                file,
                branch
            );
        }
    }
}

/// Invalid patterns are rejected before any side effect: no workspace
/// directory and no database row.
#[test]
fn invalid_sparse_pattern_rejected_before_side_effects() {
    let repo = TestRepo::new().expect("Failed to create test repo");

    for bad in ["../escape", "/abs/path"] {
        let err = treq_lib::core::create_workspace(
            &repo.repo_path,
            "feat/bad-sparse",
            None,
            None,
            None,
            None,
            Some(vec![bad.to_string()]),
        )
        .expect_err(&format!("pattern '{}' should be rejected", bad));
        assert!(
            err.contains(bad),
            "error should name the offending pattern '{}', got: {}",
            bad,
            err
        );
    }

    assert!(
        !repo.workspaces_dir().join("feat-bad-sparse").exists(),
        "no workspace directory should be left behind"
    );
    let record = treq_lib::local_db::get_workspace_by_branch(&repo.repo_path, "feat/bad-sparse")
        .expect("db query should succeed");
    assert!(record.is_none(), "no db record should be left behind");
}

/// A single-file pattern materializes just that file.
#[test]
fn sparse_pattern_single_file() {
    let repo = TestRepo::new().expect("Failed to create test repo");
    repo.commit_file("src/lib.rs", "pub fn lib() {}\n", "add src/lib.rs")
        .expect("Failed to commit src/lib.rs");
    repo.commit_file("docs/guide.md", "# Guide\n", "add docs/guide.md")
        .expect("Failed to commit docs/guide.md");

    let workspace = treq_lib::core::create_workspace(
        &repo.repo_path,
        "feat/sparse-file",
        None,
        None,
        None,
        None,
        Some(vec!["docs/guide.md".to_string()]),
    )
    .expect("Failed to create sparse workspace");

    let ws = repo.workspaces_dir().join(&workspace.workspace_path);
    assert!(
        ws.join("docs/guide.md").exists(),
        "docs/guide.md should be materialized"
    );
    assert!(!ws.join("src").exists(), "src/ should not be materialized");
    assert!(
        !ws.join("README.md").exists(),
        "README.md should not be materialized"
    );
}

/// Sparse patterns round-trip through the workspace database record.
#[test]
fn sparse_patterns_persisted_in_db() {
    let repo = TestRepo::new().expect("Failed to create test repo");
    repo.commit_file("src/lib.rs", "pub fn lib() {}\n", "add src/lib.rs")
        .expect("Failed to commit src/lib.rs");

    let sparse = treq_lib::core::create_workspace(
        &repo.repo_path,
        "feat/sparse-db",
        None,
        None,
        None,
        None,
        Some(vec!["src".to_string()]),
    )
    .expect("Failed to create sparse workspace");
    let full = treq_lib::core::create_workspace(
        &repo.repo_path,
        "feat/full-db",
        None,
        None,
        None,
        None,
        None,
    )
    .expect("Failed to create full workspace");

    assert_eq!(
        sparse.sparse_patterns,
        Some(vec!["src".to_string()]),
        "sparse workspace record should carry its patterns"
    );
    assert_eq!(
        full.sparse_patterns, None,
        "full workspace record should have no sparse patterns"
    );

    let by_id = treq_lib::local_db::get_workspace_by_id(&repo.repo_path, sparse.id)
        .expect("db query should succeed")
        .expect("workspace should exist");
    assert_eq!(by_id.sparse_patterns, Some(vec!["src".to_string()]));

    let all = treq_lib::local_db::get_workspaces(&repo.repo_path)
        .expect("get_workspaces should succeed");
    let listed = all
        .iter()
        .find(|w| w.id == sparse.id)
        .expect("sparse workspace should be listed");
    assert_eq!(listed.sparse_patterns, Some(vec!["src".to_string()]));
}

/// Files written outside the sparse patterns are neither reported as changes
/// nor swept into commits — jj's snapshotting respects the sparse matcher.
#[test]
fn files_outside_sparse_patterns_are_not_snapshotted() {
    let repo = TestRepo::new().expect("Failed to create test repo");
    repo.commit_file("src/lib.rs", "pub fn lib() {}\n", "add src/lib.rs")
        .expect("Failed to commit src/lib.rs");

    let workspace = treq_lib::core::create_workspace(
        &repo.repo_path,
        "feat/sparse-snapshot",
        None,
        None,
        None,
        None,
        Some(vec!["src".to_string()]),
    )
    .expect("Failed to create sparse workspace");

    let ws = repo.workspaces_dir().join(&workspace.workspace_path);
    let ws_str = ws.to_str().unwrap();
    TestRepo::write_workspace_file(ws_str, "src/new.rs", "pub fn new() {}\n")
        .expect("Failed to write src/new.rs");
    TestRepo::write_workspace_file(ws_str, "docs/new.md", "# stray\n")
        .expect("Failed to write docs/new.md");

    let changes =
        treq_lib::jj::jj_get_changed_files(ws_str).expect("Failed to get changed files");
    let changed_paths: Vec<&str> = changes.iter().map(|c| c.path.as_str()).collect();
    assert!(
        changed_paths.contains(&"src/new.rs"),
        "src/new.rs should be reported as changed, got: {:?}",
        changed_paths
    );
    assert!(
        !changed_paths.contains(&"docs/new.md"),
        "docs/new.md is outside the sparse patterns and should not be snapshotted, got: {:?}",
        changed_paths
    );

    // Committing must not sweep the out-of-pattern file into the commit tree.
    treq_lib::core::commit_workspace(&repo.repo_path, workspace.id, "sparse commit")
        .expect("Failed to commit workspace");
    let tree_files = TestRepo::run_jj(ws_str, &["file", "list", "-r", "feat/sparse-snapshot"])
        .expect("Failed to list files at branch");
    assert!(
        tree_files.lines().any(|l| l.trim() == "src/new.rs"),
        "committed tree should contain src/new.rs, got: {}",
        tree_files
    );
    assert!(
        !tree_files.lines().any(|l| l.trim() == "docs/new.md"),
        "committed tree should not contain docs/new.md, got: {}",
        tree_files
    );
}

/// Sparse patterns are registered in jj's working-copy state, not just a disk effect.
#[test]
fn sparse_patterns_registered_in_jj() {
    let repo = TestRepo::new().expect("Failed to create test repo");
    repo.commit_file("src/lib.rs", "pub fn lib() {}\n", "add src/lib.rs")
        .expect("Failed to commit src/lib.rs");

    let workspace = treq_lib::core::create_workspace(
        &repo.repo_path,
        "feat/sparse-list",
        None,
        None,
        None,
        None,
        Some(vec!["src".to_string()]),
    )
    .expect("Failed to create sparse workspace");

    let ws = repo.workspaces_dir().join(&workspace.workspace_path);
    let output = TestRepo::run_jj(ws.to_str().unwrap(), &["sparse", "list"])
        .expect("jj sparse list should succeed");
    let patterns: Vec<&str> = output.lines().filter(|l| !l.trim().is_empty()).collect();
    assert_eq!(
        patterns,
        vec!["src"],
        "jj sparse list should contain exactly 'src', got: {:?}",
        patterns
    );
}
