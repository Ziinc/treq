mod e2e_test_helpers;

use e2e_test_helpers::TestRepo;
use std::path::Path;
use treq_lib::local_db::Workspace;

fn workspace_write_file(repo: &TestRepo, ws: &Workspace, path: &str, content: &str) {
    let dir = repo.workspaces_dir().join(&ws.workspace_path);
    let dir_str = dir.to_str().unwrap();
    TestRepo::write_workspace_file(dir_str, path, content).unwrap();
}

fn workspace_diff_paths(repo: &TestRepo, ws: &Workspace) -> Vec<String> {
    init_test_app_db(repo, Some("git"));
    treq_lib::core::workspace_diff(&repo.repo_path, ws.id)
        .unwrap()
        .committed_files
        .iter()
        .map(|f| f.path.clone())
        .collect()
}

fn workspace_diff_fixture_conflicted_files(repo: &TestRepo, ws: &Workspace) -> Vec<String> {
    let workspace_dir = repo.workspaces_dir().join(&ws.workspace_path);
    let workspace_dir_str = workspace_dir.to_str().unwrap();

    treq_lib::jj::get_conflicted_files(workspace_dir_str, None)
        .expect("get_conflicted_files should succeed")
}

fn test_app_data_dir(repo: &TestRepo) -> std::path::PathBuf {
    Path::new(&repo.repo_path).join(".treq")
}

fn init_test_app_db(repo: &TestRepo, conflict_marker_style: Option<&str>) {
    let app_dir = test_app_data_dir(repo);
    let db_path = app_dir.join("treq.db");
    let db = treq_lib::db::Database::new(db_path).expect("test app db should be openable");
    db.init().expect("test app db should initialize");
    if let Some(style) = conflict_marker_style {
        db.set_setting("conflict_marker_style", style)
            .expect("setting conflict marker style should succeed");
    }
}

#[test]
fn test_only_shows_workspace_changes() {
    let repo = TestRepo::new().unwrap();
    repo.commit_file("base.txt", "base", "base").unwrap();
    let ws =
        treq_lib::core::create_workspace(&repo.repo_path, "feat/ws-only", None, None, None, None)
            .unwrap();
    workspace_write_file(&repo, &ws, "new.txt", "new");
    treq_lib::core::commit_workspace(&repo.repo_path, ws.id, "add new").unwrap();

    let paths = workspace_diff_paths(&repo, &ws);
    assert!(paths.contains(&"new.txt".into()));
    assert!(!paths.contains(&"base.txt".into()));
    assert!(!paths.contains(&"README.md".into()));
}

#[test]
fn test_excludes_unmodified_target_files() {
    let repo = TestRepo::new().unwrap();
    for f in ["a.txt", "b.txt", "c.txt"] {
        repo.commit_file(f, f, f).unwrap();
    }
    let ws =
        treq_lib::core::create_workspace(&repo.repo_path, "feat/mod-one", None, None, None, None)
            .unwrap();
    workspace_write_file(&repo, &ws, "b.txt", "modified");
    treq_lib::core::commit_workspace(&repo.repo_path, ws.id, "mod b").unwrap();

    let paths = workspace_diff_paths(&repo, &ws);
    assert_eq!(paths, vec!["b.txt"]);
}

#[test]
fn test_empty_when_no_commits() {
    let repo = TestRepo::new().unwrap();
    repo.commit_file("x.txt", "x", "x").unwrap();
    let ws =
        treq_lib::core::create_workspace(&repo.repo_path, "feat/empty", None, None, None, None)
            .unwrap();

    init_test_app_db(&repo, Some("git"));
    let diff = treq_lib::core::workspace_diff(&repo.repo_path, ws.id).unwrap();

    assert!(diff.uncommitted_files.is_empty());
    assert!(diff.committed_files.is_empty());
    assert!(diff.hunks_by_file.is_empty());
    assert!(diff.conflicted_files.is_empty());
    assert!(!diff.too_large_to_render);
    assert!(diff.render_block_reason.is_none());
}

