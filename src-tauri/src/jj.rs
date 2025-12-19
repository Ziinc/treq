use jj_lib::config::{ConfigLayer, ConfigSource, StackedConfig};
use jj_lib::settings::UserSettings;
use jj_lib::workspace::Workspace;
use serde::{Deserialize, Serialize};
use std::fs::{self, OpenOptions};
use std::io::{BufRead, BufReader, Write};
use std::path::Path;
use std::process::Command;

use crate::local_db;

/// Error type for jj operations
#[derive(Debug)]
pub enum JjError {
    AlreadyInitialized,
    NotGitRepository,
    InitFailed(String),
    ConfigError(String),
    WorkspaceExists(String),
    WorkspaceNotFound(String),
    GitWorkspaceError(String),
    IoError(String),
}

/// Information about a jj workspace
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct WorkspaceInfo {
    pub name: String,
    pub path: String,
    pub branch: String,
    pub is_colocated: bool,
}

/// A diff hunk from jj diff output
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct JjDiffHunk {
    pub id: String,
    pub header: String,
    pub lines: Vec<String>,
    pub patch: String,
}

/// File change status in JJ working copy
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct JjFileChange {
    pub path: String,
    pub status: String,
    pub previous_path: Option<String>,
}

/// File content lines for context expansion
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct JjFileLines {
    pub lines: Vec<String>,
    pub start_line: usize,
    pub end_line: usize,
}

/// Result of a rebase operation
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct JjRebaseResult {
    pub success: bool,
    pub message: String,
    pub has_conflicts: bool,
    pub conflicted_files: Vec<String>,
}

impl std::fmt::Display for JjError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            JjError::AlreadyInitialized => write!(f, "Jujutsu workspace already exists"),
            JjError::NotGitRepository => write!(f, "Not a git repository"),
            JjError::InitFailed(e) => write!(f, "Failed to initialize jj: {}", e),
            JjError::ConfigError(e) => write!(f, "Configuration error: {}", e),
            JjError::WorkspaceExists(name) => write!(f, "Workspace '{}' already exists", name),
            JjError::WorkspaceNotFound(name) => write!(f, "Workspace '{}' not found", name),
            JjError::GitWorkspaceError(e) => write!(f, "Git workspace error: {}", e),
            JjError::IoError(e) => write!(f, "IO error: {}", e),
        }
    }
}

/// Check if a jj workspace already exists at the given path
pub fn is_jj_workspace(repo_path: &str) -> bool {
    Path::new(repo_path).join(".jj").exists()
}

/// Get git user.name and user.email from git config
fn get_git_user_config(repo_path: &str) -> (String, String) {
    let name = Command::new("git")
        .current_dir(repo_path)
        .args(["config", "--get", "user.name"])
        .output()
        .ok()
        .filter(|o| o.status.success())
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
        .unwrap_or_else(|| "Treq User".to_string());

    let email = Command::new("git")
        .current_dir(repo_path)
        .args(["config", "--get", "user.email"])
        .output()
        .ok()
        .filter(|o| o.status.success())
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
        .unwrap_or_else(|| "treq@localhost".to_string());

    (name, email)
}

/// Create UserSettings with reasonable defaults for Treq
/// Uses git config values if available, otherwise uses defaults
fn create_user_settings(repo_path: &str) -> Result<UserSettings, JjError> {
    // Get user info from git config
    let (user_name, user_email) = get_git_user_config(repo_path);

    // Get system hostname and username
    let hostname = std::env::var("HOSTNAME")
        .or_else(|_| std::env::var("COMPUTERNAME")) // Windows fallback
        .unwrap_or_else(|_| "treq".to_string());
    let username = std::env::var("USER")
        .or_else(|_| std::env::var("USERNAME")) // Windows fallback
        .unwrap_or_else(|_| "treq".to_string());

    // Build configuration with required fields
    let config_text = format!(
        r#"
[user]
name = "{}"
email = "{}"

[operation]
hostname = "{}"
username = "{}"
"#,
        user_name, user_email, hostname, username
    );

    // Create StackedConfig with defaults and our layer
    let mut config = StackedConfig::with_defaults();
    let layer = ConfigLayer::parse(ConfigSource::User, &config_text)
        .map_err(|e| JjError::ConfigError(e.to_string()))?;
    config.add_layer(layer);

    UserSettings::from_config(config).map_err(|e| JjError::ConfigError(e.to_string()))
}

