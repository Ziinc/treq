mod e2e_test_helpers;

use e2e_test_helpers::{JjVerifier, TestRepo};
use std::path::Path;

// =============================================================================
// Test: repo initialization
// =============================================================================

#[test]
fn test_repo_initialization() {
    let repo = TestRepo::new_without_init().expect("Failed to create test repo");
    treq_lib::core::init(&repo.repo_path).ok();
    treq_lib::core::init(&repo.repo_path).ok();

    // --- JJ Initialization ---
    assert!(Path::new(&repo.repo_path).join(".git").exists());
    assert!(Path::new(&repo.repo_path).join(".jj").exists());
    assert!(
        repo.is_jj_initialized(),
        ".jj directory should exist after init"
    );

    // workspaces directory
    assert!(
        &repo.workspaces_dir().exists(),
        "Workspaces directory should exist"
    );

    let jj_workspaces =
        JjVerifier::list_workspaces(&repo.repo_path).expect("Failed to list jj workspaces");
    assert_eq!(
        jj_workspaces.len(),
        1,
        "jj should have exactly 1 workspace after init, got: {:?}",
        jj_workspaces
    );
    assert!(
        jj_workspaces.contains(&"default".to_string()),
        "jj should show 'default' workspace after init, got: {:?}",
        jj_workspaces
    );

    let status = JjVerifier::get_status(&repo.repo_path).expect("Failed to get jj status");
    assert!(
        !status.is_empty(),
        "jj status should return output after init"
    );

    let gitignore_content = repo.read_gitignore().expect("Failed to read .gitignore");
    assert_eq!(
        gitignore_content.matches(".jj/").count(),
        1,
        ".jj/ should appear exactly once"
    );
    assert_eq!(
        gitignore_content.matches(".jj*/").count(),
        1,
        ".jj*/ should appear exactly once"
    );
    assert_eq!(
        gitignore_content.matches(".treq/").count(),
        1,
        ".treq/ should appear exactly once"
    );
    assert!(
        !gitignore_content.contains("# Added by Treq"),
        ".gitignore should not contain Treq comment"
    );

    let db_path = Path::new(&repo.repo_path).join(".treq").join("local.db");
    assert!(db_path.exists(), ".treq/local.db should exist");

    // verify that db exists and is queryable
    let conn = rusqlite::Connection::open(&db_path).expect("Failed to open .treq/local.db");
    let count: i64 = conn
        .query_row("SELECT COUNT(*) FROM workspaces", [], |row| row.get(0))
        .expect("Failed to query workspaces count");

    assert_eq!(count, 0, "workspaces table should be empty after init");

    // verify workspaces dir created
    let workspaces_dir = Path::new(&repo.repo_path).join(".treq").join("workspaces");
    assert!(workspaces_dir.exists(), "workspaces dir should exist");
    assert!(
        workspaces_dir.is_dir(),
        "workspaces dir should be a directory"
    );
}

// =============================================================================
// Test: detect_binaries finds git and jj
// =============================================================================

#[test]
fn test_detect_binaries_finds_git_and_jj() {
    let temp_dir = tempfile::TempDir::new().expect("Failed to create temp dir");
    let db_path = temp_dir.path().join("test.db");
    let db = treq_lib::db::Database::new(db_path).expect("Failed to create database");
    db.init().expect("Failed to init database");

    let result = treq_lib::core::detect_binaries(&db);
    assert!(result.is_ok(), "detect_binaries should succeed");

    let detected = result.unwrap();
    assert!(
        detected.contains_key("git"),
        "git should be detected: {:?}",
        detected
    );
    assert!(
        detected.contains_key("jj"),
        "jj should be detected: {:?}",
        detected
    );
}

// =============================================================================
// Test: detect_binaries caches paths to database
// =============================================================================

#[test]
fn test_detect_binaries_caches_to_db() {
    let temp_dir = tempfile::TempDir::new().expect("Failed to create temp dir");
    let db_path = temp_dir.path().join("test.db");
    let db = treq_lib::db::Database::new(db_path).expect("Failed to create database");
    db.init().expect("Failed to init database");

    treq_lib::core::detect_binaries(&db).expect("detect_binaries should succeed");

    let cached_git = db
        .get_setting("binary_path_git")
        .expect("get_setting should not error");
    assert!(
        cached_git.is_some(),
        "binary_path_git should be cached in the database"
    );

    let cached_jj = db
        .get_setting("binary_path_jj")
        .expect("get_setting should not error");
    assert!(
        cached_jj.is_some(),
        "binary_path_jj should be cached in the database"
    );
}