#[test]
fn test_multiple_workspace_commits() {
    let repo = TestRepo::new().unwrap();
    repo.commit_file("target.txt", "t", "t").unwrap();
    let ws =
        treq_lib::core::create_workspace(&repo.repo_path, "feat/multi", None, None, None, None)
            .unwrap();
    workspace_write_file(&repo, &ws, "f1.txt", "1");
    treq_lib::core::commit_workspace(&repo.repo_path, ws.id, "add f1").unwrap();
    workspace_write_file(&repo, &ws, "f2.txt", "2");
    treq_lib::core::commit_workspace(&repo.repo_path, ws.id, "add f2").unwrap();

    let paths = workspace_diff_paths(&repo, &ws);
    assert!(paths.contains(&"f1.txt".into()));
    assert!(paths.contains(&"f2.txt".into()));
    assert!(!paths.contains(&"target.txt".into()));
}

#[test]
fn test_workspace_diff_when_wc_is_merge_commit() {
    let repo = TestRepo::new().unwrap();
    repo.commit_file("shared.txt", "target", "target").unwrap();

    let ws =
        treq_lib::core::create_workspace(&repo.repo_path, "feat/merge-wc", None, None, None, None)
            .unwrap();
    workspace_write_file(&repo, &ws, "shared.txt", "workspace");
    treq_lib::core::commit_workspace(&repo.repo_path, ws.id, "workspace shared change").unwrap();
    let ws_change_id = TestRepo::run_jj(
        repo.workspaces_dir()
            .join(&ws.workspace_path)
            .to_str()
            .unwrap(),
        &["log", "-r", "@-", "--no-graph", "-T", "change_id\n"],
    )
    .expect("workspace change_id should resolve")
    .trim()
    .to_string();

    TestRepo::remove_file_path(repo.temp_dir.path().join("shared.txt"))
        .expect("failed to delete shared.txt on main");
    treq_lib::jj::jj_commit(&repo.repo_path, "main delete").unwrap();
    let main_change_id = TestRepo::run_jj(
        &repo.repo_path,
        &["log", "-r", "@-", "--no-graph", "-T", "change_id\n"],
    )
    .expect("main change_id should resolve")
    .trim()
    .to_string();

    let ws_dir = repo.workspaces_dir().join(&ws.workspace_path);
    TestRepo::run_jj(
        ws_dir.to_str().unwrap(),
        &["new", &ws_change_id, &main_change_id],
    )
    .expect("jj new should create unresolved conflict merge commit");

    init_test_app_db(&repo, Some("git"));
    let result = treq_lib::core::workspace_diff(&repo.repo_path, ws.id);
    let diff = result.expect("workspace_diff must succeed when @ has unresolved conflicts");
    let paths: Vec<String> = diff
        .committed_files
        .iter()
        .map(|f| f.path.clone())
        .collect();
    assert!(
        paths.contains(&"shared.txt".into()),
        "expected merged tree to include conflicted file, got {:?}",
        paths
    );

    assert!(
        diff.conflicted_files.contains(&"shared.txt".into()),
        "expected workspace_diff to report unresolved conflict path, got {:?}",
        diff.conflicted_files
    );
}

#[test]
fn test_workspace_diff_includes_uncommitted_changes_and_conflicts() {
    let repo = TestRepo::new().unwrap();
    repo.commit_file("shared.txt", "base", "base").unwrap();

    let ws = treq_lib::core::create_workspace(
        &repo.repo_path,
        "feat/diff-contract",
        None,
        None,
        None,
        None,
    )
    .unwrap();
    let workspace_dir = repo.workspaces_dir().join(&ws.workspace_path);
    let workspace_dir_str = workspace_dir.to_str().unwrap();

    TestRepo::write_workspace_file(workspace_dir_str, "committed.txt", "committed").unwrap();
    treq_lib::core::commit_workspace(&repo.repo_path, ws.id, "add committed").unwrap();

    TestRepo::write_workspace_file(workspace_dir_str, "uncommitted.txt", "draft").unwrap();

    init_test_app_db(&repo, Some("git"));
    let diff = treq_lib::core::workspace_diff(&repo.repo_path, ws.id).unwrap();

    let committed_paths: Vec<_> = diff
        .committed_files
        .iter()
        .map(|f| f.path.as_str())
        .collect();
    assert!(committed_paths.contains(&"committed.txt"));
    assert!(!committed_paths.contains(&"uncommitted.txt"));

    let uncommitted_paths: Vec<_> = diff
        .uncommitted_files
        .iter()
        .map(|f| f.path.as_str())
        .collect();
    assert!(uncommitted_paths.contains(&"uncommitted.txt"));
    assert!(diff.conflicted_files.is_empty());
}