/// Ensure .jj and .treq directories are in .gitignore
/// This is idempotent - entries won't be duplicated
pub fn ensure_gitignore_entries(repo_path: &str) -> Result<(), JjError> {
    let gitignore_path = Path::new(repo_path).join(".gitignore");
    let entries_to_add = [".jj/", ".treq/"];

    // Read existing .gitignore content
    let existing_entries: std::collections::HashSet<String> = if gitignore_path.exists() {
        let file = fs::File::open(&gitignore_path)
            .map_err(|e| JjError::InitFailed(format!("Failed to read .gitignore: {}", e)))?;
        BufReader::new(file)
            .lines()
            .filter_map(|l| l.ok())
            .map(|l| l.trim().to_string())
            .collect()
    } else {
        std::collections::HashSet::new()
    };

    // Find entries that need to be added
    let entries_needed: Vec<&str> = entries_to_add
        .iter()
        .filter(|entry| !existing_entries.contains(&entry.to_string()))
        .copied()
        .collect();

    if entries_needed.is_empty() {
        return Ok(());
    }

    // Append missing entries to .gitignore
    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&gitignore_path)
        .map_err(|e| JjError::InitFailed(format!("Failed to open .gitignore: {}", e)))?;

    // Add a newline before our entries if file exists and doesn't end with newline
    if gitignore_path.exists() {
        let content = fs::read_to_string(&gitignore_path).unwrap_or_default();
        if !content.is_empty() && !content.ends_with('\n') {
            writeln!(file)
                .map_err(|e| JjError::InitFailed(format!("Failed to write to .gitignore: {}", e)))?;
        }
    }

    // Add comment and entries
    writeln!(file, "\n# Added by Treq")
        .map_err(|e| JjError::InitFailed(format!("Failed to write to .gitignore: {}", e)))?;
    for entry in entries_needed {
        writeln!(file, "{}", entry)
            .map_err(|e| JjError::InitFailed(format!("Failed to write to .gitignore: {}", e)))?;
    }

    Ok(())
}

/// Initialize jj for an existing git repository (colocated mode)
/// This creates a .jj/ directory alongside the existing .git/ directory
/// Note: .gitignore entries are handled separately by ensure_gitignore_entries()
pub fn init_jj_for_git_repo(repo_path: &str) -> Result<(), JjError> {
    let path = Path::new(repo_path);

    // Check if .jj already exists
    if is_jj_workspace(repo_path) {
        return Err(JjError::AlreadyInitialized);
    }

    // Check if .git exists
    if !path.join(".git").exists() {
        return Err(JjError::NotGitRepository);
    }

    let settings = create_user_settings(repo_path)?;

    // Use init_external_git since .git already exists
    // This links jj to the existing git repository
    let git_repo_path = path.join(".git");

    Workspace::init_external_git(&settings, path, &git_repo_path)
        .map_err(|e| JjError::InitFailed(e.to_string()))?;

    Ok(())
}

/// Ensure jj is initialized for a repository
/// This is idempotent - safe to call multiple times
/// Returns true if initialization was performed, false if already initialized
pub fn ensure_jj_initialized(
    db: &crate::db::Database,
    repo_path: &str,
) -> Result<bool, JjError> {
    // Check database flag first (avoid filesystem check if already configured)
    let flag_key = "jj_initialized";
    let already_configured = db
        .get_repo_setting(repo_path, flag_key)
        .ok()
        .flatten()
        .map(|v| v == "true")
        .unwrap_or(false);

    if already_configured {
        return Ok(false);
    }

    // Double-check filesystem in case flag got out of sync
    if is_jj_workspace(repo_path) {
        // Update flag and return
        let _ = db.set_repo_setting(repo_path, flag_key, "true");
        return Ok(false);
    }

    // Check if it's actually a git repo before trying to initialize
    if !Path::new(repo_path).join(".git").exists() {
        return Err(JjError::NotGitRepository);
    }

    // Initialize jj
    init_jj_for_git_repo(repo_path)?;

    // Mark as configured in database
    db.set_repo_setting(repo_path, flag_key, "true")
        .map_err(|e| JjError::ConfigError(format!("Failed to save flag: {}", e)))?;

    Ok(true)
}

