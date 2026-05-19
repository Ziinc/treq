mod e2e_test_helpers;

use e2e_test_helpers::{JjVerifier, TestRepo};
use std::fs;
use std::path::Path;

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

#[test]
fn test_init_triggers_workspaces_sync() {
    let repo = TestRepo::new().expect("Failed to create test repo");

    // Create workspace
    let workspace = treq_lib::core::create_workspace(
        &repo.repo_path,
        "feat/test-recover",
        Some("recovery test".to_string()),
        None,
        None,
        None,
    )
    .expect("Failed to create workspace");

    let workspace_path = repo.workspaces_dir().join(&workspace.workspace_path);

    fs::remove_dir_all(&workspace_path).expect("Failed to delete workspace directory");

    treq_lib::core::init(&repo.repo_path).expect("Failed to init");

    let workspaces =
        treq_lib::core::list_workspaces(&repo.repo_path).expect("Failed to list workspaces");
    assert!(workspaces.is_empty(), "Workspaces should be empty");

    assert!(
        !workspace_path.exists(),
        "Workspace directory should stay deleted"
    );
}

#[test]
fn returns_false_when_workspace_is_descendant_of_target() {
    let repo = TestRepo::new().expect("Failed to create test repo");
    let ws = treq_lib::core::create_workspace(
        &repo.repo_path,
        "feat/descendant",
        Some("descendant".to_string()),
        None,
        Some("main"),
        None,
    )
    .expect("Failed to create workspace");
    treq_lib::local_db::update_workspace_target_branch(&repo.repo_path, ws.id, "feat/descendant")
        .expect("set self target");

    let rebased = treq_lib::core::ensure_workspace_rebased(&repo.repo_path, ws.id, "diff")
        .expect("ensure should succeed");
    assert!(!rebased, "descendant workspace should not be rebased");
}

#[test]
fn returns_true_and_rebases_when_workspace_diverged_from_target() {
    let repo = TestRepo::new().expect("Failed to create test repo");
    let ws = treq_lib::core::create_workspace(
        &repo.repo_path,
        "feat/diverged",
        Some("diverged".to_string()),
        None,
        Some("main"),
        None,
    )
    .expect("Failed to create workspace");

    repo.commit_file("main-after.txt", "main advanced\n", "Advance main")
        .expect("advance main");

    let rebased = treq_lib::core::ensure_workspace_rebased(&repo.repo_path, ws.id, "diff")
        .expect("ensure should succeed");
    assert!(rebased, "diverged workspace should be rebased");
}

#[test]
fn returns_false_when_target_branch_missing() {
    let repo = TestRepo::new().expect("Failed to create test repo");
    let ws = treq_lib::core::create_workspace(
        &repo.repo_path,
        "feat/missing-target",
        Some("missing target".to_string()),
        None,
        None,
        None,
    )
    .expect("Failed to create workspace");

    treq_lib::local_db::update_workspace_target_branch(&repo.repo_path, ws.id, "no-such-branch")
        .expect("set target branch");

    let rebased = treq_lib::core::ensure_workspace_rebased(&repo.repo_path, ws.id, "diff")
        .expect("ensure should succeed");
    assert!(!rebased, "missing target should be treated as up-to-date");
}

#[test]
fn returns_false_for_self_target_workspace() {
    let repo = TestRepo::new().expect("Failed to create test repo");
    let ws = treq_lib::core::create_workspace(
        &repo.repo_path,
        "feat/self-target",
        Some("self target".to_string()),
        None,
        None,
        None,
    )
    .expect("Failed to create workspace");
    treq_lib::local_db::update_workspace_target_branch(&repo.repo_path, ws.id, "feat/self-target")
        .expect("set self target");

    let rebased = treq_lib::core::ensure_workspace_rebased(&repo.repo_path, ws.id, "diff")
        .expect("ensure should succeed");
    assert!(!rebased, "self-target workspace should be skipped");
}

#[test]
fn init_checks_all_workspaces_and_rebases_only_diverged_ones() {
    let repo = TestRepo::new().expect("Failed to create test repo");

    let _ws_diverged = treq_lib::core::create_workspace(
        &repo.repo_path,
        "feat/init-diverged",
        Some("init diverged".to_string()),
        None,
        Some("main"),
        None,
    )
    .expect("Failed to create diverged workspace");
    let ws_descendant = treq_lib::core::create_workspace(
        &repo.repo_path,
        "feat/init-descendant",
        Some("init descendant".to_string()),
        None,
        Some("main"),
        None,
    )
    .expect("Failed to create descendant workspace");
    treq_lib::local_db::update_workspace_target_branch(
        &repo.repo_path,
        ws_descendant.id,
        "feat/init-descendant",
    )
    .expect("set descendant self target");
    let ws_missing_target = treq_lib::core::create_workspace(
        &repo.repo_path,
        "feat/init-missing-target",
        Some("init missing target".to_string()),
        None,
        None,
        None,
    )
    .expect("Failed to create missing-target workspace");
    treq_lib::local_db::update_workspace_target_branch(
        &repo.repo_path,
        ws_missing_target.id,
        "no-such-target",
    )
    .expect("set missing target");

    repo.commit_file("main-advance.txt", "main moved\n", "Advance main")
        .expect("advance main");
    treq_lib::core::init(&repo.repo_path).expect("init should succeed");
    let workspaces =
        treq_lib::core::list_workspaces(&repo.repo_path).expect("list workspaces after init");
    assert_eq!(
        workspaces.len(),
        3,
        "init should be best-effort across workspaces"
    );
}
