mod e2e_test_helpers;

use e2e_test_helpers::TestRepo;
use rusqlite::params;
use treq_lib::local_db::get_local_db_path;

fn set_workspace_refreshed_at(repo_path: &str, id: i64, ts: &str) {
    let db_path = get_local_db_path(repo_path);
    let conn = rusqlite::Connection::open(db_path).expect("open local db");
    conn.execute(
        "UPDATE workspaces SET refreshed_at = ?1 WHERE id = ?2",
        params![ts, id],
    )
    .expect("update refreshed_at");
}

#[test]
fn test_workspace_list_statuses_show_conflict_state() {
    let repo = TestRepo::new().expect("Failed to create test repo");
    repo.create_file("conflict.txt", "base version\n")
        .expect("Failed to write conflict.txt in main repo");
    treq_lib::jj::jj_commit(&repo.repo_path, "base commit")
        .expect("Failed to create base commit in main repo");

    let workspace = treq_lib::core::create_workspace(
        &repo.repo_path,
        "base",
        Some("sidebar conflict test".to_string()),
        None,
        None,
        None,
    )
    .expect("Failed to create workspace");

    let workspace_path = repo.workspaces_dir().join(&workspace.workspace_path);
    let workspace_path_str = workspace_path.to_str().expect("utf-8");

    let statuses = treq_lib::core::list_workspace_statuses(&repo.repo_path)
        .expect("Failed to list workspace statuses");
    let clean_status = statuses
        .iter()
        .find(|s| s.current.id == workspace.id)
        .expect("workspace status should exist");
    assert!(!clean_status.has_conflicts);

    TestRepo::write_workspace_file(workspace_path_str, "conflict.txt", "workspace version\n")
        .expect("Failed to write conflict.txt in workspace");
    treq_lib::core::commit_workspace(&repo.repo_path, workspace.id, "workspace commit")
        .expect("Failed to commit in workspace");

    repo.create_file("conflict.txt", "main version\n")
        .expect("Failed to write conflict.txt in main repo");
    treq_lib::jj::jj_commit(&repo.repo_path, "main commit").expect("Failed to commit in main repo");

    let rebase_result = treq_lib::jj::jj_rebase_onto(workspace_path_str, "main", "diff")
        .expect("Failed to rebase workspace onto main");
    assert!(
        rebase_result.success,
        "Expected rebase command to succeed with recorded conflict, got: {}",
        rebase_result.message
    );

    let conflicted_files = treq_lib::jj::get_conflicted_files(workspace_path_str, None)
        .expect("Failed to list conflicted files");
    assert!(
        conflicted_files.contains(&"conflict.txt".to_string()),
        "Expected conflict.txt in conflicted files, got: {:?}",
        conflicted_files
    );

    let statuses = treq_lib::core::list_workspace_statuses(&repo.repo_path)
        .expect("Failed to list workspace statuses");
    let conflicted_status = statuses
        .iter()
        .find(|s| s.current.id == workspace.id)
        .expect("workspace status should exist");
    assert!(conflicted_status.has_conflicts);
}

#[test]
fn test_workspace_list_statuses_ignore_untracked_noise() {
    let repo = TestRepo::new().expect("Failed to create test repo");

    let workspace = treq_lib::core::create_workspace(
        &repo.repo_path,
        "feat/ignored-noise",
        Some("ignored noise".to_string()),
        None,
        None,
        None,
    )
    .expect("Failed to create workspace");

    let workspace_path = repo.workspaces_dir().join(&workspace.workspace_path);
    let workspace_path_str = workspace_path.to_str().expect("utf-8");

    TestRepo::write_workspace_file(
        workspace_path_str,
        "node_modules/pkg/index.js",
        "console.log('ignored');\n",
    )
    .expect("Failed to write ignored file");

    let statuses = treq_lib::core::list_workspace_statuses(&repo.repo_path)
        .expect("Failed to list workspace statuses");
    let status = statuses
        .iter()
        .find(|s| s.current.id == workspace.id)
        .expect("workspace status should exist");
    assert!(!status.has_conflicts);
}

