mod e2e_test_helpers;

use e2e_test_helpers::TestRepo;

#[test]
fn test_list_commits_invalid_workspace() {
    let repo = TestRepo::new().expect("Failed to create test repo");

    let result = treq_lib::core::list_commits(&repo.repo_path, Some(99999), false, None, None);
    assert!(
        result.is_err(),
        "Should return error for non-existent workspace"
    );
}

#[test]
fn test_list_commits_working_copy_diff_stats() {
    let repo = TestRepo::new().expect("Failed to create test repo");

    let workspace = treq_lib::core::create_workspace(
        &repo.repo_path,
        "feat/wc-diff-stats",
        Some("working copy diff stats test".to_string()),
        None,
        None,
        None, None,
    )
    .expect("Failed to create workspace");

    let workspace_path = repo.workspaces_dir().join(&workspace.workspace_path);
    let workspace_path_str = workspace_path
        .to_str()
        .expect("workspace path should be utf-8");

    // Write a file but don't commit — it stays in the working copy
    TestRepo::write_workspace_file(
        workspace_path_str,
        "new_file.txt",
        "line 1\nline 2\nline 3\nline 4\nline 5\n",
    )
    .expect("Failed to write file");

    let result =
        treq_lib::core::list_commits(&repo.repo_path, Some(workspace.id), false, None, None)
            .expect("Failed to list commits");

    let wc_commit = result.commits.iter().find(|c| c.is_working_copy);
    assert!(
        wc_commit.is_none(),
        "Should exclude working copy commits in the results"
    );
}

#[test]
fn test_list_commits_home_repo() {
    let repo = TestRepo::new().expect("Failed to create test repo");

    // Create a file in the home repo to ensure there's a change
    repo.create_file("home_file.txt", "home content\n")
        .expect("Failed to write file");

    let result = treq_lib::core::list_commits(&repo.repo_path, None, false, None, None)
        .expect("Failed to list commits for home repo");

    // Should have at least 1 commit (the working copy or initial commits)
    assert!(
        !result.commits.is_empty(),
        "Should have at least 1 commit for home repo"
    );
}

#[test]
fn test_list_commits_home_repo_with_committed_changes() {
    let repo = TestRepo::new().expect("Failed to create test repo");

    // Make a git commit on the home repo
    repo.commit_file(
        "committed_file.txt",
        "committed content\n",
        "Home repo commit",
    )
    .expect("Failed to create commit");

    let result = treq_lib::core::list_commits(&repo.repo_path, None, false, None, None)
        .expect("Failed to list commits for home repo");

    // Should include the committed change
    let committed: Vec<_> = result
        .commits
        .iter()
        .filter(|c| !c.is_working_copy)
        .collect();
    assert!(
        !committed.is_empty(),
        "Should have at least 1 committed change in home repo"
    );

    let descriptions: Vec<&str> = committed.iter().map(|c| c.description.as_str()).collect();
    assert!(
        descriptions.contains(&"Home repo commit"),
        "Should contain 'Home repo commit', got: {:?}",
        descriptions
    );
}

#[test]
fn test_list_commits_workspace_after_home_repo_jj_commits() {
    let repo = TestRepo::new().expect("Failed to create test repo");

    for idx in 0..13 {
        repo.commit_file(
            &format!("home_{}.txt", idx),
            &format!("home content {}\n", idx),
            &format!("Home commit {}", idx),
        )
        .expect("Failed to create home repo commit");
    }

    let workspace = treq_lib::core::create_workspace(
        &repo.repo_path,
        "feat/home-regression",
        Some("home regression".to_string()),
        None,
        None,
        None, None,
    )
    .expect("Failed to create workspace");

    let workspace_path = repo.workspaces_dir().join(&workspace.workspace_path);
    let workspace_path_str = workspace_path
        .to_str()
        .expect("workspace path should be utf-8");
    TestRepo::write_workspace_file(workspace_path_str, "workspace.txt", "workspace content\n")
        .expect("Failed to write workspace file");
    treq_lib::core::commit_workspace(&repo.repo_path, workspace.id, "Workspace commit")
        .expect("Failed to commit workspace change");

    let result =
        treq_lib::core::list_commits(&repo.repo_path, Some(workspace.id), true, None, None)
            .expect("Workspace list_commits should succeed after home repo jj commits");

    let descriptions: Vec<&str> = result
        .commits
        .iter()
        .filter(|c| !c.is_working_copy)
        .map(|c| c.description.as_str())
        .collect();
    assert!(
        descriptions.contains(&"Workspace commit"),
        "Should include workspace commit, got: {:?}",
        descriptions
    );

    let expanded_result =
        treq_lib::core::list_commits(&repo.repo_path, Some(workspace.id), true, Some(20), None)
            .expect("Expanded target branch history should succeed");
    let target_descriptions: Vec<&str> = expanded_result
        .commits
        .iter()
        .filter(|c| c.on_target_only)
        .map(|c| c.description.as_str())
        .collect();
    assert!(
        target_descriptions.contains(&"Home commit 0"),
        "Expanded target branch history should include oldest home commit, got: {:?}",
        target_descriptions,
    );
}

