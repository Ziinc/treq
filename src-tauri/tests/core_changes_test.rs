mod e2e_test_helpers;

use e2e_test_helpers::TestRepo;

fn get_change_id(cwd: &str, rev: &str) -> Result<String, String> {
    let output = TestRepo::run_jj(cwd, &["log", "-r", rev, "--no-graph", "-T", "change_id\n"])?;
    Ok(output.trim().to_string())
}

#[test]
fn test_list_conflicted_files_no_conflicts() {
    let repo = TestRepo::new().expect("Failed to create test repo");

    let workspace = treq_lib::core::create_workspace(
        &repo.repo_path,
        "feat/no-conflicts",
        Some("no conflicts test".to_string()),
        None,
        None,
        None,
        None,
    )
    .expect("Failed to create workspace");

    let workspace_path = repo.workspaces_dir().join(&workspace.workspace_path);
    let workspace_path_str = workspace_path.to_str().unwrap();

    // Write a clean file and commit — no conflicts
    TestRepo::write_workspace_file(workspace_path_str, "clean.txt", "no conflicts here")
        .expect("Failed to write file");
    treq_lib::core::commit_workspace(&repo.repo_path, workspace.id, "clean commit")
        .expect("Failed to commit");

    let result = treq_lib::jj::get_conflicted_files(workspace_path_str, None)
        .expect("get_conflicted_files should succeed on clean workspace");

    assert_eq!(
        result,
        Vec::<String>::new(),
        "Expected no conflicted files in a clean workspace"
    );
}

#[test]
fn test_list_conflicted_files_with_conflicts() {
    let repo = TestRepo::new().expect("Failed to create test repo");

    let workspace = treq_lib::core::create_workspace(
        &repo.repo_path,
        "feat/with-conflicts",
        Some("conflict test".to_string()),
        None,
        None,
        None,
        None,
    )
    .expect("Failed to create workspace");

    let workspace_path = repo.workspaces_dir().join(&workspace.workspace_path);
    let workspace_path_str = workspace_path.to_str().unwrap();

    // In workspace: create conflict.txt and commit → sibling change A
    TestRepo::write_workspace_file(workspace_path_str, "conflict.txt", "workspace version\n")
        .expect("Failed to write conflict.txt in workspace");
    treq_lib::core::commit_workspace(&repo.repo_path, workspace.id, "workspace commit")
        .expect("Failed to commit in workspace");

    let ws_change_id =
        get_change_id(workspace_path_str, "@-").expect("Failed to get workspace change_id");

    // In main repo working copy: create conflict.txt with different content and commit → sibling change B
    // Both A and B descend from the same parent (init), so rebasing A onto B creates a conflict.
    repo.create_file("conflict.txt", "main version\n")
        .expect("Failed to write conflict.txt in main repo");
    treq_lib::jj::jj_commit(&repo.repo_path, "main commit").expect("Failed to commit in main repo");

    let main_change_id =
        get_change_id(&repo.repo_path, "@-").expect("Failed to get main change_id");

    // In workspace: create a merge commit with both changes as parents.
    // Since ws_change and main_change both add conflict.txt with different content
    // from a common ancestor that doesn't have it, jj creates a conflict in @.
    TestRepo::run_jj(workspace_path_str, &["new", &ws_change_id, &main_change_id])
        .expect("Failed to create merge commit in workspace");

    // get_conflicted_files should now return conflict.txt
    let result = treq_lib::jj::get_conflicted_files(workspace_path_str, None)
        .expect("get_conflicted_files should not error on workspace with conflicts");

    assert!(
        result.contains(&"conflict.txt".to_string()),
        "Expected conflict.txt in conflicted files, got: {:?}",
        result
    );
}