#[test]
fn test_workspace_diff_reports_delete_modify_conflicts_from_jj_lib() {
    let repo = TestRepo::new().unwrap();
    repo.commit_file("shared.txt", "base", "base").unwrap();

    let ws = treq_lib::core::create_workspace(
        &repo.repo_path,
        "feat/delete-modify-conflict",
        None,
        None,
        None,
        None,
    )
    .unwrap();
    let workspace_dir = repo.workspaces_dir().join(&ws.workspace_path);
    let workspace_dir_str = workspace_dir.to_str().unwrap();

    TestRepo::write_workspace_file(workspace_dir_str, "shared.txt", "workspace side\n").unwrap();
    treq_lib::core::commit_workspace(&repo.repo_path, ws.id, "workspace modify").unwrap();
    let ws_change_id = TestRepo::run_jj(
        workspace_dir_str,
        &["log", "-r", "@-", "--no-graph", "-T", "change_id\n"],
    )
    .expect("workspace change_id should resolve")
    .trim()
    .to_string();

    TestRepo::remove_file_path(repo.temp_dir.path().join("shared.txt")).unwrap();
    treq_lib::jj::jj_commit(&repo.repo_path, "main delete").unwrap();
    let main_change_id = TestRepo::run_jj(
        &repo.repo_path,
        &["log", "-r", "@-", "--no-graph", "-T", "change_id\n"],
    )
    .expect("main change_id should resolve")
    .trim()
    .to_string();

    TestRepo::run_jj(workspace_dir_str, &["new", &ws_change_id, &main_change_id])
        .expect("jj new should create unresolved delete/modify conflict");

    let conflicted_files = workspace_diff_fixture_conflicted_files(&repo, &ws);
    assert!(
        conflicted_files.contains(&"shared.txt".to_string()),
        "expected unresolved conflict list to include shared.txt, got {:?}",
        conflicted_files
    );

    init_test_app_db(&repo, Some("git"));
    let diff = treq_lib::core::workspace_diff(&repo.repo_path, ws.id).unwrap();
    assert!(
        !diff.conflicted_files.is_empty(),
        "workspace_diff should surface unresolved conflicts"
    );
    assert!(
        diff.conflicted_files.contains(&"shared.txt".to_string()),
        "workspace_diff conflicted_files should mirror jj-lib conflict list, got {:?}",
        diff.conflicted_files
    );

    let committed_paths: Vec<_> = diff
        .committed_files
        .iter()
        .map(|f| f.path.as_str())
        .collect();
    assert!(
        committed_paths.contains(&"shared.txt"),
        "committed diff should still render the conflicting file, got {:?}",
        committed_paths
    );
}

#[test]
fn test_workspace_diff_empty_uncommitted_and_conflicts_for_clean_workspace() {
    let repo = TestRepo::new().unwrap();
    repo.commit_file("clean.txt", "clean", "base").unwrap();

    let ws =
        treq_lib::core::create_workspace(&repo.repo_path, "feat/clean", None, None, None, None)
            .unwrap();
    workspace_write_file(&repo, &ws, "committed.txt", "committed");
    treq_lib::core::commit_workspace(&repo.repo_path, ws.id, "add committed").unwrap();

    init_test_app_db(&repo, Some("git"));
    let diff = treq_lib::core::workspace_diff(&repo.repo_path, ws.id).unwrap();

    assert!(diff.uncommitted_files.is_empty());
    assert!(diff.conflicted_files.is_empty());
}

