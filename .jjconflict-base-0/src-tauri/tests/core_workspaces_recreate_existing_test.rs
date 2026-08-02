/// Tests that creating a workspace when the destination directory already contains a `.jj`
/// (orphaned or fully-tracked) recovers gracefully instead of erroring.
///
/// Current behavior (pre-fix): both tests fail with
///   "Failed to create workspace: Git workspace error: Failed to init workspace:
///    The destination repo (.../.jj) already exists"
mod e2e_test_helpers;

use e2e_test_helpers::TestRepo;

// ─── Test A: orphaned directory recovery ─────────────────────────────────────
//
// Simulate: a previous workspace creation succeeded on disk (`.jj` exists)
// but the local_db record was removed — the dir is an orphan.
// Re-creating the workspace for the same branch must succeed and leave exactly
// one db record.
#[test]
fn test_create_workspace_recovers_orphaned_jj_dir() {
    let repo = TestRepo::new().expect("Failed to create test repo");

    let branch = "feat/orphan-recovery";

    // Create the workspace normally so the .jj dir is initialised.
    let ws = treq_lib::core::create_workspace(
        &repo.repo_path,
        branch,
        Some(branch.to_string()),
        None,
        None,
        None,
        None,
    )
    .unwrap_or_else(|e| panic!("Initial create_workspace failed: {}", e));

    let workspace_dir = repo.workspaces_dir().join(&ws.workspace_path);
    let jj_dir = workspace_dir.join(".jj");

    assert!(jj_dir.exists(), ".jj should exist after first creation");

    // Orphan it: remove the db record but leave the dir on disk.
    treq_lib::local_db::delete_workspace(&repo.repo_path, ws.id)
        .expect("Failed to delete workspace from db");

    // A second create for the same branch must succeed even though .jj is present.
    let ws2 = treq_lib::core::create_workspace(
        &repo.repo_path,
        branch,
        Some(branch.to_string()),
        None,
        None,
        None,
        None,
    )
    .unwrap_or_else(|e| {
        panic!(
            "create_workspace should recover from orphaned .jj but failed: {}",
            e
        )
    });

    // .jj must still exist on disk.
    assert!(jj_dir.exists(), ".jj must exist after recovery create");

    // Exactly one db row for this branch.
    let all = treq_lib::local_db::get_workspace_by_branch(&repo.repo_path, branch)
        .expect("Failed to query workspace by branch");
    assert!(
        all.is_some(),
        "Expected exactly one db record for branch after recovery"
    );
    assert_eq!(
        all.unwrap().id,
        ws2.id,
        "db record should be the newly created one"
    );
}

// ─── Test B: re-create over a fully-tracked workspace ────────────────────────
//
// If a workspace is both on disk and tracked in db, creating the same branch
// again must succeed (replacing it) rather than erroring.
// After the call there must be exactly one db record for the branch.
#[test]
fn test_create_workspace_replaces_fully_tracked_workspace() {
    let repo = TestRepo::new().expect("Failed to create test repo");

    let branch = "feat/replace-tracked";

    // First creation.
    let ws1 = treq_lib::core::create_workspace(
        &repo.repo_path,
        branch,
        Some(branch.to_string()),
        None,
        None,
        None,
        None,
    )
    .unwrap_or_else(|e| panic!("First create_workspace failed: {}", e));

    let jj_dir = repo.workspaces_dir().join(&ws1.workspace_path).join(".jj");
    assert!(jj_dir.exists(), ".jj must exist after first creation");

    // Second creation for the exact same branch — must NOT error.
    let ws2 = treq_lib::core::create_workspace(
        &repo.repo_path,
        branch,
        Some(branch.to_string()),
        None,
        None,
        None,
        None,
    )
    .unwrap_or_else(|e| {
        panic!(
            "create_workspace should replace an existing tracked workspace but failed: {}",
            e
        )
    });

    // .jj must still be present.
    assert!(jj_dir.exists(), ".jj must exist after re-create");

    // Exactly one db record for this branch (no duplicate).
    let record = treq_lib::local_db::get_workspace_by_branch(&repo.repo_path, branch)
        .expect("Failed to query workspace by branch");
    assert!(
        record.is_some(),
        "Expected exactly one db record after re-create"
    );
    assert_eq!(
        record.unwrap().id,
        ws2.id,
        "Only the latest record should survive"
    );
}
