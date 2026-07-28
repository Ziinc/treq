/// Replicates the stacked-workspace fork bug: after auto-rebase the graph forks instead
/// of staying linear.
///
/// Root cause: when a child workspace is created stacked on a parent, the parent's
/// working-copy commit (`wo`, a child of the parent bookmark `tsy`) is NOT used as the
/// stack base — jj.rs:1271-1302 only selects the parent WC as base if its parents equal
/// the bookmark's parents (a sibling, not a child), so it falls back to `bookmark_id`.
/// The child therefore starts as a sibling of `wo` off `tsy`. Auto-rebase preserves the
/// fork because `roots(main..ducks-bookmark)` is bookmark-relative and cannot see `wo`.
///
/// Expected lineage: main → tsy → wo → uorp → xvl (straight)
/// Observed lineage: tsy has two children — wo (chicken WC) and uorp (ducks bookmark)
mod e2e_test_helpers;

use e2e_test_helpers::TestRepo;
use treq_lib::jj;
use treq_lib::local_db::Workspace;

// ─── helpers ─────────────────────────────────────────────────────────────────

fn workspace_full_path(repo: &TestRepo, ws: &Workspace) -> String {
    repo.workspaces_dir()
        .join(&ws.workspace_path)
        .to_string_lossy()
        .to_string()
}