#[test]
fn test_workspace_diff_does_not_leak_sibling_workspace_commits() {
    let repo = TestRepo::new().unwrap();
    repo.commit_file("base.txt", "base", "base").unwrap();

    let main_workspace =
        treq_lib::core::create_workspace(&repo.repo_path, "treq/root", None, None, None, None)
            .unwrap();
    let sibling_workspace =
        treq_lib::core::create_workspace(&repo.repo_path, "treq/chicken", None, None, None, None)
            .unwrap();

    let sibling_dir = repo
        .workspaces_dir()
        .join(&sibling_workspace.workspace_path);
    let sibling_dir_str = sibling_dir.to_str().unwrap();
    TestRepo::write_workspace_file(sibling_dir_str, "chicken.txt", "cluck").unwrap();
    treq_lib::core::commit_workspace(&repo.repo_path, sibling_workspace.id, "sibling change")
        .unwrap();

    let main_dir = repo.workspaces_dir().join(&main_workspace.workspace_path);
    let main_status = TestRepo::run_jj(main_dir.to_str().unwrap(), &["st"]).unwrap();
    assert!(
        main_status.contains("The working copy has no changes."),
        "main workspace should remain clean, got:\n{}",
        main_status
    );

    init_test_app_db(&repo, Some("git"));
    let diff = treq_lib::core::workspace_diff(&repo.repo_path, main_workspace.id).unwrap();

    assert!(
        diff.committed_files.is_empty(),
        "main workspace review diff should not include sibling commits, got {:?}",
        diff.committed_files
            .iter()
            .map(|file| file.path.as_str())
            .collect::<Vec<_>>()
    );
    assert!(
        diff.uncommitted_files.is_empty(),
        "main workspace review diff should not report uncommitted files, got {:?}",
        diff.uncommitted_files
            .iter()
            .map(|file| file.path.as_str())
            .collect::<Vec<_>>()
    );
    assert!(
        diff.hunks_by_file.is_empty(),
        "main workspace review diff should not include hunks, got {:?}",
        diff.hunks_by_file
    );
    assert!(
        diff.conflicted_files.is_empty(),
        "main workspace review diff should not include conflicted files, got {:?}",
        diff.conflicted_files
    );
    assert!(!diff.too_large_to_render);
    assert!(diff.render_block_reason.is_none());

    let committed_paths: Vec<_> = diff
        .committed_files
        .iter()
        .map(|f| f.path.as_str())
        .collect();
    assert!(
        committed_paths.is_empty(),
        "main workspace review diff should not include sibling commits, got {:?}",
        committed_paths
    );
}

#[test]
fn test_excludes_uncommitted_changes() {
    let repo = TestRepo::new().unwrap();
    let ws = treq_lib::core::create_workspace(&repo.repo_path, "feat/wc", None, None, None, None)
        .unwrap();
    workspace_write_file(&repo, &ws, "committed.txt", "c");
    treq_lib::core::commit_workspace(&repo.repo_path, ws.id, "add committed").unwrap();
    workspace_write_file(&repo, &ws, "uncommitted.txt", "u");

    let paths = workspace_diff_paths(&repo, &ws);
    assert!(paths.contains(&"committed.txt".into()));
    assert!(!paths.contains(&"uncommitted.txt".into()));
}

#[test]
fn test_reports_rename_with_previous_path() {
    let repo = TestRepo::new().unwrap();
    repo.commit_file("old.txt", "hello", "add old on main")
        .unwrap();
    let ws =
        treq_lib::core::create_workspace(&repo.repo_path, "feat/rename", None, None, None, None)
            .unwrap();
    let workspace_dir = repo.workspaces_dir().join(&ws.workspace_path);
    TestRepo::rename_path(
        workspace_dir.join("old.txt"),
        workspace_dir.join("renamed.txt"),
    )
    .expect("rename should succeed");
    treq_lib::core::commit_workspace(&repo.repo_path, ws.id, "rename old").unwrap();

    init_test_app_db(&repo, Some("git"));
    let diff = treq_lib::core::workspace_diff(&repo.repo_path, ws.id).unwrap();
    let renamed = diff
        .committed_files
        .iter()
        .find(|f| f.path == "renamed.txt")
        .expect("renamed entry should exist");
    assert_eq!(renamed.status, "R");
    assert_eq!(renamed.previous_path.as_deref(), Some("old.txt"));
}

#[test]
fn test_workspace_diff_reports_copy_status() {
    let repo = TestRepo::new().unwrap();
    repo.commit_file("source.txt", "hello", "add source on main")
        .unwrap();
    let ws = treq_lib::core::create_workspace(&repo.repo_path, "feat/copy", None, None, None, None)
        .unwrap();
    let workspace_dir = repo.workspaces_dir().join(&ws.workspace_path);
    TestRepo::copy_path(
        workspace_dir.join("source.txt"),
        workspace_dir.join("copied.txt"),
    )
    .expect("copy should succeed");
    treq_lib::core::commit_workspace(&repo.repo_path, ws.id, "copy source").unwrap();

    init_test_app_db(&repo, Some("git"));
    let diff = treq_lib::core::workspace_diff(&repo.repo_path, ws.id).unwrap();
    let copied = diff
        .committed_files
        .iter()
        .find(|f| f.path == "copied.txt")
        .expect("copied entry should exist");
    assert!(
        copied.status == "C" || copied.status == "A",
        "expected C or A status for copied file, got {}",
        copied.status
    );
    if copied.status == "C" {
        assert_eq!(copied.previous_path.as_deref(), Some("source.txt"));
    }
}
