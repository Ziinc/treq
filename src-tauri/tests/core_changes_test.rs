mod e2e_test_helpers;

use e2e_test_helpers::TestRepo;
use std::fs;
use std::process::Command;

fn jj_binary() -> String {
    treq_lib::binary_paths::detect_binary("jj").unwrap_or_else(|| "jj".to_string())
}

fn run_jj(cwd: &str, args: &[&str]) -> Result<String, String> {
    let output = Command::new(jj_binary())
        .current_dir(cwd)
        .args(args)
        .output()
        .map_err(|e| format!("Failed to run jj: {}", e))?;
    if !output.status.success() {
        return Err(format!(
            "jj {} failed: {}",
            args.join(" "),
            String::from_utf8_lossy(&output.stderr)
        ));
    }
    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

fn get_change_id(cwd: &str, rev: &str) -> Result<String, String> {
    let output = run_jj(cwd, &["log", "-r", rev, "--no-graph", "-T", "change_id\n"])?;
    Ok(output.trim().to_string())
}

// =============================================================================
// Test: list_conflicted_files returns empty on a clean workspace
// =============================================================================

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
    )
    .expect("Failed to create workspace");

    let workspace_path = repo.workspaces_dir().join(&workspace.workspace_path);
    let workspace_path_str = workspace_path.to_str().unwrap();

    // Write a clean file and commit — no conflicts
    fs::write(workspace_path.join("clean.txt"), "no conflicts here").expect("Failed to write file");
    treq_lib::core::commit_workspace(&repo.repo_path, workspace.id, "clean commit")
        .expect("Failed to commit");

    let result = treq_lib::core::list_conflicted_files(workspace_path_str)
        .expect("list_conflicted_files should succeed on clean workspace");

    assert_eq!(
        result,
        Vec::<String>::new(),
        "Expected no conflicted files in a clean workspace"
    );
}

// =============================================================================
// Test: list_conflicted_files returns conflicted files after a rebase conflict
// =============================================================================

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
    )
    .expect("Failed to create workspace");

    let workspace_path = repo.workspaces_dir().join(&workspace.workspace_path);
    let workspace_path_str = workspace_path.to_str().unwrap();

    // In workspace: create conflict.txt and commit → sibling change A
    fs::write(workspace_path.join("conflict.txt"), "workspace version\n")
        .expect("Failed to write conflict.txt in workspace");
    treq_lib::core::commit_workspace(&repo.repo_path, workspace.id, "workspace commit")
        .expect("Failed to commit in workspace");

    let ws_change_id =
        get_change_id(workspace_path_str, "@-").expect("Failed to get workspace change_id");

    // In main repo working copy: create conflict.txt with different content and commit → sibling change B
    // Both A and B descend from the same parent (init), so rebasing A onto B creates a conflict.
    fs::write(
        std::path::Path::new(&repo.repo_path).join("conflict.txt"),
        "main version\n",
    )
    .expect("Failed to write conflict.txt in main repo");
    treq_lib::jj::jj_commit(&repo.repo_path, "main commit").expect("Failed to commit in main repo");

    let main_change_id =
        get_change_id(&repo.repo_path, "@-").expect("Failed to get main change_id");

    // In workspace: create a merge commit with both changes as parents.
    // Since ws_change and main_change both add conflict.txt with different content
    // from a common ancestor that doesn't have it, jj creates a conflict in @.
    run_jj(workspace_path_str, &["new", &ws_change_id, &main_change_id])
        .expect("Failed to create merge commit in workspace");

    // list_conflicted_files should now return conflict.txt
    let result = treq_lib::core::list_conflicted_files(workspace_path_str)
        .expect("list_conflicted_files should not error on workspace with conflicts");

    assert!(
        result.contains(&"conflict.txt".to_string()),
        "Expected conflict.txt in conflicted files, got: {:?}",
        result
    );
}
