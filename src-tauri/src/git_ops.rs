use std::process::Command;

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
            let chars: Vec<char> = line.chars().collect();
            // Skip untracked files from porcelain (we'll get them from ls-files)
            if chars[0] == '?' && chars[1] == '?' {
                continue;
            }
            files.push(line[3..].to_string());
        }
    }

    // Get untracked files (individual files, respecting .gitignore)
    let untracked_output = Command::new("git")
        .current_dir(worktree_path)
        .args(["ls-files", "--others", "--exclude-standard"])
        .output()
        .map_err(|e| e.to_string())?;

    if untracked_output.status.success() {
        let untracked = String::from_utf8_lossy(&untracked_output.stdout);
        for line in untracked.lines() {
            if !line.is_empty() {
                files.push(line.to_string());
            }
        }
    }

    Ok(files)
}

