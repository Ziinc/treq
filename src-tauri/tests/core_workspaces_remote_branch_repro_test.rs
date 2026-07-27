/// Repro for TREQ-237: "cannot create workspace from an existing remote branch —
/// Workspace already exists", where the user reports no workspace folder under
/// .treq/workspaces and no row in the `workspaces` table.
mod e2e_test_helpers;

use e2e_test_helpers::TestRepo;

/// Plain case: remote branch exists, nothing local. Must succeed.
#[test]
fn test_create_workspace_from_remote_branch_succeeds() {
    let repo = TestRepo::with_remote().expect("Failed to create test repo with remote");

    let ws = treq_lib::core::create_workspace(
        &repo.repo_path,
        "feature-remote",
        Some("feature-remote".to_string()),
        None,
        None,
        None,
    )
    .unwrap_or_else(|e| panic!("create_workspace from remote branch failed: {}", e));

    let dir = repo.workspaces_dir().join(&ws.workspace_path);
    assert!(dir.join(".jj").exists(), "workspace .jj must exist");
    assert!(
        dir.join("feature.txt").exists(),
        "remote branch content must be checked out"
    );
}

/// Reported state: a previous attempt registered the workspace in the parent repo,
/// but the directory and the db row are both gone. Re-creating must still succeed.
#[test]
fn test_create_workspace_from_remote_branch_after_dir_and_db_removed() {
    let repo = TestRepo::with_remote().expect("Failed to create test repo with remote");

    let ws = treq_lib::core::create_workspace(
        &repo.repo_path,
        "feature-remote",
        Some("feature-remote".to_string()),
        None,
        None,
        None,
    )
    .expect("initial create_workspace failed");

    let dir = repo.workspaces_dir().join(&ws.workspace_path);

    // Match the manual checks in the issue: no folder, no db record.
    std::fs::remove_dir_all(&dir).expect("failed to remove workspace dir");
    treq_lib::local_db::delete_workspace(&repo.repo_path, ws.id).expect("failed to delete db row");

    let ws2 = treq_lib::core::create_workspace(
        &repo.repo_path,
        "feature-remote",
        Some("feature-remote".to_string()),
        None,
        None,
        None,
    )
    .unwrap_or_else(|e| panic!("re-create from remote branch failed: {}", e));

    let dir2 = repo.workspaces_dir().join(&ws2.workspace_path);
    assert!(dir2.join(".jj").exists(), "workspace .jj must exist");
    assert!(
        dir2.join("feature.txt").exists(),
        "remote branch content must be checked out on re-create"
    );

    let record = treq_lib::local_db::get_workspace_by_branch(&repo.repo_path, "feature-remote")
        .expect("failed to query workspace by branch");
    assert_eq!(
        record.expect("expected a db record").id,
        ws2.id,
        "db should hold exactly the new record"
    );
}
