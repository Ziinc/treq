mod e2e_test_helpers;

use e2e_test_helpers::TestRepo;
use std::collections::HashSet;
use std::path::Path;
use treq_lib::core::{HunkSpec, WorkspaceMoveRequest};
use treq_lib::local_db::Workspace;

fn workspace_path(repo_path: &str, workspace: &Workspace) -> String {
    Path::new(repo_path)
        .join(".treq")
        .join("workspaces")
        .join(&workspace.workspace_path)
        .to_string_lossy()
        .to_string()
}

fn setup_parent_child_graph(repo: &TestRepo) -> (Workspace, Workspace) {
    let parent = treq_lib::core::create_workspace(
        &repo.repo_path,
        "move-parent",
        Some("parent".to_string()),
        None,
        None,
        None,
    )
    .expect("should create parent workspace");

    let child = treq_lib::core::create_workspace(
        &repo.repo_path,
        "move-child",
        Some("child".to_string()),
        None,
        Some(&parent.branch_name),
        None,
    )
    .expect("should create child workspace");

    (parent, child)
}

fn setup_sibling_graph(repo: &TestRepo) -> (Workspace, Workspace) {
    let root = treq_lib::core::create_workspace(
        &repo.repo_path,
        "move-root",
        Some("root".to_string()),
        None,
        None,
        None,
    )
    .expect("should create root workspace");

    let left = treq_lib::core::create_workspace(
        &repo.repo_path,
        "move-left",
        Some("left".to_string()),
        None,
        Some(&root.branch_name),
        None,
    )
    .expect("should create left sibling workspace");

    let right = treq_lib::core::create_workspace(
        &repo.repo_path,
        "move-right",
        Some("right".to_string()),
        None,
        Some(&root.branch_name),
        None,
    )
    .expect("should create right sibling workspace");

    (left, right)
}

fn make_commit_fixture(
    repo: &TestRepo,
    source: &Workspace,
    file_path: &str,
    marker: &str,
) -> String {
    let source_path = workspace_path(&repo.repo_path, source);
    TestRepo::write_workspace_file(&source_path, file_path, &format!("{}\n", marker))
        .expect("should write fixture file");
    treq_lib::core::commit_workspace(&repo.repo_path, source.id, &format!("commit-{}", marker))
        .expect("should create workspace commit");

    let log = treq_lib::core::list_commits(&repo.repo_path, Some(source.id), false, None, None)
        .expect("should list source commits");
    log.commits
        .iter()
        .find(|c| c.description.contains(marker))
        .map(|c| c.commit_id.clone())
        .expect("commit should be discoverable in source history")
}

fn make_file_fixture(repo: &TestRepo, source: &Workspace, file_path: &str, content: &str) {
    let source_path = workspace_path(&repo.repo_path, source);
    TestRepo::write_workspace_file(&source_path, file_path, content)
        .expect("should write file fixture");
}

fn make_hunk_fixture(repo: &TestRepo, source: &Workspace, file_path: &str) {
    let source_path = workspace_path(&repo.repo_path, source);
    TestRepo::write_workspace_file(&source_path, file_path, "line-1\nline-2\nline-3\nline-4\n")
        .expect("should write hunk fixture");
}

fn read_workspace_file(repo: &TestRepo, workspace: &Workspace, file_path: &str) -> String {
    let abs = Path::new(&workspace_path(&repo.repo_path, workspace)).join(file_path);
    std::fs::read_to_string(abs).expect("expected workspace file to exist")
}

fn assert_history_contains_commit(repo: &TestRepo, workspace: &Workspace, commit_id: &str) {
    let log = treq_lib::core::list_commits(&repo.repo_path, Some(workspace.id), false, None, None)
        .expect("should list workspace commits");
    let ids: HashSet<String> = log
        .commits
        .into_iter()
        .flat_map(|c| [c.commit_id, c.change_id])
        .collect();
    assert!(
        ids.contains(commit_id),
        "expected commit '{}' to be present in workspace history",
        commit_id
    );
}

fn assert_history_does_not_contain_commit(repo: &TestRepo, workspace: &Workspace, commit_id: &str) {
    let log = treq_lib::core::list_commits(&repo.repo_path, Some(workspace.id), false, None, None)
        .expect("should list workspace commits");
    let ids: HashSet<String> = log
        .commits
        .into_iter()
        .flat_map(|c| [c.commit_id, c.change_id])
        .collect();
    assert!(
        !ids.contains(commit_id),
        "expected commit '{}' to be absent from workspace history",
        commit_id
    );
}

