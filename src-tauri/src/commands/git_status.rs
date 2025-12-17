use crate::git::{
    checkout_branch, execute_post_create_command, get_branch_info, get_branch_divergence,
    get_current_branch, get_git_status, git_init, is_git_repository, list_branches,
    list_branches_detailed, list_gitignored_files, BranchDivergence, BranchInfo, BranchListItem,
    GitStatus,
};
use crate::git2_ops;
use crate::git_ops::{
    self, BranchCommitInfo, BranchDiffFileChange, BranchDiffFileDiff, LineDiffStats,
};
use crate::{ensure_repo_ready, AppState};
use tauri::{AppHandle, State};

#[tauri::command]
pub fn git_get_current_branch(
    state: State<AppState>,
    app: AppHandle,
    repo_path: String,
) -> Result<String, String> {
    ensure_repo_ready(&state, &app, &repo_path)?;
    get_current_branch(&repo_path)
}

#[tauri::command]
pub fn git_execute_post_create_command(
    workspace_path: String,
    command: String,
) -> Result<String, String> {
    execute_post_create_command(&workspace_path, &command)
}

#[tauri::command]
pub fn git_get_status(workspace_path: String) -> Result<GitStatus, String> {
    // Try git2 first (faster), fallback to subprocess if it fails
    git2_ops::get_status_git2(&workspace_path).or_else(|_| get_git_status(&workspace_path))
}

#[tauri::command]
pub fn git_get_branch_info(workspace_path: String) -> Result<BranchInfo, String> {
    // Try git2 first (faster), fallback to subprocess if it fails
    git2_ops::get_branch_info_git2(&workspace_path).or_else(|_| get_branch_info(&workspace_path))
}

#[tauri::command]
pub fn git_get_branch_divergence(
    workspace_path: String,
    base_branch: String,
) -> Result<crate::git::BranchDivergence, String> {
    // Try git2 first (faster), fallback to subprocess if it fails
    git2_ops::get_divergence_git2(&workspace_path, &base_branch)
        .or_else(|_| get_branch_divergence(&workspace_path, &base_branch))
}

#[tauri::command]
pub fn git_get_line_diff_stats(
    workspace_path: String,
    base_branch: String,
) -> Result<LineDiffStats, String> {
    git_ops::git_get_line_diff_stats(&workspace_path, &base_branch)
}

#[tauri::command]
pub fn git_get_diff_between_branches(
    repo_path: String,
    base_branch: String,
    head_branch: String,
) -> Result<Vec<BranchDiffFileDiff>, String> {
    git_ops::git_get_diff_between_branches(&repo_path, &base_branch, &head_branch)
}

#[tauri::command]
pub fn git_get_changed_files_between_branches(
    repo_path: String,
    base_branch: String,
    head_branch: String,
) -> Result<Vec<BranchDiffFileChange>, String> {
    git_ops::git_get_changed_files_between_branches(&repo_path, &base_branch, &head_branch)
}

#[tauri::command]
pub fn git_get_commits_between_branches(
    repo_path: String,
    base_branch: String,
    head_branch: String,
    limit: Option<usize>,
) -> Result<Vec<BranchCommitInfo>, String> {
    git_ops::git_get_commits_between_branches(&repo_path, &base_branch, &head_branch, limit)
}

#[tauri::command]
pub fn git_list_branches(repo_path: String) -> Result<Vec<String>, String> {
    list_branches(&repo_path)
}

#[tauri::command]
pub fn git_list_branches_detailed(repo_path: String) -> Result<Vec<BranchListItem>, String> {
    list_branches_detailed(&repo_path)
}

#[tauri::command]
pub fn git_checkout_branch(
    repo_path: String,
    branch_name: String,
    create_new: bool,
) -> Result<String, String> {
    checkout_branch(&repo_path, &branch_name, create_new)
}

#[tauri::command]
pub fn git_is_repository(path: String) -> Result<bool, String> {
    is_git_repository(&path)
}

#[tauri::command]
pub fn git_init_repo(path: String) -> Result<String, String> {
    git_init(&path)
}

#[tauri::command]
pub fn git_list_gitignored_files(repo_path: String) -> Result<Vec<String>, String> {
    list_gitignored_files(&repo_path)
}

/// Combined struct containing all workspace git info
#[derive(serde::Serialize)]
pub struct WorkspaceGitInfo {
    pub status: GitStatus,
    pub branch_info: BranchInfo,
    pub divergence: Option<BranchDivergence>,
    pub line_diff_stats: Option<LineDiffStats>,
}

/// Combined command that fetches all git status info in parallel
#[tauri::command]
pub fn git_get_workspace_info(
    workspace_path: String,
    base_branch: Option<String>,
) -> Result<WorkspaceGitInfo, String> {
    use std::thread;

    let path1 = workspace_path.clone();
    let path2 = workspace_path.clone();
    let path3 = workspace_path.clone();
    let path4 = workspace_path.clone();
    let base1 = base_branch.clone();
    let base2 = base_branch.clone();

    thread::scope(|s| {
        let status_handle = s.spawn(move || {
            git2_ops::get_status_git2(&path1).or_else(|_| get_git_status(&path1))
        });

        let branch_info_handle = s.spawn(move || {
            git2_ops::get_branch_info_git2(&path2).or_else(|_| get_branch_info(&path2))
        });

        let divergence_handle = s.spawn(move || {
            if let Some(base) = base1 {
                git2_ops::get_divergence_git2(&path3, &base)
                    .or_else(|_| get_branch_divergence(&path3, &base))
                    .ok()
            } else {
                None
            }
        });

        let line_diff_handle = s.spawn(move || {
            if let Some(base) = base2 {
                git_ops::git_get_line_diff_stats(&path4, &base).ok()
            } else {
                None
            }
        });

        let status = status_handle.join().map_err(|_| "Thread panic".to_string())??;
        let branch_info = branch_info_handle
            .join()
            .map_err(|_| "Thread panic".to_string())??;
        let divergence = divergence_handle
            .join()
            .map_err(|_| "Thread panic".to_string())?;
        let line_diff_stats = line_diff_handle
            .join()
            .map_err(|_| "Thread panic".to_string())?;

        Ok(WorkspaceGitInfo {
            status,
            branch_info,
            divergence,
            line_diff_stats,
        })
    })
}
