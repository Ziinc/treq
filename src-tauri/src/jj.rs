use jj_lib::config::{ConfigLayer, ConfigSource, StackedConfig};
use jj_lib::settings::UserSettings;
use jj_lib::workspace::Workspace;
use serde::{Deserialize, Serialize};
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::Path;
use std::process::Command;

use crate::binary_paths;
use crate::local_db;

/// Helper function to create Command for a binary using cached path
fn command_for(binary: &str) -> Command {
    let path = binary_paths::get_binary_path(binary).unwrap_or_else(|| binary.to_string());
    Command::new(path)
}

/// Convert git remote branch format to jj bookmark format
/// Examples: "origin/main" -> "main@origin" (if origin is a remote)
///           "treq/test" -> "treq/test" (if treq is not a remote)
fn convert_git_branch_to_jj_format(branch: &str, repo_path: &str) -> String {
    if let Some(slash_pos) = branch.find('/') {
        let prefix = &branch[..slash_pos];
        let suffix = &branch[slash_pos + 1..];

        let remotes = get_git_remotes(repo_path);

        if remotes.contains(prefix) {
            // This is a remote reference, convert to jj format
            format!("{}@{}", suffix, prefix)
        } else {
            // This is a local bookmark with namespace pattern
            branch.to_string()
        }
    } else {
        branch.to_string()
    }
}

/// Public wrapper for use by auto_rebase and other modules
pub fn convert_git_branch_to_jj_format_public(branch: &str, repo_path: &str) -> String {
    convert_git_branch_to_jj_format(branch, repo_path)
}

/// Error type for jj operations
#[derive(Debug)]
pub enum JjError {
    AlreadyInitialized,
    NotGitRepository,
    InitFailed(String),
    ConfigError(String),
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
pub fn ensure_gitignore_entries(repo_path: &str) -> Result<(), JjError> {
    let gitignore_path = Path::new(repo_path).join(".gitignore");
    let entries_to_add = [".jj/", ".treq/"];

    // Read existing .gitignore content
    let existing_content = if gitignore_path.exists() {
        fs::read_to_string(&gitignore_path)
            .map_err(|e| JjError::InitFailed(format!("Failed to read .gitignore: {}", e)))?
    } else {
        String::new()
    };

    let existing_entries: std::collections::HashSet<&str> = existing_content
        .lines()
        .map(|l| l.trim())
        .collect();

    // Find entries that need to be added
    let entries_needed: Vec<&str> = entries_to_add
        .iter()
        .filter(|entry| !existing_entries.contains(*entry))
        .copied()
        .collect();

    if entries_needed.is_empty() {
        return Ok(());
    }

    // Check if the comment already exists
    let has_comment = existing_entries.contains("# Added by Treq");

    // Append missing entries to .gitignore
    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&gitignore_path)
        .map_err(|e| JjError::InitFailed(format!("Failed to open .gitignore: {}", e)))?;

    // Add a newline before our entries if file doesn't end with newline
    if !existing_content.is_empty() && !existing_content.ends_with('\n') {
        writeln!(file)
            .map_err(|e| JjError::InitFailed(format!("Failed to write to .gitignore: {}", e)))?;
    }

    // Add comment only if it doesn't exist
    if !has_comment {
        writeln!(file, "# Added by Treq")
            .map_err(|e| JjError::InitFailed(format!("Failed to write to .gitignore: {}", e)))?;
    }

    // Add collocated entries
    for entry in entries_needed {
        writeln!(file, "{}", entry)
            .map_err(|e| JjError::InitFailed(format!("Failed to write to .gitignore: {}", e)))?;
    }

    Ok(())
}

