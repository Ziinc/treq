use jj_lib::config::{ConfigLayer, ConfigSource, StackedConfig};
use jj_lib::settings::UserSettings;
use jj_lib::workspace::Workspace;
use serde::{Deserialize, Serialize};
use std::fs::{self, OpenOptions};
use std::io::{BufRead, BufReader, Write};
use std::path::Path;
use std::process::Command;

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

    // Create git workspace first
    crate::git::create_workspace_at_path(
        repo_path,
        branch_name,
        new_branch,
        source_branch,
        &workspace_path_str,
    )
    .map_err(JjError::GitWorkspaceError)?;

    // Copy selected ignored files
    if let Some(patterns) = inclusion_patterns {
        if let Err(e) = crate::git::copy_ignored_files(repo_path, &workspace_path_str, patterns) {
            eprintln!("Warning: Failed to copy ignored files: {}", e);
        }
    }

    // Initialize jj for this workspace (colocated mode)
    let settings = create_user_settings(repo_path)?;
    let git_path = workspace_dir.join(".git");

    let jj_result = Workspace::init_external_git(&settings, &workspace_dir, &git_path);

    if let Err(e) = jj_result {
        // Clean up: remove the git workspace we just created
        let _ = crate::git::remove_workspace(repo_path, &workspace_path_str);
        let _ = fs::remove_dir_all(&workspace_dir);
        return Err(JjError::InitFailed(format!(
            "Failed to init jj workspace: {}",
            e
        )));
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

    // Remove git workspace first
    crate::git::remove_workspace(repo_path, workspace_path)
        .map_err(JjError::GitWorkspaceError)?;

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