fn assert_source_working_copy_not_changed_for_file(
    repo: &TestRepo,
    workspace: &Workspace,
    file_path: &str,
) {
    let changed_files = treq_lib::core::list_changed_files(&repo.repo_path, Some(workspace.id))
        .expect("should list changed files");
    assert!(
        !changed_files.iter().any(|change| change.path == file_path),
        "expected '{}' to be absent from source working-copy changes",
        file_path
    );
}

fn assert_source_working_copy_hunks_do_not_contain_lines(
    repo: &TestRepo,
    workspace: &Workspace,
    file_path: &str,
    forbidden_lines: &[&str],
) {
    let hunks =
        treq_lib::core::list_file_hunks(&repo.repo_path, Some(workspace.id), file_path, "git")
            .expect("should list file hunks");
    let all_hunk_lines = hunks
        .iter()
        .flat_map(|h| h.lines.iter())
        .cloned()
        .collect::<Vec<String>>();
    for forbidden_line in forbidden_lines {
        assert!(
            !all_hunk_lines
                .iter()
                .any(|line| line.contains(forbidden_line)),
            "expected moved line '{}' to be absent from source working-copy hunks for '{}'",
            forbidden_line,
            file_path
        );
    }
}

#[test]
fn moves_commits_parent_to_child() {
    let repo = TestRepo::new().expect("should create repo");
    let (parent, child) = setup_parent_child_graph(&repo);
    let commit_id =
        make_commit_fixture(&repo, &parent, "commit-parent-to-child.txt", "parent-child");

    assert_history_contains_commit(&repo, &parent, &commit_id);

    let result = treq_lib::core::move_workspace_changes(
        &repo.repo_path,
        &parent.branch_name,
        &child.branch_name,
        WorkspaceMoveRequest {
            commits: vec![commit_id.clone()],
            ..WorkspaceMoveRequest::default()
        },
    )
    .expect("move commits should succeed");

    assert_eq!(result.commits_moved, 1);
    assert_history_does_not_contain_commit(&repo, &parent, &commit_id);
}

#[test]
fn moves_files_parent_to_child() {
    let repo = TestRepo::new().expect("should create repo");
    let (parent, child) = setup_parent_child_graph(&repo);
    make_file_fixture(
        &repo,
        &parent,
        "files-parent-to-child.txt",
        "file-parent-child\n",
    );

    let result = treq_lib::core::move_workspace_changes(
        &repo.repo_path,
        &parent.branch_name,
        &child.branch_name,
        WorkspaceMoveRequest {
            files: vec!["files-parent-to-child.txt".to_string()],
            ..WorkspaceMoveRequest::default()
        },
    )
    .expect("move files should succeed");

    assert_eq!(result.files_moved, 1);
    assert!(
        read_workspace_file(&repo, &child, "files-parent-to-child.txt")
            .contains("file-parent-child")
    );
    assert_source_working_copy_not_changed_for_file(&repo, &parent, "files-parent-to-child.txt");
}

#[test]
fn moves_hunks_parent_to_child() {
    let repo = TestRepo::new().expect("should create repo");
    let (parent, child) = setup_parent_child_graph(&repo);
    make_hunk_fixture(&repo, &parent, "hunks-parent-to-child.txt");

    let result = treq_lib::core::move_workspace_changes(
        &repo.repo_path,
        &parent.branch_name,
        &child.branch_name,
        WorkspaceMoveRequest {
            hunks: vec![
                HunkSpec {
                    file_path: "hunks-parent-to-child.txt".to_string(),
                    start_line: 2,
                    end_line: 3,
                },
                HunkSpec {
                    file_path: "hunks-parent-to-child.txt".to_string(),
                    start_line: 9,
                    end_line: 10,
                },
            ],
            ..WorkspaceMoveRequest::default()
        },
    )
    .expect("move hunks should succeed");

    assert_eq!(result.hunks_applied, 1);
    assert_eq!(result.hunks_skipped, 1);
    assert!(result
        .warnings
        .iter()
        .any(|w| w.contains("source range out of bounds")));

    let source_content = read_workspace_file(&repo, &parent, "hunks-parent-to-child.txt");
    let destination_content = read_workspace_file(&repo, &child, "hunks-parent-to-child.txt");
    assert!(source_content.contains("line-1\nline-4\n"));
    assert!(destination_content.contains("line-2\nline-3\n"));
    assert_source_working_copy_hunks_do_not_contain_lines(
        &repo,
        &parent,
        "hunks-parent-to-child.txt",
        &["line-2", "line-3"],
    );
}