#[test]
fn test_list_commits_with_target_branch_history() {
    let repo = TestRepo::new().expect("Failed to create test repo");

    // Add commits to main (the base branch) BEFORE creating the workspace.
    repo.commit_file("base_file_1.txt", "base content 1\n", "Base commit 1")
        .expect("Failed to create base commit 1");
    repo.commit_file("base_file_2.txt", "base content 2\n", "Base commit 2")
        .expect("Failed to create base commit 2");

    // Create a workspace branching off current main
    let workspace = treq_lib::core::create_workspace(
        &repo.repo_path,
        "feat/target-history",
        Some("target history test".to_string()),
        None,
        None,
        None, None,
    )
    .expect("Failed to create workspace");

    let workspace_path = repo.workspaces_dir().join(&workspace.workspace_path);
    let workspace_path_str = workspace_path
        .to_str()
        .expect("workspace path should be utf-8");

    // Make a commit on the workspace branch
    TestRepo::write_workspace_file(workspace_path_str, "branch_file.txt", "branch content\n")
        .expect("Failed to write file");
    treq_lib::core::commit_workspace(&repo.repo_path, workspace.id, "Branch commit")
        .expect("Failed to commit");

    // Call with include_target_branch_history=true
    let result =
        treq_lib::core::list_commits(&repo.repo_path, Some(workspace.id), true, None, None)
            .expect("Failed to list commits");

    let workspace_descriptions: Vec<&str> = result
        .commits
        .iter()
        .filter(|c| !c.is_working_copy && !c.on_target_only)
        .map(|c| c.description.as_str())
        .collect();
    let target_descriptions: Vec<&str> = result
        .commits
        .iter()
        .filter(|c| c.on_target_only)
        .map(|c| c.description.as_str())
        .collect();

    assert!(workspace_descriptions.contains(&"Branch commit"));
    assert!(
        !workspace_descriptions.contains(&"Base commit 1"),
        "workspace commits should not include target history, got: {:?}",
        workspace_descriptions
    );
    assert!(
        !workspace_descriptions.contains(&"Base commit 2"),
        "workspace commits should not include target history, got: {:?}",
        workspace_descriptions
    );

    assert!(
        !target_descriptions.is_empty(),
        "target-only commits should not be empty"
    );
    assert!(
        target_descriptions.contains(&"Base commit 1"),
        "target-only commits should contain 'Base commit 1', got: {:?}",
        target_descriptions
    );
    assert!(
        target_descriptions.contains(&"Base commit 2"),
        "target-only commits should contain 'Base commit 2', got: {:?}",
        target_descriptions
    );
}

