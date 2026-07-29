/// Integration tests verifying that no workspace is left with a stale working copy
/// after any history-rewriting jj operation.
///
/// Root-cause reference: `update_workspace_after_history_edit` (jj.rs) only checks out
/// `loaded.workspace` — the one workspace whose repo was loaded — but `rebase_descendants()`
/// rewrites the WC-commit of **every** sibling workspace in the repo.  Those siblings'
/// on-disk trees are never updated, so the next `jj` snapshot inverts every rewritten
/// commit into their working copy.
mod e2e_test_helpers;

use e2e_test_helpers::TestRepo;
use treq_lib::jj;

// ─── shared helpers ──────────────────────────────────────────────────────────

/// Assert that the working copy at `workspace_path` has **no** changes (is not stale / clean).
///
/// Uses `jj diff --stat` via the JJ binary so the assertion is independent of treq logic.
fn assert_working_copy_clean(workspace_path: &str) {
    let status = TestRepo::run_jj(workspace_path, &["st"]).unwrap_or_default();
    assert!(
        status.contains("The working copy has no changes."),
        "Expected working copy at '{}' to be clean, but got:\n{}",
        workspace_path,
        status
    );
}

/// Assert that the working copy at `workspace_path` does NOT contain a diff hunk that
/// removes `content` (i.e. does not undo a previously-committed addition).
fn assert_no_revert_hunk(workspace_path: &str, content: &str) {
    let diff = TestRepo::run_jj(workspace_path, &["diff", "--git"]).unwrap_or_default();
    assert!(
        !diff.contains(&format!("-{}", content)),
        "Working copy at '{}' contains a revert hunk for '{}'; diff:\n{}",
        workspace_path,
        content,
        diff
    );
}

// ─── test 1: the reported bug ─────────────────────────────────────────────────

/// After rebasing workspace A's lineage, workspace B (which descends from A) must not
/// end up with a stale working copy that inverts A's previously-committed changes.
///
/// Scenario (mirrors the real bug: treq-testing-ducks / default):
///   main ─► A (commits feature-a.txt)
///             └─► B (committed; empty WC at start of test)
///
///   We then add a new commit to main, rebase A's lineage onto the new main tip, and
///   verify B's working copy is still clean (no inverse diff of A's commits).
#[test]
fn sibling_workspace_not_stale_after_lineage_rebase() {
    let repo = TestRepo::new().expect("Failed to create test repo");
    let default_branch = repo.default_branch().to_string();

    // Create workspace A with a real file commit
    let ws_a = repo
        .create_workspace_with_commit("feat/ws-a", "feature-a.txt", "feature a content", None)
        .expect("Failed to create workspace with commit");
    let ws_a_path = repo.workspace_full_path(&ws_a);

    // Create workspace B stacked on top of A
    let ws_b = repo
        .create_workspace_with_commit(
            "feat/ws-b",
            "feature-b.txt",
            "feature b content",
            Some(&ws_a.branch_name),
        )
        .expect("Failed to create workspace with commit");
    let ws_b_path = repo.workspace_full_path(&ws_b);

    // Sanity: both working copies are clean before the rebase
    assert_working_copy_clean(&ws_a_path);
    assert_working_copy_clean(&ws_b_path);

    // Advance main: add a new commit to the base branch
    repo.commit_file(
        "main-advance.txt",
        "main advance content",
        "chore: advance main",
    )
    .expect("Failed to advance main");

    // Rebase A's lineage onto the new main tip
    jj::jj_rebase_workspace_bookmark_onto(&ws_a_path, &ws_a.branch_name, &default_branch)
        .expect("Failed to rebase workspace A lineage");

    // B must not be stale: its working copy should still be clean
    assert_working_copy_clean(&ws_b_path);

    // Specifically, B must not contain a hunk that reverts A's committed content
    assert_no_revert_hunk(&ws_b_path, "feature a content");
}

// ─── test 2: deferred rebase mode with non-empty WC ──────────────────────────

/// The deferred-checkout path must also leave sibling workspaces reconciled.
///
/// Before the fix, `jj_sync_working_copy_if_safe` only syncs when the WC is *empty*,
/// so a non-empty sibling WC after a deferred rebase was permanently stale.
#[test]
fn deferred_rebase_leaves_no_stale_working_copy() {
    let repo = TestRepo::new().expect("Failed to create test repo");
    let default_branch = repo.default_branch().to_string();

    // Workspace A with a committed file
    let ws_a = repo
        .create_workspace_with_commit("feat/deferred-a", "deferred-a.txt", "content-a", None)
        .expect("Failed to create workspace with commit");
    let ws_a_path = repo.workspace_full_path(&ws_a);

    // Workspace B stacked on A (also has a commit — non-empty WC to ensure
    // jj_sync_working_copy_if_safe won't silently skip it)
    let ws_b = repo
        .create_workspace_with_commit(
            "feat/deferred-b",
            "deferred-b.txt",
            "content-b",
            Some(&ws_a.branch_name),
        )
        .expect("Failed to create workspace with commit");
    let ws_b_path = repo.workspace_full_path(&ws_b);

    // Add a new commit to main to give the rebase something to do
    repo.commit_file(
        "main-deferred.txt",
        "main deferred",
        "chore: advance main for deferred test",
    )
    .expect("Failed to advance main");

    // Rebase A's lineage via the *deferred* path (the path that currently skips checkout)
    jj::jj_rebase_workspace_bookmark_onto_deferred_checkout(
        &ws_a_path,
        &ws_a.branch_name,
        &default_branch,
    )
    .expect("Failed to deferred-rebase workspace A");

    // B's working copy must still be clean — no inverse diff of A's committed changes
    assert_working_copy_clean(&ws_b_path);
    assert_no_revert_hunk(&ws_b_path, "content-a");
}