#[test]
fn test_workspace_list_statuses_discovers_and_persists_workspace_when_db_is_empty() {
    let repo = TestRepo::new().expect("Failed to create test repo");

    let workspace = treq_lib::core::create_workspace(
        &repo.repo_path,
        "feat/discovered",
        Some("discovered workspace".to_string()),
        None,
        None,
        None,
    )
    .expect("Failed to create workspace");

    treq_lib::local_db::delete_workspace(&repo.repo_path, workspace.id)
        .expect("Failed to delete workspace from db");

    let statuses = treq_lib::core::list_workspace_statuses(&repo.repo_path)
        .expect("Failed to list workspace statuses");
    let status = statuses
        .iter()
        .find(|s| s.current.workspace_name == workspace.workspace_name)
        .expect("discovered workspace should be returned");

    assert_eq!(status.current.branch_name, "feat/discovered");
    assert!(status.current.refreshed_at.is_some());

    let persisted =
        treq_lib::local_db::get_workspace_by_path(&repo.repo_path, &workspace.workspace_path)
            .expect("db lookup should succeed")
            .expect("discovered workspace should be persisted");
    assert_eq!(persisted.branch_name, "feat/discovered");
    assert!(persisted.refreshed_at.is_some());
}

#[test]
fn test_workspace_list_statuses_excludes_default_workspace_and_ignores_stale_db_rows() {
    let repo = TestRepo::new().expect("Failed to create test repo");

    let stale_id = treq_lib::local_db::add_workspace(
        &repo.repo_path,
        "stale".to_string(),
        "stale".to_string(),
        "stale-branch".to_string(),
        None,
        None,
    )
    .expect("Failed to insert stale workspace");
    set_workspace_refreshed_at(&repo.repo_path, stale_id, "2000-01-01T00:00:00Z");

    let statuses = treq_lib::core::list_workspace_statuses(&repo.repo_path)
        .expect("Failed to list workspace statuses");

    assert!(
        statuses
            .iter()
            .all(|s| s.current.workspace_name != "default"),
        "default workspace should not be returned"
    );
    assert!(
        statuses.iter().all(|s| s.current.workspace_name != "stale"),
        "stale db row should not be returned when jj does not discover it"
    );

    let persisted_stale = treq_lib::local_db::get_workspace_by_id(&repo.repo_path, stale_id)
        .expect("db lookup should succeed")
        .expect("stale row should remain persisted");
    assert_eq!(
        persisted_stale.refreshed_at.as_deref(),
        Some("2000-01-01T00:00:00Z")
    );
}

#[test]
fn test_workspace_list_statuses_preserves_existing_workspace_metadata_on_upsert() {
    let repo = TestRepo::new().expect("Failed to create test repo");

    let workspace = treq_lib::core::create_workspace(
        &repo.repo_path,
        "feat/preserve-metadata",
        Some("initial intent".to_string()),
        Some(vec!["src/lib.rs".to_string()]),
        None,
        None,
    )
    .expect("Failed to create workspace");

    treq_lib::local_db::update_workspace_target_branch(&repo.repo_path, workspace.id, "main")
        .expect("Failed to set target branch");
    treq_lib::local_db::update_workspace_not_on_remote(&repo.repo_path, workspace.id, true)
        .expect("Failed to set not_on_remote");
    set_workspace_refreshed_at(&repo.repo_path, workspace.id, "2001-01-01T00:00:00Z");

    let before = treq_lib::local_db::get_workspace_by_id(&repo.repo_path, workspace.id)
        .expect("db lookup should succeed")
        .expect("workspace should exist");
    let before_created_at = before.created_at.clone();

    let statuses = treq_lib::core::list_workspace_statuses(&repo.repo_path)
        .expect("Failed to list workspace statuses");
    let status = statuses
        .iter()
        .find(|s| s.current.id == workspace.id)
        .expect("workspace status should exist");

    assert_eq!(status.current.target_branch.as_deref(), Some("main"));
    assert_eq!(status.current.intent.as_deref(), Some("initial intent"));
    assert_eq!(
        status.current.moved_files,
        Some(vec!["src/lib.rs".to_string()])
    );
    assert!(status.current.not_on_remote);
    assert_ne!(
        status.current.refreshed_at.as_deref(),
        Some("2001-01-01T00:00:00Z")
    );
    assert_eq!(status.current.created_at, before_created_at);
}