#[test]
fn test_list_commits_keeps_workspace_and_target_histories_disjoint() {
    let repo = TestRepo::new().expect("Failed to create test repo");

    repo.commit_file("base.txt", "base\n", "Base commit")
        .expect("Failed to create base commit");
    repo.commit_file("target-only.txt", "target only\n", "Target only commit")
        .expect("Failed to create target-only commit");

    let workspace = treq_lib::core::create_workspace(
        &repo.repo_path,
        "feat/disjoint-history",
        Some("disjoint history test".to_string()),
        None,
        None,
        None, None,
    )
    .expect("Failed to create workspace");

    let workspace_path = repo.workspaces_dir().join(&workspace.workspace_path);
    let workspace_path_str = workspace_path
        .to_str()
        .expect("workspace path should be utf-8");
    TestRepo::write_workspace_file(workspace_path_str, "workspace-only.txt", "workspace only\n")
        .expect("Failed to write workspace file");
    treq_lib::core::commit_workspace(&repo.repo_path, workspace.id, "Workspace only commit")
        .expect("Failed to commit workspace change");

    let result =
        treq_lib::core::list_commits(&repo.repo_path, Some(workspace.id), true, None, None)
            .expect("Failed to list commits");

    let workspace_descriptions: Vec<&str> = result
        .commits
        .iter()
        .filter(|c| !c.is_working_copy && !c.on_target_only)
        .map(|c| c.description.as_str())
        .collect();
    let target_descriptions: Vec<&str> = result
        .commits
        .iter()
        .filter(|c| c.on_target_only)
        .map(|c| c.description.as_str())
        .collect();

    assert!(
        workspace_descriptions.contains(&"Workspace only commit"),
        "workspace commits should include the workspace-only commit, got: {:?}",
        workspace_descriptions
    );
    assert!(
        !workspace_descriptions.contains(&"Target only commit"),
        "workspace commits should not include target-only commits, got: {:?}",
        workspace_descriptions
    );
    assert!(
        target_descriptions.contains(&"Target only commit"),
        "target-only commits should include the target-only commit, got: {:?}",
        target_descriptions
    );

    let workspace_commit_ids: std::collections::HashSet<&str> = result
        .commits
        .iter()
        .filter(|c| !c.on_target_only)
        .map(|c| c.commit_id.as_str())
        .collect();
    let target_commit_ids: std::collections::HashSet<&str> = result
        .commits
        .iter()
        .filter(|c| c.on_target_only)
        .map(|c| c.commit_id.as_str())
        .collect();
    let overlap: Vec<_> = workspace_commit_ids
        .intersection(&target_commit_ids)
        .copied()
        .collect();
    assert!(
        overlap.is_empty(),
        "workspace and target-only commits should be disjoint, overlap: {:?}",
        overlap
    );
}

#[test]
fn test_list_commits_target_branch_history_limits_to_10() {
    let repo = TestRepo::new().expect("Failed to create test repo");

    // Create >10 commits on main before workspace
    for i in 1..=15 {
        repo.commit_file(
            &format!("file_{}.txt", i),
            &format!("content {}\n", i),
            &format!("Main commit {}", i),
        )
        .expect(&format!("Failed to create commit {}", i));
    }

    let workspace = treq_lib::core::create_workspace(
        &repo.repo_path,
        "feat/limit-test",
        Some("limit test".to_string()),
        None,
        None,
        None, None,
    )
    .expect("Failed to create workspace");

    let result =
        treq_lib::core::list_commits(&repo.repo_path, Some(workspace.id), true, None, None)
            .expect("Failed to list commits");

    let target_only_count = result.commits.iter().filter(|c| c.on_target_only).count();
    assert!(
        target_only_count <= 10,
        "target-only commits should be limited to 10, got {}",
        target_only_count
    );
}

#[test]
fn test_list_commits_without_target_branch_history() {
    let repo = TestRepo::new().expect("Failed to create test repo");

    repo.commit_file("base.txt", "base\n", "Base commit")
        .expect("Failed to create base commit");

    let workspace = treq_lib::core::create_workspace(
        &repo.repo_path,
        "feat/no-history",
        Some("no history test".to_string()),
        None,
        None,
        None, None,
    )
    .expect("Failed to create workspace");

    repo.commit_workspace_file(
        &workspace,
        "workspace.txt",
        "workspace content\n",
        "Workspace commit",
    )
    .expect("Failed to commit workspace change");

    let result =
        treq_lib::core::list_commits(&repo.repo_path, Some(workspace.id), false, None, None)
            .expect("Failed to list commits");

    let workspace_descriptions: Vec<&str> = result
        .commits
        .iter()
        .filter(|c| !c.is_working_copy && !c.on_target_only)
        .map(|c| c.description.as_str())
        .collect();
    let target_descriptions: Vec<&str> = result
        .commits
        .iter()
        .filter(|c| c.on_target_only)
        .map(|c| c.description.as_str())
        .collect();

    assert!(
        workspace_descriptions.contains(&"Workspace commit"),
        "workspace commits should stay on the workspace side, got: {:?}",
        workspace_descriptions
    );
    assert!(
        target_descriptions.is_empty(),
        "target-only commits should be omitted when include_target_branch_history is false, got: {:?}",
        target_descriptions
    );
}