#[test]
fn test_workspace_status_invariant_no_conflicts_for_divergent_non_conflicting_edits() {
    let repo = TestRepo::new().expect("Failed to create test repo");

    let base_workspace = treq_lib::core::create_workspace(
        &repo.repo_path,
        "feature-base",
        Some("base".to_string()),
        None,
        None,
        None,
        None,
    )
    .expect("Failed to create base workspace");
    let base_path = repo.workspaces_dir().join(&base_workspace.workspace_path);
    let base_path_str = base_path.to_str().unwrap();

    let stacked_workspace = treq_lib::core::create_workspace(
        &repo.repo_path,
        "feat/divergent",
        Some("stacked".to_string()),
        None,
        Some("feature-base"),
        None,
        None,
    )
    .expect("Failed to create stacked workspace");
    let stacked_path = repo
        .workspaces_dir()
        .join(&stacked_workspace.workspace_path);
    let stacked_path_str = stacked_path.to_str().unwrap();

    TestRepo::write_workspace_file(base_path_str, "base-only.txt", "base change\n")
        .expect("Failed to write base-only.txt");
    treq_lib::core::commit_workspace(&repo.repo_path, base_workspace.id, "base commit")
        .expect("Failed to commit base workspace");

    TestRepo::write_workspace_file(stacked_path_str, "stacked-only.txt", "stacked change\n")
        .expect("Failed to write stacked-only.txt");
    treq_lib::core::commit_workspace(&repo.repo_path, stacked_workspace.id, "stacked commit")
        .expect("Failed to commit stacked workspace");

    let status = treq_lib::core::workspace_status(&repo.repo_path, Some(stacked_workspace.id))
        .expect("workspace_status should succeed");
    assert!(
        !status.partial.has_conflicts,
        "Divergent non-conflicting edits must not set has_conflicts"
    );
    assert!(
        status.conflicted_files.is_empty(),
        "Divergent non-conflicting edits must not report conflicted files: {:?}",
        status.conflicted_files
    );
}

#[test]
fn test_workspace_status_invariant_unresolved_conflicts_require_conflicted_files() {
    let repo = TestRepo::new().expect("Failed to create test repo");

    let workspace = treq_lib::core::create_workspace(
        &repo.repo_path,
        "feat/conflict",
        Some("conflict".to_string()),
        None,
        None,
        None,
        None,
    )
    .expect("Failed to create workspace");
    let workspace_path = repo.workspaces_dir().join(&workspace.workspace_path);
    let workspace_path_str = workspace_path.to_str().unwrap();

    TestRepo::write_workspace_file(workspace_path_str, "README.md", "workspace side\n")
        .expect("Failed to write workspace README");
    treq_lib::core::commit_workspace(&repo.repo_path, workspace.id, "workspace commit")
        .expect("Failed to commit workspace");
    let ws_change_id =
        get_change_id(workspace_path_str, "@-").expect("Failed to get workspace change_id");

    repo.create_file("README.md", "main side\n")
        .expect("Failed to write main README");
    treq_lib::jj::jj_commit(&repo.repo_path, "main commit").expect("Failed to commit in main");
    let main_change_id =
        get_change_id(&repo.repo_path, "@-").expect("Failed to get main change_id");

    TestRepo::run_jj(workspace_path_str, &["new", &ws_change_id, &main_change_id])
        .expect("Failed to create unresolved conflict");

    let status = treq_lib::core::workspace_status(&repo.repo_path, Some(workspace.id))
        .expect("workspace_status should succeed");
    let conflicted_files = treq_lib::jj::get_conflicted_files(workspace_path_str, None)
        .expect("get_conflicted_files should succeed for conflict workspace");
    assert!(
        conflicted_files.contains(&"README.md".to_string()),
        "Expected README.md in conflicted files, got: {:?}",
        conflicted_files
    );

    assert!(
        status.partial.has_conflicts,
        "Unresolved conflict must set has_conflicts=true"
    );
    assert!(
        status.conflicted_files.contains(&"README.md".to_string()),
        "Unresolved conflict must include README.md in conflicted_files: {:?}",
        status.conflicted_files
    );
}

