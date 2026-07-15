use crate::binary_paths::{detect_binary, get_binary_path, get_extended_path};
pub use crate::github::{GitRemoteInfo, PrInfo};

/// Run `gh pr view` for the given branch in the given repo directory.
/// Returns None if gh is not installed, not authenticated, or no PR exists.
#[tauri::command]
pub fn get_pr_info_via_gh(
    repo_path: String,
    branch_name: String,
) -> Result<Option<PrInfo>, String> {
    let gh = get_binary_path("gh")
        .or_else(|| detect_binary("gh"))
        .ok_or_else(|| "gh CLI not found".to_string())?;

    crate::github::get_pr_info_via_gh_impl(&gh, &repo_path, &branch_name, &get_extended_path())
}

/// Read the GitHub remote URL from .git/config and parse owner/repo.
/// Returns None if no GitHub remote is found.
#[tauri::command]
pub fn get_git_remote_url(repo_path: String) -> Result<Option<GitRemoteInfo>, String> {
    crate::github::get_git_remote_url_impl(&repo_path)
}