#[test]
fn test_list_commits_caches_commit_info_in_local_db() {
    let repo = TestRepo::new().expect("Failed to create test repo");

    let workspace = treq_lib::core::create_workspace(
        &repo.repo_path,
        "feat/cache-commit-info",
        Some("cache commit info test".to_string()),
        None,
        None,
        None, None,
    )
    .expect("Failed to create workspace");

    let workspace_path = repo.workspaces_dir().join(&workspace.workspace_path);
    let workspace_path_str = workspace_path
        .to_str()
        .expect("workspace path should be utf-8");

    TestRepo::write_workspace_file(
        workspace_path_str,
        "cached_file.txt",
        "line 1\nline 2\nline 3\n",
    )
    .expect("Failed to write file");
    treq_lib::core::commit_workspace(&repo.repo_path, workspace.id, "Cacheable commit")
        .expect("Failed to commit");

    // First call populates the cache as a side-effect.
    let first =
        treq_lib::core::list_commits(&repo.repo_path, Some(workspace.id), false, None, None)
            .expect("Failed to list commits");

    let original = first
        .commits
        .iter()
        .find(|c| !c.is_working_copy && c.description == "Cacheable commit")
        .expect("Should include 'Cacheable commit'");
    assert_eq!(original.description, "Cacheable commit");
    assert_eq!(original.insertions, 3);
    assert_eq!(original.deletions, 0);

    // Verify the commit_diff_stats cache table now has a row with the same metadata.
    let db_path = treq_lib::local_db::get_local_db_path(&repo.repo_path);
    let conn = rusqlite::Connection::open(&db_path).expect("Should open local db");
    let row_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM commit_diff_stats WHERE description = ?1",
            rusqlite::params!["Cacheable commit"],
            |row| row.get(0),
        )
        .expect("Should count cached rows");
    assert_eq!(
        row_count, 1,
        "list_commits should cache exactly one row for the committed change"
    );
}

#[test]
fn test_list_commits_target_branch_history_uses_local_bookmark_only() {
    let repo = TestRepo::with_remote().expect("Failed to create test repo with remote");

    // Create local-only advancement on main.
    repo.commit_file(
        "local_main_only.txt",
        "local-only main content\n",
        "Local main only commit",
    )
    .expect("Failed to create local main commit");

    // Create remote-only advancement on main so local `main` becomes conflicted after fetch.
    repo.remote_commit_file(
        "remote_main_only.txt",
        "remote-only main content\n",
        "Remote main only commit",
    )
    .expect("Failed to create remote main commit");
    treq_lib::jj::jj_git_fetch(&repo.repo_path).expect("Failed to fetch");

    let workspace = treq_lib::core::create_workspace(
        &repo.repo_path,
        "feat/local-target-main",
        Some("local target history".to_string()),
        None,
        None,
        None, None,
    )
    .expect("Failed to create workspace");

    let workspace_path = repo.workspaces_dir().join(&workspace.workspace_path);
    let workspace_path_str = workspace_path
        .to_str()
        .expect("workspace path should be utf-8");
    TestRepo::write_workspace_file(
        workspace_path_str,
        "workspace_only.txt",
        "workspace-only content\n",
    )
    .expect("Failed to write workspace file");
    treq_lib::core::commit_workspace(&repo.repo_path, workspace.id, "Workspace local commit")
        .expect("Failed to commit workspace change");

    let result =
        treq_lib::core::list_commits(&repo.repo_path, Some(workspace.id), true, Some(30), None)
            .expect("list_commits should succeed");

    let target_descriptions: Vec<&str> = result
        .commits
        .iter()
        .filter(|c| c.on_target_only)
        .map(|c| c.description.as_str())
        .collect();

    assert!(
        target_descriptions.contains(&"Local main only commit"),
        "target-only history should include local main commit, got: {:?}",
        target_descriptions
    );
    assert!(
        !target_descriptions.contains(&"Remote main only commit"),
        "target branch history should not fall back to remote main@git, got: {:?}",
        target_descriptions
    );
}