// ─── test 3: jj_abandon must not strand siblings ─────────────────────────────

/// `jj_abandon` rewrites descendants via `rebase_descendants()` but never called
/// `update_workspace_after_history_edit`.  A sibling workspace whose WC descends from
/// the abandoned commit must be reconciled.
#[test]
fn abandon_does_not_strand_sibling_working_copy() {
    let repo = TestRepo::new().expect("Failed to create test repo");

    // Workspace A: we will abandon its tip commit
    let ws_a = repo
        .create_workspace_with_commit("feat/abandon-a", "abandon-a.txt", "content-abandon-a", None)
        .expect("Failed to create workspace with commit");
    let ws_a_path = repo.workspace_full_path(&ws_a);

    // Workspace B stacked on A's commit
    let ws_b = repo
        .create_workspace_with_commit(
            "feat/abandon-b",
            "abandon-b.txt",
            "content-abandon-b",
            Some(&ws_a.branch_name),
        )
        .expect("Failed to create workspace with commit");
    let ws_b_path = repo.workspace_full_path(&ws_b);

    // Sanity pre-condition
    assert_working_copy_clean(&ws_a_path);
    assert_working_copy_clean(&ws_b_path);

    // Abandon A's tip commit (the one that added abandon-a.txt)
    // We need the change id; get it from jj log
    let log = TestRepo::run_jj(
        &ws_a_path,
        &[
            "log",
            "--no-graph",
            "-r",
            &ws_a.branch_name,
            "--template",
            "change_id",
        ],
    )
    .expect("Failed to get log for ws_a");
    let change_id = log.trim().to_string();

    jj::jj_abandon(&ws_a_path, &change_id).expect("Failed to abandon commit");

    // B's working copy must not have been made stale by the abandon
    assert_working_copy_clean(&ws_b_path);
    assert_no_revert_hunk(&ws_b_path, "content-abandon-a");
}

// ─── test 4: update_stale_workspace is safe to call idempotently ─────────────

/// `update_stale_workspace` must be safe to call on a workspace that is already clean —
/// it must not introduce changes or corrupt the working copy.  This guards the self-healing
/// call sites in core/workspaces.rs and elsewhere that call it defensively after operations.
///
/// Additionally, after a rebase that already reconciled siblings, a follow-up call to
/// `update_stale_workspace` must leave the workspace still clean (no inverse diff reintroduced).
#[test]
fn update_stale_workspace_is_idempotent() {
    let repo = TestRepo::new().expect("Failed to create test repo");
    let default_branch = repo.default_branch().to_string();

    // Workspace A with a committed file
    let ws_a = repo
        .create_workspace_with_commit("feat/idem-a", "idem-a.txt", "idem-a-content", None)
        .expect("Failed to create workspace with commit");
    let ws_a_path = repo.workspace_full_path(&ws_a);

    // Workspace B stacked on A
    let ws_b = repo
        .create_workspace_with_commit(
            "feat/idem-b",
            "idem-b.txt",
            "idem-b-content",
            Some(&ws_a.branch_name),
        )
        .expect("Failed to create workspace with commit");
    let ws_b_path = repo.workspace_full_path(&ws_b);

    // Advance main and rebase A (our fix reconciles B automatically)
    repo.commit_file(
        "main-idem.txt",
        "main idem",
        "chore: advance main for idem test",
    )
    .expect("Failed to advance main");
    jj::jj_rebase_workspace_bookmark_onto(&ws_a_path, &ws_a.branch_name, &default_branch)
        .expect("Failed to rebase A");

    // B should already be clean after the rebase (our fix reconciles it)
    assert_working_copy_clean(&ws_b_path);

    // Calling update_stale_workspace again must be harmless (idempotent)
    jj::update_stale_workspace(&ws_b_path).expect("update_stale_workspace should not fail");
    assert_working_copy_clean(&ws_b_path);

    // And again — triple-call to confirm no state corruption
    jj::update_stale_workspace(&ws_b_path).expect("update_stale_workspace should not fail");
    assert_working_copy_clean(&ws_b_path);

    // No inverse hunk for A's committed content
    assert_no_revert_hunk(&ws_b_path, "idem-a-content");
}
