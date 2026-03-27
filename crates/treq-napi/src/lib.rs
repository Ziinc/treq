#![deny(clippy::all)]

mod dispatch;
mod state;

use napi_derive::napi;
use std::path::PathBuf;
use tempfile::TempDir;

/// Initialize the napi module state with an app-level SQLite database.
/// Must be called once before any `invoke_sync` calls that require DB access.
/// Safe to call multiple times (no-op after first call).
#[napi]
pub fn init_state(db_path: String) -> napi::Result<()> {
    state::init(PathBuf::from(db_path)).map_err(|e| napi::Error::from_reason(e))
}

/// Dispatch a Tauri command by name with camelCase JSON args.
/// Returns the serialized result or throws an error.
/// Wrap in Promise.resolve() on the JS side to match the Tauri invoke() API.
#[napi]
pub fn invoke_sync(command: String, args: serde_json::Value) -> napi::Result<serde_json::Value> {
    dispatch::dispatch(&command, args).map_err(|e| napi::Error::from_reason(e))
}

/// Information about a temporary test repository created by `create_test_repo`.
#[napi(object)]
pub struct TestRepoInfo {
    /// Absolute path to the repository root.
    pub repo_path: String,
    /// Absolute path to the temp directory (same as repo_path for simple repos).
    pub temp_dir_path: String,
}

// We keep the TempDir alive by leaking it for the duration of the test process.
// Tests should call cleanup_test_repo or just let the process exit.
static TEST_REPOS: std::sync::Mutex<Vec<TempDir>> = std::sync::Mutex::new(Vec::new());

/// Create a temporary git+jj repository for integration testing.
/// The repository is initialized with `core::init()` so it is ready for treq operations.
/// Pass `with_remote = true` to also set up a bare remote origin.
#[napi]
pub fn create_test_repo(with_remote: bool) -> napi::Result<TestRepoInfo> {
    create_repo_impl(with_remote).map_err(|e| napi::Error::from_reason(e))
}

fn create_repo_impl(with_remote: bool) -> Result<TestRepoInfo, String> {
    let temp_dir = TempDir::new().map_err(|e| format!("Failed to create temp dir: {}", e))?;
    let repo_path = temp_dir.path().to_string_lossy().to_string();

    // Initialize git repo
    run_git(&repo_path, &["init"])?;
    run_git(&repo_path, &["config", "user.email", "test@example.com"])?;
    run_git(&repo_path, &["config", "user.name", "Test User"])?;

    // Create initial commit
    let readme = temp_dir.path().join("README.md");
    std::fs::write(&readme, "# Test Repository\n")
        .map_err(|e| format!("Failed to write README: {}", e))?;
    run_git(&repo_path, &["add", "."])?;
    run_git(&repo_path, &["commit", "-m", "Initial commit"])?;
    let _ = run_git(&repo_path, &["branch", "-M", "main"]);

    if with_remote {
        // Create a bare remote
        let remote_dir = temp_dir.path().join("remote.git");
        std::fs::create_dir_all(&remote_dir)
            .map_err(|e| format!("Failed to create remote dir: {}", e))?;
        let remote_path = remote_dir.to_string_lossy().to_string();
        run_git(&remote_path, &["init", "--bare"])?;
        run_git(&repo_path, &["remote", "add", "origin", &remote_path])?;
        run_git(&repo_path, &["push", "-u", "origin", "main"])?;
    }

    // Initialize treq (jj colocated + local DB)
    treq_lib::core::init(&repo_path)?;

    let info = TestRepoInfo {
        temp_dir_path: repo_path.clone(),
        repo_path,
    };

    // Keep TempDir alive
    TEST_REPOS
        .lock()
        .map_err(|e| e.to_string())?
        .push(temp_dir);

    Ok(info)
}

fn run_git(cwd: &str, args: &[&str]) -> Result<(), String> {
    let output = std::process::Command::new("git")
        .current_dir(cwd)
        .args(args)
        .output()
        .map_err(|e| format!("Failed to execute git: {}", e))?;
    if !output.status.success() {
        return Err(format!(
            "git {:?} failed: {}",
            args,
            String::from_utf8_lossy(&output.stderr)
        ));
    }
    Ok(())
}