#[test]
fn test_default_branch_workspace_returns_full_history() {
    let repo = TestRepo::new().expect("Failed to create test repo");
    let default_branch = repo.default_branch();

    repo.commit_file("base_1.txt", "base 1\n", "Base commit 1")
        .expect("Failed to create base commit 1");
    repo.commit_file("base_2.txt", "base 2\n", "Base commit 2")
        .expect("Failed to create base commit 2");

    let workspace = treq_lib::core::create_workspace(
        &repo.repo_path,
        default_branch,
        Some("root main workspace".to_string()),
        None,
        None,
        None, None,
    )
    .expect("Failed to create main workspace");

    let result =
        treq_lib::core::list_commits(&repo.repo_path, Some(workspace.id), true, None, None)
            .expect("Failed to list commits");

    let committed_descriptions: Vec<&str> = result
        .commits
        .iter()
        .filter(|c| !c.is_working_copy)
        .map(|c| c.description.as_str())
        .collect();

    assert!(
        committed_descriptions.contains(&"Base commit 1"),
        "default-branch workspace should include base history, got: {:?}",
        committed_descriptions
    );
    assert!(
        committed_descriptions.contains(&"Base commit 2"),
        "default-branch workspace should include base history, got: {:?}",
        committed_descriptions
    );
}

#[test]
fn test_non_default_workspace_includes_target_history() {
    let repo = TestRepo::new().expect("Failed to create test repo");

    repo.commit_file("base_1.txt", "base 1\n", "Base commit 1")
        .expect("Failed to create base commit 1");
    repo.commit_file("base_2.txt", "base 2\n", "Base commit 2")
        .expect("Failed to create base commit 2");

    let workspace = treq_lib::core::create_workspace(
        &repo.repo_path,
        "feat/ahead-only",
        Some("ahead only workspace".to_string()),
        None,
        None,
        None, None,
    )
    .expect("Failed to create workspace");

    repo.commit_workspace_file(
        &workspace,
        "workspace_only.txt",
        "workspace\n",
        "Workspace commit",
    )
    .expect("Failed to commit workspace change");

    let result =
        treq_lib::core::list_commits(&repo.repo_path, Some(workspace.id), true, None, None)
            .expect("Failed to list commits");

    let workspace_descriptions: Vec<&str> = result
        .commits
        .iter()
        .filter(|c| !c.is_working_copy && !c.on_target_only)
        .map(|c| c.description.as_str())
        .collect();
    let target_descriptions: Vec<&str> = result
        .commits
        .iter()
        .filter(|c| c.on_target_only)
        .map(|c| c.description.as_str())
        .collect();

    assert!(
        workspace_descriptions.contains(&"Workspace commit"),
        "workspace history should include its own commit, got: {:?}",
        workspace_descriptions
    );
    assert!(
        !workspace_descriptions.contains(&"Base commit 1"),
        "workspace history should not include target branch history, got: {:?}",
        workspace_descriptions
    );
    assert!(
        !workspace_descriptions.contains(&"Base commit 2"),
        "workspace history should not include target branch history, got: {:?}",
        workspace_descriptions
    );
    assert!(
        target_descriptions.contains(&"Base commit 1"),
        "target-only commits should include base history, got: {:?}",
        target_descriptions
    );
    assert!(
        target_descriptions.contains(&"Base commit 2"),
        "target-only commits should include base history, got: {:?}",
        target_descriptions
    );
}