#[test]
fn moves_commits_child_to_parent() {
    let repo = TestRepo::new().expect("should create repo");
    let (parent, child) = setup_parent_child_graph(&repo);
    let commit_id =
        make_commit_fixture(&repo, &child, "commit-child-to-parent.txt", "child-parent");

    assert_history_contains_commit(&repo, &child, &commit_id);

    let result = treq_lib::core::move_workspace_changes(
        &repo.repo_path,
        &child.branch_name,
        &parent.branch_name,
        WorkspaceMoveRequest {
            commits: vec![commit_id.clone()],
            ..WorkspaceMoveRequest::default()
        },
    )
    .expect("move commits should succeed");

    assert_eq!(result.commits_moved, 1);
    assert_history_does_not_contain_commit(&repo, &child, &commit_id);
}

#[test]
fn moves_files_child_to_parent() {
    let repo = TestRepo::new().expect("should create repo");
    let (parent, child) = setup_parent_child_graph(&repo);
    make_file_fixture(
        &repo,
        &child,
        "files-child-to-parent.txt",
        "file-child-parent\n",
    );

    let result = treq_lib::core::move_workspace_changes(
        &repo.repo_path,
        &child.branch_name,
        &parent.branch_name,
        WorkspaceMoveRequest {
            files: vec!["files-child-to-parent.txt".to_string()],
            ..WorkspaceMoveRequest::default()
        },
    )
    .expect("move files should succeed");

    assert_eq!(result.files_moved, 1);
    assert!(
        read_workspace_file(&repo, &parent, "files-child-to-parent.txt")
            .contains("file-child-parent")
    );
    assert_source_working_copy_not_changed_for_file(&repo, &child, "files-child-to-parent.txt");
}

#[test]
fn moves_hunks_child_to_parent() {
    let repo = TestRepo::new().expect("should create repo");
    let (parent, child) = setup_parent_child_graph(&repo);
    make_hunk_fixture(&repo, &child, "hunks-child-to-parent.txt");

    let result = treq_lib::core::move_workspace_changes(
        &repo.repo_path,
        &child.branch_name,
        &parent.branch_name,
        WorkspaceMoveRequest {
            hunks: vec![
                HunkSpec {
                    file_path: "hunks-child-to-parent.txt".to_string(),
                    start_line: 2,
                    end_line: 3,
                },
                HunkSpec {
                    file_path: "hunks-child-to-parent.txt".to_string(),
                    start_line: 99,
                    end_line: 100,
                },
            ],
            ..WorkspaceMoveRequest::default()
        },
    )
    .expect("move hunks should succeed");

    assert_eq!(result.hunks_applied, 1);
    assert_eq!(result.hunks_skipped, 1);
    assert!(result
        .warnings
        .iter()
        .any(|w| w.contains("source range out of bounds")));

    let source_content = read_workspace_file(&repo, &child, "hunks-child-to-parent.txt");
    let destination_content = read_workspace_file(&repo, &parent, "hunks-child-to-parent.txt");
    assert!(source_content.contains("line-1\nline-4\n"));
    assert!(destination_content.contains("line-2\nline-3\n"));
    assert_source_working_copy_hunks_do_not_contain_lines(
        &repo,
        &child,
        "hunks-child-to-parent.txt",
        &["line-2", "line-3"],
    );
}

#[test]
fn moves_commits_between_siblings() {
    let repo = TestRepo::new().expect("should create repo");
    let (left, right) = setup_sibling_graph(&repo);
    let commit_id = make_commit_fixture(&repo, &left, "commit-left-to-right.txt", "left-right");

    assert_history_contains_commit(&repo, &left, &commit_id);

    let result = treq_lib::core::move_workspace_changes(
        &repo.repo_path,
        &left.branch_name,
        &right.branch_name,
        WorkspaceMoveRequest {
            commits: vec![commit_id.clone()],
            ..WorkspaceMoveRequest::default()
        },
    )
    .expect("move commits should succeed");

    assert_eq!(result.commits_moved, 1);
    assert_history_does_not_contain_commit(&repo, &left, &commit_id);
}