/// Sanitize workspace name for filesystem use
pub fn sanitize_workspace_name(name: &str) -> String {
    name.replace('/', "-")
        .replace('\\', "-")
        .replace(['*', '?', '<', '>', '|', '"', ':'], "_")
        .trim_matches('.')
        .trim()
        .to_string()
}

/// Create a colocated jj workspace
///
/// This creates:
/// 1. A git workspace at the specified path
/// 2. A jj workspace initialized on top of it
///
/// Returns the workspace path on success
pub fn create_workspace(
    repo_path: &str,
    workspace_name: &str,
    branch_name: &str,
    new_branch: bool,
    source_branch: Option<&str>,
    inclusion_patterns: Option<Vec<String>>,
) -> Result<String, JjError> {
    let repo_path_buf = Path::new(repo_path);

    // Validate main repo has jj initialized
    if !is_jj_workspace(repo_path) {
        return Err(JjError::NotGitRepository);
    }

    // Compute workspace path
    let sanitized_name = sanitize_workspace_name(workspace_name);
    let workspace_dir = repo_path_buf
        .join(".treq")
        .join("workspaces")
        .join(&sanitized_name);

    if workspace_dir.exists() {
        return Err(JjError::WorkspaceExists(workspace_name.to_string()));
    }

    // Create the directory structure
    if let Some(parent) = workspace_dir.parent() {
        fs::create_dir_all(parent).map_err(|e| JjError::IoError(e.to_string()))?;
    }

    let workspace_path_str = workspace_dir.to_string_lossy().to_string();

    // Create git workspace first using git worktree command
    let mut git_cmd = std::process::Command::new("git");
    git_cmd.current_dir(repo_path)
        .arg("worktree")
        .arg("add");

    if new_branch {
        git_cmd.arg("-b").arg(branch_name);
    } else {
        git_cmd.arg("--no-track");
    }

    git_cmd.arg(&workspace_path_str);

    if let Some(source) = source_branch {
        git_cmd.arg(source);
    } else if !new_branch {
        git_cmd.arg(branch_name);
    }

    let output = git_cmd.output()
        .map_err(|e| JjError::GitWorkspaceError(format!("Failed to execute git worktree: {}", e)))?;

    if !output.status.success() {
        return Err(JjError::GitWorkspaceError(
            String::from_utf8_lossy(&output.stderr).to_string()
        ));
    }

    // Initialize jj for this workspace (colocated mode)
    let settings = create_user_settings(repo_path)?;
    let git_path = workspace_dir.join(".git");

    let jj_result = Workspace::init_external_git(&settings, &workspace_dir, &git_path);

    if let Err(e) = jj_result {
        // Clean up: remove the git workspace we just created
        let _ = std::process::Command::new("git")
            .current_dir(repo_path)
            .args(&["worktree", "remove", "--force", &workspace_path_str])
            .output();
        let _ = fs::remove_dir_all(&workspace_dir);
        return Err(JjError::InitFailed(format!(
            "Failed to init jj workspace: {}",
            e
        )));
    }

    // Create initial bookmark pointing at current working copy
    if let Err(e) = jj_set_bookmark(&workspace_path_str, branch_name, "@") {
        eprintln!("Warning: Failed to create initial bookmark '{}': {}", branch_name, e);
        // Don't fail workspace creation for bookmark errors
    }

    Ok(workspace_path_str)
}

/// List all workspaces in a repository
/// Returns workspaces found in .treq/workspaces/ directory
pub fn list_workspaces(repo_path: &str) -> Result<Vec<WorkspaceInfo>, JjError> {
    let workspaces_dir = Path::new(repo_path).join(".treq").join("workspaces");

    if !workspaces_dir.exists() {
        return Ok(Vec::new());
    }

    let mut workspaces = Vec::new();

    let entries =
        fs::read_dir(&workspaces_dir).map_err(|e| JjError::IoError(e.to_string()))?;

    for entry in entries.filter_map(|e| e.ok()) {
        let entry_path = entry.path();

        // Must be a directory
        if !entry_path.is_dir() {
            continue;
        }

        // Must have a .git file/dir (valid git workspace)
        let git_path = entry_path.join(".git");
        if !git_path.exists() {
            continue;
        }

        let name = entry
            .file_name()
            .to_string_lossy()
            .to_string();

        let path = entry_path.to_string_lossy().to_string();

        // Check if it's colocated (has .jj directory)
        let is_colocated = entry_path.join(".jj").exists();

        // Get branch name from git
        let branch = get_workspace_branch(&path).unwrap_or_default();

        workspaces.push(WorkspaceInfo {
            name,
            path,
            branch,
            is_colocated,
        });
    }

    // Sort by name
    workspaces.sort_by(|a, b| a.name.cmp(&b.name));

    Ok(workspaces)
}