#[test]
fn test_non_default_workspace_empty_ahead_includes_target_history() {
    let repo = TestRepo::new().expect("Failed to create test repo");

    repo.commit_file("base_1.txt", "base 1\n", "Base commit 1")
        .expect("Failed to create base commit 1");
    repo.commit_file("base_2.txt", "base 2\n", "Base commit 2")
        .expect("Failed to create base commit 2");

    let workspace = treq_lib::core::create_workspace(
        &repo.repo_path,
        "feat/no-ahead",
        Some("no ahead workspace".to_string()),
        None,
        None,
        None, None,
    )
    .expect("Failed to create workspace");

    let result =
        treq_lib::core::list_commits(&repo.repo_path, Some(workspace.id), true, None, None)
            .expect("Failed to list commits");

    let workspace_descriptions: Vec<&str> = result
        .commits
        .iter()
        .filter(|c| !c.is_working_copy && !c.on_target_only)
        .map(|c| c.description.as_str())
        .collect();
    let target_descriptions: Vec<&str> = result
        .commits
        .iter()
        .filter(|c| c.on_target_only)
        .map(|c| c.description.as_str())
        .collect();

    assert!(
        workspace_descriptions.is_empty() || workspace_descriptions.contains(&"Workspace commit"),
        "workspace commits should stay on the workspace side, got: {:?}",
        workspace_descriptions
    );
    assert!(
        target_descriptions.contains(&"Base commit 1"),
        "target-only commits should include base history, got: {:?}",
        target_descriptions
    );
    assert!(
        target_descriptions.contains(&"Base commit 2"),
        "target-only commits should include base history, got: {:?}",
        target_descriptions
    );
}

#[test]
fn test_non_default_workspace_combined_history_has_no_duplicate_commit_ids() {
    let repo = TestRepo::new().expect("Failed to create test repo");

    repo.commit_file("base_1.txt", "base 1\n", "Base commit 1")
        .expect("Failed to create base commit 1");
    repo.commit_file("base_2.txt", "base 2\n", "Base commit 2")
        .expect("Failed to create base commit 2");

    let workspace = treq_lib::core::create_workspace(
        &repo.repo_path,
        "feat/dedupe",
        Some("dedupe workspace".to_string()),
        None,
        None,
        None, None,
    )
    .expect("Failed to create workspace");

    let workspace_path = repo.workspaces_dir().join(&workspace.workspace_path);
    let workspace_path_str = workspace_path
        .to_str()
        .expect("workspace path should be utf-8");
    TestRepo::write_workspace_file(workspace_path_str, "workspace_only.txt", "workspace\n")
        .expect("Failed to write workspace file");
    treq_lib::core::commit_workspace(&repo.repo_path, workspace.id, "Workspace commit")
        .expect("Failed to commit workspace change");

    let result =
        treq_lib::core::list_commits(&repo.repo_path, Some(workspace.id), true, None, None)
            .expect("Failed to list commits");

    let all_commit_ids: Vec<&str> = result
        .commits
        .iter()
        .filter(|c| !c.is_working_copy)
        .map(|c| c.commit_id.as_str())
        .collect();
    let unique_commit_ids: std::collections::HashSet<&str> =
        all_commit_ids.iter().copied().collect();

    assert_eq!(
        unique_commit_ids.len(),
        all_commit_ids.len(),
        "combined commits should have unique commit ids"
    );
}