#[test]
fn moves_files_between_siblings() {
    let repo = TestRepo::new().expect("should create repo");
    let (left, right) = setup_sibling_graph(&repo);
    make_file_fixture(&repo, &left, "files-left-to-right.txt", "file-left-right\n");

    let result = treq_lib::core::move_workspace_changes(
        &repo.repo_path,
        &left.branch_name,
        &right.branch_name,
        WorkspaceMoveRequest {
            files: vec!["files-left-to-right.txt".to_string()],
            ..WorkspaceMoveRequest::default()
        },
    )
    .expect("move files should succeed");

    assert_eq!(result.files_moved, 1);
    assert!(
        read_workspace_file(&repo, &right, "files-left-to-right.txt").contains("file-left-right")
    );
    assert_source_working_copy_not_changed_for_file(&repo, &left, "files-left-to-right.txt");
}

#[test]
fn moves_hunks_between_siblings() {
    let repo = TestRepo::new().expect("should create repo");
    let (left, right) = setup_sibling_graph(&repo);
    make_hunk_fixture(&repo, &left, "hunks-left-to-right.txt");

    let result = treq_lib::core::move_workspace_changes(
        &repo.repo_path,
        &left.branch_name,
        &right.branch_name,
        WorkspaceMoveRequest {
            hunks: vec![
                HunkSpec {
                    file_path: "hunks-left-to-right.txt".to_string(),
                    start_line: 2,
                    end_line: 3,
                },
                HunkSpec {
                    file_path: "hunks-left-to-right.txt".to_string(),
                    start_line: 77,
                    end_line: 88,
                },
            ],
            ..WorkspaceMoveRequest::default()
        },
    )
    .expect("move hunks should succeed");

    assert_eq!(result.hunks_applied, 1);
    assert_eq!(result.hunks_skipped, 1);
    assert!(result
        .warnings
        .iter()
        .any(|w| w.contains("source range out of bounds")));

    let source_content = read_workspace_file(&repo, &left, "hunks-left-to-right.txt");
    let destination_content = read_workspace_file(&repo, &right, "hunks-left-to-right.txt");
    assert!(source_content.contains("line-1\nline-4\n"));
    assert!(destination_content.contains("line-2\nline-3\n"));
    assert_source_working_copy_hunks_do_not_contain_lines(
        &repo,
        &left,
        "hunks-left-to-right.txt",
        &["line-2", "line-3"],
    );
}

#[test]
fn moves_combined_selectors_in_commit_file_hunk_order() {
    let repo = TestRepo::new().expect("should create repo");
    let (left, right) = setup_sibling_graph(&repo);

    let commit_id = make_commit_fixture(&repo, &left, "combo-commit.txt", "combo-commit");
    make_file_fixture(&repo, &left, "combo-file.txt", "combo-file\n");
    make_hunk_fixture(&repo, &left, "combo-hunk.txt");

    let result = treq_lib::core::move_workspace_changes(
        &repo.repo_path,
        &left.branch_name,
        &right.branch_name,
        WorkspaceMoveRequest {
            commits: vec![commit_id],
            files: vec!["combo-file.txt".to_string()],
            hunks: vec![HunkSpec {
                file_path: "combo-hunk.txt".to_string(),
                start_line: 2,
                end_line: 3,
            }],
        },
    )
    .expect("combined move should succeed");

    assert_eq!(result.commits_moved, 1);
    assert_eq!(result.files_moved, 1);
    assert_eq!(result.hunks_applied, 1);

    assert!(read_workspace_file(&repo, &right, "combo-commit.txt").contains("combo-commit"));
    assert!(read_workspace_file(&repo, &right, "combo-file.txt").contains("combo-file"));
    assert!(read_workspace_file(&repo, &right, "combo-hunk.txt").contains("line-2\nline-3\n"));
}

#[test]
fn returns_error_when_commit_not_in_source_history() {
    let repo = TestRepo::new().expect("should create repo");
    let (parent, child) = setup_parent_child_graph(&repo);

    let err = treq_lib::core::move_workspace_changes(
        &repo.repo_path,
        &parent.branch_name,
        &child.branch_name,
        WorkspaceMoveRequest {
            commits: vec!["missing-commit-id".to_string()],
            ..WorkspaceMoveRequest::default()
        },
    )
    .expect_err("should fail for commit not found in source history");

    assert!(err.contains("not found in source workspace history"));
}