/// Get the current branch of a workspace
fn get_workspace_branch(workspace_path: &str) -> Result<String, JjError> {
    let output = Command::new("git")
        .current_dir(workspace_path)
        .args(["rev-parse", "--abbrev-ref", "HEAD"])
        .output()
        .map_err(|e| JjError::IoError(e.to_string()))?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    } else {
        Err(JjError::GitWorkspaceError(
            String::from_utf8_lossy(&output.stderr).to_string(),
        ))
    }
}

/// Remove a workspace (jj + git workspace + files)
pub fn remove_workspace(
    repo_path: &str,
    workspace_path: &str,
) -> Result<(), JjError> {
    let workspace_dir = Path::new(workspace_path);

    // Check workspace exists
    if !workspace_dir.exists() {
        return Err(JjError::WorkspaceNotFound(workspace_path.to_string()));
    }

    // Remove git workspace first using git worktree command
    let output = std::process::Command::new("git")
        .current_dir(repo_path)
        .args(&["worktree", "remove", "--force", workspace_path])
        .output()
        .map_err(|e| JjError::GitWorkspaceError(format!("Failed to execute git worktree remove: {}", e)))?;

    if !output.status.success() {
        return Err(JjError::GitWorkspaceError(
            String::from_utf8_lossy(&output.stderr).to_string()
        ));
    }

    // Remove directory if it still exists (git worktree remove command should handle this)
    if workspace_dir.exists() {
        fs::remove_dir_all(workspace_dir).map_err(|e| JjError::IoError(e.to_string()))?;
    }

    Ok(())
}

/// Get workspace info for a specific workspace path
pub fn get_workspace_info(workspace_path: &str) -> Result<WorkspaceInfo, JjError> {
    let workspace_dir = Path::new(workspace_path);

    if !workspace_dir.exists() {
        return Err(JjError::WorkspaceNotFound(workspace_path.to_string()));
    }

    let name = workspace_dir
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default();

    let is_colocated = workspace_dir.join(".jj").exists();
    let branch = get_workspace_branch(workspace_path).unwrap_or_default();

    Ok(WorkspaceInfo {
        name,
        path: workspace_path.to_string(),
        branch,
        is_colocated,
    })
}

/// Move changes from one workspace to another using jj squash
/// This moves changes from the current workspace (@) to the target workspace's working copy
/// Uses: jj squash --from @ --into <target-workspace-name>@
pub fn squash_to_workspace(
    source_workspace_path: &str,
    target_workspace_name: &str,
    file_paths: Option<Vec<String>>,
) -> Result<String, JjError> {
    // Construct the target revision reference: workspace-name@
    let target_ref = format!("{}@", target_workspace_name);

    // Build the jj squash command
    let mut cmd = Command::new("jj");
    cmd.current_dir(source_workspace_path);
    cmd.args(["squash", "--from", "@", "--into", &target_ref]);

    // If specific file paths are provided, add them
    if let Some(paths) = file_paths {
        if !paths.is_empty() {
            for path in paths {
                cmd.arg(path);
            }
        }
    }

    let output = cmd.output().map_err(|e| JjError::IoError(e.to_string()))?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        Err(JjError::InitFailed(format!(
            "Failed to squash changes: {}",
            String::from_utf8_lossy(&output.stderr)
        )))
    }
}

// ============================================================================
// Diff Operations using hybrid CLI approach
// Uses jj CLI for file listing (faster) and git CLI for diffs (reliable)
// ============================================================================

/// Get list of changed files in working copy using jj status
/// This is faster than git status for large repos
pub fn jj_get_changed_files(workspace_path: &str) -> Result<Vec<JjFileChange>, JjError> {
    let output = Command::new("jj")
        .current_dir(workspace_path)
        .args(["status", "--no-pager"])
        .output()
        .map_err(|e| JjError::IoError(e.to_string()))?;

    if !output.status.success() {
        return Err(JjError::IoError(
            String::from_utf8_lossy(&output.stderr).to_string(),
        ));
    }

    let status_output = String::from_utf8_lossy(&output.stdout);
    parse_jj_status(&status_output)
}