#[test]
fn test_no_main_assumption_for_non_main_default() {
    let repo = TestRepo::new_without_init().expect("Failed to create test repo");

    TestRepo::run_git(&repo.repo_path, &["branch", "-m", "trunk"])
        .expect("Failed to rename default branch to trunk");
    TestRepo::run_git(&repo.repo_path, &["checkout", "trunk"])
        .expect("Failed to checkout trunk branch");

    let remote_path = repo.temp_dir.path().join("remote.git");
    TestRepo::ensure_dir(&remote_path).expect("Failed to create remote directory");
    TestRepo::run_git(&remote_path.to_string_lossy(), &["init", "--bare"])
        .expect("Failed to initialize bare remote");
    TestRepo::run_git(
        &repo.repo_path,
        &[
            "remote",
            "add",
            "origin",
            remote_path.to_str().expect("remote path should be utf-8"),
        ],
    )
    .expect("Failed to add origin remote");
    TestRepo::run_git(&repo.repo_path, &["push", "-u", "origin", "trunk"])
        .expect("Failed to push trunk to remote");
    TestRepo::run_git(&repo.repo_path, &["remote", "set-head", "origin", "trunk"])
        .expect("Failed to set origin HEAD to trunk");

    treq_lib::core::init(&repo.repo_path).expect("Failed to initialize treq");

    repo.commit_file("trunk_1.txt", "trunk 1\n", "Trunk commit 1")
        .expect("Failed to create trunk commit 1");
    repo.commit_file("trunk_2.txt", "trunk 2\n", "Trunk commit 2")
        .expect("Failed to create trunk commit 2");

    let workspace = treq_lib::core::create_workspace(
        &repo.repo_path,
        "trunk",
        Some("root trunk workspace".to_string()),
        None,
        None,
        None, None,
    )
    .expect("Failed to create trunk workspace");

    let result =
        treq_lib::core::list_commits(&repo.repo_path, Some(workspace.id), false, None, None)
            .expect("Failed to list commits");

    let committed_descriptions: Vec<&str> = result
        .commits
        .iter()
        .filter(|c| !c.is_working_copy)
        .map(|c| c.description.as_str())
        .collect();

    assert!(
        committed_descriptions.contains(&"Trunk commit 1"),
        "trunk default-branch workspace should include trunk history, got: {:?}",
        committed_descriptions
    );
    assert!(
        committed_descriptions.contains(&"Trunk commit 2"),
        "trunk default-branch workspace should include trunk history, got: {:?}",
        committed_descriptions
    );
}

#[test]
fn test_non_default_workspace_uses_non_main_default_target_history() {
    let repo = TestRepo::new_without_init().expect("Failed to create test repo");

    TestRepo::run_git(&repo.repo_path, &["branch", "-m", "trunk"])
        .expect("Failed to rename default branch to trunk");
    TestRepo::run_git(&repo.repo_path, &["checkout", "trunk"])
        .expect("Failed to checkout trunk branch");

    let remote_path = repo.temp_dir.path().join("remote.git");
    TestRepo::ensure_dir(&remote_path).expect("Failed to create remote directory");
    TestRepo::run_git(&remote_path.to_string_lossy(), &["init", "--bare"])
        .expect("Failed to initialize bare remote");
    TestRepo::run_git(
        &repo.repo_path,
        &[
            "remote",
            "add",
            "origin",
            remote_path.to_str().expect("remote path should be utf-8"),
        ],
    )
    .expect("Failed to add origin remote");
    TestRepo::run_git(&repo.repo_path, &["push", "-u", "origin", "trunk"])
        .expect("Failed to push trunk to remote");
    TestRepo::run_git(&repo.repo_path, &["remote", "set-head", "origin", "trunk"])
        .expect("Failed to set origin HEAD to trunk");

    treq_lib::core::init(&repo.repo_path).expect("Failed to initialize treq");

    repo.commit_file("trunk_1.txt", "trunk 1\n", "Trunk commit 1")
        .expect("Failed to create trunk commit 1");
    repo.commit_file("trunk_2.txt", "trunk 2\n", "Trunk commit 2")
        .expect("Failed to create trunk commit 2");

    let workspace = treq_lib::core::create_workspace(
        &repo.repo_path,
        "feat/trunk-target",
        Some("feature on trunk default".to_string()),
        None,
        None,
        None, None,
    )
    .expect("Failed to create workspace");

    let workspace_path = repo.workspaces_dir().join(&workspace.workspace_path);
    let workspace_path_str = workspace_path
        .to_str()
        .expect("workspace path should be utf-8");
    TestRepo::write_workspace_file(workspace_path_str, "workspace_only.txt", "workspace\n")
        .expect("Failed to write workspace file");
    treq_lib::core::commit_workspace(&repo.repo_path, workspace.id, "Workspace trunk commit")
        .expect("Failed to commit workspace change");

    let result =
        treq_lib::core::list_commits(&repo.repo_path, Some(workspace.id), true, None, None)
            .expect("Failed to list commits");

    let workspace_descriptions: Vec<&str> = result
        .commits
        .iter()
        .filter(|c| !c.is_working_copy && !c.on_target_only)
        .map(|c| c.description.as_str())
        .collect();
    let target_descriptions: Vec<&str> = result
        .commits
        .iter()
        .filter(|c| c.on_target_only)
        .map(|c| c.description.as_str())
        .collect();

    assert!(
        workspace_descriptions.contains(&"Workspace trunk commit"),
        "workspace history should include its own commit, got: {:?}",
        workspace_descriptions
    );
    assert!(
        !workspace_descriptions.contains(&"Trunk commit 1"),
        "workspace history should not include trunk target history, got: {:?}",
        workspace_descriptions
    );
    assert!(
        !workspace_descriptions.contains(&"Trunk commit 2"),
        "workspace history should not include trunk target history, got: {:?}",
        workspace_descriptions
    );
    assert!(
        target_descriptions.contains(&"Trunk commit 1"),
        "target branch commits should include trunk history, got: {:?}",
        target_descriptions
    );
    assert!(
        target_descriptions.contains(&"Trunk commit 2"),
        "target branch commits should include trunk history, got: {:?}",
        target_descriptions
    );
}

