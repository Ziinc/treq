use serde::Serialize;
use std::collections::HashMap;
use std::io::Write;
use std::process::{Command, Stdio};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MergeStrategy {
    Regular,
    Squash,
    NoFastForward,
    FastForwardOnly,
}

#[derive(Debug, Serialize)]
pub struct DiffHunk {
    pub id: String,
    pub header: String,
    pub lines: Vec<String>,
    pub is_staged: bool,
    pub patch: String,
}

#[derive(Debug, Serialize)]
pub struct FileLines {
    pub lines: Vec<String>,
    pub start_line: usize,
    pub end_line: usize,
}

#[derive(Debug, Serialize, Clone, Copy)]
#[serde(rename_all = "snake_case")]
pub enum DiffLineKind {
    Context,
    Addition,
    Deletion,
    Meta,
}

#[derive(Debug, Serialize)]
pub struct BranchDiffLine {
    pub content: String,
    pub kind: DiffLineKind,
    pub old_line: Option<usize>,
    pub new_line: Option<usize>,
}

#[derive(Debug, Serialize)]
pub struct BranchDiffHunk {
    pub header: String,
    pub lines: Vec<BranchDiffLine>,
}

#[derive(Debug, Serialize)]
pub struct BranchDiffFileDiff {
    pub path: String,
    pub previous_path: Option<String>,
    pub status: String,
    pub is_binary: bool,
    pub binary_message: Option<String>,
    pub metadata: Vec<String>,
    pub hunks: Vec<BranchDiffHunk>,
}

#[derive(Debug, Serialize, Clone)]
pub struct BranchDiffFileChange {
    pub path: String,
    pub previous_path: Option<String>,
    pub status: String,
}

#[derive(Debug, Serialize)]
pub struct BranchCommitInfo {
    pub hash: String,
    pub abbreviated_hash: String,
    pub author_name: String,
    pub author_email: String,
    pub date: String,
    pub message: String,
}

#[derive(Debug, Serialize)]
pub struct LineDiffStats {
    pub lines_added: usize,
    pub lines_deleted: usize,
}

