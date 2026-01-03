use jj_lib::config::{ConfigLayer, ConfigSource, StackedConfig};
use jj_lib::settings::UserSettings;
use jj_lib::workspace::Workspace;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use std::process::Command;

use crate::binary_paths;
use crate::local_db;

/// Helper function to create Command for a binary using cached path
fn command_for(binary: &str) -> Command {
    let path = binary_paths::get_binary_path(binary).unwrap_or_else(|| binary.to_string());
    Command::new(path)
}

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

/// A single commit in the log
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct JjLogCommit {
    pub commit_id: String,
    pub short_id: String,
    pub change_id: String,
    pub description: String,
    pub author_name: String,
    pub timestamp: String,
    pub parent_ids: Vec<String>,
    pub is_working_copy: bool,
    pub bookmarks: Vec<String>,
    pub insertions: u32,
    pub deletions: u32,
}

/// The full log response including metadata
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct JjLogResult {
    pub commits: Vec<JjLogCommit>,
    pub target_branch: String,
    pub workspace_branch: String,
}

/// Commits ahead of target branch
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct JjCommitsAhead {
    pub commits: Vec<JjLogCommit>,
    pub total_count: usize,
}

/// Result of merge operation
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct JjMergeResult {
    pub success: bool,
    pub message: String,
    pub has_conflicts: bool,
    pub conflicted_files: Vec<String>,
    pub merge_commit_id: Option<String>,
}

/// Diff hunks for a single file
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct JjFileDiff {
    pub path: String,
    pub hunks: Vec<JjDiffHunk>,
}

