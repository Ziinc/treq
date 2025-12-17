use crate::git;
use crate::git_ops::{self, MergeStrategy};

// Git merge operations
#[tauri::command]
pub fn git_merge(
    repo_path: String,
    branch: String,
    strategy: String,
    commit_message: Option<String>,
) -> Result<String, String> {
    let strategy = match strategy.as_str() {
        "regular" => MergeStrategy::Regular,
        "squash" => MergeStrategy::Squash,
        "no_ff" => MergeStrategy::NoFastForward,
        "ff_only" => MergeStrategy::FastForwardOnly,
        other => {
            return Err(format!("Unsupported merge strategy: {}", other));
        }
    };

    git_ops::git_merge(&repo_path, &branch, strategy, commit_message.as_deref())
}

#[tauri::command]
pub fn git_discard_all_changes(workspace_path: String) -> Result<String, String> {
    git_ops::git_discard_all_changes(&workspace_path)
}

#[tauri::command]
pub fn git_discard_files(workspace_path: String, file_paths: Vec<String>) -> Result<String, String> {
    git_ops::git_discard_files(&workspace_path, file_paths)
}

#[tauri::command]
pub fn git_has_uncommitted_changes(workspace_path: String) -> Result<bool, String> {
    git_ops::has_uncommitted_changes(&workspace_path)
}

#[tauri::command]
pub fn git_stash_push_files(
    workspace_path: String,
    file_paths: Vec<String>,
    message: String,
) -> Result<String, String> {
    git::git_stash_push_files(&workspace_path, file_paths, &message)
}

#[tauri::command]
pub fn git_stash_pop(workspace_path: String) -> Result<String, String> {
    git::git_stash_pop(&workspace_path)
}

// Git operations
#[tauri::command]
pub fn git_commit(workspace_path: String, message: String) -> Result<String, String> {
    git_ops::git_commit(&workspace_path, &message)
}

#[tauri::command]
pub fn git_add_all(workspace_path: String) -> Result<String, String> {
    git_ops::git_add_all(&workspace_path)
}

#[tauri::command]
pub fn git_unstage_all(workspace_path: String) -> Result<String, String> {
    git_ops::git_unstage_all(&workspace_path)
}

#[tauri::command]
pub fn git_push(workspace_path: String) -> Result<String, String> {
    git_ops::git_push(&workspace_path)
}

#[tauri::command]
pub fn git_push_force(workspace_path: String) -> Result<String, String> {
    git_ops::git_push_force(&workspace_path)
}

#[tauri::command]
pub fn git_commit_amend(workspace_path: String, message: String) -> Result<String, String> {
    git_ops::git_commit_amend(&workspace_path, &message)
}

#[tauri::command]
pub fn git_pull(workspace_path: String) -> Result<String, String> {
    git_ops::git_pull(&workspace_path)
}

#[tauri::command]
pub fn git_fetch(workspace_path: String) -> Result<String, String> {
    git_ops::git_fetch(&workspace_path)
}

#[tauri::command]
pub fn git_stage_file(workspace_path: String, file_path: String) -> Result<String, String> {
    git_ops::git_stage_file(&workspace_path, &file_path)
}

#[tauri::command]
pub fn git_unstage_file(workspace_path: String, file_path: String) -> Result<String, String> {
    git_ops::git_unstage_file(&workspace_path, &file_path)
}

#[tauri::command]
pub fn git_list_remotes(workspace_path: String) -> Result<Vec<String>, String> {
    git_ops::git_list_remotes(&workspace_path)
}
