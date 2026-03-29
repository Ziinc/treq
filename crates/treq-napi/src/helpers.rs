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
    write_repo_file_impl(&repo_path, &relative_path, &content, append.unwrap_or(false))
        .map_err(napi::Error::from_reason)
}
