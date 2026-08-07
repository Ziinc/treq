mod e2e_test_helpers;

use e2e_test_helpers::TestRepo;
use treq_lib::jj;

#[test]
fn resolve_bookmark_conflict_preserves_every_local_change_on_target() {
    let repo = TestRepo::with_remote().expect("Failed to create test repo with remote");
    let ws = repo
        .setup_workspace_with_pushed_commit("feat/lossless", "base.txt", "base")
        .expect("Failed to create workspace");
    let workspace_path = repo.workspace_full_path(&ws);

    TestRepo::write_workspace_file(&workspace_path, "one.txt", "one").unwrap();
    treq_lib::core::commit_workspace(&repo.repo_path, ws.id, "local one").unwrap();
    let first_change = jj::jj_get_change_id(&workspace_path, "@-").unwrap();
    TestRepo::write_workspace_file(&workspace_path, "two.txt", "two").unwrap();
    treq_lib::core::commit_workspace(&repo.repo_path, ws.id, "local two").unwrap();
    let second_change = jj::jj_get_change_id(&workspace_path, "@-").unwrap();

    repo.remote_commit_on_branch("feat/lossless", "remote.txt", "remote", "remote change")
        .unwrap();
    jj::jj_git_fetch(&repo.repo_path).unwrap();
    assert!(jj::jj_is_bookmark_conflicted(
        &workspace_path,
        "feat/lossless"
    ));

    let result = jj::jj_resolve_bookmark_conflict_losslessly(
        &workspace_path,
        "feat/lossless",
        "feat/lossless@origin",
    )
    .expect("lossless resolution should succeed atomically");

    assert_eq!(result.preserved_change_ids.len(), 2);
    assert!(!jj::jj_is_bookmark_conflicted(
        &workspace_path,
        "feat/lossless"
    ));
    for change_id in [first_change, second_change] {
        let reachable = jj::jj_log_revset_commit_ids(
            &workspace_path,
            &format!("{} & ::feat/lossless", change_id),
        )
        .unwrap();
        assert_eq!(reachable.len(), 1, "captured change must remain reachable");
    }
}

#[test]
fn test_auto_rebase_resolves_bookmark_conflict() {
    let repo = TestRepo::with_remote().expect("Failed to create test repo with remote");
    let default_branch = repo.default_branch();

    let ws = repo
        .setup_workspace_with_pushed_commit("feat/conflict-test", "local.txt", "local content")
        .expect("Failed to create pushed workspace");

    let full_path = repo.workspace_full_path(&ws);

    TestRepo::write_workspace_file(&full_path, "local2.txt", "local2")
        .expect("Failed to write file");
    treq_lib::core::commit_workspace(&repo.repo_path, ws.id, "Add local2.txt")
        .expect("Failed to create local commit");

    repo.remote_commit_on_branch(
        "feat/conflict-test",
        "remote.txt",
        "remote content",
        "Remote commit on feat/conflict-test",
    )
    .expect("Failed to make remote commit");

    jj::jj_git_fetch(&repo.repo_path).expect("Failed to fetch");

    assert!(
        jj::jj_is_bookmark_conflicted(&full_path, "feat/conflict-test"),
        "Bookmark should be conflicted after divergent fetch"
    );

    let result = treq_lib::auto_rebase::rebase_single_workspace(
        &repo.repo_path,
        ws.id,
        default_branch,
        true,
        "diff",
    )
    .expect("rebase_single_workspace should succeed");

    assert!(result.is_some(), "Should have performed a rebase");
    assert!(
        !jj::jj_is_bookmark_conflicted(&full_path, "feat/conflict-test"),
        "Bookmark should not be conflicted after rebase"
    );
}