/// Parse jj status output into file changes
fn parse_jj_status(status: &str) -> Result<Vec<JjFileChange>, JjError> {
    let mut changes = Vec::new();

    for line in status.lines() {
        let line = line.trim();

        // Skip empty lines and section headers
        if line.is_empty() || line.starts_with("Working copy") || line.starts_with("Parent commit") {
            continue;
        }

        // Parse lines like "M file.txt" or "A new.txt" or "D removed.txt"
        if let Some((status_char, rest)) = line.split_once(' ') {
            let status = match status_char {
                "M" => "M", // Modified
                "A" => "A", // Added
                "D" => "D", // Deleted
                "R" => "M", // Renamed (treat as modified for now)
                _ => continue,
            };

            let path = rest.trim().to_string();
            changes.push(JjFileChange {
                path,
                status: status.to_string(),
                previous_path: None,
            });
        }
    }

    Ok(changes)
}

/// Get diff hunks for a specific file
/// Uses jj diff CLI with git-format output
pub fn jj_get_file_hunks(workspace_path: &str, file_path: &str) -> Result<Vec<JjDiffHunk>, JjError> {
    // Use jj diff --git to get hunks in git-compatible format
    let output = Command::new("jj")
        .current_dir(workspace_path)
        .args(["diff", "--git", "--no-pager", "--", file_path])
        .output()
        .map_err(|e| JjError::IoError(e.to_string()))?;

    if !output.status.success() {
        return Err(JjError::IoError(
            String::from_utf8_lossy(&output.stderr).to_string(),
        ));
    }

    let diff_output = String::from_utf8_lossy(&output.stdout);
    parse_git_diff_hunks(&diff_output)
}

/// Parse git diff output into hunks
fn parse_git_diff_hunks(diff: &str) -> Result<Vec<JjDiffHunk>, JjError> {
    let mut hunks = Vec::new();
    let mut current_hunk: Option<(String, Vec<String>)> = None;
    let mut hunk_index = 0;

    for line in diff.lines() {
        if line.starts_with("@@") {
            // Save previous hunk if exists
            if let Some((header, lines)) = current_hunk.take() {
                hunks.push(JjDiffHunk {
                    id: format!("hunk-{}", hunk_index),
                    header: header.clone(),
                    lines: lines.clone(),
                    patch: format!("{}\n{}", header, lines.join("\n")),
                });
                hunk_index += 1;
            }

            // Start new hunk
            current_hunk = Some((line.to_string(), Vec::new()));
        } else if let Some((_, ref mut lines)) = current_hunk {
            // Skip diff metadata lines
            if !line.starts_with("diff") && !line.starts_with("index") && !line.starts_with("---") && !line.starts_with("+++") {
                lines.push(line.to_string());
            }
        }
    }

    // Save last hunk
    if let Some((header, lines)) = current_hunk {
        hunks.push(JjDiffHunk {
            id: format!("hunk-{}", hunk_index),
            header: header.clone(),
            lines: lines.clone(),
            patch: format!("{}\n{}", header, lines.join("\n")),
        });
    }

    Ok(hunks)
}

/// Get file content at specific lines for context expansion
pub fn jj_get_file_lines(
    workspace_path: &str,
    file_path: &str,
    from_parent: bool,
    start_line: usize,
    end_line: usize,
) -> Result<JjFileLines, JjError> {
    let content = if from_parent {
        // Get file from parent commit using git show
        let output = Command::new("git")
            .current_dir(workspace_path)
            .args(["show", &format!("HEAD:{}", file_path)])
            .output()
            .map_err(|e| JjError::IoError(e.to_string()))?;

        if !output.status.success() {
            return Err(JjError::IoError(
                String::from_utf8_lossy(&output.stderr).to_string(),
            ));
        }

        String::from_utf8_lossy(&output.stdout).to_string()
    } else {
        // Read file from working directory
        let full_path = Path::new(workspace_path).join(file_path);
        fs::read_to_string(&full_path)
            .map_err(|e| JjError::IoError(format!("Failed to read file: {}", e)))?
    };

    let all_lines: Vec<&str> = content.lines().collect();
    let start_idx = start_line.saturating_sub(1).min(all_lines.len());
    let end_idx = end_line.min(all_lines.len());

    let lines: Vec<String> = all_lines[start_idx..end_idx]
        .iter()
        .map(|s| s.to_string())
        .collect();

    Ok(JjFileLines {
        lines,
        start_line: start_idx + 1,
        end_line: end_idx,
    })
}

