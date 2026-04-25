mod e2e_test_helpers;

use e2e_test_helpers::TestRepo;
use treq_lib::jj;

/// Helper: given a workspace's workspace_path (directory name), return the full path.
fn workspace_full_path(repo: &TestRepo, ws: &treq_lib::local_db::Workspace) -> String {
    repo.workspaces_dir()
        .join(&ws.workspace_path)
        .to_string_lossy()
        .to_string()
}

/// Helper: create a workspace, make a local commit, and push to remote.
fn setup_workspace_with_pushed_commit(
    repo: &TestRepo,
    branch_name: &str,
    filename: &str,
    content: &str,
) -> treq_lib::local_db::Workspace {
    let ws = treq_lib::core::create_workspace(
        &repo.repo_path,
        branch_name,
        Some(branch_name.to_string()),
        None,
        None,
        None,
    )
    .expect("Failed to create workspace");

    let full_path = workspace_full_path(repo, &ws);
    let file_path = std::path::Path::new(&full_path).join(filename);
    std::fs::write(&file_path, content).expect("Failed to write file");
    treq_lib::core::commit_workspace(&repo.repo_path, ws.id, &format!("Add {}", filename))
        .expect("Failed to create commit");

    jj::jj_push(&full_path).expect("Failed to push branch via jj");
    jj::jj_git_fetch(&repo.repo_path).expect("Failed to fetch");

    ws
}

#[test]
fn test_auto_rebase_resolves_bookmark_conflict() {
    let repo = TestRepo::with_remote().expect("Failed to create test repo with remote");

    let ws = setup_workspace_with_pushed_commit(
        &repo,
        "feat/conflict-test",
        "local.txt",
        "local content",
    );

    let full_path = workspace_full_path(&repo, &ws);

    let local_file = std::path::Path::new(&full_path).join("local2.txt");
    std::fs::write(&local_file, "local2").expect("Failed to write file");
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
        "main",
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

    let ws = setup_workspace_with_pushed_commit(
        &repo,
        "feat/no-local",
        "initial.txt",
        "initial content",
    );

    let full_path = workspace_full_path(&repo, &ws);

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
        "main",
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

    let ws1 = setup_workspace_with_pushed_commit(&repo, "feat/batch-ws1", "ws1.txt", "ws1 content");
    let ws2 = setup_workspace_with_pushed_commit(&repo, "feat/batch-ws2", "ws2.txt", "ws2 content");

    let full_path1 = workspace_full_path(&repo, &ws1);
    let full_path2 = workspace_full_path(&repo, &ws2);

    treq_lib::local_db::update_workspace_target_branch(&repo.repo_path, ws1.id, "origin/main")
        .expect("Failed to set target branch on ws1");
    treq_lib::local_db::update_workspace_target_branch(&repo.repo_path, ws2.id, "origin/main")
        .expect("Failed to set target branch on ws2");

    repo.remote_commit_file(
        "main_advance.txt",
        "advance main",
        "Advance main for batch test",
    )
    .expect("Failed to advance main");

    let local1 = std::path::Path::new(&full_path1).join("local_ws1.txt");
    std::fs::write(&local1, "local ws1").expect("write");
    treq_lib::core::commit_workspace(&repo.repo_path, ws1.id, "Local commit on ws1")
        .expect("Failed to create local commit ws1");

    let local2 = std::path::Path::new(&full_path2).join("local_ws2.txt");
    std::fs::write(&local2, "local ws2").expect("write");
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

    let ws = treq_lib::core::create_workspace(
        &repo.repo_path,
        "feat/no-conflict",
        Some("feat/no-conflict".to_string()),
        None,
        None,
        None,
    )
    .expect("Failed to create workspace");

    let full_path = workspace_full_path(&repo, &ws);

    let file_path = std::path::Path::new(&full_path).join("ws_file.txt");
    std::fs::write(&file_path, "workspace content").expect("Failed to write file");
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
        "main",
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