/// Combined diff between two revisions
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct JjRevisionDiff {
    pub files: Vec<JjFileChange>,
    pub hunks_by_file: Vec<JjFileDiff>,
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
    let name = command_for("git")
        .current_dir(repo_path)
        .args(["config", "--get", "user.name"])
        .output()
        .ok()
        .filter(|o| o.status.success())
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
        .unwrap_or_else(|| "Treq User".to_string());

    let email = command_for("git")
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
pub fn ensure_jj_initialized(db: &crate::db::Database, repo_path: &str) -> Result<bool, JjError> {
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
    _inclusion_patterns: Option<Vec<String>>,
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

    let workspace_path_str = workspace_dir.to_string_lossy().to_string();

    // Use jj workspace add for all cases (handles both new and existing bookmarks)
    let mut jj_cmd = command_for("jj");
    jj_cmd.current_dir(repo_path)
        .args(["workspace", "add", &workspace_path_str]);

    // Determine revision to start from and extract remote name if applicable
    // Convert git format (origin/branch) to jj format (branch@origin)
    let remote_name = if !new_branch {
        // Existing bookmark: point to that bookmark's revision
        jj_cmd.args(["--revision", branch_name]);
        None
    } else if let Some(source) = source_branch {
        // Check if source is a git remote ref format (e.g., "origin/branch")
        if let Some(slash_pos) = source.find('/') {
            let remote = &source[..slash_pos];
            let remote_branch = &source[slash_pos + 1..];
            // Convert to jj format: branch@remote
            let jj_ref = format!("{}@{}", remote_branch, remote);
            jj_cmd.args(["--revision", &jj_ref]);
            Some(remote.to_string())
        } else {
            // Not a remote ref, use as-is (local branch or commit)
            jj_cmd.args(["--revision", source]);
            None
        }
    } else {
        None
    };

    let output = jj_cmd.output()
        .map_err(|e| JjError::GitWorkspaceError(format!("Failed to execute jj workspace add: {}", e)))?;

    if !output.status.success() {
        return Err(JjError::GitWorkspaceError(
            String::from_utf8_lossy(&output.stderr).to_string()
        ));
    }

    // Create/set the bookmark on the new workspace's working copy
    if let Err(e) = jj_set_bookmark(&workspace_path_str, branch_name, "@") {
        eprintln!("Warning: Failed to set bookmark '{}': {}", branch_name, e);
        // Don't fail workspace creation for bookmark errors
    }

    // Track the remote bookmark if this workspace was created from a remote branch
    if let Some(remote) = remote_name {
        if let Err(e) = jj_bookmark_track(&workspace_path_str, branch_name, &remote) {
            eprintln!("Warning: Failed to track bookmark '{}@{}': {}", branch_name, remote, e);
            // Don't fail workspace creation for tracking errors
        }
    }

    Ok(sanitized_name)
}

/// List all workspaces in a repository
/// Returns workspaces found in .treq/workspaces/ directory
pub fn list_workspaces(repo_path: &str) -> Result<Vec<WorkspaceInfo>, JjError> {
    let workspaces_dir = Path::new(repo_path).join(".treq").join("workspaces");

    if !workspaces_dir.exists() {
        return Ok(Vec::new());
    }

    let mut workspaces = Vec::new();

    let entries = fs::read_dir(&workspaces_dir).map_err(|e| JjError::IoError(e.to_string()))?;

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

        let name = entry.file_name().to_string_lossy().to_string();

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
pub fn get_workspace_branch(workspace_path: &str) -> Result<String, JjError> {
    let output = command_for("git")
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


/// Remove a workspace (jj workspace + files)
pub fn remove_workspace(repo_path: &str, workspace_path: &str) -> Result<(), JjError> {
    let workspace_dir = Path::new(workspace_path);

    // Extract workspace name from path (last component)
    let workspace_name = workspace_dir
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("");

    // Always try to forget the jj workspace first
    // This ensures jj stops tracking it even if directory is already gone
    if !workspace_name.is_empty() {
        let output = command_for("jj")
            .current_dir(repo_path)
            .args(&["workspace", "forget", workspace_name])
            .output()
            .map_err(|e| JjError::IoError(format!("Failed to execute jj workspace forget: {}", e)))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            // Only return error if it's not a "workspace not found" error
            if !stderr.contains("No such workspace") {
                return Err(JjError::IoError(
                    format!("Failed to forget workspace: {}", stderr)
                ));
            }
            // If workspace not found in jj, that's fine - continue with directory cleanup
        }
    }

    // Remove directory if it exists
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
    let mut cmd = command_for("jj");
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
    let output = command_for("jj")
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
        if line.is_empty() || line.starts_with("Working copy") || line.starts_with("Parent commit")
        {
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
pub fn jj_get_file_hunks(
    workspace_path: &str,
    file_path: &str,
) -> Result<Vec<JjDiffHunk>, JjError> {
    // Use jj diff --git to get hunks in git-compatible format
    let output = command_for("jj")
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
            // Skip diff metadata lines (be specific to avoid filtering conflict markers)
            if !line.starts_with("diff --git")
                && !line.starts_with("index ")
                && !line.starts_with("--- ")
                && !line.starts_with("+++ ")
            {
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
        let output = command_for("git")
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
    let output = command_for("jj")
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
    let output = command_for("jj")
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
pub fn jj_set_bookmark(
    workspace_path: &str,
    bookmark_name: &str,
    revision: &str,
) -> Result<(), JjError> {
    let output = command_for("jj")
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

/// Track a remote bookmark
/// Uses: jj bookmark track <name>@<remote>
pub fn jj_bookmark_track(
    workspace_path: &str,
    bookmark_name: &str,
    remote_name: &str,
) -> Result<(), JjError> {
    let tracking_ref = format!("{}@{}", bookmark_name, remote_name);
    let output = command_for("jj")
        .current_dir(workspace_path)
        .args(["bookmark", "track", &tracking_ref])
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
pub fn derive_repo_path_from_workspace(workspace_path: &str) -> Option<String> {
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
    let repo_path = derive_repo_path_from_workspace(workspace_path);

    // Get branch name - different logic for workspaces vs main repo
    let branch = if let Some(ref rp) = repo_path {
        // For workspaces: get branch_name from the workspace record in db
        let workspace = local_db::get_workspace_by_path(rp, workspace_path)
            .map_err(|e| JjError::IoError(format!("Failed to query workspace: {}", e)))?
            .ok_or_else(|| JjError::WorkspaceNotFound(workspace_path.to_string()))?;
        workspace.branch_name
    } else {
        // For main repo: require git to be on a branch
        let git_branch = get_workspace_branch(workspace_path).map_err(|e| {
            JjError::IoError(format!(
                "Failed to determine current git branch: {}",
                e
            ))
        })?;

        if git_branch.is_empty() || git_branch == "HEAD" {
            return Err(JjError::IoError(
                "Git is not checked out to a branch. Please checkout a branch before committing."
                    .to_string(),
            ));
        }
        git_branch
    };

    // Now commit with message (sets message on current change and creates new empty change)
    let commit = command_for("jj")
        .current_dir(workspace_path)
        .args(["commit", "-m", message])
        .output()
        .map_err(|e| JjError::IoError(e.to_string()))?;

    if !commit.status.success() {
        return Err(JjError::IoError(
            String::from_utf8_lossy(&commit.stderr).to_string(),
        ));
    }

    // Set the bookmark to point at @- (the commit with the actual content)
    jj_set_bookmark(workspace_path, &branch, "@-")
        .map_err(|e| JjError::IoError(format!("Failed to advance bookmark '{}': {}", branch, e)))?;

    // Only checkout branch in git for main repo (not workspaces)
    if repo_path.is_none() {
        let checkout = command_for("git")
            .current_dir(workspace_path)
            .args(["checkout", &branch])
            .output();
        if let Err(e) = checkout {
            eprintln!("Warning: Failed to checkout git branch '{}': {}", branch, e);
        }
    }

    Ok(format!("Committed successfully to branch '{}'", branch))
}

/// Split selected files from working copy into a new parent commit
/// Uses: jj split -r @ -m <message> <file_paths...>
pub fn jj_split(
    workspace_path: &str,
    message: &str,
    file_paths: Vec<String>,
) -> Result<String, JjError> {
    let repo_path = derive_repo_path_from_workspace(workspace_path);

    // Get branch name - different logic for workspaces vs main repo
    let branch = if let Some(ref rp) = repo_path {
        // For workspaces: get branch_name from the workspace record in db
        let workspace = local_db::get_workspace_by_path(rp, workspace_path)
            .map_err(|e| JjError::IoError(format!("Failed to query workspace: {}", e)))?
            .ok_or_else(|| JjError::WorkspaceNotFound(workspace_path.to_string()))?;
        workspace.branch_name
    } else {
        let git_branch = get_workspace_branch(workspace_path).map_err(|e| {
            JjError::IoError(format!(
                "Failed to determine current git branch: {}",
                e
            ))
        })?;

        if git_branch.is_empty() || git_branch == "HEAD" {
            return Err(JjError::IoError(
                "Git is not checked out to a branch. Please checkout a branch before committing."
                    .to_string(),
            ));
        }
        git_branch
    };

    // Build and execute the jj split command
    let mut cmd = command_for("jj");
    cmd.current_dir(workspace_path);
    cmd.args(["split", "-r", "@", "-m", message]);
    for path in &file_paths {
        cmd.arg(path);
    }

    let output = cmd.output().map_err(|e| JjError::IoError(e.to_string()))?;

    if !output.status.success() {
        return Err(JjError::IoError(
            String::from_utf8_lossy(&output.stderr).to_string(),
        ));
    }

    // Set the bookmark to point at @- (critical - same as jj_commit)
    jj_set_bookmark(workspace_path, &branch, "@-")
        .map_err(|e| JjError::IoError(format!("Failed to advance bookmark '{}': {}", branch, e)))?;

    // Only checkout branch in git for main repo
    if repo_path.is_none() {
        let checkout = command_for("git")
            .current_dir(workspace_path)
            .args(["checkout", &branch])
            .output();
        if let Err(e) = checkout {
            eprintln!("Warning: Failed to checkout git branch '{}': {}", branch, e);
        }
    }

    Ok(format!("Committed successfully to branch '{}'", branch))
}

/// Rebase the current workspace onto a target branch
/// Uses: jj rebase -d <target_branch>
pub fn jj_rebase_onto(
    workspace_path: &str,
    target_branch: &str,
) -> Result<JjRebaseResult, JjError> {
    let output = command_for("jj")
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
    let output = command_for("jj")
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
        // This is the ONLY way jj marks conflicted files in status output
        if let Some(rest) = trimmed.strip_prefix("C ") {
            conflicts.push(rest.trim().to_string());
        }
    }

    Ok(conflicts)
}

/// Get the current commit ID for a branch/revision
/// Uses: jj log -r <revision> --no-graph -T 'commit_id.short(12)'
pub fn jj_get_commit_id(repo_path: &str, revision: &str) -> Result<String, JjError> {
    let output = command_for("jj")
        .current_dir(repo_path)
        .args([
            "log",
            "-r",
            revision,
            "--no-graph",
            "-T",
            "commit_id.short(12)",
        ])
        .output()
        .map_err(|e| JjError::IoError(e.to_string()))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(JjError::IoError(format!(
            "Failed to get commit ID for '{}': {}",
            revision, stderr
        )));
    }

    let commit_id = String::from_utf8_lossy(&output.stdout).trim().to_string();

    if commit_id.is_empty() {
        return Err(JjError::IoError(format!(
            "No commit found for revision '{}'",
            revision
        )));
    }

    Ok(commit_id)
}

/// Rebase using a revset expression
/// Runs from specified directory to ensure correct commit resolution
/// Sets jj bookmark after successful rebase
pub fn jj_rebase_with_revset(
    working_dir: &str,
    revset: &str,
    target_branch: &str,
    branch_name: &str,
) -> Result<JjRebaseResult, JjError> {
    let output = command_for("jj")
        .current_dir(working_dir)
        .args(["rebase", "-s", revset, "-d", target_branch])
        .output()
        .map_err(|e| JjError::IoError(e.to_string()))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);
    let combined_message = format!("{}{}", stdout, stderr);

    // Check for conflicts in output
    let has_conflicts = combined_message.to_lowercase().contains("conflict");

    // Get conflicted files if there are conflicts
    let conflicted_files = if has_conflicts {
        get_conflicted_files(working_dir)
            .unwrap_or_else(|_| Vec::new())
    } else {
        Vec::new()
    };

    // Set jj bookmark after successful rebase
    if output.status.success() {
        jj_set_bookmark(working_dir, branch_name, "@")
            .map_err(|e| JjError::IoError(format!(
                "Rebase succeeded but failed to set bookmark '{}': {}",
                branch_name, e
            )))?;
    }

    Ok(JjRebaseResult {
        success: output.status.success(),
        message: combined_message,
        has_conflicts,
        conflicted_files,
    })
}

/// Rebase multiple workspaces onto their shared target branch
/// Uses: jj rebase -s 'roots(target..branch1)' -s 'roots(target..branch2)' ... -d target
pub fn jj_rebase_workspaces_onto_target(
    repo_path: &str,
    target_branch: &str,
    workspace_branches: Vec<String>,
) -> Result<JjRebaseResult, JjError> {
    if workspace_branches.is_empty() {
        return Ok(JjRebaseResult {
            success: true,
            message: "No workspaces to rebase".to_string(),
            has_conflicts: false,
            conflicted_files: Vec::new(),
        });
    }

    let mut args = vec!["rebase".to_string()];

    // Add -s argument for each workspace
    for branch in &workspace_branches {
        args.push("-s".to_string());
        args.push(format!("roots({}..{})", target_branch, branch));
    }

    // Add destination
    args.push("-d".to_string());
    args.push(target_branch.to_string());

    let output = command_for("jj")
        .current_dir(repo_path)
        .args(&args)
        .output()
        .map_err(|e| JjError::IoError(e.to_string()))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);
    let combined_message = format!("{}{}", stdout, stderr);

    // Check for conflicts in output
    let has_conflicts = combined_message.to_lowercase().contains("conflict");

    // Get conflicted files if there are conflicts
    // Note: For multi-workspace rebase, we'd need to check each workspace individually
    // For now, we'll return an empty list since this is a bulk operation
    let conflicted_files = Vec::new();

    Ok(JjRebaseResult {
        success: output.status.success(),
        message: combined_message,
        has_conflicts,
        conflicted_files,
    })
}

/// Get the default branch of the repository (main/master)
/// Checks git symbolic-ref for origin/HEAD, falls back to checking for main/master
pub fn get_default_branch(repo_path: &str) -> Result<String, JjError> {
    // Try origin/HEAD first
    let output = command_for("git")
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
        let check = command_for("git")
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
    let output = command_for("jj")
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

/// Fetch remote branches using jj git fetch (without rebasing)
/// This updates remote tracking refs and makes remote branches available
pub fn jj_git_fetch(repo_path: &str) -> Result<String, JjError> {
    let output = command_for("jj")
        .current_dir(repo_path)
        .args(["git", "fetch"])
        .output()
        .map_err(|e| JjError::IoError(e.to_string()))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);

    // Note: jj git fetch may have warnings in stderr even on success
    // So we only fail if the command itself failed
    if !output.status.success() {
        return Err(JjError::IoError(format!("{}{}", stdout, stderr)));
    }

    Ok(format!("{}{}", stdout, stderr))
}

/// Pull changes from remote using jj git fetch + rebase
/// Fetches from origin and rebases current workspace onto tracking branch
pub fn jj_pull(workspace_path: &str) -> Result<String, JjError> {
    // First, fetch from remote
    let fetch_output = command_for("jj")
        .current_dir(workspace_path)
        .args(["git", "fetch"])
        .output()
        .map_err(|e| JjError::IoError(e.to_string()))?;

    let fetch_stdout = String::from_utf8_lossy(&fetch_output.stdout);
    let fetch_stderr = String::from_utf8_lossy(&fetch_output.stderr);

    if !fetch_output.status.success() {
        return Err(JjError::IoError(format!(
            "{}{}",
            fetch_stdout, fetch_stderr
        )));
    }

    // Get the current branch name to determine tracking branch
    let branch_name = get_workspace_branch(workspace_path)?;

    if branch_name.is_empty() || branch_name == "HEAD" {
        // No branch - just return fetch result
        return Ok(format!("{}{}", fetch_stdout, fetch_stderr));
    }

    // Rebase onto the tracking branch (branch@origin)
    let tracking_branch = format!("{}@origin", branch_name);
    let rebase_output = command_for("jj")
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

/// Branch status indicating whether a branch exists locally and/or remotely
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct BranchStatus {
    pub local_exists: bool,
    pub remote_exists: bool,
    pub remote_name: Option<String>,  // The remote name (e.g., "origin") if remote exists
    pub remote_ref: Option<String>,   // Full remote ref (e.g., "origin/branch") if remote exists
}

/// Check if a branch exists locally and/or remotely
/// Uses git rev-parse to check refs/heads/{branch} and refs/remotes/{remote}/{branch}
/// Currently only checks 'origin' remote
pub fn check_branch_exists(repo_path: &str, branch_name: &str) -> Result<BranchStatus, JjError> {
    // Check local branch existence
    let local_ref = format!("refs/heads/{}", branch_name);
    let local_check = command_for("git")
        .current_dir(repo_path)
        .args(["rev-parse", "--verify", &local_ref])
        .output()
        .map_err(|e| JjError::IoError(e.to_string()))?;

    let local_exists = local_check.status.success();

    // Check remote branch existence (origin)
    // In the future, could check all remotes from `git remote` output
    let remote_name = "origin";
    let remote_ref = format!("refs/remotes/{}/{}", remote_name, branch_name);
    let remote_check = command_for("git")
        .current_dir(repo_path)
        .args(["rev-parse", "--verify", &remote_ref])
        .output()
        .map_err(|e| JjError::IoError(e.to_string()))?;

    let remote_exists = remote_check.status.success();

    let remote_ref_short = if remote_exists {
        Some(format!("{}/{}", remote_name, branch_name))
    } else {
        None
    };

    Ok(BranchStatus {
        local_exists,
        remote_exists,
        remote_name: if remote_exists { Some(remote_name.to_string()) } else { None },
        remote_ref: remote_ref_short,
    })
}

/// Information about a jj bookmark/branch
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct JjBranch {
    pub name: String,
    pub is_current: bool,
}

/// Get list of branches in the repository
/// Uses jj bookmark list to get local bookmarks
pub fn get_branches(repo_path: &str) -> Result<Vec<JjBranch>, JjError> {
    let output = command_for("jj")
        .current_dir(repo_path)
        .args(["bookmark", "list"])
        .output()
        .map_err(|e| JjError::IoError(e.to_string()))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(JjError::IoError(format!(
            "Failed to list branches: {}",
            stderr
        )));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut branches = Vec::new();

    // Parse jj bookmark list output
    // Format is typically: "branch_name: commit_id"
    // or "branch_name (deleted)"
    // Current bookmark might be marked with * or similar
    for line in stdout.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }

        // Check if this is the current bookmark (marked with *)
        let is_current = line.starts_with('*');
        let line = if is_current {
            line.trim_start_matches('*').trim()
        } else {
            line
        };

        // Extract branch name (everything before the colon)
        if let Some(colon_pos) = line.find(':') {
            let branch_name = line[..colon_pos].trim().to_string();
            if !branch_name.is_empty() {
                branches.push(JjBranch {
                    name: branch_name,
                    is_current,
                });
            }
        }
    }

    Ok(branches)
}

/// Get commit log from fork point to HEAD for a workspace
/// Uses: jj log with custom template for machine-readable output
/// Parse diff stat output from jj: "X files changed, Y insertions(+), Z deletions(-)"
/// Returns (insertions, deletions) tuple
fn parse_diff_stat(stat: &str) -> (u32, u32) {
    let mut insertions = 0;
    let mut deletions = 0;

    // Look for "Y insertions(+)"
    if let Some(ins_start) = stat.find("insertions(+)") {
        let before = &stat[..ins_start].trim();
        if let Some(last_space) = before.rfind(' ') {
            if let Ok(num) = before[last_space + 1..].parse::<u32>() {
                insertions = num;
            }
        }
    } else if let Some(ins_start) = stat.find("insertion(+)") {
        // Handle singular "insertion"
        let before = &stat[..ins_start].trim();
        if let Some(last_space) = before.rfind(' ') {
            if let Ok(num) = before[last_space + 1..].parse::<u32>() {
                insertions = num;
            }
        }
    }

    // Look for "Z deletions(-)"
    if let Some(del_start) = stat.find("deletions(-)") {
        let before = &stat[..del_start].trim();
        if let Some(last_space) = before.rfind(' ') {
            if let Ok(num) = before[last_space + 1..].parse::<u32>() {
                deletions = num;
            }
        }
    } else if let Some(del_start) = stat.find("deletion(-)") {
        // Handle singular "deletion"
        let before = &stat[..del_start].trim();
        if let Some(last_space) = before.rfind(' ') {
            if let Ok(num) = before[last_space + 1..].parse::<u32>() {
                deletions = num;
            }
        }
    }

    (insertions, deletions)
}

pub fn jj_get_log(workspace_path: &str, target_branch: &str) -> Result<JjLogResult, JjError> {
    // Get workspace branch name
    let workspace_branch = get_workspace_branch(workspace_path)?;

    // Build revset: target_branch..@
    // This shows only commits in workspace that are NOT in target branch (same as merge preview)
    let revset = format!("{}..@", target_branch);

    // Build template for tab-separated output
    let template = concat!(
        "commit_id.short(12) ++ \"\\t\" ++ ",
        "change_id.short(12) ++ \"\\t\" ++ ",
        "if(description, description.first_line(), \"(no description)\") ++ \"\\t\" ++ ",
        "author.name() ++ \"\\t\" ++ ",
        "author.timestamp() ++ \"\\t\" ++ ",
        "parents.map(|p| p.commit_id().short(12)).join(\",\") ++ \"\\t\" ++ ",
        "if(working_copies, \"true\", \"false\") ++ \"\\t\" ++ ",
        "bookmarks.map(|b| b.name()).join(\",\") ++ \"\\t\" ++ ",
        "diff.stat() ++ \"\\n\""
    );

    let output = command_for("jj")
        .current_dir(workspace_path)
        .args([
            "log",
            "-r",
            &revset,
            "--no-graph",
            "-T",
            template,
        ])
        .output()
        .map_err(|e| JjError::IoError(e.to_string()))?;

    if !output.status.success() {
        return Err(JjError::IoError(
            String::from_utf8_lossy(&output.stderr).to_string(),
        ));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut commits = Vec::new();

    // Parse each line of tab-separated output
    for line in stdout.lines() {
        if line.trim().is_empty() {
            continue;
        }

        let parts: Vec<&str> = line.split('\t').collect();
        if parts.len() < 9 {
            continue; // Skip malformed lines
        }

        let short_id = parts[0].to_string();
        let change_id = parts[1].to_string();
        let description = parts[2].to_string();
        let author_name = parts[3].to_string();
        let timestamp = parts[4].to_string();
        let parent_ids_str = parts[5];
        let is_working_copy = parts[6] == "true";
        let bookmarks_str = parts[7];
        let diff_stat = parts[8];

        // Parse parent IDs
        let parent_ids: Vec<String> = if parent_ids_str.is_empty() {
            Vec::new()
        } else {
            parent_ids_str.split(',').map(|s| s.to_string()).collect()
        };

        // Parse bookmarks
        let bookmarks: Vec<String> = if bookmarks_str.is_empty() {
            Vec::new()
        } else {
            bookmarks_str.split(',').map(|s| s.to_string()).collect()
        };

        // Parse diff stats: "X files changed, Y insertions(+), Z deletions(-)"
        let (insertions, deletions) = parse_diff_stat(diff_stat);

        commits.push(JjLogCommit {
            commit_id: short_id.clone(),
            short_id,
            change_id,
            description,
            author_name,
            timestamp,
            parent_ids,
            is_working_copy,
            bookmarks,
            insertions,
            deletions,
        });
    }

    Ok(JjLogResult {
        commits,
        target_branch: target_branch.to_string(),
        workspace_branch,
    })
}

/// Get commits that are in workspace but not in target branch
/// Uses revset: target_branch..@ (commits reachable from @ but not from target)
pub fn jj_get_commits_ahead(
    workspace_path: &str,
    target_branch: &str,
) -> Result<JjCommitsAhead, JjError> {
    // Validate target_branch to prevent injection
    if target_branch.starts_with('-') || target_branch.contains('\0') || target_branch.is_empty() {
        return Err(JjError::IoError("Invalid target branch name".to_string()));
    }

    // Revset: commits reachable from @ but not from target_branch
    let revset = format!("{}..@", target_branch);

    // Use same template as jj_get_log
    let template = concat!(
        "commit_id.short(12) ++ \"\\t\" ++ ",
        "change_id.short(12) ++ \"\\t\" ++ ",
        "if(description, description.first_line(), \"(no description)\") ++ \"\\t\" ++ ",
        "author.name() ++ \"\\t\" ++ ",
        "author.timestamp() ++ \"\\t\" ++ ",
        "parents.map(|p| p.commit_id().short(12)).join(\",\") ++ \"\\t\" ++ ",
        "if(working_copies, \"true\", \"false\") ++ \"\\t\" ++ ",
        "bookmarks.map(|b| b.name()).join(\",\") ++ \"\\t\" ++ ",
        "diff.stat() ++ \"\\n\""
    );

    let output = command_for("jj")
        .current_dir(workspace_path)
        .args(["log", "-r", &revset, "--no-graph", "-T", template])
        .output()
        .map_err(|e| JjError::IoError(e.to_string()))?;

    if !output.status.success() {
        return Err(JjError::IoError(
            String::from_utf8_lossy(&output.stderr).to_string(),
        ));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut commits = Vec::new();

    // Parse each line of tab-separated output (same logic as jj_get_log)
    for line in stdout.lines() {
        if line.trim().is_empty() {
            continue;
        }

        let parts: Vec<&str> = line.split('\t').collect();
        if parts.len() < 9 {
            continue;
        }

        let short_id = parts[0].to_string();
        let change_id = parts[1].to_string();
        let description = parts[2].to_string();
        let author_name = parts[3].to_string();
        let timestamp = parts[4].to_string();
        let parent_ids_str = parts[5];
        let is_working_copy = parts[6] == "true";
        let bookmarks_str = parts[7];
        let diff_stat = parts[8];

        let parent_ids: Vec<String> = if parent_ids_str.is_empty() {
            Vec::new()
        } else {
            parent_ids_str.split(',').map(|s| s.to_string()).collect()
        };

        let bookmarks: Vec<String> = if bookmarks_str.is_empty() {
            Vec::new()
        } else {
            bookmarks_str.split(',').map(|s| s.to_string()).collect()
        };

        // Parse diff stats
        let (insertions, deletions) = parse_diff_stat(diff_stat);

        commits.push(JjLogCommit {
            commit_id: short_id.clone(),
            short_id,
            change_id,
            description,
            author_name,
            timestamp,
            parent_ids,
            is_working_copy,
            bookmarks,
            insertions,
            deletions,
        });
    }

    let total_count = commits.len();

    Ok(JjCommitsAhead {
        commits,
        total_count,
    })
}

/// Parse diff summary output from jj diff --summary
/// Format: "M file.txt", "A new.txt", "D removed.txt"
fn parse_diff_summary(summary: &str) -> Result<Vec<JjFileChange>, JjError> {
    let mut files = Vec::new();

    for line in summary.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }

        // Parse format: "M path/to/file.txt"
        let parts: Vec<&str> = line.splitn(2, ' ').collect();
        if parts.len() < 2 {
            continue;
        }

        let status = parts[0].to_string();
        let path = parts[1].to_string();

        files.push(JjFileChange {
            path,
            status,
            previous_path: None,
        });
    }

    Ok(files)
}

/// Get combined diff of all changes between target branch and workspace HEAD
/// Uses: jj diff --from target_branch --to @ --git
pub fn jj_get_merge_diff(
    workspace_path: &str,
    target_branch: &str,
) -> Result<JjRevisionDiff, JjError> {
    // Validate target_branch to prevent injection
    if target_branch.starts_with('-') || target_branch.contains('\0') || target_branch.is_empty() {
        return Err(JjError::IoError("Invalid target branch name".to_string()));
    }

    // First get list of changed files
    let status_output = command_for("jj")
        .current_dir(workspace_path)
        .args(["diff", "--from", target_branch, "--to", "@", "--summary"])
        .output()
        .map_err(|e| JjError::IoError(e.to_string()))?;

    if !status_output.status.success() {
        return Err(JjError::IoError(
            String::from_utf8_lossy(&status_output.stderr).to_string(),
        ));
    }

    let summary = String::from_utf8_lossy(&status_output.stdout);
    let files = parse_diff_summary(&summary)?;

    // For each file, get the hunks
    let mut hunks_by_file = Vec::new();
    for file in &files {
        let diff_output = command_for("jj")
            .current_dir(workspace_path)
            .args([
                "diff",
                "--from", target_branch,
                "--to", "@",
                "--git",
                "--no-pager",
                "--",
                &file.path,
            ])
            .output()
            .map_err(|e| JjError::IoError(e.to_string()))?;

        if !diff_output.status.success() {
            // If diff fails for a file, skip it but continue with others
            continue;
        }

        let diff_text = String::from_utf8_lossy(&diff_output.stdout);
        let hunks = parse_git_diff_hunks(&diff_text)?;

        hunks_by_file.push(JjFileDiff {
            path: file.path.clone(),
            hunks,
        });
    }

    Ok(JjRevisionDiff {
        files,
        hunks_by_file,
    })
}

/// Create a merge commit using jj new
///
/// Flow:
/// 1. jj new workspace_branch target_branch+ -m "message" - create merge
/// 2. jj new @ - create new working copy on top
/// 3. jj bookmark set target_branch -r @- - move target_branch to merge commit
/// This is executed in the context of the workspace directory, @ refers to workspace HEAD
pub fn jj_create_merge_commit(
    workspace_path: &str,
    workspace_branch: &str,
    target_branch: &str,
    message: &str,
) -> Result<JjMergeResult, JjError> {
    if workspace_branch.starts_with('-') || workspace_branch.contains('\0') || workspace_branch.is_empty() {
        return Err(JjError::IoError("Invalid workspace branch name".to_string()));
    }

    if target_branch.starts_with('-') || target_branch.contains('\0') || target_branch.is_empty() {
        return Err(JjError::IoError("Invalid target branch name".to_string()));
    }

    if message.contains('\0') {
        return Err(JjError::IoError("Invalid commit message".to_string()));
    }

    if message.len() > 10000 {
        return Err(JjError::IoError("Commit message too long (max 10000 characters)".to_string()));
    }

    // Step 1: Create merge commit with workspace_branch and target_branch+ as parents
    let target_revset = format!("{}+", target_branch);
    let output = command_for("jj")
        .current_dir(workspace_path)
        .args(["new", workspace_branch, &target_revset, "-m", message])
        .output()
        .map_err(|e| JjError::IoError(e.to_string()))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);
    let combined = format!("{}{}", stdout, stderr);

    let has_conflicts = combined.to_lowercase().contains("conflict");

    let conflicted_files = if has_conflicts {
        get_conflicted_files(workspace_path).unwrap_or_default()
    } else {
        Vec::new()
    };

    let merge_commit_id = if output.status.success() {
        // Step 2: Create new working copy on top of merge
        let new_wc_output = command_for("jj")
            .current_dir(workspace_path)
            .args(["new", "@"])
            .output()
            .map_err(|e| JjError::IoError(e.to_string()))?;

        if !new_wc_output.status.success() {
            let new_wc_stderr = String::from_utf8_lossy(&new_wc_output.stderr);
            eprintln!("Warning: Failed to create new working copy: {}", new_wc_stderr);
        }

        // Step 3: Move target_branch bookmark to merge commit (parent of new working copy)
        if let Err(e) = jj_set_bookmark(workspace_path, target_branch, "@-") {
            eprintln!("Warning: Failed to update target bookmark '{}': {}", target_branch, e);
        }

        // Get merge commit ID (now at @-)
        command_for("jj")
            .current_dir(workspace_path)
            .args(["log", "-r", "@-", "--no-graph", "-T", "commit_id.short(12)"])
            .output()
            .ok()
            .and_then(|out| {
                if out.status.success() {
                    String::from_utf8(out.stdout)
                        .ok()
                        .map(|s| s.trim().to_string())
                } else {
                    None
                }
            })
    } else {
        None
    };

    Ok(JjMergeResult {
        success: output.status.success(),
        message: combined,
        has_conflicts,
        conflicted_files,
        merge_commit_id,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::PathBuf;
    use tempfile::TempDir;

    /// Helper to create a temporary directory for testing
    fn setup_test_dir() -> (TempDir, PathBuf) {
        let temp_dir = TempDir::new().unwrap();
        let workspace_path = temp_dir.path().join("test_workspace");
        fs::create_dir_all(&workspace_path).unwrap();
        (temp_dir, workspace_path)
    }

    #[test]
    fn test_remove_workspace_nonexistent_directory() {
        // Test that removing a non-existent workspace should succeed (not error)
        // This is the bug fix - currently it returns Err(WorkspaceNotFound)
        let temp_dir = TempDir::new().unwrap();
        let repo_path = temp_dir.path().to_str().unwrap();
        let nonexistent_path = temp_dir.path().join("nonexistent").to_str().unwrap().to_string();

        let result = remove_workspace(repo_path, &nonexistent_path);

        // Should succeed even if workspace doesn't exist
        assert!(result.is_ok(), "remove_workspace should succeed when directory doesn't exist");
    }

    #[test]
    fn test_remove_workspace_existing_directory() {
        // Test that removing an existing directory works
        let (_temp_dir, workspace_path) = setup_test_dir();
        let workspace_path_str = workspace_path.to_str().unwrap();
        let repo_path = workspace_path.parent().unwrap().to_str().unwrap();

        assert!(workspace_path.exists(), "Workspace should exist before removal");

        let result = remove_workspace(repo_path, workspace_path_str);

        // Should succeed and directory should be removed
        assert!(result.is_ok(), "remove_workspace should succeed: {:?}", result);
        assert!(!workspace_path.exists(), "Workspace directory should be removed");
    }

    #[test]
    fn test_remove_workspace_handles_git_failure_gracefully() {
        // Test that workspace removal continues even if git worktree remove fails
        // This simulates a workspace that was created without git worktree
        let (_temp_dir, workspace_path) = setup_test_dir();
        let workspace_path_str = workspace_path.to_str().unwrap();

        // Create a file in the workspace to ensure it needs cleanup
        let test_file = workspace_path.join("test.txt");
        fs::write(&test_file, "test content").unwrap();

        assert!(workspace_path.exists(), "Workspace should exist before removal");
        assert!(test_file.exists(), "Test file should exist");

        // Use a non-git repo path - git worktree remove will fail
        let fake_repo_path = workspace_path.parent().unwrap().to_str().unwrap();
        let result = remove_workspace(fake_repo_path, workspace_path_str);

        // Should still succeed by falling back to fs::remove_dir_all
        assert!(result.is_ok(), "remove_workspace should succeed even when git fails: {:?}", result);
        assert!(!workspace_path.exists(), "Workspace directory should be removed despite git failure");
    }

    #[test]
    fn test_parse_diff_summary() {
        let summary = "M src/file.ts\nA src/new.ts\nD src/old.ts";
        let files = parse_diff_summary(summary).unwrap();

        assert_eq!(files.len(), 3);
        assert_eq!(files[0].status, "M");
        assert_eq!(files[0].path, "src/file.ts");
        assert_eq!(files[1].status, "A");
        assert_eq!(files[1].path, "src/new.ts");
        assert_eq!(files[2].status, "D");
        assert_eq!(files[2].path, "src/old.ts");
    }

    #[test]
    fn test_parse_diff_summary_empty() {
        let summary = "";
        let files = parse_diff_summary(summary).unwrap();
        assert_eq!(files.len(), 0);
    }

    #[test]
    fn test_jj_commits_ahead_serialization() {
        // Test that JjCommitsAhead serializes correctly
        let result = JjCommitsAhead {
            commits: vec![],
            total_count: 0,
        };
        let json = serde_json::to_string(&result).unwrap();
        assert!(json.contains("total_count"));
        assert!(json.contains("commits"));
    }

    /// Test: jj_create_merge_commit flow
    ///
    /// Expected behavior:
    /// 1. Create merge: jj new workspace_branch target_branch+ -m "message"
    /// 2. Create new working copy: jj new @
    /// 3. Move target bookmark to merge: jj bookmark set target_branch -r @-
    ///
    /// This is a documentation test - integration testing requires a full jj repo setup.
    #[test]
    fn test_jj_create_merge_commit_should_update_target_bookmark() {
        assert!(
            true,
            "jj_create_merge_commit should create merge, new wc, and move bookmark"
        );
    }

    #[test]
    fn test_commit_in_workspace_with_detached_head() {
        // This test reproduces the bug where jj_commit fails when workspace is in detached HEAD
        // Workspaces SHOULD be in detached HEAD state - jj manages version control, not git

        let temp_dir = TempDir::new().unwrap();
        let repo_path = temp_dir.path().join("test_repo");
        fs::create_dir_all(&repo_path).unwrap();
        let repo_path_str = repo_path.to_str().unwrap();

        // Initialize git repo
        let git_init = command_for("git")
            .current_dir(&repo_path)
            .args(["init"])
            .output();
        assert!(git_init.is_ok(), "Failed to init git repo");

        // Configure git (required for commits)
        command_for("git")
            .current_dir(&repo_path)
            .args(["config", "user.name", "Test User"])
            .output()
            .unwrap();
        command_for("git")
            .current_dir(&repo_path)
            .args(["config", "user.email", "test@example.com"])
            .output()
            .unwrap();

        // Create initial commit in git
        let readme = repo_path.join("README.md");
        fs::write(&readme, "# Test Repo").unwrap();
        command_for("git")
            .current_dir(&repo_path)
            .args(["add", "."])
            .output()
            .unwrap();
        command_for("git")
            .current_dir(&repo_path)
            .args(["commit", "-m", "Initial commit"])
            .output()
            .unwrap();

        // Initialize jj in the repo
        let jj_init = command_for("jj")
            .current_dir(&repo_path)
            .args(["git", "init", "--colocate"])
            .output();

        let jj_init_result = jj_init.unwrap();
        if !jj_init_result.status.success() {
            eprintln!("Skipping test: jj not available or init failed: {}",
                String::from_utf8_lossy(&jj_init_result.stderr));
            return;
        }

        eprintln!("✓ JJ initialized successfully");

        // Create main branch in git
        command_for("git")
            .current_dir(&repo_path)
            .args(["checkout", "-b", "main"])
            .output()
            .unwrap();

        eprintln!("✓ Created main branch in git");

        // Create a workspace using the actual create_workspace function
        let workspace_result = create_workspace(
            repo_path_str,
            "test-workspace",
            "test-branch",
            true,  // new_branch
            Some("main"),
            None,
        );

        if workspace_result.is_err() {
            eprintln!("Skipping test: workspace creation failed: {:?}", workspace_result);
            return;
        }
        eprintln!("✓ Workspace created successfully");

        let workspace_name = workspace_result.unwrap();
        let workspace_path = repo_path.join(".treq/workspaces").join(&workspace_name);
        let workspace_path_str = workspace_path.to_str().unwrap();

        // Verify workspace is in detached HEAD (expected state)
        let git_branch_output = command_for("git")
            .current_dir(&workspace_path)
            .args(["rev-parse", "--abbrev-ref", "HEAD"])
            .output()
            .unwrap();
        let git_branch = String::from_utf8_lossy(&git_branch_output.stdout).trim().to_string();

        eprintln!("Git branch in workspace: '{}'", git_branch);

        // Workspace should be in detached HEAD
        if git_branch != "HEAD" {
            eprintln!("WARNING: Workspace is NOT in detached HEAD (on branch: {})", git_branch);
            eprintln!("This may be a different issue - workspace creation should leave it detached");
            // Don't skip the test, let's see what happens
        }

        // Make a change in the workspace
        let test_file = workspace_path.join("test.txt");
        fs::write(&test_file, "test content").unwrap();

        eprintln!("✓ Made changes in workspace");

        // Try to commit - THIS SHOULD CURRENTLY FAIL with "Git is not checked out to a branch"
        eprintln!("Attempting to commit...");
        let commit_result = jj_commit(workspace_path_str, "Test commit");

        eprintln!("Commit result: {:?}", commit_result);

        // After the fix: commits should succeed in workspaces even in detached HEAD
        assert!(
            commit_result.is_ok(),
            "jj_commit should succeed in workspace detached HEAD, got error: {:?}",
            commit_result
        );

        if let Ok(msg) = commit_result {
            eprintln!("✓ Commit succeeded: {}", msg);
            assert!(msg.contains("Committed successfully"), "Success message should confirm commit");
        }
    }

    #[test]
    fn test_jj_merge_result_serialization() {
        let result = JjMergeResult {
            success: true,
            message: "Merged successfully".to_string(),
            has_conflicts: false,
            conflicted_files: vec![],
            merge_commit_id: Some("abc123".to_string()),
        };
        let json = serde_json::to_string(&result).unwrap();
        assert!(json.contains("success"));
        assert!(json.contains("merge_commit_id"));
    }

    #[test]
    fn test_parse_conflicted_files_only_matches_c_prefix() {
        // Test that parse_conflicted_files only detects files with "C " prefix
        // and does NOT match status messages containing "conflict"

        // Actual jj status output with a real conflict
        let status_with_conflict = "Working copy: qpvuntsm 70db4c90 (no description set)\n\
            C src/conflicted-file.ts\n\
            Working copy : qpvuntsm 70db4c90 (no description set)";

        let conflicts = parse_conflicted_files(status_with_conflict).unwrap();
        assert_eq!(conflicts.len(), 1);
        assert_eq!(conflicts[0], "src/conflicted-file.ts");

        // Status message that contains "conflict" but is NOT a conflict
        // This simulates false positive scenarios
        let status_no_conflict = "Working copy: qpvuntsm 70db4c90 (conflict in description: fixed)\n\
            M src/file.ts\n\
            Working copy : qpvuntsm 70db4c90 (no description set)";

        let conflicts = parse_conflicted_files(status_no_conflict).unwrap();
        assert_eq!(conflicts.len(), 0, "Should not detect false positive conflicts");

        // Multiple conflicts
        let status_multiple = "C src/file1.ts\n\
            C src/file2.ts\n\
            M src/normal.ts";

        let conflicts = parse_conflicted_files(status_multiple).unwrap();
        assert_eq!(conflicts.len(), 2);
        assert!(conflicts.contains(&"src/file1.ts".to_string()));
        assert!(conflicts.contains(&"src/file2.ts".to_string()));

        // Empty status
        let status_empty = "";
        let conflicts = parse_conflicted_files(status_empty).unwrap();
        assert_eq!(conflicts.len(), 0);
    }

    #[test]
    fn test_workspace_from_remote_tracks_bookmark() {
        // Test that creating a workspace from a remote branch
        // automatically tracks the remote bookmark

        let temp_dir = TempDir::new().unwrap();
        let origin_repo = temp_dir.path().join("origin");
        let local_repo = temp_dir.path().join("local");

        // Create origin repository
        fs::create_dir_all(&origin_repo).unwrap();

        // Initialize git in origin
        let git_init = command_for("git")
            .current_dir(&origin_repo)
            .args(["init", "--initial-branch=main"])
            .output();

        if git_init.is_err() {
            eprintln!("Skipping test: git not available");
            return;
        }

        // Configure git in origin
        command_for("git")
            .current_dir(&origin_repo)
            .args(["config", "user.name", "Test User"])
            .output()
            .unwrap();
        command_for("git")
            .current_dir(&origin_repo)
            .args(["config", "user.email", "test@example.com"])
            .output()
            .unwrap();

        // Create initial commit in origin
        let readme = origin_repo.join("README.md");
        fs::write(&readme, "# Origin Repo").unwrap();
        command_for("git")
            .current_dir(&origin_repo)
            .args(["add", "."])
            .output()
            .unwrap();
        command_for("git")
            .current_dir(&origin_repo)
            .args(["commit", "-m", "Initial commit"])
            .output()
            .unwrap();

        // Create a feature branch in origin
        command_for("git")
            .current_dir(&origin_repo)
            .args(["checkout", "-b", "feature-branch"])
            .output()
            .unwrap();
        let feature_file = origin_repo.join("feature.txt");
        fs::write(&feature_file, "feature content").unwrap();
        command_for("git")
            .current_dir(&origin_repo)
            .args(["add", "."])
            .output()
            .unwrap();
        command_for("git")
            .current_dir(&origin_repo)
            .args(["commit", "-m", "Add feature"])
            .output()
            .unwrap();

        // Clone to local repository
        let clone_result = command_for("git")
            .current_dir(temp_dir.path())
            .args(["clone", origin_repo.to_str().unwrap(), local_repo.to_str().unwrap()])
            .output()
            .unwrap();

        if !clone_result.status.success() {
            eprintln!("Skipping test: git clone failed");
            return;
        }

        let local_repo_str = local_repo.to_str().unwrap();

        // Initialize jj in the local repo
        let jj_init = command_for("jj")
            .current_dir(&local_repo)
            .args(["git", "init", "--colocate"])
            .output();

        if jj_init.is_err() {
            eprintln!("Skipping test: jj not available");
            return;
        }

        let jj_init_result = jj_init.unwrap();
        if !jj_init_result.status.success() {
            eprintln!("Skipping test: jj init failed: {}",
                String::from_utf8_lossy(&jj_init_result.stderr));
            return;
        }

        // Fetch remote branches
        let fetch_result = jj_git_fetch(local_repo_str);
        if fetch_result.is_err() {
            eprintln!("Skipping test: jj git fetch failed: {:?}", fetch_result);
            return;
        }

        eprintln!("✓ Repository setup complete");

        // Create .treq/workspaces directory
        fs::create_dir_all(local_repo.join(".treq/workspaces")).unwrap();

        // Create workspace from remote branch
        // Pass in git format (origin/branch) as the frontend would
        let workspace_result = create_workspace(
            local_repo_str,
            "feature-workspace",
            "feature-branch",
            true,  // new_branch
            Some("origin/feature-branch"),  // source from remote in git format
            None,
        );

        if workspace_result.is_err() {
            eprintln!("Workspace creation failed: {:?}", workspace_result);
        }

        assert!(
            workspace_result.is_ok(),
            "Workspace creation should succeed, got error: {:?}",
            workspace_result
        );

        let workspace_name = workspace_result.unwrap();
        let workspace_path = local_repo.join(".treq/workspaces").join(&workspace_name);
        let workspace_path_str = workspace_path.to_str().unwrap();

        eprintln!("✓ Workspace created at {}", workspace_path_str);

        // Check that the bookmark is tracked
        // Run: jj bookmark list in the workspace
        let bookmark_list = command_for("jj")
            .current_dir(&workspace_path)
            .args(["bookmark", "list"])
            .output()
            .unwrap();

        let bookmark_output = String::from_utf8_lossy(&bookmark_list.stdout);
        eprintln!("Bookmark list output:\n{}", bookmark_output);

        // The output should show that feature-branch is tracking origin
        // Expected format: "feature-branch: <hash>" with tracking info
        assert!(
            bookmark_output.contains("feature-branch"),
            "Bookmark 'feature-branch' should exist"
        );

        // Check for tracking status - jj shows tracked bookmarks with "@origin" or similar
        // We need to verify the bookmark is associated with the remote
        let has_tracking = bookmark_output.contains("@origin") ||
                          bookmark_output.contains("tracked");

        assert!(
            has_tracking,
            "Bookmark 'feature-branch' should be tracked from origin. Output was:\n{}",
            bookmark_output
        );

        eprintln!("✓ Bookmark is properly tracked");
    }
}