// ============================================================================
// Mutation Operations (CLI fallbacks)
// ============================================================================

/// Restore a file to parent state (discard changes)
/// Uses CLI as jj-lib mutation APIs are complex
pub fn jj_restore_file(workspace_path: &str, file_path: &str) -> Result<String, JjError> {
    let output = Command::new("jj")
        .current_dir(workspace_path)
        .args(["restore", file_path])
        .output()
        .map_err(|e| JjError::IoError(e.to_string()))?;

    if !output.status.success() {
        return Err(JjError::IoError(
            String::from_utf8_lossy(&output.stderr).to_string(),
        ));
    }

    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

/// Restore all changes
pub fn jj_restore_all(workspace_path: &str) -> Result<String, JjError> {
    let output = Command::new("jj")
        .current_dir(workspace_path)
        .args(["restore"])
        .output()
        .map_err(|e| JjError::IoError(e.to_string()))?;

    if !output.status.success() {
        return Err(JjError::IoError(
            String::from_utf8_lossy(&output.stderr).to_string(),
        ));
    }

    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

/// Set (or create) a jj bookmark to point at a specific revision
/// Uses: jj bookmark set <name> -r <revision>
pub fn jj_set_bookmark(workspace_path: &str, bookmark_name: &str, revision: &str) -> Result<(), JjError> {
    let output = Command::new("jj")
        .current_dir(workspace_path)
        .args(["bookmark", "set", bookmark_name, "-r", revision])
        .output()
        .map_err(|e| JjError::IoError(e.to_string()))?;

    if !output.status.success() {
        return Err(JjError::IoError(
            String::from_utf8_lossy(&output.stderr).to_string(),
        ));
    }

    Ok(())
}

/// Derive repo_path from workspace_path
/// Workspace paths are: {repo_path}/.treq/workspaces/{workspace_name}
fn derive_repo_path_from_workspace(workspace_path: &str) -> Option<String> {
    let path = Path::new(workspace_path);

    // Look for .treq/workspaces pattern in the path
    let mut current = path;
    while let Some(parent) = current.parent() {
        if current.file_name() == Some(std::ffi::OsStr::new("workspaces")) {
            if let Some(grandparent) = parent.parent() {
                if parent.file_name() == Some(std::ffi::OsStr::new(".treq")) {
                    // Found the pattern - grandparent is repo_path
                    return Some(grandparent.to_string_lossy().to_string());
                }
            }
        }
        current = parent;
    }

    None
}

/// Commit with message and create new working copy
pub fn jj_commit(workspace_path: &str, message: &str) -> Result<String, JjError> {
    // Commit with message (sets message on current change and creates new empty change)
    let commit = Command::new("jj")
        .current_dir(workspace_path)
        .args(["commit", "-m", message])
        .output()
        .map_err(|e| JjError::IoError(e.to_string()))?;

    if !commit.status.success() {
        return Err(JjError::IoError(
            String::from_utf8_lossy(&commit.stderr).to_string(),
        ));
    }

    // Advance the bookmark to the new commit (@- is the parent, which has the content)
    // Try to get branch name from database first
    let mut branch_name: Option<String> = None;
    let repo_path = derive_repo_path_from_workspace(workspace_path);

    if let Some(ref rp) = repo_path {
        if let Ok(db_branch) = local_db::get_workspace_branch_name(rp, workspace_path) {
            branch_name = db_branch;
        }
    }

    // Fallback to git detection if database lookup failed
    if branch_name.is_none() {
        if let Ok(git_branch) = get_workspace_branch(workspace_path) {
            if !git_branch.is_empty() && git_branch != "HEAD" {
                branch_name = Some(git_branch);
            }
        }
    }

    // Advance the bookmark if we found a valid branch name
    if let Some(ref branch) = branch_name {
        // Set the bookmark to point at @- (the commit with the actual content)
        if let Err(e) = jj_set_bookmark(workspace_path, branch, "@-") {
            eprintln!("Warning: Failed to advance bookmark '{}': {}", branch, e);
            // Don't fail the commit for bookmark errors
        }

        // Checkout the branch in git to avoid detached HEAD
        if let Some(ref rp) = repo_path {
            match Command::new("git")
                .current_dir(rp)
                .args(["checkout", branch])
                .output()
            {
                Ok(output) => {
                    let stdout = String::from_utf8_lossy(&output.stdout);
                    let stderr = String::from_utf8_lossy(&output.stderr);
                    eprintln!("git checkout {}: {}{}", branch, stdout, stderr);
                }
                Err(e) => {
                    eprintln!("Warning: Failed to checkout git branch '{}': {}", branch, e);
                }
            }
        }
    }

    Ok("Committed successfully".to_string())
}

/// Split selected files from working copy into a new parent commit
/// Uses: jj split -r @ -m <message> <file_paths...>
pub fn jj_split(
    workspace_path: &str,
    message: &str,
    file_paths: Vec<String>,
) -> Result<String, JjError> {
    // Build the jj split command
    let mut cmd = Command::new("jj");
    cmd.current_dir(workspace_path);
    cmd.args(["split", "-r", "@", "-m", message]);
    for path in &file_paths {
        cmd.arg(path);
    }

    let output = cmd
        .output()
        .map_err(|e| JjError::IoError(e.to_string()))?;

    if !output.status.success() {
        return Err(JjError::IoError(
            String::from_utf8_lossy(&output.stderr).to_string(),
        ));
    }

    // After split, advance the bookmark to the parent commit (@- has the selected files)
    // Try to get branch name from database first
    let mut branch_name: Option<String> = None;
    let repo_path = derive_repo_path_from_workspace(workspace_path);

    if let Some(ref rp) = repo_path {
        if let Ok(db_branch) = local_db::get_workspace_branch_name(rp, workspace_path) {
            branch_name = db_branch;
        }
    }

    // Fallback to git detection if database lookup failed
    if branch_name.is_none() {
        if let Ok(git_branch) = get_workspace_branch(workspace_path) {
            if !git_branch.is_empty() && git_branch != "HEAD" {
                branch_name = Some(git_branch);
            }
        }
    }

    // Advance the bookmark if we found a valid branch name
    if let Some(ref branch) = branch_name {
        // Set the bookmark to point at @- (the parent with selected files)
        if let Err(e) = jj_set_bookmark(workspace_path, branch, "@-") {
            eprintln!("Warning: Failed to advance bookmark '{}': {}", branch, e);
            // Don't fail the split for bookmark errors
        }

        // Checkout the branch in git to avoid detached HEAD
        if let Some(ref rp) = repo_path {
            let checkout = Command::new("git")
                .current_dir(rp)
                .args(["checkout", branch])
                .output();
            if let Err(e) = checkout {
                eprintln!("Warning: Failed to checkout git branch '{}': {}", branch, e);
            }
        }
    }

    Ok("Split successfully".to_string())
}

/// Rebase the current workspace onto a target branch
/// Uses: jj rebase -d <target_branch>
pub fn jj_rebase_onto(
    workspace_path: &str,
    target_branch: &str,
) -> Result<JjRebaseResult, JjError> {
    let output = Command::new("jj")
        .current_dir(workspace_path)
        .args(["rebase", "-d", target_branch])
        .output()
        .map_err(|e| JjError::IoError(e.to_string()))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);
    let combined_message = format!("{}{}", stdout, stderr);

    // Check for conflicts in output
    let has_conflicts = combined_message.to_lowercase().contains("conflict");

    // Get conflicted files if there are conflicts
    let conflicted_files = if has_conflicts {
        get_conflicted_files(workspace_path).unwrap_or_default()
    } else {
        Vec::new()
    };

    Ok(JjRebaseResult {
        success: output.status.success(),
        message: combined_message,
        has_conflicts,
        conflicted_files,
    })
}

/// Get list of conflicted files from jj status
pub fn get_conflicted_files(workspace_path: &str) -> Result<Vec<String>, JjError> {
    let output = Command::new("jj")
        .current_dir(workspace_path)
        .args(["status", "--no-pager"])
        .output()
        .map_err(|e| JjError::IoError(e.to_string()))?;

    if !output.status.success() {
        return Ok(Vec::new());
    }

    let status = String::from_utf8_lossy(&output.stdout);
    parse_conflicted_files(&status)
}

/// Parse jj status output to extract conflicted files
/// JJ shows conflicts with "C" prefix in status output
fn parse_conflicted_files(status: &str) -> Result<Vec<String>, JjError> {
    let mut conflicts = Vec::new();

    for line in status.lines() {
        let trimmed = line.trim();

        // Look for lines that start with "C " indicating conflicts
        if let Some(rest) = trimmed.strip_prefix("C ") {
            conflicts.push(rest.trim().to_string());
        }
        // Also check for explicit conflict messages
        else if trimmed.contains("conflict") && trimmed.contains(":") {
            if let Some(file_path) = trimmed.split(':').next() {
                let clean_path = file_path.trim();
                if !clean_path.is_empty() && !conflicts.contains(&clean_path.to_string()) {
                    conflicts.push(clean_path.to_string());
                }
            }
        }
    }

    Ok(conflicts)
}

/// Get the default branch of the repository (main/master)
/// Checks git symbolic-ref for origin/HEAD, falls back to checking for main/master
pub fn get_default_branch(repo_path: &str) -> Result<String, JjError> {
    // Try origin/HEAD first
    let output = Command::new("git")
        .current_dir(repo_path)
        .args(["symbolic-ref", "refs/remotes/origin/HEAD"])
        .output()
        .map_err(|e| JjError::IoError(e.to_string()))?;

    if output.status.success() {
        let branch = String::from_utf8_lossy(&output.stdout)
            .trim()
            .strip_prefix("refs/remotes/origin/")
            .unwrap_or("main")
            .to_string();
        return Ok(branch);
    }

    // Fallback: check for main or master branches
    for branch in &["main", "master"] {
        let check = Command::new("git")
            .current_dir(repo_path)
            .args(["rev-parse", "--verify", branch])
            .output();

        if check.map(|o| o.status.success()).unwrap_or(false) {
            return Ok(branch.to_string());
        }
    }

    // Default fallback
    Ok("main".to_string())
}

/// Push changes to remote using jj git push
pub fn jj_push(workspace_path: &str) -> Result<String, JjError> {
    let output = Command::new("jj")
        .current_dir(workspace_path)
        .args(["git", "push"])
        .output()
        .map_err(|e| JjError::IoError(e.to_string()))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);

    if !output.status.success() {
        return Err(JjError::IoError(format!("{}{}", stdout, stderr)));
    }

    Ok(format!("{}{}", stdout, stderr))
}

