mod e2e_test_helpers;

use e2e_test_helpers::TestRepo;
use std::fs;

#[test]
fn test_workspace_conflict_detection() {
    let repo = TestRepo::new().expect("Failed to create test repo");

    let workspace = treq_lib::core::create_workspace(
        &repo.repo_path,
        "base",
        Some("feature-base".to_string()),
        None,
        None,
        None,
    )
    .expect("Failed to create base workspace");

    let workspace_path = repo.workspaces_dir().join(&workspace.workspace_path);
    let file_path = workspace_path.join("README.md");
    fs::write(&file_path, "some content").expect("Failed to write base file");

    let stacked_workspace = treq_lib::core::create_workspace(
        &repo.repo_path,
        "feat/stacked",
        None,
        None,
        Some(&workspace.branch_name),
        None,
    )
    .expect("Failed to create stacked workspace");
    let stacked_workspace_path = repo
        .workspaces_dir()
        .join(&stacked_workspace.workspace_path);

    let statuses = treq_lib::core::list_workspace_statuses(&repo.repo_path)
        .expect("Failed to list workspace statuses");
    let base_status_before = statuses
        .iter()
        .find(|s| s.current.id == workspace.id)
        .expect("base status should exist");
    let stacked_status_before = statuses
        .iter()
        .find(|s| s.current.id == stacked_workspace.id)
        .expect("stacked status should exist");
    assert!(!base_status_before.has_conflicts);
    assert!(!stacked_status_before.has_conflicts);
    assert!(base_status_before.has_changes);
    assert!(!stacked_status_before.has_changes);
    assert_eq!(base_status_before.commits_ahead, 0);
    assert_eq!(stacked_status_before.commits_ahead, 0);

    fs::write(stacked_workspace_path.join("README.md"), "stacked content")
        .expect("Failed to write file");
    let statuses = treq_lib::core::list_workspace_statuses(&repo.repo_path)
        .expect("Failed to list workspace statuses");
    let stacked_status_with_change = statuses
        .iter()
        .find(|s| s.current.id == stacked_workspace.id)
        .expect("stacked status should exist");
    assert!(stacked_status_with_change.has_changes);

    fs::write(
        stacked_workspace_path.join("README.md"),
        "stacked version of README",
    )
    .expect("Failed to write stacked file");
    fs::write(workspace_path.join("README.md"), "base version of README")
        .expect("Failed to write base file");

    let statuses = treq_lib::core::list_workspace_statuses(&repo.repo_path)
        .expect("Failed to list workspace statuses");
    let stacked_status = statuses
        .iter()
        .find(|s| s.current.workspace_path == stacked_workspace.workspace_path)
        .expect("Stacked workspace should exist");
    assert!(stacked_status.has_conflicts);

    let status = treq_lib::core::workspace_status(&repo.repo_path, Some(workspace.id))
        .expect("Failed to get workspace status");
    assert_eq!(status.conflicted_workspace_ids.len(), 1);
    assert!(status
        .conflicted_workspace_ids
        .contains(&stacked_workspace.id));
}

#[test]
fn test_list_workspace_statuses_commits_ahead() {
    let repo = TestRepo::new().expect("Failed to create test repo");

    let workspace = treq_lib::core::create_workspace(
        &repo.repo_path,
        "feat/commits-ahead",
        Some("test commits ahead".to_string()),
        None,
        None,
        None,
    )
    .expect("Failed to create workspace");

    let workspace_path = repo.workspaces_dir().join(&workspace.workspace_path);

    let statuses = treq_lib::core::list_workspace_statuses(&repo.repo_path)
        .expect("Failed to list workspace statuses");
    let status = statuses
        .iter()
        .find(|s| s.current.id == workspace.id)
        .expect("Workspace should exist in statuses");
    assert_eq!(status.commits_ahead, 0);

    fs::write(workspace_path.join("file1.txt"), "content 1").expect("Failed to write file");
    treq_lib::core::commit_workspace(&repo.repo_path, workspace.id, "First commit")
        .expect("Failed to commit");

    let statuses = treq_lib::core::list_workspace_statuses(&repo.repo_path)
        .expect("Failed to list workspace statuses");
    let status = statuses
        .iter()
        .find(|s| s.current.id == workspace.id)
        .expect("Workspace should exist in statuses");
    assert_eq!(status.commits_ahead, 1);

    fs::write(workspace_path.join("file2.txt"), "content 2").expect("Failed to write file");
    treq_lib::core::commit_workspace(&repo.repo_path, workspace.id, "Second commit")
        .expect("Failed to commit");

    let statuses = treq_lib::core::list_workspace_statuses(&repo.repo_path)
        .expect("Failed to list workspace statuses");
    let status = statuses
        .iter()
        .find(|s| s.current.id == workspace.id)
        .expect("Workspace should exist in statuses");
    assert_eq!(status.commits_ahead, 2);
}
