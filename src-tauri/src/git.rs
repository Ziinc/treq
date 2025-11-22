use globset::{Glob, GlobSetBuilder};
use ignore::WalkBuilder;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use std::process::Command;
use walkdir::WalkDir;

#[derive(Debug, Serialize, Deserialize)]
pub struct GitStatus {
    pub modified: usize,
    pub added: usize,
    pub deleted: usize,
    pub untracked: usize,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct BranchInfo {
    pub name: String,
    pub ahead: usize,
    pub behind: usize,
    pub upstream: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct BranchDivergence {
    pub ahead: usize,
    pub behind: usize,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct WorktreeInfo {
    pub path: String,
    pub branch: String,
    pub commit: String,
}

pub fn create_worktree(
    repo_path: &str,
    branch: &str,
    new_branch: bool,
    inclusion_patterns: Option<Vec<String>>,
) -> Result<String, String> {
    // Sanitize branch name for path
    let sanitized = sanitize_branch_name_for_path(branch);

    // Generate worktree path: {repo_path}/.treq/worktrees/{sanitized_branch}
    let worktree_path = format!("{}/.treq/worktrees/{}", repo_path, sanitized);

    // Create .treq/worktrees directory if it doesn't exist
    let treq_dir = format!("{}/.treq/worktrees", repo_path);
    fs::create_dir_all(&treq_dir)
        .map_err(|e| format!("Failed to create .treq/worktrees directory: {}", e))?;

    // Check if worktree already exists at this path
    if Path::new(&worktree_path).exists() {
        return Err(format!("Worktree already exists at {}", worktree_path));
    }

    // Execute git worktree add command
    let mut cmd = Command::new("git");
    cmd.current_dir(repo_path);
    cmd.arg("worktree").arg("add");

    if new_branch {
        cmd.arg("-b").arg(branch);
    }

    cmd.arg(&worktree_path);

    if !new_branch {
        cmd.arg(branch);
    }

    let output = cmd.output().map_err(|e| e.to_string())?;

    if output.status.success() {
        // Copy selected ignored files after successful worktree creation
        if let Err(e) = copy_selected_ignored_files(repo_path, &worktree_path, inclusion_patterns) {
            eprintln!("Warning: Failed to copy ignored files: {}", e);
            // Don't fail the worktree creation, just log the warning
        }

        // Return the worktree path instead of stdout
        Ok(worktree_path)
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

pub fn list_worktrees(repo_path: &str) -> Result<Vec<WorktreeInfo>, String> {
    let output = Command::new("git")
        .current_dir(repo_path)
        .args(["worktree", "list", "--porcelain"])
        .output()
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut worktrees = Vec::new();
    let mut current_worktree: Option<WorktreeInfo> = None;

    for line in stdout.lines() {
        if line.starts_with("worktree ") {
            if let Some(wt) = current_worktree.take() {
                worktrees.push(wt);
            }
            current_worktree = Some(WorktreeInfo {
                path: line.strip_prefix("worktree ").unwrap_or("").to_string(),
                branch: String::new(),
                commit: String::new(),
            });
        } else if line.starts_with("branch ") {
            if let Some(ref mut wt) = current_worktree {
                wt.branch = line
                    .strip_prefix("branch refs/heads/")
                    .or_else(|| line.strip_prefix("branch "))
                    .unwrap_or("")
                    .to_string();
            }
        } else if line.starts_with("HEAD ") {
            if let Some(ref mut wt) = current_worktree {
                wt.commit = line.strip_prefix("HEAD ").unwrap_or("").to_string();
            }
        }
    }

    if let Some(wt) = current_worktree {
        worktrees.push(wt);
    }

    Ok(worktrees)
}

pub fn remove_worktree(repo_path: &str, worktree_path: &str) -> Result<String, String> {
    // Use --force because the UI already prompts the user for confirmation
    let output = Command::new("git")
        .current_dir(repo_path)
        .args(["worktree", "remove", "--force", worktree_path])
        .output()
        .map_err(|e| e.to_string())?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

pub fn get_git_status(worktree_path: &str) -> Result<GitStatus, String> {
    // Get tracked file changes (modified, added, deleted, staged)
    let output = Command::new("git")
        .current_dir(worktree_path)
        .args(["status", "--porcelain"])
        .output()
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut status = GitStatus {
        modified: 0,
        added: 0,
        deleted: 0,
        untracked: 0,
    };

    for line in stdout.lines() {
        if line.len() < 3 {
            continue;
        }

        let chars: Vec<char> = line.chars().collect();
        // Skip untracked files from porcelain output (we'll count them separately)
        if chars[0] == '?' && chars[1] == '?' {
            continue;
        }

        match chars[0] {
            'M' => status.modified += 1,
            'A' => status.added += 1,
            'D' => status.deleted += 1,
            _ => {}
        }
        if chars.len() > 1 {
            match chars[1] {
                'M' => status.modified += 1,
                'D' => status.deleted += 1,
                _ => {}
            }
        }
    }

    // Get untracked files count (individual files, respecting .gitignore)
    let untracked_output = Command::new("git")
        .current_dir(worktree_path)
        .args(["ls-files", "--others", "--exclude-standard"])
        .output()
        .map_err(|e| e.to_string())?;

    if untracked_output.status.success() {
        let untracked_stdout = String::from_utf8_lossy(&untracked_output.stdout);
        status.untracked = untracked_stdout
            .lines()
            .filter(|line| !line.is_empty())
            .count();
    }

    Ok(status)
}

pub fn get_branch_info(worktree_path: &str) -> Result<BranchInfo, String> {
    // Get current branch name
    let branch_output = Command::new("git")
        .current_dir(worktree_path)
        .args(["rev-parse", "--abbrev-ref", "HEAD"])
        .output()
        .map_err(|e| e.to_string())?;

    let branch_name = String::from_utf8_lossy(&branch_output.stdout)
        .trim()
        .to_string();

    // Get upstream branch
    let upstream_output = Command::new("git")
        .current_dir(worktree_path)
        .args(["rev-parse", "--abbrev-ref", "@{upstream}"])
        .output()
        .ok();

    let upstream = upstream_output.and_then(|o| {
        if o.status.success() {
            Some(String::from_utf8_lossy(&o.stdout).trim().to_string())
        } else {
            None
        }
    });

    // Get ahead/behind counts
    let (ahead, behind) = if let Some(ref up) = upstream {
        let rev_output = Command::new("git")
            .current_dir(worktree_path)
            .args([
                "rev-list",
                "--left-right",
                "--count",
                &format!("{}...{}", up, branch_name),
            ])
            .output()
            .ok();

        if let Some(output) = rev_output {
            let counts = String::from_utf8_lossy(&output.stdout);
            let parts: Vec<&str> = counts.trim().split_whitespace().collect();
            if parts.len() == 2 {
                let behind = parts[0].parse().unwrap_or(0);
                let ahead = parts[1].parse().unwrap_or(0);
                (ahead, behind)
            } else {
                (0, 0)
            }
        } else {
            (0, 0)
        }
    } else {
        (0, 0)
    };

    Ok(BranchInfo {
        name: branch_name,
        ahead,
        behind,
        upstream,
    })
}

pub fn get_branch_divergence(
    worktree_path: &str,
    base_branch: &str,
) -> Result<BranchDivergence, String> {
    if base_branch.trim().is_empty() {
        return Err("Base branch name is required".to_string());
    }

    let branch_output = Command::new("git")
        .current_dir(worktree_path)
        .args(["rev-parse", "--abbrev-ref", "HEAD"])
        .output()
        .map_err(|e| e.to_string())?;

    if !branch_output.status.success() {
        return Err(String::from_utf8_lossy(&branch_output.stderr).to_string());
    }

    let branch_name = String::from_utf8_lossy(&branch_output.stdout)
        .trim()
        .to_string();

    let rev_output = Command::new("git")
        .current_dir(worktree_path)
        .args([
            "rev-list",
            "--left-right",
            "--count",
            &format!("{}...{}", base_branch, branch_name),
        ])
        .output()
        .map_err(|e| e.to_string())?;

    if !rev_output.status.success() {
        return Err(String::from_utf8_lossy(&rev_output.stderr).to_string());
    }

    let counts = String::from_utf8_lossy(&rev_output.stdout);
    let parts: Vec<&str> = counts.trim().split_whitespace().collect();
    let behind = parts
        .get(0)
        .and_then(|s| s.parse::<usize>().ok())
        .unwrap_or(0);
    let ahead = parts
        .get(1)
        .and_then(|s| s.parse::<usize>().ok())
        .unwrap_or(0);

    Ok(BranchDivergence { ahead, behind })
}

pub fn get_file_diff(worktree_path: &str, file_path: &str) -> Result<String, String> {
    let output = Command::new("git")
        .current_dir(worktree_path)
        .args(["diff", "HEAD", file_path])
        .output()
        .map_err(|e| e.to_string())?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

pub fn list_branches(repo_path: &str) -> Result<Vec<String>, String> {
    let output = Command::new("git")
        .current_dir(repo_path)
        .args(["branch", "-a", "--format=%(refname:short)"])
        .output()
        .map_err(|e| e.to_string())?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout)
            .lines()
            .map(|s| s.to_string())
            .collect())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

pub fn is_git_repository(path: &str) -> Result<bool, String> {
    let git_path = Path::new(path).join(".git");
    Ok(git_path.exists())
}

pub fn git_init(path: &str) -> Result<String, String> {
    let output = Command::new("git")
        .current_dir(path)
        .args(["init"])
        .output()
        .map_err(|e| e.to_string())?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

pub fn get_current_branch(repo_path: &str) -> Result<String, String> {
    let output = Command::new("git")
        .current_dir(repo_path)
        .args(["rev-parse", "--abbrev-ref", "HEAD"])
        .output()
        .map_err(|e| e.to_string())?;

    if output.status.success() {
        let branch = String::from_utf8_lossy(&output.stdout).trim().to_string();

        // Handle detached HEAD state
        if branch == "HEAD" {
            let commit_output = Command::new("git")
                .current_dir(repo_path)
                .args(["rev-parse", "--short", "HEAD"])
                .output()
                .map_err(|e| e.to_string())?;

            if commit_output.status.success() {
                let commit = String::from_utf8_lossy(&commit_output.stdout)
                    .trim()
                    .to_string();
                return Ok(format!("HEAD detached at {}", commit));
            }
        }

        Ok(branch)
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

pub fn sanitize_branch_name_for_path(branch: &str) -> String {
    branch
        .replace('/', "-")
        .replace('\\', "-")
        .replace('*', "_")
        .replace('?', "_")
        .replace('<', "_")
        .replace('>', "_")
        .replace('|', "_")
        .replace('"', "_")
        .replace(':', "_")
        .trim_matches('.')
        .trim()
        .to_string()
}

pub fn execute_post_create_command(worktree_path: &str, command: &str) -> Result<String, String> {
    // Split command into program and arguments
    // For simplicity, we'll use shell to execute the command
    // This allows complex commands with pipes, redirects, etc.

    #[cfg(target_os = "windows")]
    let shell = "powershell";
    #[cfg(target_os = "windows")]
    let shell_arg = "-Command";

    #[cfg(not(target_os = "windows"))]
    let shell = "sh";
    #[cfg(not(target_os = "windows"))]
    let shell_arg = "-c";

    let output = Command::new(shell)
        .arg(shell_arg)
        .arg(command)
        .current_dir(worktree_path)
        .output()
        .map_err(|e| format!("Failed to execute command: {}", e))?;

    // Combine stdout and stderr
    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);

    if output.status.success() {
        Ok(format!("{}{}", stdout, stderr))
    } else {
        Err(format!(
            "Command failed with exit code {:?}\nOutput: {}{}",
            output.status.code(),
            stdout,
            stderr
        ))
    }
}

/// Copy selected ignored files from source repository to worktree
/// This function identifies files that are gitignored and copies only those matching inclusion patterns
/// If inclusion_patterns is None or empty, no files are copied (secure by default)
fn copy_selected_ignored_files(
    source_repo: &str,
    dest_worktree: &str,
    inclusion_patterns: Option<Vec<String>>,
) -> Result<(), String> {
    let source_path = Path::new(source_repo);
    let dest_path = Path::new(dest_worktree);

    // Build glob set from inclusion patterns
    let globset = if let Some(patterns) = inclusion_patterns {
        if !patterns.is_empty() {
            let mut builder = GlobSetBuilder::new();
            for pattern in &patterns {
                let pattern = pattern.trim();
                if !pattern.is_empty() {
                    match Glob::new(pattern) {
                        Ok(glob) => {
                            builder.add(glob);
                        }
                        Err(e) => {
                            eprintln!("Warning: Invalid glob pattern '{}': {}", pattern, e);
                        }
                    }
                }
            }
            match builder.build() {
                Ok(gs) => Some(gs),
                Err(e) => {
                    eprintln!("Warning: Failed to build glob set: {}", e);
                    None
                }
            }
        } else {
            None
        }
    } else {
        None
    };

    // If no inclusion patterns, don't copy anything (secure by default)
    if globset.is_none() {
        println!("No inclusion patterns specified, skipping ignored file copy");
        return Ok(());
    }

    // Build a walker that respects .gitignore
    let walker = WalkBuilder::new(source_path)
        .hidden(false)
        .git_ignore(true)
        .git_global(true)
        .git_exclude(true)
        .build();

    // Also walk all files (including ignored) to compare
    let all_files: Vec<_> = WalkDir::new(source_path)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_file())
        .map(|e| e.path().to_path_buf())
        .collect();

    // Collect non-ignored files
    let non_ignored: std::collections::HashSet<_> = walker
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().map(|t| t.is_file()).unwrap_or(false))
        .map(|e| e.path().to_path_buf())
        .collect();

    // Find ignored files (files in all_files but not in non_ignored)
    let mut copied_count = 0;

    for file_path in all_files {
        // Skip .git directory
        if file_path.components().any(|c| c.as_os_str() == ".git") {
            continue;
        }

        if !non_ignored.contains(&file_path) {
            // This file is ignored
            if let Ok(rel_path) = file_path.strip_prefix(source_path) {
                // Check if this file matches any inclusion pattern
                let should_copy = if let Some(ref gs) = globset {
                    gs.is_match(rel_path)
                } else {
                    false
                };

                if !should_copy {
                    continue; // Skip this file
                }

                let dest_file = dest_path.join(rel_path);

                // Create parent directory if needed
                if let Some(parent) = dest_file.parent() {
                    if let Err(e) = fs::create_dir_all(parent) {
                        eprintln!(
                            "Warning: Failed to create directory {}: {}",
                            parent.display(),
                            e
                        );
                        continue;
                    }
                }

                // Copy the file
                if let Err(e) = fs::copy(&file_path, &dest_file) {
                    eprintln!("Warning: Failed to copy {}: {}", file_path.display(), e);
                } else {
                    copied_count += 1;
                }
            }
        }
    }

    if copied_count > 0 {
        println!(
            "Copied {} ignored files matching inclusion patterns to worktree",
            copied_count
        );
    }

    Ok(())
}

/// List gitignored files and directories at the root level of a repository
/// Excludes .treq and .vscode automatically
pub fn list_gitignored_files(repo_path: &str) -> Result<Vec<String>, String> {
    let repo = Path::new(repo_path);

    // Build a walker that respects .gitignore
    let walker = WalkBuilder::new(repo)
        .max_depth(Some(1)) // Only root level
        .hidden(false)
        .git_ignore(true)
        .git_global(true)
        .git_exclude(true)
        .build();

    // Walk all entries at root level
    let all_entries: Vec<_> = fs::read_dir(repo)
        .map_err(|e| format!("Failed to read directory: {}", e))?
        .filter_map(|e| e.ok())
        .filter(|e| {
            // Skip .git, .treq, and .vscode
            if let Some(name) = e.file_name().to_str() {
                name != ".git" && name != ".treq" && name != ".vscode"
            } else {
                false
            }
        })
        .map(|e| e.path())
        .collect();

    // Collect non-ignored entries
    let non_ignored: std::collections::HashSet<_> = walker
        .filter_map(|e| e.ok())
        .map(|e| e.path().to_path_buf())
        .collect();

    // Find ignored entries
    let mut ignored_files = Vec::new();

    for entry_path in all_entries {
        if !non_ignored.contains(&entry_path) {
            if let Some(name) = entry_path.file_name().and_then(|n| n.to_str()) {
                ignored_files.push(name.to_string());
            }
        }
    }

    // Sort for consistent ordering
    ignored_files.sort();

    Ok(ignored_files)
}