/// Return the full commit id of the workspace's current `@` commit.
fn workspace_wc_commit(workspace_path: &str) -> String {
    TestRepo::run_jj(
        workspace_path,
        &["log", "--no-graph", "-r", "@", "-T", "commit_id"],
    )
    .unwrap_or_default()
    .trim()
    .to_string()
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

// ─── test 1: fork replication ─────────────────────────────────────────────────

/// After auto-rebase, the stacked pair must form a straight line:
///   main → chicken-bookmark → chicken-wc → ducks-bookmark → ducks-wc
///
/// FAILS on current code: chicken's working-copy commit `wo` and the ducks bookmark
/// `uorp` are siblings under the chicken bookmark `tsy`, not a straight line.
#[test]
fn test_stacked_workspace_lineage_stays_linear_after_auto_rebase() {
    let repo = TestRepo::new().expect("Failed to create test repo");
    let default_branch = repo.default_branch().to_string();

    // chicken workspace stacked directly on main
    let chicken = create_workspace_with_commit(
        &repo,
        "feat/chicken",
        "chicken.txt",
        "chicken content\n",
        None,
    );
    let chicken_path = workspace_full_path(&repo, &chicken);

    // ducks workspace stacked on chicken
    let ducks = create_workspace_with_commit(
        &repo,
        "feat/ducks",
        "ducks.txt",
        "ducks content\n",
        Some(&chicken.branch_name),
    );

    treq_lib::local_db::update_workspace_target_branch(
        &repo.repo_path,
        chicken.id,
        &default_branch,
    )
    .expect("Failed to set target branch on chicken");
    treq_lib::local_db::update_workspace_target_branch(&repo.repo_path, ducks.id, &default_branch)
        .expect("Failed to set target branch on ducks");

    // Print pre-rebase graph so the test output shows the starting topology.
    let pre_graph = TestRepo::run_jj(
        &repo.repo_path,
        &[
            "log",
            "--no-graph",
            "-r",
            "all()",
            "-T",
            "commit_id.short() ++ \" | \" ++ bookmarks ++ \" | \" ++ description.first_line() ++ \"\\n\"",
        ],
    )
    .unwrap_or_default();
    println!("=== pre-rebase graph ===\n{pre_graph}");

    // Advance main.
    repo.commit_file("main-advance.txt", "advance\n", "chore: advance main")
        .expect("Failed to advance main");

    // Capture chicken's WC commit before the rebase (it will be rewritten but position
    // relative to ducks is what we care about after).
    let chicken_wc_before = workspace_wc_commit(&chicken_path);
    println!("chicken WC before rebase: {chicken_wc_before}");

    // Run the production auto-rebase entry point.
    treq_lib::auto_rebase::rebase_after_commit(&repo.repo_path, &default_branch)
        .expect("rebase_after_commit should not error");

    // Print post-rebase graph for evidence.
    let post_graph = TestRepo::run_jj(
        &repo.repo_path,
        &[
            "log",
            "--no-graph",
            "-r",
            "all()",
            "-T",
            "commit_id.short() ++ \" | \" ++ bookmarks ++ \" | \" ++ description.first_line() ++ \"\\n\"",
        ],
    )
    .unwrap_or_default();
    println!("=== post-rebase graph ===\n{post_graph}");

    let chicken_wc_after = workspace_wc_commit(&chicken_path);
    let chicken_bm = jj::jj_get_commit_id(&repo.repo_path, &chicken.branch_name)
        .expect("Failed to resolve chicken bookmark");
    let ducks_bm = jj::jj_get_commit_id(&repo.repo_path, &ducks.branch_name)
        .expect("Failed to resolve ducks bookmark");

    println!("chicken bookmark:   {chicken_bm}");
    println!("chicken WC (after): {chicken_wc_after}");
    println!("ducks bookmark:     {ducks_bm}");

    // PRIMARY assertion: ducks bookmark must be a descendant of chicken's WC commit.
    // If they are siblings (the bug), ancestors(ducks_bm) does not contain chicken_wc.
    let ancestors_check = TestRepo::run_jj(
        &repo.repo_path,
        &[
            "log",
            "--no-graph",
            "-r",
            &format!("{chicken_wc_after} & ancestors({ducks_bm})"),
            "-T",
            "commit_id",
        ],
    )
    .unwrap_or_default();
    assert!(
        !ancestors_check.trim().is_empty(),
        "ducks bookmark ({ducks_bm}) must be a descendant of chicken's WC commit \
         ({chicken_wc_after}); got empty — they are siblings (fork bug)"
    );

    // CORROBORATING: chicken bookmark must have exactly one child (the chicken WC, not also
    // the ducks bookmark). Two children means the fork exists.
    let children_of_chicken_bm = TestRepo::run_jj(
        &repo.repo_path,
        &[
            "log",
            "--no-graph",
            "-r",
            &format!("children({chicken_bm})"),
            "-T",
            "commit_id ++ \"\\n\"",
        ],
    )
    .unwrap_or_default();
    let child_count = children_of_chicken_bm
        .lines()
        .filter(|l| !l.trim().is_empty())
        .count();
    assert_eq!(
        child_count, 1,
        "chicken bookmark ({chicken_bm}) must have exactly 1 child (its WC commit), \
         but has {child_count} — the ducks bookmark is forked as a sibling (fork bug)\n\
         children:\n{children_of_chicken_bm}"
    );
}

// ─── test 2: WC-staleness regression (disproven hypothesis, kept as coverage) ──

/// Verifies that auto-rebase does not leave stale on-disk working copies on a stacked pair.
/// This was the initial hypothesis for the live-repo conflict bug; it was disproven
/// (the reconciliation path already works), but the test is kept as regression coverage.
#[test]
fn test_auto_rebase_does_not_leave_stale_working_copy_on_stacked_workspaces() {
    let repo = TestRepo::new().expect("Failed to create test repo");
    let default_branch = repo.default_branch().to_string();

    let chicken_base = create_workspace_with_commit(
        &repo,
        "feat/chicken-base",
        "CHICKEN.md",
        "# chicken rules\n",
        None,
    );
    let ws_duck = create_workspace_with_commit(
        &repo,
        "feat/duck-fencing",
        "CHICKEN.md",
        "# chicken rules\n\n## duck fencing\n\nUse a sturdy fence.\n",
        Some(&chicken_base.branch_name),
    );
    let ws_duck_path = workspace_full_path(&repo, &ws_duck);
    let ws_rule = create_workspace_with_commit(
        &repo,
        "feat/ducks-rule",
        "CHICKEN.md",
        "# chicken rules\n\n## duck fencing\n\nUse a sturdy fence.\n\n## ducks rule\n\nYes they do.\n",
        Some(&ws_duck.branch_name),
    );
    let ws_rule_path = workspace_full_path(&repo, &ws_rule);

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

    repo.commit_file("main-advance.txt", "main advance\n", "chore: advance main")
        .expect("Failed to advance main");

    treq_lib::auto_rebase::rebase_after_commit(&repo.repo_path, &default_branch)
        .expect("rebase_after_commit should not error");

    for (label, path) in [("ws_duck", &ws_duck_path), ("ws_rule", &ws_rule_path)] {
        let st = TestRepo::run_jj(path, &["st"]).unwrap_or_default();
        println!("[{label}] jj st:\n{st}");
        assert!(
            st.contains("The working copy has no changes."),
            "[{label}] Expected clean WC at '{path}', got:\n{st}"
        );
        let diff = TestRepo::run_jj(path, &["diff", "--git"]).unwrap_or_default();
        println!("[{label}] jj diff --git:\n{diff}");
    }
}
