use crate::binary_paths::{detect_binary, get_binary_path, get_extended_path};
pub use crate::github::{
    GhIssue, GhListPage, GhPullRequest, GhReviewThread, GitRemoteInfo, PrCiStatus, PrInfo,
};

fn gh_bin() -> Result<String, String> {
    get_binary_path("gh")
        .or_else(|| detect_binary("gh"))
        .ok_or_else(|| "gh CLI not found".to_string())
}

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

/// Run `gh pr checks` for the given branch in the given repo directory and
/// roll the individual check runs up into an overall CI status.
/// Returns None if gh is not installed, not authenticated, there is no PR,
/// or the PR has no checks reported yet.
#[tauri::command]
pub fn get_pr_checks_via_gh(
    repo_path: String,
    branch_name: String,
) -> Result<Option<PrCiStatus>, String> {
    let gh = get_binary_path("gh")
        .or_else(|| detect_binary("gh"))
        .ok_or_else(|| "gh CLI not found".to_string())?;

    crate::github::get_pr_checks_via_gh_impl(&gh, &repo_path, &branch_name, &get_extended_path())
}

/// Read the GitHub remote URL from .git/config and parse owner/repo.
/// Returns None if no GitHub remote is found.
#[tauri::command]
pub fn get_git_remote_url(repo_path: String) -> Result<Option<GitRemoteInfo>, String> {
    crate::github::get_git_remote_url_impl(&repo_path)
}

#[tauri::command]
pub fn gh_list_issues(
    repo_full_name: String,
    state: String,
    limit: Option<u32>,
    page: Option<u32>,
) -> Result<GhListPage<GhIssue>, String> {
    let gh = gh_bin()?;
    crate::github::gh_list_issues_impl(
        &gh,
        &repo_full_name,
        &state,
        limit.unwrap_or(crate::github::GH_LIST_PAGE_SIZE),
        page.unwrap_or(1),
        &get_extended_path(),
    )
}

#[tauri::command]
pub fn gh_view_issue(repo_full_name: String, issue_number: u64) -> Result<GhIssue, String> {
    let gh = gh_bin()?;
    crate::github::gh_view_issue_impl(&gh, &repo_full_name, issue_number, &get_extended_path())
}

#[tauri::command]
pub fn gh_create_issue(repo_full_name: String, title: String, body: String) -> Result<u64, String> {
    let gh = gh_bin()?;
    crate::github::gh_create_issue_impl(&gh, &repo_full_name, &title, &body, &get_extended_path())
}

#[tauri::command]
pub fn gh_create_issue_comment(
    repo_full_name: String,
    issue_number: u64,
    body: String,
) -> Result<(), String> {
    let gh = gh_bin()?;
    crate::github::gh_create_issue_comment_impl(
        &gh,
        &repo_full_name,
        issue_number,
        &body,
        &get_extended_path(),
    )
}

#[tauri::command]
pub fn gh_close_issue(repo_full_name: String, issue_number: u64) -> Result<(), String> {
    let gh = gh_bin()?;
    crate::github::gh_close_issue_impl(&gh, &repo_full_name, issue_number, &get_extended_path())
}

#[tauri::command]
pub fn gh_reopen_issue(repo_full_name: String, issue_number: u64) -> Result<(), String> {
    let gh = gh_bin()?;
    crate::github::gh_reopen_issue_impl(&gh, &repo_full_name, issue_number, &get_extended_path())
}

#[tauri::command]
pub fn gh_list_prs(
    repo_full_name: String,
    state: String,
    limit: Option<u32>,
    page: Option<u32>,
) -> Result<GhListPage<GhPullRequest>, String> {
    let gh = gh_bin()?;
    crate::github::gh_list_prs_impl(
        &gh,
        &repo_full_name,
        &state,
        limit.unwrap_or(crate::github::GH_LIST_PAGE_SIZE),
        page.unwrap_or(1),
        &get_extended_path(),
    )
}

#[tauri::command]
pub fn gh_view_pr(repo_full_name: String, pr_number: u64) -> Result<GhPullRequest, String> {
    let gh = gh_bin()?;
    crate::github::gh_view_pr_impl(&gh, &repo_full_name, pr_number, &get_extended_path())
}

#[tauri::command]
pub fn gh_create_pr_comment(
    repo_full_name: String,
    pr_number: u64,
    body: String,
) -> Result<(), String> {
    let gh = gh_bin()?;
    crate::github::gh_create_pr_comment_impl(
        &gh,
        &repo_full_name,
        pr_number,
        &body,
        &get_extended_path(),
    )
}

#[tauri::command]
pub fn gh_close_pr(repo_full_name: String, pr_number: u64) -> Result<(), String> {
    let gh = gh_bin()?;
    crate::github::gh_close_pr_impl(&gh, &repo_full_name, pr_number, &get_extended_path())
}

#[tauri::command]
pub fn gh_reopen_pr(repo_full_name: String, pr_number: u64) -> Result<(), String> {
    let gh = gh_bin()?;
    crate::github::gh_reopen_pr_impl(&gh, &repo_full_name, pr_number, &get_extended_path())
}

#[tauri::command]
pub fn gh_set_pr_draft(repo_full_name: String, pr_number: u64, draft: bool) -> Result<(), String> {
    let gh = gh_bin()?;
    crate::github::gh_set_pr_draft_impl(
        &gh,
        &repo_full_name,
        pr_number,
        draft,
        &get_extended_path(),
    )
}

/// List every review-comment thread on a PR, including resolved/outdated
/// state. Read-only: no replies, resolves, or other mutations are issued.
#[tauri::command]
pub fn gh_list_pr_review_threads(
    owner: String,
    repo: String,
    pr_number: u64,
) -> Result<Vec<GhReviewThread>, String> {
    let gh = gh_bin()?;
    crate::github::gh_list_pr_review_threads_impl(
        &gh,
        &owner,
        &repo,
        pr_number,
        &get_extended_path(),
    )
}

#[tauri::command]
pub fn gh_create_pr(
    repo_full_name: String,
    title: String,
    body: String,
    base_branch: String,
    head_branch: String,
    draft: Option<bool>,
) -> Result<u64, String> {
    let gh = gh_bin()?;
    crate::github::gh_create_pr_impl(
        &gh,
        &repo_full_name,
        &title,
        &body,
        &base_branch,
        &head_branch,
        draft.unwrap_or(false),
        &get_extended_path(),
    )
}
