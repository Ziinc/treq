use std::collections::HashMap;
use std::env;
use std::process::Command;
use std::sync::OnceLock;

static BINARY_PATHS_CACHE: OnceLock<HashMap<String, String>> = OnceLock::new();

/// Get extended PATH that includes common binary locations
pub fn get_extended_path() -> String {
    let current_path = env::var("PATH").unwrap_or_default();

    // Common binary locations to add
    let additional_paths = vec![
        "/opt/homebrew/bin",      // macOS ARM Homebrew
        "/usr/local/bin",          // macOS Intel Homebrew, common
        "~/.cargo/bin",            // Rust tools
        "/usr/bin",                // System binaries
        "/bin",                    // System binaries
    ];

    // Expand ~ to home directory
    let home = env::var("HOME").unwrap_or_default();
    let expanded_paths: Vec<String> = additional_paths
        .iter()
        .map(|p| p.replace('~', &home))
        .collect();

    // Combine existing PATH with additional paths (deduplicating)
    let mut all_paths: Vec<String> = current_path
        .split(':')
        .filter(|p| !p.is_empty())
        .map(String::from)
        .collect();

    // Add additional paths if not already present
    for path in expanded_paths {
        if !all_paths.contains(&path) {
            all_paths.push(path);
        }
    }

    all_paths.join(":")
}

/// Detect binary path using `which` command with extended PATH
pub fn detect_binary(name: &str) -> Option<String> {
    let extended_path = get_extended_path();

    // Try using `which` with extended PATH
    let output = Command::new("which")
        .arg(name)
        .env("PATH", extended_path)
        .output()
        .ok()?;

    if output.status.success() {
        let path = String::from_utf8(output.stdout).ok()?;
        let path = path.trim().to_string();
        if !path.is_empty() {
            return Some(path);
        }
    }

    None
}

/// Initialize binary paths cache with detected paths
pub fn init_binary_paths_cache(paths: HashMap<String, String>) {
    let _ = BINARY_PATHS_CACHE.set(paths);
}

/// Get cached binary path for a given binary name
pub fn get_binary_path(name: &str) -> Option<String> {
    BINARY_PATHS_CACHE.get()?.get(name).cloned()
}

/// Detect installed editor applications using mdfind
pub fn detect_editor_app(app_name: &str) -> bool {
    let search_pattern = "kMDItemKind == 'Application'";

    let output = Command::new("mdfind")
        .arg(search_pattern)
        .output()
        .ok();

    if let Some(output) = output {
        if output.status.success() {
            let stdout = String::from_utf8_lossy(&output.stdout);
            let app_file = format!("/{}.app", app_name);
            return stdout.lines().any(|line| line.ends_with(&app_file));
        }
    }

    false
}

static EDITOR_APPS_CACHE: OnceLock<HashMap<String, bool>> = OnceLock::new();

/// Initialize editor apps cache
pub fn init_editor_apps_cache(apps: HashMap<String, bool>) {
    let _ = EDITOR_APPS_CACHE.set(apps);
}

/// Get cached editor app availability
pub fn get_editor_app(name: &str) -> bool {
    EDITOR_APPS_CACHE
        .get()
        .and_then(|cache| cache.get(name).copied())
        .unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_get_extended_path_includes_homebrew() {
        let path = get_extended_path();
        assert!(path.contains("/opt/homebrew/bin") || path.contains("/usr/local/bin"));
    }

    #[test]
    fn test_detect_binary_finds_git() {
        // git should be available on most systems
        let git_path = detect_binary("git");
        assert!(git_path.is_some());
    }
}