#[test]
fn test_unpushed_commits_on_default_branch_are_mutable() {
    // Pushed commits should be immutable; local-only commits on the default branch
    // should be mutable so users can edit/abandon them.
    let repo = TestRepo::with_remote().expect("Failed to create test repo with remote");
    let default_branch = repo.default_branch();

    // Push a commit to establish the remote tip.
    repo.commit_file("pushed.txt", "pushed\n", "Pushed commit")
        .expect("Failed to create pushed commit");
    TestRepo::run_git(&repo.repo_path, &["push", "origin", default_branch])
        .expect("Failed to push commit");

    // Add local commits that are NOT pushed.
    repo.commit_file("local_1.txt", "local 1\n", "Local commit 1")
        .expect("Failed to create local commit 1");
    repo.commit_file("local_2.txt", "local 2\n", "Local commit 2")
        .expect("Failed to create local commit 2");

    // Fetch to ensure jj knows about the remote state.
    treq_lib::jj::jj_git_fetch(&repo.repo_path).expect("Failed to fetch");

    let result = treq_lib::jj::jj_get_log(&repo.repo_path, default_branch, Some(true), None)
        .expect("Failed to list commits");

    let pushed_commit = result
        .commits
        .iter()
        .find(|c| c.description == "Pushed commit");
    let local_commit_1 = result
        .commits
        .iter()
        .find(|c| c.description == "Local commit 1");
    let local_commit_2 = result
        .commits
        .iter()
        .find(|c| c.description == "Local commit 2");

    assert!(
        pushed_commit.is_some(),
        "pushed commit should appear in log"
    );
    assert!(
        local_commit_1.is_some(),
        "local commit 1 should appear in log"
    );
    assert!(
        local_commit_2.is_some(),
        "local commit 2 should appear in log"
    );

    assert!(
        pushed_commit.unwrap().is_immutable,
        "pushed commit should be immutable (already shared)"
    );
    assert!(
        !local_commit_1.unwrap().is_immutable,
        "unpushed local commit 1 should be mutable"
    );
    assert!(
        !local_commit_2.unwrap().is_immutable,
        "unpushed local commit 2 should be mutable"
    );
}

#[test]
fn test_default_branch_without_remote_all_commits_immutable() {
    // When there is no remote, fall back to local bookmark — everything immutable.
    let repo = TestRepo::new().expect("Failed to create test repo");
    let default_branch = repo.default_branch();

    repo.commit_file("commit_1.txt", "content\n", "Commit 1")
        .expect("Failed to create commit 1");
    repo.commit_file("commit_2.txt", "content\n", "Commit 2")
        .expect("Failed to create commit 2");

    let result = treq_lib::jj::jj_get_log(&repo.repo_path, default_branch, Some(true), None)
        .expect("Failed to list commits");

    let non_wc_commits: Vec<_> = result
        .commits
        .iter()
        .filter(|c| !c.is_working_copy)
        .collect();
    assert!(!non_wc_commits.is_empty(), "should have commits");

    for commit in &non_wc_commits {
        assert!(
            commit.is_immutable,
            "without remote, commit '{}' should be immutable (fallback behavior)",
            commit.description
        );
    }
}
