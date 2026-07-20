mod e2e_test_helpers;

use e2e_test_helpers::{JjVerifier, TestRepo};
use treq_lib::local_db::Workspace;

#[test]
fn test_can_delete_workspace() {
    let repo = TestRepo::new().expect("Failed to create test repo");

    let workspace: Workspace = treq_lib::core::create_workspace(
        &repo.repo_path,
        "feat/delete",
        Some("delete feature".to_string()),
        None,
        None,
        None,
        None,
    )
    .expect("Failed to create workspace");
    let workspace_name = workspace.workspace_name.clone();

    let workspace_path = repo.workspaces_dir().join(&workspace.workspace_path);

    let result = treq_lib::core::delete_workspace(&repo.repo_path, &workspace.id)
        .expect("Failed to delete workspace");
    assert!(result, "Workspace should be deleted");

    assert!(
        !workspace_path.exists(),
        "Workspace directory should be removed"
    );

    let bookmarks = JjVerifier::list_bookmarks(&repo.repo_path).expect("Failed to list bookmarks");
    assert!(
        bookmarks.iter().any(|b| b == &workspace.branch_name),
        "Bookmark '{}' should exist in workspace, got: {:?}",
        workspace.branch_name,
        bookmarks
    );

    let jj_workspaces_after =
        JjVerifier::list_workspaces(&repo.repo_path).expect("Failed to list jj workspaces");
    assert!(
        !jj_workspaces_after.contains(&workspace_name),
        "Workspace should NOT be in jj list after deletion, got: {:?}",
        jj_workspaces_after
    );

    let workspaces =
        treq_lib::local_db::get_workspaces(&repo.repo_path).expect("Failed to get workspaces");
    assert!(
        !workspaces.iter().any(|w| w.id == workspace.id),
        "Workspace should be removed from database"
    );
}

#[test]
fn test_delete_workspace_retargets_children_to_default_branch() {
    let repo = TestRepo::new().expect("Failed to create test repo");
    let default_branch = repo.default_branch();

    let parent: Workspace = treq_lib::core::create_workspace(
        &repo.repo_path,
        "feat/parent",
        Some("parent feature".to_string()),
        None,
        None,
        None,
        None,
    )
    .expect("Failed to create parent workspace");

    let child1: Workspace = treq_lib::core::create_workspace(
        &repo.repo_path,
        "feat/child1",
        None,
        None,
        Some(&parent.branch_name),
        None,
        None,
    )
    .expect("Failed to create child1 workspace");

    let child2: Workspace = treq_lib::core::create_workspace(
        &repo.repo_path,
        "feat/child2",
        None,
        None,
        Some(&parent.branch_name),
        None,
        None,
    )
    .expect("Failed to create child2 workspace");

    let grandchild: Workspace = treq_lib::core::create_workspace(
        &repo.repo_path,
        "feat/grandchild",
        None,
        None,
        Some(&child1.branch_name),
        None,
        None,
    )
    .expect("Failed to create grandchild workspace");

    assert_eq!(child1.target_branch, Some("feat/parent".to_string()));
    assert_eq!(child2.target_branch, Some("feat/parent".to_string()));
    assert_eq!(grandchild.target_branch, Some("feat/child1".to_string()));

    let result = treq_lib::core::delete_workspace(&repo.repo_path, &parent.id)
        .expect("Failed to delete parent workspace");
    assert!(result, "delete_workspace should return true");

    let workspaces =
        treq_lib::local_db::get_workspaces(&repo.repo_path).expect("Failed to get workspaces");

    let updated_child1 = workspaces
        .iter()
        .find(|w| w.id == child1.id)
        .expect("child1 should still exist");
    let updated_child2 = workspaces
        .iter()
        .find(|w| w.id == child2.id)
        .expect("child2 should still exist");
    let updated_grandchild = workspaces
        .iter()
        .find(|w| w.id == grandchild.id)
        .expect("grandchild should still exist");

    assert_eq!(
        updated_child1.target_branch,
        Some(default_branch.to_string())
    );
    assert_eq!(
        updated_child2.target_branch,
        Some(default_branch.to_string())
    );
    assert_eq!(
        updated_grandchild.target_branch,
        Some("feat/child1".to_string())
    );
}
