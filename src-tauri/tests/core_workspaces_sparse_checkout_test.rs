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
