use serde::Serialize;
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

/// Get git log (last n commits)
pub fn git_log(worktree_path: &str, count: usize) -> Result<Vec<String>, String> {
    let output = Command::new("git")
        .current_dir(worktree_path)
        .args([
            "log",
            &format!("-{}", count),
            "--pretty=format:%h - %s (%an, %ar)",
        ])
        .output()
        .map_err(|e| e.to_string())?;

    if output.status.success() {
        let log = String::from_utf8_lossy(&output.stdout);
        Ok(log.lines().map(|s| s.to_string()).collect())
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
            // Return full porcelain format: "XY filename"
            files.push(line.to_string());
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

pub fn git_stage_hunk(worktree_path: &str, patch: &str) -> Result<String, String> {
    apply_patch(worktree_path, patch, false)
}

pub fn git_unstage_hunk(worktree_path: &str, patch: &str) -> Result<String, String> {
    apply_patch(worktree_path, patch, true)
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
    cmd.current_dir(worktree_path)
        .arg("apply")
        .arg("--cached");

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
