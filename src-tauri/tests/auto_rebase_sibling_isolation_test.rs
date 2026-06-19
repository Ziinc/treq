/// Investigates whether `rebase_after_commit` leaves stale working copies on stacked
/// workspaces — the working-copy-staleness hypothesis for the live-repo conflict bug.
///
/// Live-repo symptom: after auto-rebase, workspaces `treq-test-chicken` and
/// `treq/now-ducks-rule-the-world` end up as conflict commits.  The topology is *stacked*
/// (now-ducks-rule is a child of treq-test-chicken), not sibling.  Hypothesis: the
/// auto-rebase path leaves a stale on-disk WC tree; the next jj snapshot inverts the
/// parent's committed content into the workspace, producing a spurious conflict.
///
/// If the assertions below FAIL → WC reconciliation gap confirmed.
/// If they PASS → the conflict is a genuine content conflict (workspace edit authored
///   against a different base than main), not a staleness issue.
mod e2e_test_helpers;

use e2e_test_helpers::TestRepo;
use treq_lib::local_db::Workspace;

// ─── helpers ─────────────────────────────────────────────────────────────────

fn workspace_full_path(repo: &TestRepo, ws: &Workspace) -> String {
    repo.workspaces_dir()
        .join(&ws.workspace_path)
        .to_string_lossy()
        .to_string()
}

/// Assert that the working copy at `workspace_path` has no pending changes.
/// A stale tree would show up as a non-empty `jj st` on the very next invocation.
fn assert_working_copy_clean(label: &str, workspace_path: &str) {
    let st = TestRepo::run_jj(workspace_path, &["st"]).unwrap_or_default();
    println!("[{label}] jj st:\n{st}");
    assert!(
        st.contains("The working copy has no changes."),
        "[{label}] Expected clean WC at '{workspace_path}', got:\n{st}"
    );
}

/// Assert that the working copy does NOT contain a hunk removing `content`
/// (stale-tree snapshot signature: parent's committed text reverted into the WC).
fn assert_no_revert_hunk(label: &str, workspace_path: &str, content: &str) {
    let diff = TestRepo::run_jj(workspace_path, &["diff", "--git"]).unwrap_or_default();
    println!("[{label}] jj diff --git:\n{diff}");
    assert!(
        !diff.contains(&format!("-{content}")),
        "[{label}] WC at '{workspace_path}' contains a revert hunk for '{content}'"
    );
}

/// Create a workspace, write `filename` with `content`, and commit it.
fn create_workspace_with_commit(
    repo: &TestRepo,
    branch_name: &str,
    filename: &str,
    content: &str,
    source_branch: Option<&str>,
) -> Workspace {
    let ws = treq_lib::core::create_workspace(
        &repo.repo_path,
        branch_name,
        Some(branch_name.to_string()),
        None,
        source_branch,
        None,
    )
    .unwrap_or_else(|e| panic!("Failed to create workspace '{branch_name}': {e}"));

    let full_path = workspace_full_path(repo, &ws);
    TestRepo::write_workspace_file(&full_path, filename, content)
        .unwrap_or_else(|e| panic!("Failed to write '{filename}': {e}"));
    treq_lib::core::commit_workspace(&repo.repo_path, ws.id, &format!("Add {filename}"))
        .unwrap_or_else(|e| panic!("Failed to commit '{filename}': {e}"));

    ws
}

// ─── test ────────────────────────────────────────────────────────────────────

/// Stacked topology mirroring the live-repo bug:
///
///   main ──► chicken-base (README has "chicken rules")
///                 └─► ws-duck  (feat/duck-fencing,  adds "## duck fencing" section)
///                       └─► ws-rule (feat/ducks-rule, adds "## ducks rule" section)
///
/// Both ws-duck and ws-rule target the default branch.  main then advances.
/// `rebase_after_commit` is the real production entry point.
///
/// After the rebase, each workspace's on-disk WC must be clean:
///   - no stale snapshot (jj st is empty)
///   - no inverse diff of a parent's committed content (stale-tree signature)
///
/// FAIL → WC reconciliation gap confirmed (stale tree → spurious conflict).
/// PASS → WC hypothesis disproven; live-repo conflict is a genuine content conflict.
#[test]
fn test_auto_rebase_does_not_leave_stale_working_copy_on_stacked_workspaces() {
    let repo = TestRepo::new().expect("Failed to create test repo");
    let default_branch = repo.default_branch().to_string();

    // ── build the stacked topology ──────────────────────────────────────────

    // chicken-base: stacked on main, introduces a README with a shared prefix.
    // Using a unique filename avoids a content conflict with main's README.md.
    let chicken_base = create_workspace_with_commit(
        &repo,
        "feat/chicken-base",
        "CHICKEN.md",
        "# chicken rules\n",
        None,
    );

    // ws-duck: stacked on chicken-base, appends a duck-fencing section.
    let ws_duck = create_workspace_with_commit(
        &repo,
        "feat/duck-fencing",
        "CHICKEN.md",
        "# chicken rules\n\n## duck fencing\n\nUse a sturdy fence.\n",
        Some(&chicken_base.branch_name),
    );
    let ws_duck_path = workspace_full_path(&repo, &ws_duck);

    // ws-rule: stacked on ws-duck, appends a ducks-rule section.
    let ws_rule = create_workspace_with_commit(
        &repo,
        "feat/ducks-rule",
        "CHICKEN.md",
        "# chicken rules\n\n## duck fencing\n\nUse a sturdy fence.\n\n## ducks rule\n\nYes they do.\n",
        Some(&ws_duck.branch_name),
    );
    let ws_rule_path = workspace_full_path(&repo, &ws_rule);

    // Point both workspaces at the default branch (they already are by default,
    // but be explicit so the auto-rebase filter picks them up).
    treq_lib::local_db::update_workspace_target_branch(
        &repo.repo_path,
        ws_duck.id,
        &default_branch,
    )
    .expect("Failed to set target branch on ws_duck");
    treq_lib::local_db::update_workspace_target_branch(
        &repo.repo_path,
        ws_rule.id,
        &default_branch,
    )
    .expect("Failed to set target branch on ws_rule");

    // ── sanity: WCs are clean before we do anything ─────────────────────────
    assert_working_copy_clean("ws_duck pre-rebase", &ws_duck_path);
    assert_working_copy_clean("ws_rule pre-rebase", &ws_rule_path);

    // ── advance main ─────────────────────────────────────────────────────────
    repo.commit_file(
        "main-advance.txt",
        "main advance\n",
        "chore: advance main",
    )
    .expect("Failed to advance main");

    // ── trigger auto-rebase (production entry point) ─────────────────────────
    treq_lib::auto_rebase::rebase_after_commit(&repo.repo_path, &default_branch)
        .expect("rebase_after_commit should not error");

    // ── assertions: WC must be clean after rebase ────────────────────────────
    assert_working_copy_clean("ws_duck post-rebase", &ws_duck_path);
    assert_working_copy_clean("ws_rule post-rebase", &ws_rule_path);

    // No inverse diff of a parent's committed content (stale-tree signature).
    assert_no_revert_hunk("ws_duck post-rebase", &ws_duck_path, "# chicken rules");
    assert_no_revert_hunk("ws_rule post-rebase", &ws_rule_path, "# chicken rules");
    assert_no_revert_hunk("ws_rule post-rebase", &ws_rule_path, "## duck fencing");
}