#[test]
fn test_list_conflicted_files_preserves_deleted_side_conflict_path() {
    let repo = TestRepo::new().expect("Failed to create test repo");

    repo.create_file("README.md", "line1\nline2\n")
        .expect("Failed to create base README");
    treq_lib::jj::jj_commit(&repo.repo_path, "base commit").expect("Failed to commit base");

    let workspace = treq_lib::core::create_workspace(
        &repo.repo_path,
        "feat/deleted-side-conflict",
        Some("deleted side conflict".to_string()),
        None,
        None,
        None,
        None,
    )
    .expect("Failed to create workspace");
    let workspace_path = repo.workspaces_dir().join(&workspace.workspace_path);
    let workspace_path_str = workspace_path.to_str().unwrap();

    TestRepo::write_workspace_file(workspace_path_str, "README.md", "line1\n")
        .expect("Failed to update workspace README");
    treq_lib::core::commit_workspace(&repo.repo_path, workspace.id, "workspace commit")
        .expect("Failed to commit workspace");
    let ws_change_id =
        get_change_id(workspace_path_str, "@-").expect("Failed to get workspace change_id");

    repo.create_file("README.md", "line1\nline2 modified on main\n")
        .expect("Failed to modify README on main");
    treq_lib::jj::jj_commit(&repo.repo_path, "main modify").expect("Failed to commit main");
    let main_change_id =
        get_change_id(&repo.repo_path, "@-").expect("Failed to get main change_id");

    TestRepo::run_jj(workspace_path_str, &["new", &ws_change_id, &main_change_id])
        .expect("Failed to create merge commit with deleted-side content conflict");

    let conflicted_files = treq_lib::jj::get_conflicted_files(workspace_path_str, None)
        .expect("get_conflicted_files should succeed");
    assert!(
        conflicted_files.contains(&"README.md".to_string()),
        "Expected deleted-side conflict path to be preserved, got: {:?}",
        conflicted_files
    );
}

#[test]
fn test_list_conflicted_files_is_deterministic_and_deduped() {
    let repo = TestRepo::new().expect("Failed to create test repo");

    let workspace = treq_lib::core::create_workspace(
        &repo.repo_path,
        "feat/multi-conflicts",
        Some("multi conflict test".to_string()),
        None,
        None,
        None,
        None,
    )
    .expect("Failed to create workspace");
    let workspace_path = repo.workspaces_dir().join(&workspace.workspace_path);
    let workspace_path_str = workspace_path.to_str().unwrap();

    TestRepo::write_workspace_file(workspace_path_str, "z.txt", "workspace z\n")
        .expect("Failed to write z.txt in workspace");
    TestRepo::write_workspace_file(workspace_path_str, "a.txt", "workspace a\n")
        .expect("Failed to write a.txt in workspace");
    treq_lib::core::commit_workspace(&repo.repo_path, workspace.id, "workspace commit")
        .expect("Failed to commit workspace");
    let ws_change_id =
        get_change_id(workspace_path_str, "@-").expect("Failed to get workspace change_id");

    repo.create_file("z.txt", "main z\n")
        .expect("Failed to write z.txt in main");
    repo.create_file("a.txt", "main a\n")
        .expect("Failed to write a.txt in main");
    treq_lib::jj::jj_commit(&repo.repo_path, "main commit").expect("Failed to commit in main");
    let main_change_id =
        get_change_id(&repo.repo_path, "@-").expect("Failed to get main change_id");

    TestRepo::run_jj(workspace_path_str, &["new", &ws_change_id, &main_change_id])
        .expect("Failed to create merge commit with conflicts");

    let conflicted_files = treq_lib::jj::get_conflicted_files(workspace_path_str, None)
        .expect("get_conflicted_files should succeed");
    assert_eq!(
        conflicted_files,
        vec!["a.txt".to_string(), "z.txt".to_string()],
        "Expected deterministic sorted, deduplicated conflicted files"
    );
}

#[test]
fn test_list_conflicted_files_none_target_defaults_to_repo_default_branch() {
    let repo = TestRepo::new().expect("Failed to create test repo");

    let workspace = treq_lib::core::create_workspace(
        &repo.repo_path,
        "feat/default-main-target",
        Some("default main target".to_string()),
        None,
        None,
        None,
        None,
    )
    .expect("Failed to create workspace");
    let workspace_path = repo.workspaces_dir().join(&workspace.workspace_path);
    let workspace_path_str = workspace_path.to_str().unwrap();

    TestRepo::write_workspace_file(workspace_path_str, "conflict.txt", "workspace version\n")
        .expect("Failed to write conflict.txt in workspace");
    treq_lib::core::commit_workspace(&repo.repo_path, workspace.id, "workspace commit")
        .expect("Failed to commit in workspace");

    repo.create_file("conflict.txt", "main version\n")
        .expect("Failed to write conflict.txt in main repo");
    treq_lib::jj::jj_commit(&repo.repo_path, "main commit").expect("Failed to commit in main repo");

    let default_branch =
        treq_lib::jj::get_default_branch(&repo.repo_path).expect("default branch should resolve");

    let via_none = treq_lib::jj::get_conflicted_files(workspace_path_str, None)
        .expect("get_conflicted_files(None) should succeed");
    let via_default = treq_lib::jj::get_conflicted_files(workspace_path_str, Some(&default_branch))
        .expect("get_conflicted_files(Some(default_branch)) should succeed");

    assert_eq!(
        via_none, via_default,
        "None target must default to repo default-branch diff semantics"
    );
}

