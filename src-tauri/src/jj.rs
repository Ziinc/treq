use jj_lib::config::{ConfigLayer, ConfigSource, StackedConfig};
use jj_lib::settings::UserSettings;
use jj_lib::workspace::Workspace;
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
}

impl std::fmt::Display for JjError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            JjError::AlreadyInitialized => write!(f, "Jujutsu workspace already exists"),
            JjError::NotGitRepository => write!(f, "Not a git repository"),
            JjError::InitFailed(e) => write!(f, "Failed to initialize jj: {}", e),
            JjError::ConfigError(e) => write!(f, "Configuration error: {}", e),
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