#[test]
fn test_auto_rebase_resolves_conflict_no_local_commits() {
    let repo = TestRepo::with_remote().expect("Failed to create test repo with remote");
    let default_branch = repo.default_branch();

    let ws = repo
        .setup_workspace_with_pushed_commit("feat/no-local", "initial.txt", "initial content")
        .expect("Failed to create pushed workspace");

    let full_path = repo.workspace_full_path(&ws);

    repo.remote_commit_on_branch(
        "feat/no-local",
        "remote_only.txt",
        "remote only",
        "Remote-only commit",
    )
    .expect("Failed to make remote commit");

    jj::jj_git_fetch(&repo.repo_path).expect("Failed to fetch");

    let result = treq_lib::auto_rebase::rebase_single_workspace(
        &repo.repo_path,
        ws.id,
        default_branch,
        true,
        "diff",
    )
    .expect("rebase_single_workspace should succeed with no local commits");

    assert!(result.is_some(), "Should have performed a rebase");
    assert!(
        !jj::jj_is_bookmark_conflicted(&full_path, "feat/no-local"),
        "Bookmark should not be conflicted after resolution"
    );
}

#[test]
fn test_auto_rebase_batch_resolves_bookmark_conflicts() {
    let repo = TestRepo::with_remote().expect("Failed to create test repo with remote");
    let default_branch = repo.default_branch();
    let origin_default = format!("origin/{default_branch}");

    let ws1 = repo
        .setup_workspace_with_pushed_commit("feat/batch-ws1", "ws1.txt", "ws1 content")
        .expect("Failed to create pushed workspace");
    let ws2 = repo
        .setup_workspace_with_pushed_commit("feat/batch-ws2", "ws2.txt", "ws2 content")
        .expect("Failed to create pushed workspace");

    let full_path1 = repo.workspace_full_path(&ws1);
    let full_path2 = repo.workspace_full_path(&ws2);

    treq_lib::local_db::update_workspace_target_branch(&repo.repo_path, ws1.id, &origin_default)
        .expect("Failed to set target branch on ws1");
    treq_lib::local_db::update_workspace_target_branch(&repo.repo_path, ws2.id, &origin_default)
        .expect("Failed to set target branch on ws2");

    repo.remote_commit_file(
        "main_advance.txt",
        "advance main",
        "Advance main for batch test",
    )
    .expect("Failed to advance main");

    TestRepo::write_workspace_file(&full_path1, "local_ws1.txt", "local ws1").expect("write");
    treq_lib::core::commit_workspace(&repo.repo_path, ws1.id, "Local commit on ws1")
        .expect("Failed to create local commit ws1");

    TestRepo::write_workspace_file(&full_path2, "local_ws2.txt", "local ws2").expect("write");
    treq_lib::core::commit_workspace(&repo.repo_path, ws2.id, "Local commit on ws2")
        .expect("Failed to create local commit ws2");

    repo.remote_commit_on_branch("feat/batch-ws1", "r1.txt", "r1", "Remote on ws1")
        .expect("Failed to make remote commit on ws1");
    repo.remote_commit_on_branch("feat/batch-ws2", "r2.txt", "r2", "Remote on ws2")
        .expect("Failed to make remote commit on ws2");

    jj::jj_git_fetch(&repo.repo_path).expect("Failed to fetch");

    assert!(
        jj::jj_is_bookmark_conflicted(&full_path1, "feat/batch-ws1"),
        "ws1 bookmark should be conflicted after divergent fetch"
    );
    assert!(
        jj::jj_is_bookmark_conflicted(&full_path2, "feat/batch-ws2"),
        "ws2 bookmark should be conflicted after divergent fetch"
    );

    treq_lib::auto_rebase::check_and_rebase_all(&repo.repo_path, "diff")
        .expect("check_and_rebase_all should succeed");

    assert!(
        !jj::jj_is_bookmark_conflicted(&full_path1, "feat/batch-ws1"),
        "ws1 bookmark should not be conflicted after batch rebase"
    );
    assert!(
        !jj::jj_is_bookmark_conflicted(&full_path2, "feat/batch-ws2"),
        "ws2 bookmark should not be conflicted after batch rebase"
    );
}