/// Conflicts that live only in the committed tip (clean working copy on top of a
/// conflicted tree) must still be discovered — including when the "target" for the
/// conflict query is the workspace's own branch tip (same tree as WC, so a
/// pairwise tree-diff emits nothing). Detection must walk the tree's own conflicts.
#[test]
fn test_detects_conflicts_in_committed_tip_when_tree_diff_is_empty() {
    let repo = TestRepo::new().expect("Failed to create test repo");

    let workspace = treq_lib::core::create_workspace(
        &repo.repo_path,
        "feat/committed-conflict",
        Some("committed conflict".to_string()),
        None,
        None,
        None,
        None,
    )
    .expect("Failed to create workspace");
    let workspace_path = repo.workspaces_dir().join(&workspace.workspace_path);
    let workspace_path_str = workspace_path.to_str().unwrap();

    TestRepo::write_workspace_file(workspace_path_str, "shared.txt", "workspace side\n")
        .expect("Failed to write workspace shared.txt");
    treq_lib::core::commit_workspace(&repo.repo_path, workspace.id, "workspace commit")
        .expect("Failed to commit workspace");
    let ws_change_id =
        get_change_id(workspace_path_str, "@-").expect("Failed to get workspace change_id");

    repo.create_file("shared.txt", "main side\n")
        .expect("Failed to write main shared.txt");
    treq_lib::jj::jj_commit(&repo.repo_path, "main commit").expect("Failed to commit main");
    let main_change_id =
        get_change_id(&repo.repo_path, "@-").expect("Failed to get main change_id");

    // Conflicted merge becomes the working-copy commit.
    TestRepo::run_jj(workspace_path_str, &["new", &ws_change_id, &main_change_id])
        .expect("Failed to create conflicted merge");

    // Point the workspace bookmark at the conflicted tip, then create an empty
    // working-copy child so the conflict lives only in "committed" history while
    // the WC itself has no dirty files.
    TestRepo::run_jj(
        workspace_path_str,
        &[
            "bookmark",
            "set",
            "feat/committed-conflict",
            "-r",
            "@",
            "--allow-backwards",
        ],
    )
    .expect("Failed to point bookmark at conflicted tip");
    TestRepo::run_jj(workspace_path_str, &["new", "@"])
        .expect("Failed to create empty WC on conflicted tip");

    let changed = treq_lib::jj::jj_get_changed_files(workspace_path_str)
        .expect("jj_get_changed_files should succeed");
    assert!(
        changed.is_empty(),
        "WC must be clean so the conflict is committed-only, got {:?}",
        changed
    );
    assert!(
        treq_lib::jj::workspace_has_unresolved_conflicts(workspace_path_str)
            .expect("workspace_has_unresolved_conflicts should succeed"),
        "conflicted tip must leave WC tree unresolved"
    );

    // Querying with the workspace branch as target makes before/after trees
    // identical — pairwise diff finds nothing. Tree.conflicts() must still win.
    let conflicted_files = treq_lib::jj::get_conflicted_files(
        workspace_path_str,
        Some("feat/committed-conflict"),
    )
    .expect("get_conflicted_files should succeed for committed-tip conflicts");
    assert!(
        conflicted_files.contains(&"shared.txt".to_string()),
        "committed-tip conflict must be reported even when tree-diff is empty, got {:?}",
        conflicted_files
    );

    let status = treq_lib::core::workspace_status(&repo.repo_path, Some(workspace.id))
        .expect("workspace_status should succeed");
    assert!(
        status.partial.has_conflicts,
        "workspace status must flag conflicts that live in committed tip"
    );
    assert!(
        status
            .conflicted_files
            .contains(&"shared.txt".to_string()),
        "workspace status must list committed-tip conflicted files, got {:?}",
        status.conflicted_files
    );
}
