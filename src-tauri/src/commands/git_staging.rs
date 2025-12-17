use crate::git_ops::{self, DiffHunk, LineSelection};

#[tauri::command]
pub fn git_get_changed_files(workspace_path: String) -> Result<Vec<String>, String> {
    git_ops::git_get_changed_files(&workspace_path)
}

#[tauri::command]
pub fn git_stage_hunk(workspace_path: String, patch: String) -> Result<String, String> {
    git_ops::git_stage_hunk(&workspace_path, &patch)
}

#[tauri::command]
pub fn git_unstage_hunk(workspace_path: String, patch: String) -> Result<String, String> {
    git_ops::git_unstage_hunk(&workspace_path, &patch)
}

#[tauri::command]
pub fn git_get_file_hunks(workspace_path: String, file_path: String) -> Result<Vec<DiffHunk>, String> {
    git_ops::git_get_file_hunks(&workspace_path, &file_path)
}

#[tauri::command]
pub fn git_get_file_lines(
    workspace_path: String,
    file_path: String,
    is_staged: bool,
    start_line: usize,
    end_line: usize,
) -> Result<git_ops::FileLines, String> {
    git_ops::git_get_file_lines(&workspace_path, &file_path, is_staged, start_line, end_line)
}

#[tauri::command]
pub fn git_stage_selected_lines(
    workspace_path: String,
    file_path: String,
    selections: Vec<LineSelection>,
    metadata_lines: Vec<String>,
    hunks: Vec<(String, Vec<String>)>,
) -> Result<String, String> {
    git_ops::git_stage_selected_lines(
        &workspace_path,
        &file_path,
        selections,
        metadata_lines,
        hunks,
    )
}

#[tauri::command]
pub fn git_unstage_selected_lines(
    workspace_path: String,
    file_path: String,
    selections: Vec<LineSelection>,
    metadata_lines: Vec<String>,
    hunks: Vec<(String, Vec<String>)>,
) -> Result<String, String> {
    git_ops::git_unstage_selected_lines(
        &workspace_path,
        &file_path,
        selections,
        metadata_lines,
        hunks,
    )
}
