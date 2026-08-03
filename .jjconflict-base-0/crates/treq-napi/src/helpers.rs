use crate::TestRepoInfo;
use napi_derive::napi;

#[path = "../../../src-tauri/tests/e2e_test_helpers.rs"]
mod e2e_test_helpers;

use e2e_test_helpers::TestRepo;

// Keep test repos alive for the duration of the test process.
// Tests should call cleanup_test_repo or just let the process exit.
static TEST_REPOS: std::sync::Mutex<Vec<TestRepo>> = std::sync::Mutex::new(Vec::new());

pub fn create_test_repo_impl(with_remote: bool) -> Result<TestRepoInfo, String> {
    let repo = e2e_test_helpers::create_test_repo(with_remote)?;

    let info = TestRepoInfo {
        temp_dir_path: repo.temp_dir.path().to_string_lossy().to_string(),
        repo_path: repo.repo_path.clone(),
        default_branch: repo.default_branch().to_string(),
    };

    TEST_REPOS.lock().map_err(|e| e.to_string())?.push(repo);

    Ok(info)
}

#[napi]
pub fn create_test_repo(with_remote: bool) -> napi::Result<TestRepoInfo> {
    create_test_repo_impl(with_remote).map_err(napi::Error::from_reason)
}

pub fn write_workspace_file_impl(
    workspace_path: &str,
    relative_path: &str,
    content: &str,
    append: bool,
) -> Result<String, String> {
    e2e_test_helpers::write_test_file(workspace_path, relative_path, content, append)
}

pub fn write_repo_file_impl(
    repo_path: &str,
    relative_path: &str,
    content: &str,
    append: bool,
) -> Result<String, String> {
    e2e_test_helpers::write_test_file(repo_path, relative_path, content, append)
}

/// The `jj` CLI snapshots the working copy before running any command, so a test that
/// used to shell out saw `@` already updated with on-disk edits. `jj_get_changed_files`
/// performs that same snapshot, so call it first to keep the CLI's semantics.
/// Best effort: a failed snapshot must not hide the revision the caller asked for.
fn snapshot_working_copy(workspace_path: &str) {
    let _ = treq_lib::jj::jj_get_changed_files(workspace_path);
}

pub fn resolve_commit_id_impl(workspace_path: &str, revision: &str) -> Result<String, String> {
    snapshot_working_copy(workspace_path);
    treq_lib::jj::jj_get_commit_id(workspace_path, revision).map_err(|e| e.to_string())
}

pub fn resolve_change_id_impl(workspace_path: &str, revision: &str) -> Result<String, String> {
    snapshot_working_copy(workspace_path);
    treq_lib::jj::jj_get_change_id(workspace_path, revision).map_err(|e| e.to_string())
}

pub fn resolve_revset_commit_ids_impl(
    workspace_path: &str,
    revset: &str,
) -> Result<Vec<String>, String> {
    snapshot_working_copy(workspace_path);
    treq_lib::jj::jj_log_revset_commit_ids(workspace_path, revset).map_err(|e| e.to_string())
}

pub fn new_commit_with_parents_impl(
    workspace_path: &str,
    parent_revisions: &[String],
) -> Result<String, String> {
    snapshot_working_copy(workspace_path);
    treq_lib::jj::jj_new_with_parents(workspace_path, parent_revisions).map_err(|e| e.to_string())
}

pub fn git_commit_all_impl(repo_path: &str, message: &str) -> Result<(), String> {
    TestRepo::run_git(repo_path, &["add", "."])?;
    TestRepo::run_git(repo_path, &["commit", "-m", message])?;
    Ok(())
}

#[napi]
pub fn write_workspace_file(
    workspace_path: String,
    relative_path: String,
    content: String,
    append: Option<bool>,
) -> napi::Result<String> {
    write_workspace_file_impl(
        &workspace_path,
        &relative_path,
        &content,
        append.unwrap_or(false),
    )
    .map_err(napi::Error::from_reason)
}

#[napi]
pub fn write_repo_file(
    repo_path: String,
    relative_path: String,
    content: String,
    append: Option<bool>,
) -> napi::Result<String> {
    write_repo_file_impl(
        &repo_path,
        &relative_path,
        &content,
        append.unwrap_or(false),
    )
    .map_err(napi::Error::from_reason)
}

#[napi]
pub fn git_commit_all(repo_path: String, message: String) -> napi::Result<()> {
    git_commit_all_impl(&repo_path, &message).map_err(napi::Error::from_reason)
}

/// Resolve a revision to its short commit id, without shelling out to the jj CLI.
#[napi]
pub fn resolve_commit_id(workspace_path: String, revision: String) -> napi::Result<String> {
    resolve_commit_id_impl(&workspace_path, &revision).map_err(napi::Error::from_reason)
}

/// Resolve a revision to its short change id, which survives later rewrites of that commit.
#[napi]
pub fn resolve_change_id(workspace_path: String, revision: String) -> napi::Result<String> {
    resolve_change_id_impl(&workspace_path, &revision).map_err(napi::Error::from_reason)
}

/// Resolve a revset to the short commit ids it matches (empty when it matches nothing).
#[napi]
pub fn resolve_revset_commit_ids(
    workspace_path: String,
    revset: String,
) -> napi::Result<Vec<String>> {
    resolve_revset_commit_ids_impl(&workspace_path, &revset).map_err(napi::Error::from_reason)
}

/// Create a new working-copy commit on the given parents (equivalent to `jj new <rev>...`).
#[napi]
pub fn new_commit_with_parents(
    workspace_path: String,
    parent_revisions: Vec<String>,
) -> napi::Result<String> {
    new_commit_with_parents_impl(&workspace_path, &parent_revisions)
        .map_err(napi::Error::from_reason)
}