/// Execute git commit with message
pub fn git_commit(worktree_path: &str, message: &str) -> Result<String, String> {
    let output = Command::new("git")
        .current_dir(worktree_path)
        .args(["commit", "-m", message])
        .output()
        .map_err(|e| e.to_string())?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

pub fn git_merge(
    repo_path: &str,
    branch: &str,
    strategy: MergeStrategy,
    commit_message: Option<&str>,
) -> Result<String, String> {
    let mut cmd = Command::new("git");
    cmd.current_dir(repo_path).arg("merge");

    match strategy {
        MergeStrategy::Regular => {}
        MergeStrategy::Squash => {
            cmd.arg("--squash");
        }
        MergeStrategy::NoFastForward => {
            cmd.arg("--no-ff");
        }
        MergeStrategy::FastForwardOnly => {
            cmd.arg("--ff-only");
        }
    }

    if let Some(message) = commit_message {
        let trimmed = message.trim();
        if !trimmed.is_empty()
            && strategy != MergeStrategy::Squash
            && strategy != MergeStrategy::FastForwardOnly
        {
            cmd.arg("-m").arg(trimmed);
        }
    }

    cmd.arg(branch);

    let merge_output = cmd.output().map_err(|e| e.to_string())?;

    if !merge_output.status.success() {
        return Err(String::from_utf8_lossy(&merge_output.stderr).to_string());
    }

    let mut response = String::new();
    response.push_str(&String::from_utf8_lossy(&merge_output.stdout));
    if !merge_output.stderr.is_empty() {
        if !response.is_empty() {
            response.push('\n');
        }
        response.push_str(&String::from_utf8_lossy(&merge_output.stderr));
    }

    if strategy == MergeStrategy::Squash {
        let commit_msg = commit_message
            .map(|msg| msg.trim().to_string())
            .filter(|msg| !msg.is_empty())
            .unwrap_or_else(|| format!("Squash merge branch {}", branch));

        let commit_output = Command::new("git")
            .current_dir(repo_path)
            .args(["commit", "-m", &commit_msg])
            .output()
            .map_err(|e| e.to_string())?;

        if !commit_output.status.success() {
            return Err(String::from_utf8_lossy(&commit_output.stderr).to_string());
        }

        if !response.is_empty() {
            response.push('\n');
        }
        response.push_str(&String::from_utf8_lossy(&commit_output.stdout));
        if !commit_output.stderr.is_empty() {
            response.push_str(&String::from_utf8_lossy(&commit_output.stderr));
        }
    }

    Ok(response)
}

pub fn git_discard_all_changes(worktree_path: &str) -> Result<String, String> {
    let reset_output = Command::new("git")
        .current_dir(worktree_path)
        .args(["reset", "--hard"])
        .output()
        .map_err(|e| e.to_string())?;

    if !reset_output.status.success() {
        return Err(String::from_utf8_lossy(&reset_output.stderr).to_string());
    }

    let clean_output = Command::new("git")
        .current_dir(worktree_path)
        .args(["clean", "-fd"])
        .output()
        .map_err(|e| e.to_string())?;

    if !clean_output.status.success() {
        return Err(String::from_utf8_lossy(&clean_output.stderr).to_string());
    }

    let mut response = String::new();
    response.push_str(&String::from_utf8_lossy(&reset_output.stdout));
    if !reset_output.stderr.is_empty() {
        response.push_str(&String::from_utf8_lossy(&reset_output.stderr));
    }
    response.push_str(&String::from_utf8_lossy(&clean_output.stdout));
    if !clean_output.stderr.is_empty() {
        response.push_str(&String::from_utf8_lossy(&clean_output.stderr));
    }

    Ok(response)
}

pub fn git_discard_files(worktree_path: &str, file_paths: Vec<String>) -> Result<String, String> {
    let mut response = String::new();

    // Get status of all files to determine which are tracked/untracked
    let status_output = Command::new("git")
        .current_dir(worktree_path)
        .args(["status", "--porcelain"])
        .output()
        .map_err(|e| e.to_string())?;

    if !status_output.status.success() {
        return Err(String::from_utf8_lossy(&status_output.stderr).to_string());
    }

    let status_str = String::from_utf8_lossy(&status_output.stdout);
    let mut untracked_files = Vec::new();
    let mut tracked_files = Vec::new();

    // Parse status to categorize files
    for file_path in &file_paths {
        let mut is_untracked = false;
        for line in status_str.lines() {
            if line.len() < 4 {
                continue;
            }
            let status_code = &line[0..2];
            let file_in_status = line[3..].trim();

            if file_in_status == file_path {
                // Check if file is untracked (status code "??")
                if status_code == "??" {
                    is_untracked = true;
                }
                break;
            }
        }

        if is_untracked {
            untracked_files.push(file_path);
        } else {
            tracked_files.push(file_path);
        }
    }

    // First, unstage any staged files (restore from HEAD to index)
    if !file_paths.is_empty() {
        let mut unstage_args = vec!["restore", "--staged"];
        for file_path in &file_paths {
            unstage_args.push(file_path);
        }

        let unstage_output = Command::new("git")
            .current_dir(worktree_path)
            .args(&unstage_args)
            .output()
            .map_err(|e| e.to_string())?;

        // Unstaging untracked files will fail, but that's okay
        if unstage_output.status.success() {
            response.push_str(&String::from_utf8_lossy(&unstage_output.stdout));
        }
    }

    // Discard tracked files (restore working tree from index)
    if !tracked_files.is_empty() {
        let mut restore_args = vec!["restore"];
        for file_path in &tracked_files {
            restore_args.push(file_path);
        }

        let restore_output = Command::new("git")
            .current_dir(worktree_path)
            .args(&restore_args)
            .output()
            .map_err(|e| e.to_string())?;

        if !restore_output.status.success() {
            return Err(String::from_utf8_lossy(&restore_output.stderr).to_string());
        }

        response.push_str(&String::from_utf8_lossy(&restore_output.stdout));
        if !restore_output.stderr.is_empty() {
            response.push_str(&String::from_utf8_lossy(&restore_output.stderr));
        }
    }

    // Remove untracked files
    for file_path in untracked_files {
        let file_full_path = std::path::Path::new(worktree_path).join(file_path);
        if file_full_path.exists() {
            if file_full_path.is_dir() {
                std::fs::remove_dir_all(&file_full_path)
                    .map_err(|e| format!("Failed to remove directory {}: {}", file_path, e))?;
            } else {
                std::fs::remove_file(&file_full_path)
                    .map_err(|e| format!("Failed to remove file {}: {}", file_path, e))?;
            }
            response.push_str(&format!("Removed untracked file: {}\n", file_path));
        }
    }

    if response.is_empty() {
        response = "Files discarded successfully".to_string();
    }

    Ok(response)
}

pub fn has_uncommitted_changes(worktree_path: &str) -> Result<bool, String> {
    let output = Command::new("git")
        .current_dir(worktree_path)
        .args(["status", "--porcelain"])
        .output()
        .map_err(|e| e.to_string())?;

    if output.status.success() {
        Ok(!output.stdout.is_empty())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

/// Stage all changes
pub fn git_add_all(worktree_path: &str) -> Result<String, String> {
    let output = Command::new("git")
        .current_dir(worktree_path)
        .args(["add", "."])
        .output()
        .map_err(|e| e.to_string())?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

/// Unstage all staged changes
pub fn git_unstage_all(worktree_path: &str) -> Result<String, String> {
    let output = Command::new("git")
        .current_dir(worktree_path)
        .args(["reset", "HEAD"])
        .output()
        .map_err(|e| e.to_string())?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

/// Push changes to remote
pub fn git_push(worktree_path: &str) -> Result<String, String> {
    let output = Command::new("git")
        .current_dir(worktree_path)
        .args(["push"])
        .output()
        .map_err(|e| e.to_string())?;

    if output.status.success() {
        let stdout = String::from_utf8_lossy(&output.stdout).to_string();
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        Ok(format!("{}{}", stdout, stderr))
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

/// Force push changes to remote (use with caution)
pub fn git_push_force(worktree_path: &str) -> Result<String, String> {
    let output = Command::new("git")
        .current_dir(worktree_path)
        .args(["push", "--force"])
        .output()
        .map_err(|e| e.to_string())?;

    if output.status.success() {
        let stdout = String::from_utf8_lossy(&output.stdout).to_string();
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        Ok(format!("{}{}", stdout, stderr))
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

/// Amend the last commit with a new message
pub fn git_commit_amend(worktree_path: &str, message: &str) -> Result<String, String> {
    let output = Command::new("git")
        .current_dir(worktree_path)
        .args(["commit", "--amend", "-m", message])
        .output()
        .map_err(|e| e.to_string())?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

/// Pull changes from remote
pub fn git_pull(worktree_path: &str) -> Result<String, String> {
    let output = Command::new("git")
        .current_dir(worktree_path)
        .args(["pull"])
        .output()
        .map_err(|e| e.to_string())?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

/// Fetch from remote
pub fn git_fetch(worktree_path: &str) -> Result<String, String> {
    let output = Command::new("git")
        .current_dir(worktree_path)
        .args(["fetch"])
        .output()
        .map_err(|e| e.to_string())?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

/// Stage specific file(s)
pub fn git_stage_file(worktree_path: &str, file_path: &str) -> Result<String, String> {
    let output = Command::new("git")
        .current_dir(worktree_path)
        .args(["add", file_path])
        .output()
        .map_err(|e| e.to_string())?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

/// Unstage specific file(s)
pub fn git_unstage_file(worktree_path: &str, file_path: &str) -> Result<String, String> {
    let output = Command::new("git")
        .current_dir(worktree_path)
        .args(["reset", "HEAD", file_path])
        .output()
        .map_err(|e| e.to_string())?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

/// Check if a git status entry represents a directory
/// Returns true if the entry is a directory based on:
/// 1. Trailing slash in path (git's standard convention)
/// 2. Filesystem verification (fallback for edge cases)
fn is_directory_entry(worktree_path: &str, status_entry: &str) -> bool {
    // Extract file path from porcelain format: "XY filename"
    let path_start = if status_entry.len() > 3 { 3 } else { 0 };
    let file_path = status_entry[path_start..].trim();

    // Git status adds '/' suffix to untracked directories
    if file_path.ends_with('/') {
        return true;
    }

    // Fallback: check filesystem for edge cases
    let full_path = std::path::Path::new(worktree_path).join(file_path);
    full_path.is_dir()
}

/// Get list of modified/untracked files (excluding .gitignore)
pub fn git_get_changed_files(worktree_path: &str) -> Result<Vec<String>, String> {
    let mut files: Vec<String> = Vec::new();

    // Get tracked changes (modified, added, deleted, staged)
    let status_output = Command::new("git")
        .current_dir(worktree_path)
        .args(["status", "--porcelain"])
        .output()
        .map_err(|e| e.to_string())?;

    if !status_output.status.success() {
        return Err(String::from_utf8_lossy(&status_output.stderr).to_string());
    }

    let status = String::from_utf8_lossy(&status_output.stdout);
    for line in status.lines() {
        if line.len() > 3 {
            // Filter out directory entries - only include files
            if !is_directory_entry(worktree_path, line) {
                // Return full porcelain format: "XY filename"
                files.push(line.to_string());
            }
        }
    }

    // Get untracked files (individual files, respecting .gitignore)
    // Prefix with "?? " to match porcelain format
    let untracked_output = Command::new("git")
        .current_dir(worktree_path)
        .args(["ls-files", "--others", "--exclude-standard"])
        .output()
        .map_err(|e| e.to_string())?;

    if untracked_output.status.success() {
        let untracked = String::from_utf8_lossy(&untracked_output.stdout);
        for line in untracked.lines() {
            if !line.is_empty() {
                // Format as porcelain: "?? filename"
                files.push(format!("?? {}", line));
            }
        }
    }

    Ok(files)
}

/// Get line-level diff statistics against a base branch
pub fn git_get_line_diff_stats(
    worktree_path: &str,
    base_branch: &str,
) -> Result<LineDiffStats, String> {
    let range = format!("{}...HEAD", base_branch);
    let output = Command::new("git")
        .current_dir(worktree_path)
        .args(["diff", "--numstat", &range])
        .output()
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut lines_added: usize = 0;
    let mut lines_deleted: usize = 0;

    for line in stdout.lines() {
        let parts: Vec<&str> = line.split('\t').collect();
        if parts.len() >= 2 {
            // Binary files show "-" instead of numbers
            if parts[0] != "-" {
                lines_added += parts[0].parse::<usize>().unwrap_or(0);
            }
            if parts[1] != "-" {
                lines_deleted += parts[1].parse::<usize>().unwrap_or(0);
            }
        }
    }

    Ok(LineDiffStats {
        lines_added,
        lines_deleted,
    })
}

pub fn git_get_changed_files_between_branches(
    repo_path: &str,
    base_branch: &str,
    head_branch: &str,
) -> Result<Vec<BranchDiffFileChange>, String> {
    let range = format!("{}..{}", base_branch, head_branch);
    let output = Command::new("git")
        .current_dir(repo_path)
        .args(["diff", "--name-status", &range])
        .output()
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut changes = Vec::new();

    for line in stdout.lines() {
        if line.trim().is_empty() {
            continue;
        }

        let mut parts = line.split('\t');
        let status_raw = parts.next().unwrap_or("").trim();
        let status = status_raw.chars().next().unwrap_or('M').to_string();
        let remaining: Vec<&str> = parts.collect();

        let (path, previous_path) = match remaining.as_slice() {
            [] => (String::new(), None),
            [single] => (single.trim().to_string(), None),
            [old_path, new_path] => (
                new_path.trim().to_string(),
                Some(old_path.trim().to_string()),
            ),
            _ => {
                let last = remaining.last().unwrap().trim().to_string();
                (last, None)
            }
        };

        if path.is_empty() {
            continue;
        }

        changes.push(BranchDiffFileChange {
            path,
            previous_path,
            status,
        });
    }

    Ok(changes)
}

pub fn git_get_diff_between_branches(
    repo_path: &str,
    base_branch: &str,
    head_branch: &str,
) -> Result<Vec<BranchDiffFileDiff>, String> {
    let range = format!("{}..{}", base_branch, head_branch);
    let changes = git_get_changed_files_between_branches(repo_path, base_branch, head_branch)?;
    let mut status_map: HashMap<String, BranchDiffFileChange> = HashMap::new();
    for change in changes.into_iter() {
        if let Some(prev) = &change.previous_path {
            status_map.insert(prev.clone(), change.clone());
        }
        status_map.insert(change.path.clone(), change);
    }

    let output = Command::new("git")
        .current_dir(repo_path)
        .args(["diff", "--unified=200", "--no-color", &range])
        .output()
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    let diff_text = String::from_utf8_lossy(&output.stdout);
    Ok(parse_branch_diff(&diff_text, &status_map))
}

pub fn git_get_commits_between_branches(
    repo_path: &str,
    base_branch: &str,
    head_branch: &str,
    limit: Option<usize>,
) -> Result<Vec<BranchCommitInfo>, String> {
    let range = format!("{}..{}", base_branch, head_branch);
    let max_count = limit.unwrap_or(50);
    let format = "%H\x1f%h\x1f%an\x1f%ae\x1f%ad\x1f%s\x1e";

    let output = Command::new("git")
        .current_dir(repo_path)
        .args([
            "log",
            &format!("--max-count={}", max_count),
            "--date=iso-strict",
            &format!("--pretty=format:{}", format),
            &range,
        ])
        .output()
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut commits = Vec::new();
    for record in stdout.split('\x1e') {
        if record.trim().is_empty() {
            continue;
        }
        let mut fields = record.split('\x1f');
        let hash = fields.next().unwrap_or("").trim();
        if hash.is_empty() {
            continue;
        }
        let abbreviated_hash = fields.next().unwrap_or("").trim().to_string();
        let author_name = fields.next().unwrap_or("").trim().to_string();
        let author_email = fields.next().unwrap_or("").trim().to_string();
        let date = fields.next().unwrap_or("").trim().to_string();
        let message = fields.next().unwrap_or("").trim().to_string();

        commits.push(BranchCommitInfo {
            hash: hash.to_string(),
            abbreviated_hash,
            author_name,
            author_email,
            date,
            message,
        });
    }

    Ok(commits)
}

pub fn git_stage_hunk(worktree_path: &str, patch: &str) -> Result<String, String> {
    apply_patch(worktree_path, patch, false)
}

pub fn git_unstage_hunk(worktree_path: &str, patch: &str) -> Result<String, String> {
    apply_patch(worktree_path, patch, true)
}

/// Represents a line selection for staging
#[derive(Debug, serde::Deserialize)]
pub struct LineSelection {
    /// The hunk index this line belongs to
    pub hunk_index: usize,
    /// The line index within the hunk
    pub line_index: usize,
    /// The line content (including +/- prefix)
    #[allow(dead_code)]
    pub content: String,
}

/// Stage selected lines from multiple hunks
/// This builds a custom patch containing only the selected changed lines with proper context
pub fn git_stage_selected_lines(
    worktree_path: &str,
    file_path: &str,
    selections: Vec<LineSelection>,
    metadata_lines: Vec<String>,
    hunks: Vec<(String, Vec<String>)>, // (header, lines) for each hunk
) -> Result<String, String> {
    let patch = build_selected_lines_patch(file_path, &metadata_lines, &hunks, &selections, false)?;
    apply_patch(worktree_path, &patch, false)
}

/// Unstage selected lines
pub fn git_unstage_selected_lines(
    worktree_path: &str,
    file_path: &str,
    selections: Vec<LineSelection>,
    metadata_lines: Vec<String>,
    hunks: Vec<(String, Vec<String>)>,
) -> Result<String, String> {
    let patch = build_selected_lines_patch(file_path, &metadata_lines, &hunks, &selections, true)?;
    apply_patch(worktree_path, &patch, true)
}

/// Build a patch containing only the selected changed lines with proper context
fn build_selected_lines_patch(
    file_path: &str,
    metadata_lines: &[String],
    hunks: &[(String, Vec<String>)],
    selections: &[LineSelection],
    _for_unstage: bool,
) -> Result<String, String> {
    if selections.is_empty() {
        return Err("No lines selected".to_string());
    }

    // Group selections by hunk
    let mut selections_by_hunk: std::collections::HashMap<usize, Vec<&LineSelection>> =
        std::collections::HashMap::new();
    for sel in selections {
        selections_by_hunk
            .entry(sel.hunk_index)
            .or_default()
            .push(sel);
    }

    let mut patch_parts: Vec<String> = Vec::new();

    // Add metadata
    let mut has_diff = false;
    let mut has_old = false;
    let mut has_new = false;

    for line in metadata_lines {
        if line.starts_with("diff --git") {
            has_diff = true;
            patch_parts.push(line.clone());
        } else if line.starts_with("index ")
            || line.starts_with("old mode")
            || line.starts_with("new mode")
            || line.starts_with("deleted file mode")
            || line.starts_with("new file mode")
            || line.starts_with("similarity index")
            || line.starts_with("rename from")
            || line.starts_with("rename to")
        {
            patch_parts.push(line.clone());
        } else if line.starts_with("--- ") {
            has_old = true;
            patch_parts.push(line.clone());
        } else if line.starts_with("+++ ") {
            has_new = true;
            patch_parts.push(line.clone());
        }
    }

    if !has_diff {
        patch_parts.push(format!("diff --git a/{0} b/{0}", file_path));
    }
    if !has_old {
        patch_parts.push(format!("--- a/{}", file_path));
    }
    if !has_new {
        patch_parts.push(format!("+++ b/{}", file_path));
    }

    // Process each hunk that has selections
    for (hunk_idx, (header, lines)) in hunks.iter().enumerate() {
        let Some(hunk_selections) = selections_by_hunk.get(&hunk_idx) else {
            continue;
        };

        // Parse the original hunk header to get starting line numbers
        let (old_start, new_start) = parse_hunk_header(header);

        // Build the new hunk with only selected changes
        let mut new_hunk_lines: Vec<String> = Vec::new();
        let mut old_count = 0usize;
        let mut new_count = 0usize;

        // Get the set of selected line indices
        let selected_indices: std::collections::HashSet<usize> =
            hunk_selections.iter().map(|s| s.line_index).collect();

        for (line_idx, line) in lines.iter().enumerate() {
            let first_char = line.chars().next().unwrap_or(' ');

            match first_char {
                '+' => {
                    if selected_indices.contains(&line_idx) {
                        // Include this addition
                        new_hunk_lines.push(line.clone());
                        new_count += 1;
                    }
                    // If not selected, we skip it (don't add to new file)
                }
                '-' => {
                    if selected_indices.contains(&line_idx) {
                        // Include this deletion
                        new_hunk_lines.push(line.clone());
                        old_count += 1;
                    } else {
                        // Convert unselected deletion to context line
                        let content = line.get(1..).unwrap_or("");
                        new_hunk_lines.push(format!(" {}", content));
                        old_count += 1;
                        new_count += 1;
                    }
                }
                ' ' | _ => {
                    // Context line - always include
                    new_hunk_lines.push(line.clone());
                    old_count += 1;
                    new_count += 1;
                }
            }
        }

        // Only add the hunk if it has actual changes
        let has_changes = new_hunk_lines
            .iter()
            .any(|l| l.starts_with('+') || l.starts_with('-'));

        if has_changes {
            // Create new header with updated counts
            let new_header = format!(
                "@@ -{},{} +{},{} @@",
                old_start, old_count, new_start, new_count
            );
            patch_parts.push(new_header);
            patch_parts.extend(new_hunk_lines);
        }
    }

    patch_parts.push(String::new());
    Ok(patch_parts.join("\n"))
}

pub fn git_get_file_hunks(worktree_path: &str, file_path: &str) -> Result<Vec<DiffHunk>, String> {
    let staged_diff = git_diff_for_file(worktree_path, file_path, true)?;
    let unstaged_diff = git_diff_for_file(worktree_path, file_path, false)?;

    let mut hunks = Vec::new();
    hunks.extend(parse_diff_hunks(&staged_diff, file_path, true, "staged", 0));
    let next_index = hunks.len();
    hunks.extend(parse_diff_hunks(
        &unstaged_diff,
        file_path,
        false,
        "unstaged",
        next_index,
    ));

    Ok(hunks)
}

fn git_diff_for_file(worktree_path: &str, file_path: &str, staged: bool) -> Result<String, String> {
    let mut cmd = Command::new("git");
    cmd.current_dir(worktree_path)
        .arg("diff")
        .arg("--unified=3");

    if staged {
        cmd.arg("--cached");
    }

    let output = cmd
        .arg("--")
        .arg(file_path)
        .output()
        .map_err(|e| e.to_string())?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

fn parse_diff_hunks(
    diff: &str,
    file_path: &str,
    is_staged: bool,
    prefix: &str,
    start_index: usize,
) -> Vec<DiffHunk> {
    if diff.trim().is_empty() {
        return Vec::new();
    }

    let mut metadata_lines: Vec<String> = Vec::new();
    let mut in_hunk = false;
    let mut current_header = String::new();
    let mut current_lines: Vec<String> = Vec::new();
    let mut hunks: Vec<DiffHunk> = Vec::new();
    let mut counter = start_index;

    for line in diff.lines() {
        if line.starts_with("@@") {
            if !current_header.is_empty() {
                push_hunk_entry(
                    &mut hunks,
                    file_path,
                    &metadata_lines,
                    &current_header,
                    &current_lines,
                    is_staged,
                    prefix,
                    counter,
                );
                counter += 1;
            }
            current_header = line.to_string();
            current_lines = vec![line.to_string()];
            in_hunk = true;
        } else if in_hunk {
            current_lines.push(line.to_string());
        } else {
            metadata_lines.push(line.to_string());
        }
    }

    if !current_header.is_empty() {
        push_hunk_entry(
            &mut hunks,
            file_path,
            &metadata_lines,
            &current_header,
            &current_lines,
            is_staged,
            prefix,
            counter,
        );
    }

    hunks
}

fn push_hunk_entry(
    hunks: &mut Vec<DiffHunk>,
    file_path: &str,
    metadata_lines: &[String],
    header: &str,
    lines: &[String],
    is_staged: bool,
    prefix: &str,
    index: usize,
) {
    if header.is_empty() || lines.is_empty() {
        return;
    }

    let display_lines = if lines.len() > 1 {
        lines[1..].to_vec()
    } else {
        Vec::new()
    };

    let patch = build_patch(file_path, metadata_lines, lines);
    hunks.push(DiffHunk {
        id: format!("{}-{}", prefix, index),
        header: header.to_string(),
        lines: display_lines,
        is_staged,
        patch,
    });
}

fn build_patch(file_path: &str, metadata_lines: &[String], hunk_lines: &[String]) -> String {
    let mut patch_parts: Vec<String> = Vec::new();

    let mut has_diff = false;
    let mut has_old = false;
    let mut has_new = false;

    for line in metadata_lines {
        if line.starts_with("diff --git") {
            has_diff = true;
            patch_parts.push(line.clone());
        } else if line.starts_with("index ")
            || line.starts_with("old mode")
            || line.starts_with("new mode")
            || line.starts_with("deleted file mode")
            || line.starts_with("new file mode")
            || line.starts_with("similarity index")
            || line.starts_with("rename from")
            || line.starts_with("rename to")
        {
            patch_parts.push(line.clone());
        } else if line.starts_with("--- ") {
            has_old = true;
            patch_parts.push(line.clone());
        } else if line.starts_with("+++ ") {
            has_new = true;
            patch_parts.push(line.clone());
        }
    }

    if !has_diff {
        patch_parts.push(format!("diff --git a/{0} b/{0}", file_path));
    }
    if !has_old {
        patch_parts.push(format!("--- a/{}", file_path));
    }
    if !has_new {
        patch_parts.push(format!("+++ b/{}", file_path));
    }

    patch_parts.extend(hunk_lines.iter().cloned());
    patch_parts.push(String::new());
    patch_parts.join("\n")
}

fn apply_patch(worktree_path: &str, patch: &str, reverse: bool) -> Result<String, String> {
    let mut cmd = Command::new("git");
    cmd.current_dir(worktree_path).arg("apply").arg("--cached");

    if reverse {
        cmd.arg("--reverse");
    }

    let mut child = cmd
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| e.to_string())?;

    {
        let stdin = child
            .stdin
            .as_mut()
            .ok_or_else(|| "Failed to open git apply stdin".to_string())?;
        stdin
            .write_all(patch.as_bytes())
            .map_err(|e| e.to_string())?;
    }

    let output = child.wait_with_output().map_err(|e| e.to_string())?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

fn parse_branch_diff(
    diff_text: &str,
    status_map: &HashMap<String, BranchDiffFileChange>,
) -> Vec<BranchDiffFileDiff> {
    fn normalize_diff_path(token: &str) -> String {
        let trimmed = token.trim().trim_matches('"');
        if let Some(stripped) = trimmed.strip_prefix("a/") {
            stripped.to_string()
        } else if let Some(stripped) = trimmed.strip_prefix("b/") {
            stripped.to_string()
        } else {
            trimmed.to_string()
        }
    }

    let mut files = Vec::new();
    let mut current_file: Option<BranchDiffFileDiff> = None;
    let mut current_hunk: Option<BranchDiffHunk> = None;
    let mut old_line = 0usize;
    let mut new_line = 0usize;

    let finalize_current_file =
        |current_file: &mut Option<BranchDiffFileDiff>,
         current_hunk: &mut Option<BranchDiffHunk>,
         files: &mut Vec<BranchDiffFileDiff>| {
            if let Some(mut file) = current_file.take() {
                if let Some(hunk) = current_hunk.take() {
                    file.hunks.push(hunk);
                }
                files.push(file);
            }
        };

    for line in diff_text.lines() {
        if line.starts_with("diff --git ") {
            finalize_current_file(&mut current_file, &mut current_hunk, &mut files);

            let mut parts = line.split_whitespace().skip(2);
            let old_token = parts.next().unwrap_or("");
            let new_token = parts.next().unwrap_or("");
            let old_path = normalize_diff_path(old_token);
            let mut path = normalize_diff_path(new_token);
            if path.is_empty() {
                path = old_path.clone();
            }

            let mut file_diff = BranchDiffFileDiff {
                path: path.clone(),
                previous_path: None,
                status: "M".to_string(),
                is_binary: false,
                binary_message: None,
                metadata: Vec::new(),
                hunks: Vec::new(),
            };

            if let Some(change) = status_map.get(&file_diff.path) {
                file_diff.status = change.status.clone();
                file_diff.previous_path = change.previous_path.clone();
            } else if let Some(change) = status_map.get(&old_path) {
                file_diff.status = change.status.clone();
                file_diff.previous_path = change
                    .previous_path
                    .clone()
                    .or_else(|| Some(old_path.clone()));
            }

            current_file = Some(file_diff);
            current_hunk = None;
            continue;
        }

        if let Some(ref mut file) = current_file {
            if line.starts_with("@@") {
                if let Some(hunk) = current_hunk.take() {
                    file.hunks.push(hunk);
                }
                let (old_start, new_start) = parse_hunk_header(line);
                old_line = old_start;
                new_line = new_start;
                current_hunk = Some(BranchDiffHunk {
                    header: line.to_string(),
                    lines: Vec::new(),
                });
                continue;
            }

            if line.starts_with("--- ") {
                file.metadata.push(line.to_string());
                continue;
            }

            if line.starts_with("+++ ") {
                file.metadata.push(line.to_string());
                let new_token = line.trim_start_matches("+++ ").trim();
                if new_token != "/dev/null" {
                    let normalized = normalize_diff_path(new_token);
                    if !normalized.is_empty() {
                        file.path = normalized.clone();
                        if let Some(change) = status_map.get(&file.path) {
                            file.status = change.status.clone();
                            file.previous_path = change.previous_path.clone();
                        }
                    }
                }
                continue;
            }

            if line.starts_with("rename from ") {
                file.metadata.push(line.to_string());
                let prev = line.trim_start_matches("rename from ").trim().to_string();
                if !prev.is_empty() {
                    file.previous_path = Some(prev);
                }
                continue;
            }

            if line.starts_with("rename to ") {
                file.metadata.push(line.to_string());
                let new_name = line.trim_start_matches("rename to ").trim().to_string();
                if !new_name.is_empty() {
                    file.path = new_name;
                }
                continue;
            }

            if line.starts_with("new file mode")
                || line.starts_with("deleted file mode")
                || line.starts_with("index ")
                || line.starts_with("similarity index")
                || line.starts_with("old mode")
                || line.starts_with("new mode")
            {
                file.metadata.push(line.to_string());
                continue;
            }

            if line.starts_with("Binary files") || line.starts_with("GIT binary patch") {
                file.is_binary = true;
                if file.binary_message.is_none() {
                    file.binary_message = Some(line.to_string());
                }
                file.metadata.push(line.to_string());
                continue;
            }

            if let Some(ref mut hunk) = current_hunk {
                if line.starts_with('\\') {
                    hunk.lines.push(BranchDiffLine {
                        content: line.to_string(),
                        kind: DiffLineKind::Meta,
                        old_line: None,
                        new_line: None,
                    });
                    continue;
                }

                if let Some(first_char) = line.chars().next() {
                    match first_char {
                        '+' => {
                            let content = line.get(1..).unwrap_or("").to_string();
                            hunk.lines.push(BranchDiffLine {
                                content,
                                kind: DiffLineKind::Addition,
                                old_line: None,
                                new_line: Some(new_line),
                            });
                            new_line = new_line.saturating_add(1);
                        }
                        '-' => {
                            let content = line.get(1..).unwrap_or("").to_string();
                            hunk.lines.push(BranchDiffLine {
                                content,
                                kind: DiffLineKind::Deletion,
                                old_line: Some(old_line),
                                new_line: None,
                            });
                            old_line = old_line.saturating_add(1);
                        }
                        ' ' => {
                            let content = line.get(1..).unwrap_or("").to_string();
                            hunk.lines.push(BranchDiffLine {
                                content,
                                kind: DiffLineKind::Context,
                                old_line: Some(old_line),
                                new_line: Some(new_line),
                            });
                            old_line = old_line.saturating_add(1);
                            new_line = new_line.saturating_add(1);
                        }
                        _ => {
                            hunk.lines.push(BranchDiffLine {
                                content: line.to_string(),
                                kind: DiffLineKind::Meta,
                                old_line: None,
                                new_line: None,
                            });
                        }
                    }
                }
            }
        }
    }

    finalize_current_file(&mut current_file, &mut current_hunk, &mut files);
    files
}

fn parse_hunk_header(header: &str) -> (usize, usize) {
    let mut old_start = 0usize;
    let mut new_start = 0usize;
    let parts: Vec<&str> = header.split_whitespace().collect();
    if parts.len() >= 3 {
        old_start = parts[1]
            .trim_start_matches('-')
            .split(',')
            .next()
            .unwrap_or("0")
            .parse()
            .unwrap_or(0);
        new_start = parts[2]
            .trim_start_matches('+')
            .split(',')
            .next()
            .unwrap_or("0")
            .parse()
            .unwrap_or(0);
    }
    (old_start, new_start)
}

/// Get specific lines from a file (for expanding context in diffs)
pub fn git_get_file_lines(
    worktree_path: &str,
    file_path: &str,
    is_staged: bool,
    start_line: usize,
    end_line: usize,
) -> Result<FileLines, String> {
    let lines = if is_staged {
        // Get staged version using git show
        let output = Command::new("git")
            .current_dir(worktree_path)
            .args(["show", &format!(":0:{}", file_path)])
            .output()
            .map_err(|e| format!("Failed to execute git show: {}", e))?;

        if !output.status.success() {
            return Err(String::from_utf8_lossy(&output.stderr).to_string());
        }

        String::from_utf8_lossy(&output.stdout).to_string()
    } else {
        // Get working directory version
        let full_path = format!("{}/{}", worktree_path, file_path);
        std::fs::read_to_string(&full_path)
            .map_err(|e| format!("Failed to read file: {}", e))?
    };

    let all_lines: Vec<String> = lines.lines().map(|s| s.to_string()).collect();

    // Extract requested range (1-indexed)
    let start_idx = start_line.saturating_sub(1);
    let end_idx = end_line.min(all_lines.len());

    if start_idx >= all_lines.len() {
        return Ok(FileLines {
            lines: Vec::new(),
            start_line,
            end_line: start_line,
        });
    }

    let extracted_lines = all_lines[start_idx..end_idx].to_vec();
    let line_count = extracted_lines.len();

    Ok(FileLines {
        lines: extracted_lines,
        start_line,
        end_line: start_idx + line_count,
    })
}