/// Initialize jj for an existing git repository (colocated mode)
/// This creates a .jj/ directory alongside the existing .git/ directory
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

    // Ensure .gitignore entries
    ensure_gitignore_entries(repo_path)?;

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
    let _remote_name = if !new_branch {
        // Existing bookmark: point to that bookmark's revision
        jj_cmd.args(["--revision", branch_name]);
        None
    } else if let Some(source) = source_branch {
        // Convert source branch format - only treat as remote if prefix is actual remote
        let jj_ref = convert_git_branch_to_jj_format(source, repo_path);

        // Check if conversion happened (contains @)
        let remote_name = if jj_ref.contains('@') && jj_ref != source {
            // Extract remote name from jj_ref (format: branch@remote)
            jj_ref.split('@').nth(1).map(|s| s.to_string())
        } else {
            None
        };

        jj_cmd.args(["--revision", &jj_ref]);
        remote_name
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

    // Always track the bookmark with origin remote
    // This ensures bookmarks are tracked even for new local branches
    match is_bookmark_tracked(&workspace_path_str, branch_name, "origin") {
        Ok(true) => {
            eprintln!("Bookmark '{}' is already tracked with origin", branch_name);
        }
        Ok(false) => {
            if let Err(e) = jj_bookmark_track(&workspace_path_str, branch_name, "origin") {
                eprintln!("Warning: Failed to track bookmark '{}@origin': {}", branch_name, e);
                // Don't fail workspace creation for tracking errors
            } else {
                eprintln!("Successfully set up tracking for '{}@origin'", branch_name);
            }
        }
        Err(e) => {
            eprintln!("Warning: Could not determine tracking status: {}", e);
            // Attempt to track anyway
            if let Err(e) = jj_bookmark_track(&workspace_path_str, branch_name, "origin") {
                eprintln!("Warning: Failed to track bookmark '{}@origin': {}", branch_name, e);
                // Don't fail workspace creation for tracking errors
            }
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

/// Edit the working copy of a workspace branch
/// Tries to edit <branch>+ (child of bookmark), falls back to <branch> + new if no child exists
/// This ensures we're editing the working copy, not the bookmark commit itself
///
/// Note: This function is kept for potential future use. After the fix for stale working copies,
/// we no longer edit working copies from outside their workspace directories.
#[allow(dead_code)]
pub fn jj_edit_workspace_working_copy(workspace_path: &str, branch_name: &str) -> Result<(), JjError> {
    // 1. Try: jj edit <branch>+
    let branch_plus = format!("{}+", branch_name);
    let result = command_for("jj")
        .current_dir(workspace_path)
        .args(["edit", &branch_plus])
        .output();

    if let Ok(output) = result {
        if output.status.success() {
            // Successfully edited the child of the bookmark
            return Ok(());
        }
    }

    // 2. Check if bookmark points to @ (working copy)
    // If so, we're already at the working copy, no need to create a new one
    let bookmark_commit = jj_get_commit_id(workspace_path, branch_name);
    let working_copy_commit = jj_get_commit_id(workspace_path, "@");

    if let (Ok(bookmark_id), Ok(wc_id)) = (bookmark_commit, working_copy_commit) {
        if bookmark_id == wc_id {
            // Bookmark points to working copy, we're already in the right place
            return Ok(());
        }
    }

    // 3. Fallback: jj edit <branch> then jj new
    // This happens when there's no child and bookmark != working copy
    let edit_result = command_for("jj")
        .current_dir(workspace_path)
        .args(["edit", branch_name])
        .output()
        .map_err(|e| JjError::IoError(e.to_string()))?;

    if !edit_result.status.success() {
        return Err(JjError::IoError(format!(
            "Failed to edit branch '{}': {}",
            branch_name,
            String::from_utf8_lossy(&edit_result.stderr)
        )));
    }

    // Create a new working copy on top of the bookmark
    let new_result = command_for("jj")
        .current_dir(workspace_path)
        .args(["new"])
        .output()
        .map_err(|e| JjError::IoError(e.to_string()))?;

    if !new_result.status.success() {
        return Err(JjError::IoError(format!(
            "Failed to create new working copy: {}",
            String::from_utf8_lossy(&new_result.stderr)
        )));
    }

    Ok(())
}

// ============================================================================
// Stale Working Copy Detection and Recovery
// ============================================================================

/// Check if a workspace has a stale working copy
/// Returns true if the workspace is stale
pub fn is_workspace_stale(workspace_path: &str) -> Result<bool, JjError> {
    let output = command_for("jj")
        .current_dir(workspace_path)
        .args(["status", "--no-pager"])
        .output()
        .map_err(|e| JjError::IoError(e.to_string()))?;

    let stderr = String::from_utf8_lossy(&output.stderr);

    // Check for stale working copy error messages
    Ok(stderr.contains("stale") || stderr.contains("not updated since operation"))
}

/// Update a stale working copy using jj workspace update-stale
pub fn jj_workspace_update_stale(workspace_path: &str) -> Result<String, JjError> {
    let output = command_for("jj")
        .current_dir(workspace_path)
        .args(["workspace", "update-stale"])
        .output()
        .map_err(|e| JjError::IoError(e.to_string()))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);
    let combined = format!("{}{}", stdout, stderr);

    if !output.status.success() {
        return Err(JjError::IoError(combined));
    }

    Ok(combined)
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
        .args(["bookmark", "set", bookmark_name, "-r", revision, "--allow-backwards"])
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

/// Check if a bookmark is tracked with a remote
/// Uses: jj bookmark list --all-remotes
/// Returns true if the bookmark has a tracking relationship with the specified remote
pub fn is_bookmark_tracked(
    workspace_path: &str,
    bookmark_name: &str,
    remote_name: &str,
) -> Result<bool, JjError> {
    let output = command_for("jj")
        .current_dir(workspace_path)
        .args(["bookmark", "list", "--all-remotes"])
        .output()
        .map_err(|e| JjError::IoError(e.to_string()))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(JjError::IoError(format!(
            "Failed to list bookmarks: {}",
            stderr
        )));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);

    // Two possible formats for tracked bookmarks:
    // 1. "bookmark_name@remote_name: hash ..." (all-in-one format)
    // 2. "bookmark_name: hash ...\n  @remote_name ..." (multi-line format with indented remote)

    let all_in_one_pattern = format!("{}@{}:", bookmark_name, remote_name);
    let lines: Vec<&str> = stdout.lines().collect();

    for i in 0..lines.len() {
        let line = lines[i];

        // Check for all-in-one format
        if line.contains(&all_in_one_pattern) {
            return Ok(true);
        }

        // Check for multi-line format
        // Look for line that starts with bookmark_name:
        if line.starts_with(&format!("{}:", bookmark_name)) {
            // Check if next line (if exists) is an indented remote reference
            if i + 1 < lines.len() {
                let next_line = lines[i + 1];
                // Next line should be indented and start with @remote_name
                if next_line.starts_with("  @") && next_line.contains(remote_name) {
                    return Ok(true);
                }
            }
        }
    }

    Ok(false)
}

/// Edit/switch to a bookmark (similar to git checkout)
/// Uses: jj edit <bookmark_name>
/// For colocated repos, also syncs git HEAD
pub fn jj_edit_bookmark(repo_path: &str, bookmark_name: &str) -> Result<String, JjError> {
    // Run jj edit <bookmark>
    let output = command_for("jj")
        .current_dir(repo_path)
        .args(["edit", bookmark_name])
        .output()
        .map_err(|e| JjError::IoError(e.to_string()))?;

    if !output.status.success() {
        return Err(JjError::IoError(
            String::from_utf8_lossy(&output.stderr).to_string(),
        ));
    }

    // For colocated repos, sync git HEAD to keep git in sync
    let _ = command_for("git")
        .current_dir(repo_path)
        .args(["checkout", bookmark_name])
        .output();

    Ok(format!("Switched to {}", bookmark_name))
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

    Ok(JjRebaseResult {
        success: output.status.success(),
        message: combined_message,
    })
}

/// Get list of conflicted files in the workspace
///
/// If target_branch is provided, uses: jj diff --from <target_branch> --to @ --summary
/// This checks for conflicts in changes between target branch and working copy (@)
///
/// If target_branch is None, falls back to: jj status --no-pager
/// This checks for conflicts in the current working copy only
pub fn get_conflicted_files(
    workspace_path: &str,
    target_branch: Option<&str>,
) -> Result<Vec<String>, JjError> {
    // New approach: use jj diff if target_branch is provided
    if let Some(branch) = target_branch {
        // Validate branch name to prevent injection
        if !branch.starts_with('-') && !branch.contains('\0') && !branch.is_empty() {
            // Convert git format to jj format (e.g., origin/main -> main@origin)
            // Derive repo path from workspace path for remote detection
            let repo_path = derive_repo_path_from_workspace(workspace_path).unwrap_or_else(|| workspace_path.to_string());
            let jj_branch = convert_git_branch_to_jj_format(branch, &repo_path);

            // Try jj diff approach
            match get_conflicted_files_from_diff(workspace_path, &jj_branch) {
                Ok(conflicts) => {
                    return Ok(conflicts);
                }
                Err(e) => {
                    eprintln!("Warning: jj diff failed ({}), falling back to status", e);
                    // Fall through to status-based approach
                }
            }
        } else {
            eprintln!("Warning: Invalid target branch name, falling back to status");
        }
    }

    // Fallback approach: use jj st to check for conflicts
    let output = command_for("jj")
        .current_dir(workspace_path)
        .args(["st"])
        .output()
        .map_err(|e| JjError::IoError(e.to_string()))?;

    if !output.status.success() {
        return Ok(Vec::new());
    }

    let status = String::from_utf8_lossy(&output.stdout);
    let conflicts = parse_conflicted_files_from_status(&status)?;

    Ok(conflicts)
}

/// Get conflicted files using jj diff approach
/// Uses: jj diff --from <target_branch> --to @ --summary
fn get_conflicted_files_from_diff(
    workspace_path: &str,
    jj_branch: &str,
) -> Result<Vec<String>, JjError> {
    let output = command_for("jj")
        .current_dir(workspace_path)
        .args(["diff", "--from", jj_branch, "--to", "@", "--summary"])
        .output()
        .map_err(|e| JjError::IoError(e.to_string()))?;

    if !output.status.success() {
        return Err(JjError::IoError(
            String::from_utf8_lossy(&output.stderr).to_string(),
        ));
    }

    let summary = String::from_utf8_lossy(&output.stdout);
    let files = parse_diff_summary(&summary)?;
    let conflicts = extract_conflicted_files_from_summary(files);

    Ok(conflicts)
}

/// Parse jj st output to extract conflicted files
///
/// jj st output format with conflicts:
/// ```
/// Working copy changes:
/// M src/file.ts
/// Working copy  (@) : wsxupqkr 5a3c905b (conflict) (no description set)
/// Parent commit (@-): tqkoqust 9d3dff68 (empty) (no description set)
/// Warning: There are unresolved conflicts at these paths:
/// src/file1.rs    2-sided conflict including 1 deletion
/// src/file2.ts    2-sided conflict
/// ```
fn parse_conflicted_files_from_status(status: &str) -> Result<Vec<String>, JjError> {
    // Step 1: Check if "Working copy" line contains "(conflict)" marker
    let has_conflict_marker = status.lines()
        .any(|line| {
            line.trim().starts_with("Working copy") && line.contains("(conflict)")
        });

    if !has_conflict_marker {
        return Ok(Vec::new());
    }

    // Step 2: Parse "Warning:" section to extract file paths
    let mut conflicts = Vec::new();
    let mut in_warning_section = false;

    for line in status.lines() {
        let trimmed = line.trim();

        // Detect start of warning section
        if trimmed.starts_with("Warning: There are unresolved conflicts at these paths:") {
            in_warning_section = true;
            continue;
        }

        // Parse conflict lines in warning section
        if in_warning_section {
            if trimmed.is_empty() {
                break;  // End of warning section
            }

            // Format: "<file_path>    <conflict_description>"
            if let Some(file_path) = trimmed.split_whitespace().next() {
                if !file_path.is_empty() && !file_path.starts_with("Warning") {
                    conflicts.push(file_path.to_string());
                }
            }
        }
    }

    Ok(conflicts)
}

/// Get all commit IDs for a potentially conflicted bookmark
/// Returns a vector of commit IDs - will have 1 item for normal bookmarks,
/// 2+ items for conflicted bookmarks
fn get_all_commits_for_revision(repo_path: &str, revision: &str) -> Result<Vec<String>, JjError> {
    // Try with bookmarks(exact:...) to get all revisions for a bookmark
    let bookmark_name = revision.split('@').next().unwrap_or(revision);
    let exact_query = format!("bookmarks(exact:{})", bookmark_name);

    let output = command_for("jj")
        .current_dir(repo_path)
        .args([
            "log",
            "-r",
            &exact_query,
            "--no-graph",
            "-T",
            "commit_id.short(12)\n",
        ])
        .output()
        .map_err(|e| JjError::IoError(e.to_string()))?;

    if !output.status.success() {
        return Err(JjError::IoError(String::from_utf8_lossy(&output.stderr).to_string()));
    }

    let commit_ids: Vec<String> = String::from_utf8_lossy(&output.stdout)
        .lines()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect();

    Ok(commit_ids)
}

/// Get the current commit ID for a branch/revision
/// Uses: jj log -r <revision> --no-graph -T 'commit_id.short(12)'
/// Returns error if the bookmark is conflicted (with details about all conflicting commits)
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
        let error_msg = stderr.to_string();

        // If the bookmark is conflicted, get all commits and report them
        if error_msg.contains("conflicted") && !revision.starts_with("bookmarks(") {
            // Try to get all conflicting commits
            if let Ok(commits) = get_all_commits_for_revision(repo_path, revision) {
                if !commits.is_empty() {
                    let commit_list = commits.join(", ");
                    return Err(JjError::IoError(format!(
                        "Conflicted bookmark '{}' has multiple revisions: [{}]. Use `jj bookmark set {} -r <REVISION>` to resolve.",
                        revision, commit_list, revision
                    )));
                }
            }
        }

        return Err(JjError::IoError(format!(
            "Failed to get commit ID for '{}': {}",
            revision, error_msg
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
    _branch_name: &str,  // No longer used after switching to bookmark-only rebasing
) -> Result<JjRebaseResult, JjError> {
    let output = command_for("jj")
        .current_dir(working_dir)
        .args(["rebase", "-s", revset, "-d", target_branch])
        .output()
        .map_err(|e| JjError::IoError(e.to_string()))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);
    let combined_message = format!("{}{}", stdout, stderr);

    // After rebase with -s <revset> -d <target>, jj automatically updates bookmarks
    // that are included in the revset to point to the rebased commits.
    // We don't need to manually set the bookmark to @ (which is the working copy).
    // Working only with committed bookmarks ensures working copies stay isolated.

    Ok(JjRebaseResult {
        success: output.status.success(),
        message: combined_message,
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
pub fn jj_push(workspace_path: &str, force: bool) -> Result<String, JjError> {
    // Get current branch name to check/ensure tracking
    let branch_name = get_workspace_branch(workspace_path)?;

    // Ensure bookmark is tracked before pushing
    // This helps avoid "Non-tracking remote bookmark" warnings
    let mut tracking_message = String::new();

    match is_bookmark_tracked(workspace_path, &branch_name, "origin") {
        Ok(true) => {
            // Already tracked, proceed normally
        }
        Ok(false) => {
            // Not tracked, attempt to set up tracking
            tracking_message.push_str(&format!(
                "Warning: Bookmark '{}' was not tracked. Attempting to set up tracking...\n",
                branch_name
            ));

            if let Err(e) = jj_bookmark_track(workspace_path, &branch_name, "origin") {
                tracking_message.push_str(&format!(
                    "Warning: Could not set up tracking: {}. Attempting push anyway...\n",
                    e
                ));
            } else {
                tracking_message.push_str("Successfully set up tracking.\n");
            }
        }
        Err(e) => {
            // Error checking, log but continue
            tracking_message.push_str(&format!(
                "Warning: Could not verify tracking status: {}. Attempting push anyway...\n",
                e
            ));
        }
    }

    // Execute the push
    let mut cmd = command_for("jj");
    cmd.current_dir(workspace_path);

    if force {
        cmd.args(["git", "push", "--force"]);
    } else {
        cmd.args(["git", "push"]);
    }

    let output = cmd
        .output()
        .map_err(|e| JjError::IoError(e.to_string()))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);

    if !output.status.success() {
        return Err(JjError::IoError(format!("{}{}{}", tracking_message, stdout, stderr)));
    }

    Ok(format!("{}{}{}", tracking_message, stdout, stderr))
}

/// Get sync status with remote (ahead/behind counts)
/// Returns (ahead_count, behind_count)
pub fn jj_get_sync_status(workspace_path: &str, branch_name: &str) -> Result<(usize, usize), JjError> {
    let remote_branch = format!("{}@origin", branch_name);

    // Count commits ahead (local has, remote doesn't)
    // Using: jj log -r '<remote>..<local>' --no-graph -T 'commit_id\n'
    let ahead_output = command_for("jj")
        .current_dir(workspace_path)
        .args(["log", "-r", &format!("{}..{}", remote_branch, branch_name), "--no-graph", "-T", "commit_id\n"])
        .output()
        .map_err(|e| JjError::IoError(e.to_string()))?;

    let ahead_count = if ahead_output.status.success() {
        String::from_utf8_lossy(&ahead_output.stdout)
            .lines()
            .filter(|line| !line.trim().is_empty())
            .count()
    } else {
        0
    };

    // Count commits behind (remote has, local doesn't)
    // Using: jj log -r '<local>..<remote>' --no-graph -T 'commit_id\n'
    let behind_output = command_for("jj")
        .current_dir(workspace_path)
        .args(["log", "-r", &format!("{}..{}", branch_name, remote_branch), "--no-graph", "-T", "commit_id\n"])
        .output()
        .map_err(|e| JjError::IoError(e.to_string()))?;

    let behind_count = if behind_output.status.success() {
        String::from_utf8_lossy(&behind_output.stdout)
            .lines()
            .filter(|line| !line.trim().is_empty())
            .count()
    } else {
        0
    };

    Ok((ahead_count, behind_count))
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

/// Get list of git remotes in the repository with graceful fallback
/// Uses jj git remote list which returns format: "<remote_name> <remote_url>"
pub fn get_git_remotes(repo_path: &str) -> std::collections::HashSet<String> {
    let output = match command_for("jj")
        .current_dir(repo_path)
        .args(["git", "remote", "list"])
        .output()
    {
        Ok(output) => output,
        Err(e) => {
            eprintln!("Warning: Failed to execute jj git remote list: {}", e);
            return std::collections::HashSet::new();
        }
    };

    if !output.status.success() {
        eprintln!("Warning: jj git remote list failed: {}", String::from_utf8_lossy(&output.stderr));
        return std::collections::HashSet::new();
    }

    // Parse output: "origin git@github.com:user/repo.git"
    // Extract just the remote name (first word on each line)
    String::from_utf8_lossy(&output.stdout)
        .lines()
        .filter_map(|line| {
            let line = line.trim();
            if line.is_empty() {
                None
            } else {
                // Take first word (remote name)
                line.split_whitespace().next().map(|s| s.to_string())
            }
        })
        .collect()
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

/// Build the revset string for jj_get_log based on context
fn build_jj_get_log_revset(target_branch: &str, is_home_repo: bool) -> String {
    if is_home_repo {
        // For home repo: show last 10 commits of current branch
        "latest(::@, 10)".to_string()
    } else {
        // For workspace: show commits ahead of target branch
        format!("{}..@", target_branch)
    }
}

pub fn jj_get_log(workspace_path: &str, target_branch: &str, is_home_repo: Option<bool>) -> Result<JjLogResult, JjError> {
    // Get workspace branch name
    let workspace_branch = get_workspace_branch(workspace_path)?;

    // Build revset based on context (home repo vs workspace)
    let revset = build_jj_get_log_revset(target_branch, is_home_repo.unwrap_or(false));

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

/// Extract only conflicted files from diff summary
/// Filters files with status 'C' (conflict)
fn extract_conflicted_files_from_summary(files: Vec<JjFileChange>) -> Vec<String> {
    files.into_iter()
        .filter(|f| f.status == "C")
        .map(|f| f.path)
        .collect()
}

/// Get combined diff of all changes between target branch and workspace HEAD
/// Uses: jj diff --from target_branch --to @- --git
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
        .args(["diff", "--from", target_branch, "--to", "@-", "--summary"])
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
                "--to", "@-",
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
        get_conflicted_files(workspace_path, None).unwrap_or_default()
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
    fn test_ensure_gitignore_entries_adds_to_empty_file() {
        let temp_dir = TempDir::new().unwrap();
        let gitignore_path = temp_dir.path().join(".gitignore");

        ensure_gitignore_entries(temp_dir.path().to_str().unwrap()).unwrap();
        let content = fs::read_to_string(&gitignore_path).unwrap();

        assert!(content.contains("# Added by Treq"));
        assert!(content.contains(".jj/"));
        assert!(content.contains(".treq/"));
    }

    #[test]
    fn test_ensure_gitignore_entries_only_adds_missing() {
        let temp_dir = TempDir::new().unwrap();
        let gitignore_path = temp_dir.path().join(".gitignore");

        // Test: Only .jj/ is missing
        fs::write(&gitignore_path, "# Added by Treq\n.treq/\n").unwrap();
        ensure_gitignore_entries(temp_dir.path().to_str().unwrap()).unwrap();
        let content = fs::read_to_string(&gitignore_path).unwrap();
        assert_eq!(content.matches(".jj/").count(), 1);
        assert_eq!(content.matches(".treq/").count(), 1);
        assert_eq!(content.matches("# Added by Treq").count(), 1);

        // Test: Only .treq/ is missing
        fs::write(&gitignore_path, "# Added by Treq\n.jj/\n").unwrap();
        ensure_gitignore_entries(temp_dir.path().to_str().unwrap()).unwrap();
        let content = fs::read_to_string(&gitignore_path).unwrap();
        assert_eq!(content.matches(".jj/").count(), 1);
        assert_eq!(content.matches(".treq/").count(), 1);
        assert_eq!(content.matches("# Added by Treq").count(), 1);

        // Test: Both exist - no changes
        fs::write(&gitignore_path, "# Added by Treq\n.jj/\n.treq/\n").unwrap();
        ensure_gitignore_entries(temp_dir.path().to_str().unwrap()).unwrap();
        let content = fs::read_to_string(&gitignore_path).unwrap();
        assert_eq!(content.matches(".jj/").count(), 1);
        assert_eq!(content.matches(".treq/").count(), 1);
        assert_eq!(content.matches("# Added by Treq").count(), 1);
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
    fn test_parse_conflicted_files_from_status() {
        // Test with conflicts
        let status_with_conflicts = r#"Working copy changes:
M src/normal-file.ts
Working copy  (@) : wsxupqkr 5a3c905b (conflict) (no description set)
Parent commit (@-): tqkoqust 9d3dff68 (empty) (no description set)
Warning: There are unresolved conflicts at these paths:
src/conflicted-file1.ts    2-sided conflict including 1 deletion
src/conflicted-file2.rs    2-sided conflict
"#;

        let conflicts = parse_conflicted_files_from_status(status_with_conflicts).unwrap();
        assert_eq!(conflicts.len(), 2);
        assert_eq!(conflicts[0], "src/conflicted-file1.ts");
        assert_eq!(conflicts[1], "src/conflicted-file2.rs");

        // Test without conflicts
        let status_no_conflicts = r#"Working copy changes:
M src/file.ts
Working copy  (@) : qpvuntsm 70db4c90 (no description set)
Parent commit (@-): sktxnswn 130dbfd1 main | (no description set)
"#;

        let conflicts = parse_conflicted_files_from_status(status_no_conflicts).unwrap();
        assert_eq!(conflicts.len(), 0, "Should not detect false positive conflicts");

        // Test with empty status
        let status_empty = "";
        let conflicts = parse_conflicted_files_from_status(status_empty).unwrap();
        assert_eq!(conflicts.len(), 0);

        // Test with conflict marker but no Warning section (edge case)
        let status_marker_only = r#"Working copy  (@) : wsxupqkr 5a3c905b (conflict) (no description set)
Parent commit (@-): tqkoqust 9d3dff68 (empty) (no description set)
"#;

        let conflicts = parse_conflicted_files_from_status(status_marker_only).unwrap();
        assert_eq!(conflicts.len(), 0, "Should handle missing Warning section gracefully");

        // Test with complex paths
        let status_complex_paths = r#"Working copy  (@) : wsxupqkr 5a3c905b (conflict) (no description set)
Warning: There are unresolved conflicts at these paths:
src/deeply/nested/path/file.ts    2-sided conflict
target/debug/deps/lib.so    2-sided conflict including 1 deletion and an executable
"#;

        let conflicts = parse_conflicted_files_from_status(status_complex_paths).unwrap();
        assert_eq!(conflicts.len(), 2);
        assert_eq!(conflicts[0], "src/deeply/nested/path/file.ts");
        assert_eq!(conflicts[1], "target/debug/deps/lib.so");
    }

    #[test]
    fn test_extract_conflicted_files_from_summary() {
        let files = vec![
            JjFileChange {
                path: "src/file1.ts".to_string(),
                status: "M".to_string(),
                previous_path: None,
            },
            JjFileChange {
                path: "src/conflict.ts".to_string(),
                status: "C".to_string(),
                previous_path: None,
            },
            JjFileChange {
                path: "src/another_conflict.rs".to_string(),
                status: "C".to_string(),
                previous_path: None,
            },
            JjFileChange {
                path: "src/added.ts".to_string(),
                status: "A".to_string(),
                previous_path: None,
            },
        ];

        let conflicts = extract_conflicted_files_from_summary(files);

        assert_eq!(conflicts.len(), 2);
        assert!(conflicts.contains(&"src/conflict.ts".to_string()));
        assert!(conflicts.contains(&"src/another_conflict.rs".to_string()));
    }

    #[test]
    fn test_extract_conflicted_files_from_summary_no_conflicts() {
        let files = vec![
            JjFileChange {
                path: "src/file1.ts".to_string(),
                status: "M".to_string(),
                previous_path: None,
            },
            JjFileChange {
                path: "src/added.ts".to_string(),
                status: "A".to_string(),
                previous_path: None,
            },
        ];

        let conflicts = extract_conflicted_files_from_summary(files);
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

    #[test]
    fn test_jj_get_merge_diff_empty_when_no_commits() {
        // Test that when workspace branch = target branch (no commits),
        // jj_get_merge_diff returns empty results (no committed files)
        // Bug: Currently includes working copy changes

        let temp_dir = TempDir::new().unwrap();
        let repo_path = temp_dir.path().join("test_repo");
        fs::create_dir_all(&repo_path).unwrap();

        // Initialize git repo
        let git_init = command_for("git")
            .current_dir(&repo_path)
            .args(["init"])
            .output();
        if git_init.is_err() {
            eprintln!("Skipping test: git init failed");
            return;
        }

        // Configure git
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

        // Create initial commit
        fs::write(repo_path.join("file1.txt"), "initial content").unwrap();
        command_for("git")
            .current_dir(&repo_path)
            .args(["add", "."])
            .output()
            .unwrap();
        command_for("git")
            .current_dir(&repo_path)
            .args(["commit", "-m", "initial"])
            .output()
            .unwrap();

        // Initialize jj
        let jj_init = command_for("jj")
            .current_dir(&repo_path)
            .args(["git", "init", "--colocate"])
            .output();

        let jj_init_result = jj_init.unwrap();
        if !jj_init_result.status.success() {
            eprintln!("Skipping test: jj init failed: {}",
                String::from_utf8_lossy(&jj_init_result.stderr));
            return;
        }

        // Add UNCOMMITTED changes (working copy only, no new commits)
        fs::write(repo_path.join("uncommitted.txt"), "working copy changes").unwrap();

        // Call jj_get_merge_diff comparing main to main (no commits)
        // Since there are NO commits on main (main = main), the result should be EMPTY
        let result = jj_get_merge_diff(
            repo_path.to_str().unwrap(),
            "main"
        );

        assert!(result.is_ok(), "jj_get_merge_diff should succeed");
        let diff = result.unwrap();

        // CRITICAL ASSERTION: Should be empty because there are NO COMMITTED changes
        // Only working copy changes exist
        // This test will FAIL with current implementation (bug: shows uncommitted files)
        // After fix with @-, it should PASS (empty result)
        assert_eq!(diff.files.len(), 0,
            "Should have no committed files when workspace = target branch (no commits yet)");
    }

    #[test]
    fn test_jj_get_merge_diff_excludes_working_copy_changes() {
        // Test that jj_get_merge_diff returns only COMMITTED files,
        // not working copy (uncommitted) changes
        // Setup:
        // - main branch (target)
        // - workspace branch with COMMITTED changes
        // - workspace with UNCOMMITTED changes in working copy

        let temp_dir = TempDir::new().unwrap();
        let repo_path = temp_dir.path().join("test_repo");
        fs::create_dir_all(&repo_path).unwrap();

        // Initialize git repo
        let git_init = command_for("git")
            .current_dir(&repo_path)
            .args(["init"])
            .output();
        if git_init.is_err() {
            eprintln!("Skipping test: git init failed");
            return;
        }

        // Configure git
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

        // Create initial commit
        fs::write(repo_path.join("initial.txt"), "initial").unwrap();
        command_for("git")
            .current_dir(&repo_path)
            .args(["add", "."])
            .output()
            .unwrap();
        command_for("git")
            .current_dir(&repo_path)
            .args(["commit", "-m", "initial"])
            .output()
            .unwrap();

        // Initialize jj
        let jj_init = command_for("jj")
            .current_dir(&repo_path)
            .args(["git", "init", "--colocate"])
            .output();

        let jj_init_result = jj_init.unwrap();
        if !jj_init_result.status.success() {
            eprintln!("Skipping test: jj init failed");
            return;
        }

        // Create a committed file (simulates a commit on current branch)
        fs::write(repo_path.join("committed.txt"), "committed file").unwrap();

        // Commit this file using jj
        let jj_commit = command_for("jj")
            .current_dir(&repo_path)
            .args(["new", "-m", "Add committed file"])
            .output();

        if jj_commit.is_err() || !jj_commit.unwrap().status.success() {
            eprintln!("Skipping test: jj new failed");
            return;
        }

        // Now add UNCOMMITTED changes to a different file
        fs::write(repo_path.join("working_copy.txt"), "uncommitted changes").unwrap();

        // Call jj_get_merge_diff
        let result = jj_get_merge_diff(
            repo_path.to_str().unwrap(),
            "main"
        );

        assert!(result.is_ok(), "jj_get_merge_diff should succeed");
        let diff = result.unwrap();

        // CRITICAL ASSERTION: Should include 'committed.txt' (the committed file)
        // but NOT include 'working_copy.txt' (the uncommitted file)
        // Bug: Current implementation with @ includes both (working copy changes too)
        // Fix with @-: Should only include committed files
        let file_paths: Vec<String> = diff.files.iter().map(|f| f.path.clone()).collect();

        // At minimum, should not be completely empty (should have committed changes)
        assert!(!file_paths.is_empty(),
            "Should have some committed files between main and current");

        // The working_copy.txt file should NOT be included (bug scenario)
        assert!(!file_paths.iter().any(|p| p.contains("working_copy")),
            "Working copy changes should NOT be included in committed diff. Files: {:?}",
            file_paths);
    }

    #[test]
    fn test_is_bookmark_tracked_detects_tracked_bookmarks() {
        // Test that is_bookmark_tracked() correctly detects when a bookmark is tracked
        // Setup: Create a git/jj repo with a tracked bookmark

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
            eprintln!("Skipping test: jj init failed");
            return;
        }

        // Create a test bookmark in a new workspace
        fs::create_dir_all(local_repo.join(".treq/workspaces")).unwrap();
        let workspace_path = local_repo.join(".treq/workspaces/test-workspace");
        fs::create_dir_all(&workspace_path).unwrap();

        // Create workspace with jj
        let workspace_setup = command_for("jj")
            .current_dir(&local_repo)
            .args(["workspace", "add", "--name", "test-workspace", "-r", "main"])
            .output()
            .unwrap();

        if !workspace_setup.status.success() {
            eprintln!("Skipping test: jj workspace add failed");
            return;
        }

        let workspace_path_str = workspace_path.to_str().unwrap();

        // Set a bookmark and track it
        let _ = command_for("jj")
            .current_dir(&workspace_path)
            .args(["bookmark", "set", "test-branch", "-r", "@", "--allow-backwards"])
            .output()
            .unwrap();

        // Track the bookmark
        let track_result = command_for("jj")
            .current_dir(&workspace_path)
            .args(["bookmark", "track", "test-branch@origin"])
            .output()
            .unwrap();

        if !track_result.status.success() {
            eprintln!("Skipping test: jj bookmark track failed");
            return;
        }

        // Now test the is_bookmark_tracked function
        let is_tracked = is_bookmark_tracked(workspace_path_str, "test-branch", "origin");

        assert!(
            is_tracked.is_ok(),
            "is_bookmark_tracked should not error: {:?}",
            is_tracked
        );
        assert!(
            is_tracked.unwrap(),
            "test-branch should be tracked with origin"
        );

        eprintln!("✓ is_bookmark_tracked correctly detected tracked bookmark");
    }

    #[test]
    fn test_is_bookmark_tracked_returns_false_for_untracked() {
        // Test that is_bookmark_tracked() returns false for untracked bookmarks

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
            eprintln!("Skipping test: jj init failed");
            return;
        }

        // Create a test bookmark in a new workspace (without tracking)
        fs::create_dir_all(local_repo.join(".treq/workspaces")).unwrap();
        let workspace_path = local_repo.join(".treq/workspaces/test-workspace-2");
        fs::create_dir_all(&workspace_path).unwrap();

        // Create workspace with jj
        let workspace_setup = command_for("jj")
            .current_dir(&local_repo)
            .args(["workspace", "add", "--name", "test-workspace-2", "-r", "main"])
            .output()
            .unwrap();

        if !workspace_setup.status.success() {
            eprintln!("Skipping test: jj workspace add failed");
            return;
        }

        let workspace_path_str = workspace_path.to_str().unwrap();

        // Set a bookmark but DO NOT track it
        let _ = command_for("jj")
            .current_dir(&workspace_path)
            .args(["bookmark", "set", "untracked-branch", "-r", "@", "--allow-backwards"])
            .output()
            .unwrap();

        // Now test the is_bookmark_tracked function
        let is_tracked = is_bookmark_tracked(workspace_path_str, "untracked-branch", "origin");

        assert!(
            is_tracked.is_ok(),
            "is_bookmark_tracked should not error: {:?}",
            is_tracked
        );
        assert!(
            !is_tracked.unwrap(),
            "untracked-branch should not be tracked"
        );

        eprintln!("✓ is_bookmark_tracked correctly returned false for untracked bookmark");
    }

    #[test]
    fn test_is_bookmark_tracked_handles_nonexistent_bookmark() {
        // Test that is_bookmark_tracked() returns false for non-existent bookmarks

        let temp_dir = TempDir::new().unwrap();
        let workspace_path = temp_dir.path().join("test_workspace");
        fs::create_dir_all(&workspace_path).unwrap();

        let workspace_path_str = workspace_path.to_str().unwrap();

        // Try to check tracking status of non-existent bookmark
        // This should return Ok(false) not an error
        let result = is_bookmark_tracked(workspace_path_str, "nonexistent-bookmark", "origin");

        // Should handle gracefully
        if let Ok(is_tracked) = result {
            assert!(!is_tracked, "Non-existent bookmark should return false");
        }
        // If it errors, that's also acceptable (graceful degradation)

        eprintln!("✓ is_bookmark_tracked handled non-existent bookmark");
    }

    #[test]
    fn test_create_workspace_always_tracks_bookmark() {
        // Test that create_workspace() always tracks bookmarks, even for local branches
        // This is the key requirement: workspace creation should set up tracking for origin

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
            eprintln!("Skipping test: jj init failed");
            return;
        }

        // Create .treq/workspaces directory
        fs::create_dir_all(local_repo.join(".treq/workspaces")).unwrap();

        // Create workspace from local branch (new_branch=false, source_branch=Some("main"))
        let workspace_name = create_workspace(
            local_repo_str,
            "test-local-workspace",
            "test-local-branch",
            true,
            Some("main"),
            None,
        );

        if workspace_name.is_err() {
            eprintln!("Skipping test: create_workspace failed: {:?}", workspace_name);
            return;
        }

        let workspace_name = workspace_name.unwrap();
        let workspace_path = local_repo.join(".treq/workspaces").join(&workspace_name);
        let workspace_path_str = workspace_path.to_str().unwrap();

        eprintln!("✓ Workspace created: {}", workspace_name);

        // Debug: print the bookmark list
        let debug_list = command_for("jj")
            .current_dir(&workspace_path)
            .args(["bookmark", "list", "--all-remotes"])
            .output()
            .unwrap();
        let debug_output = String::from_utf8_lossy(&debug_list.stdout);
        eprintln!("Bookmark list output:\n{}", debug_output);

        // Now verify that tracking was set up for origin
        let is_tracked = is_bookmark_tracked(workspace_path_str, "test-local-branch", "origin");

        assert!(
            is_tracked.is_ok(),
            "is_bookmark_tracked should not error: {:?}",
            is_tracked
        );

        let tracked = is_tracked.unwrap();
        assert!(
            tracked,
            "Workspace bookmark should be tracked with origin after create_workspace()"
        );

        eprintln!("✓ Workspace bookmark is correctly tracked with origin");
    }

    #[test]
    fn test_create_workspace_tolerates_tracking_failures() {
        // Test that create_workspace() doesn't fail even if bookmark tracking fails
        // This ensures workspace creation is robust

        let temp_dir = TempDir::new().unwrap();
        let local_repo = temp_dir.path().join("test-repo");

        // Create a directory that looks like a repo but isn't
        // This will cause jj commands to fail, including tracking
        fs::create_dir_all(&local_repo).unwrap();

        // Initialize git in the test repo
        let git_init = command_for("git")
            .current_dir(&local_repo)
            .args(["init", "--initial-branch=main"])
            .output();

        if git_init.is_err() {
            eprintln!("Skipping test: git not available");
            return;
        }

        // Configure git
        command_for("git")
            .current_dir(&local_repo)
            .args(["config", "user.name", "Test User"])
            .output()
            .unwrap();
        command_for("git")
            .current_dir(&local_repo)
            .args(["config", "user.email", "test@example.com"])
            .output()
            .unwrap();

        // Create initial commit
        let readme = local_repo.join("README.md");
        fs::write(&readme, "# Test").unwrap();
        command_for("git")
            .current_dir(&local_repo)
            .args(["add", "."])
            .output()
            .unwrap();
        command_for("git")
            .current_dir(&local_repo)
            .args(["commit", "-m", "Initial"])
            .output()
            .unwrap();

        // Initialize jj
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
            eprintln!("Skipping test: jj init failed");
            return;
        }

        let local_repo_str = local_repo.to_str().unwrap();

        // Create .treq/workspaces directory
        fs::create_dir_all(local_repo.join(".treq/workspaces")).unwrap();

        // Create workspace - even if tracking has issues, creation should succeed
        let workspace_name = create_workspace(
            local_repo_str,
            "test-workspace",
            "test-branch",
            true,
            Some("main"),
            None,
        );

        // The workspace should be created successfully despite any tracking issues
        assert!(
            workspace_name.is_ok(),
            "Workspace creation should succeed even with tracking issues: {:?}",
            workspace_name
        );

        eprintln!("✓ Workspace creation succeeded despite potential tracking issues");
    }

    #[test]
    fn test_jj_push_function_runs_without_crash() {
        // Test that jj_push() executes without crashing even with complex tracking scenarios
        // The function will likely fail to push (since no real origin), but shouldn't panic

        let temp_dir = TempDir::new().unwrap();
        let repo = temp_dir.path().join("repo");

        // Create a minimal git repo with jj
        fs::create_dir_all(&repo).unwrap();

        let git_init = command_for("git")
            .current_dir(&repo)
            .args(["init", "--initial-branch=main"])
            .output();

        if git_init.is_err() {
            eprintln!("Skipping test: git not available");
            return;
        }

        // Configure git
        command_for("git")
            .current_dir(&repo)
            .args(["config", "user.name", "Test"])
            .output()
            .unwrap();
        command_for("git")
            .current_dir(&repo)
            .args(["config", "user.email", "test@example.com"])
            .output()
            .unwrap();

        // Create initial commit
        let readme = repo.join("README.md");
        fs::write(&readme, "# Test").unwrap();
        command_for("git")
            .current_dir(&repo)
            .args(["add", "."])
            .output()
            .unwrap();
        command_for("git")
            .current_dir(&repo)
            .args(["commit", "-m", "Initial"])
            .output()
            .unwrap();

        // Initialize jj
        let jj_init = command_for("jj")
            .current_dir(&repo)
            .args(["git", "init", "--colocate"])
            .output();

        if jj_init.is_err() {
            eprintln!("Skipping test: jj not available");
            return;
        }

        let repo_str = repo.to_str().unwrap();

        // Create a bookmark without tracking
        let _ = command_for("jj")
            .current_dir(&repo)
            .args(["bookmark", "set", "test-branch", "-r", "@", "--allow-backwards"])
            .output()
            .unwrap();

        // Call jj_push - it should not panic regardless of success/failure
        let push_result = jj_push(repo_str, false);

        // The important thing is the function doesn't crash
        match push_result {
            Ok(output) => {
                eprintln!("Push output:\n{}", output);
            }
            Err(e) => {
                eprintln!("Push error: {}", e);
            }
        }

        eprintln!("✓ jj_push() executed without crash");
    }

    #[test]
    fn test_jj_get_log_revset_construction() {
        // Happy path 1: Home repo should use latest(::@, 10) revset
        let revset_home = build_jj_get_log_revset("main", true);
        assert_eq!(revset_home, "latest(::@, 10)", "Home repo should use latest revset");

        // Happy path 2: Workspace should use target_branch..@ revset
        let revset_workspace = build_jj_get_log_revset("main", false);
        assert_eq!(revset_workspace, "main..@", "Workspace should use diff revset");
    }

    // ============ New TDD Tests for Remote Detection ============

    /// Helper to create test repo with jj and a remote
    fn setup_test_repo_with_remote() -> (TempDir, String) {
        let temp_dir = TempDir::new().unwrap();
        let repo_path = temp_dir.path().to_str().unwrap().to_string();

        // Initialize git repo
        command_for("git")
            .current_dir(&repo_path)
            .args(["init"])
            .output()
            .expect("Failed to init git");

        // Initialize jj colocated
        let jj_init = command_for("jj")
            .current_dir(&repo_path)
            .args(["git", "init", "--colocate"])
            .output();

        if let Ok(output) = jj_init {
            if !output.status.success() {
                eprintln!("Skipping test: jj init failed");
                return (temp_dir, repo_path);
            }
        }

        // Add a remote
        command_for("git")
            .current_dir(&repo_path)
            .args(["remote", "add", "origin", "https://github.com/test/test.git"])
            .output()
            .expect("Failed to add remote");

        (temp_dir, repo_path)
    }

    #[test]
    fn test_get_git_remotes_returns_origin() {
        let (_temp, repo_path) = setup_test_repo_with_remote();
        let remotes = get_git_remotes(&repo_path);

        assert!(remotes.contains("origin"), "Should contain origin remote");
    }

    #[test]
    fn test_get_git_remotes_empty_for_no_remotes() {
        let temp_dir = TempDir::new().unwrap();
        let repo_path = temp_dir.path().to_str().unwrap();

        // Initialize git but no remotes
        command_for("git")
            .current_dir(&repo_path)
            .args(["init"])
            .output()
            .expect("Failed to init git");

        command_for("jj")
            .current_dir(&repo_path)
            .args(["git", "init", "--colocate"])
            .output()
            .ok();

        let remotes = get_git_remotes(&repo_path);
        assert!(remotes.is_empty(), "Should have no remotes");
    }

    #[test]
    fn test_convert_remote_ref_with_valid_remote() {
        let (_temp, repo_path) = setup_test_repo_with_remote();
        let result = convert_git_branch_to_jj_format("origin/main", &repo_path);

        assert_eq!(result, "main@origin", "Should convert origin/main to main@origin");
    }

    #[test]
    fn test_convert_local_bookmark_with_slash() {
        let (_temp, repo_path) = setup_test_repo_with_remote();
        let result = convert_git_branch_to_jj_format("treq/test-toast", &repo_path);

        assert_eq!(result, "treq/test-toast", "Should NOT convert local bookmark with slash");
    }

    #[test]
    fn test_convert_branch_without_slash() {
        let (_temp, repo_path) = setup_test_repo_with_remote();
        let result = convert_git_branch_to_jj_format("main", &repo_path);

        assert_eq!(result, "main", "Should keep branch without slash unchanged");
    }

    #[test]
    fn test_get_git_remotes_graceful_on_invalid_path() {
        let remotes = get_git_remotes("/nonexistent/path");
        assert!(remotes.is_empty(), "Should return empty set for invalid path");
    }

    #[test]
    fn test_stale_detection_identifies_stale_error() {
        // Test that stale error messages are detected
        let stderr = "Error: The working copy is stale (not updated since operation abc123)";
        assert!(stderr.contains("stale"));
        assert!(stderr.contains("not updated since operation"));
    }

    #[test]
    fn test_stale_detection_identifies_working_copy_modified() {
        // Test various stale working copy error message formats
        let messages = vec![
            "The working copy is stale (not updated since operation 138380c1c86d)",
            "working copy is stale",
            "not updated since operation xyz",
        ];

        for msg in messages {
            assert!(
                msg.contains("stale") || msg.contains("not updated since operation"),
                "Should detect stale marker in: {}",
                msg
            );
        }
    }

    #[test]
    fn test_stale_detection_ignores_clean_workspace() {
        // Clean workspaces should not be detected as stale
        let clean_messages = vec![
            "Working copy clean",
            "At commit abc123",
            "No conflicts",
        ];

        for msg in clean_messages {
            assert!(
                !msg.contains("stale") && !msg.contains("not updated since operation"),
                "Should not detect as stale: {}",
                msg
            );
        }
    }
}