#[test]
fn test_auto_rebase_no_conflict_still_works() {
    let repo = TestRepo::with_remote().expect("Failed to create test repo with remote");
    let default_branch = repo.default_branch();

    let ws = treq_lib::core::create_workspace(
        &repo.repo_path,
        "feat/no-conflict",
        Some("feat/no-conflict".to_string()),
        None,
        None,
        None,
        None,
    )
    .expect("Failed to create workspace");

    let full_path = repo.workspace_full_path(&ws);

    TestRepo::write_workspace_file(&full_path, "ws_file.txt", "workspace content")
        .expect("Failed to write file");
    treq_lib::core::commit_workspace(&repo.repo_path, ws.id, "Add ws_file.txt")
        .expect("Failed to create commit");

    repo.remote_commit_file("main_advance.txt", "main advance", "Advance main")
        .expect("Failed to advance main");

    jj::jj_git_fetch(&repo.repo_path).expect("Failed to fetch");

    assert!(
        !jj::jj_is_bookmark_conflicted(&full_path, "feat/no-conflict"),
        "Bookmark should not be conflicted"
    );

    let result = treq_lib::auto_rebase::rebase_single_workspace(
        &repo.repo_path,
        ws.id,
        default_branch,
        true,
        "diff",
    )
    .expect("rebase_single_workspace should succeed on non-conflicted workspace");

    assert!(
        !jj::jj_is_bookmark_conflicted(&full_path, "feat/no-conflict"),
        "Bookmark should not be conflicted after normal rebase"
    );

    let _ = result;
}

#[test]
fn test_force_rebase_rooted_subtree_handles_conflicted_local_main_target() {
    let repo = TestRepo::with_remote().expect("Failed to create test repo with remote");
    let default_branch = repo.default_branch();

    // Create a local workspace on the default branch so rooted-subtree force rebase can include descendants
    // that target it (the local bookmark we intentionally make conflicted).
    let root_main = treq_lib::core::create_workspace(
        &repo.repo_path,
        default_branch,
        Some("root main workspace".to_string()),
        None,
        None,
        None,
        None,
    )
    .expect("Failed to create main workspace");

    let child = treq_lib::core::create_workspace(
        &repo.repo_path,
        "feat/force-main-child",
        Some("force main child".to_string()),
        None,
        Some(default_branch),
        None,
        None,
    )
    .expect("Failed to create child workspace");

    let child_path = repo.workspace_full_path(&child);
    TestRepo::write_workspace_file(&child_path, "child.txt", "child content\n")
        .expect("Failed to write child file");
    treq_lib::core::commit_workspace(&repo.repo_path, child.id, "Child commit")
        .expect("Failed to commit child change");

    // Diverge local/remote main so local `main` becomes conflicted after fetch.
    repo.commit_file(
        "local_main_conflict.txt",
        "local main conflict\n",
        "Local main conflict commit",
    )
    .expect("Failed to create local main commit");
    repo.remote_commit_file(
        "remote_main_conflict.txt",
        "remote main conflict\n",
        "Remote main conflict commit",
    )
    .expect("Failed to create remote main commit");
    jj::jj_git_fetch(&repo.repo_path).expect("Failed to fetch");

    let main_workspace_path = repo.workspace_full_path(&root_main);
    assert!(
        jj::jj_is_bookmark_conflicted(&main_workspace_path, default_branch),
        "main bookmark should be conflicted before force rebase"
    );

    let result = treq_lib::auto_rebase::rebase_root_subtree_from_workspace_force(
        &repo.repo_path,
        root_main.id,
        default_branch,
        "diff",
    )
    .expect("force rooted-subtree rebase should not fail when local main is conflicted");

    assert!(result.is_some(), "force rooted-subtree should run");
    let result = result.expect("result should be present");
    assert!(
        result.rebase_result.success,
        "force rooted-subtree rebase should succeed: {}",
        result.rebase_result.message
    );
    let conflicted_name_msg = format!("Name '{default_branch}' is conflicted");
    assert!(
        !result.rebase_result.message.contains(&conflicted_name_msg),
        "force rebase should not fail on conflicted local main resolution: {}",
        result.rebase_result.message
    );
}