/// Pull changes from remote using jj git fetch + rebase
/// Fetches from origin and rebases current workspace onto tracking branch
pub fn jj_pull(workspace_path: &str) -> Result<String, JjError> {
    // First, fetch from remote
    let fetch_output = Command::new("jj")
        .current_dir(workspace_path)
        .args(["git", "fetch"])
        .output()
        .map_err(|e| JjError::IoError(e.to_string()))?;

    let fetch_stdout = String::from_utf8_lossy(&fetch_output.stdout);
    let fetch_stderr = String::from_utf8_lossy(&fetch_output.stderr);

    if !fetch_output.status.success() {
        return Err(JjError::IoError(format!("{}{}", fetch_stdout, fetch_stderr)));
    }

    // Get the current branch name to determine tracking branch
    let branch_name = get_workspace_branch(workspace_path)?;

    if branch_name.is_empty() || branch_name == "HEAD" {
        // No branch - just return fetch result
        return Ok(format!("{}{}", fetch_stdout, fetch_stderr));
    }

    // Rebase onto the tracking branch (branch@origin)
    let tracking_branch = format!("{}@origin", branch_name);
    let rebase_output = Command::new("jj")
        .current_dir(workspace_path)
        .args(["rebase", "-d", &tracking_branch])
        .output()
        .map_err(|e| JjError::IoError(e.to_string()))?;

    let rebase_stdout = String::from_utf8_lossy(&rebase_output.stdout);
    let rebase_stderr = String::from_utf8_lossy(&rebase_output.stderr);

    // Combine fetch and rebase output
    let combined = format!(
        "Fetch:\n{}{}\nRebase:\n{}{}",
        fetch_stdout, fetch_stderr, rebase_stdout, rebase_stderr
    );

    if !rebase_output.status.success() {
        return Err(JjError::IoError(combined));
    }

    Ok(combined)
}
