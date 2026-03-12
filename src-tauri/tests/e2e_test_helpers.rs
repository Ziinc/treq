use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use tempfile::TempDir;

#[allow(dead_code)]
pub struct TestRepo {
    pub temp_dir: TempDir,
    pub repo_path: String,
}

#[allow(dead_code)]
impl TestRepo {
    /// Creates a new temporary Git repository for testing.
    /// Simulates cloning a git repo by initializing with proper git config.
    /// Calls `core::init()` to initialize jj and local db.
    pub fn new() -> Result<Self, String> {
        Self::create(true)
    }

    /// Creates a new temporary Git repository without jj/db initialization.
    pub fn new_without_init() -> Result<Self, String> {
        Self::create(false)
    }

    fn create(init: bool) -> Result<Self, String> {
        let temp_dir = TempDir::new().map_err(|e| format!("Failed to create temp dir: {}", e))?;
        let repo_path = temp_dir.path().to_string_lossy().to_string();

        // Initialize git repo
        Self::run_git(&repo_path, &["init"])?;

        // Configure git user (required for commits)
        Self::run_git(&repo_path, &["config", "user.email", "test@example.com"])?;
        Self::run_git(&repo_path, &["config", "user.name", "Test User"])?;

        // Create initial commit (git repos need at least one commit)
        let readme_path = temp_dir.path().join("README.md");
        fs::write(&readme_path, "# Test Repository\n")
            .map_err(|e| format!("Failed to write README: {}", e))?;

        Self::run_git(&repo_path, &["add", "."])?;
        Self::run_git(&repo_path, &["commit", "-m", "Initial commit"])?;

        // Create main branch if not already on it
        let _ = Self::run_git(&repo_path, &["branch", "-M", "main"]);

        if init {
            treq_lib::core::init(&repo_path)?;
        }

        Ok(TestRepo {
            temp_dir,
            repo_path,
        })
    }

    /// Creates a test repo with a remote origin for testing remote branch operations.
    /// Calls `core::init()` to initialize jj and local db.
    pub fn with_remote() -> Result<Self, String> {
        Self::with_remote_create(true)
    }

    /// Creates a test repo with a remote origin, without jj/db initialization.
    pub fn with_remote_without_init() -> Result<Self, String> {
        Self::with_remote_create(false)
    }

    fn with_remote_create(init: bool) -> Result<Self, String> {
        let repo = Self::create(init)?;

        // Create a "remote" repository
        let remote_dir = repo.temp_dir.path().join("remote.git");
        fs::create_dir_all(&remote_dir)
            .map_err(|e| format!("Failed to create remote dir: {}", e))?;

        let remote_path = remote_dir.to_string_lossy().to_string();
        Self::run_git(&remote_path, &["init", "--bare"])?;

        // Add remote to main repo
        Self::run_git(&repo.repo_path, &["remote", "add", "origin", &remote_path])?;

        // Push main branch to remote
        Self::run_git(&repo.repo_path, &["push", "-u", "origin", "main"])?;

        // Create a remote branch with a commit for testing
        // The test expects a "feature.txt" file in the remote branch
        Self::run_git(&repo.repo_path, &["checkout", "-b", "feature-remote"])?;

        let feature_file = repo.temp_dir.path().join("feature.txt");
        fs::write(&feature_file, "This is a feature from remote branch")
            .map_err(|e| format!("Failed to write feature file: {}", e))?;

        Self::run_git(&repo.repo_path, &["add", "feature.txt"])?;
        Self::run_git(&repo.repo_path, &["commit", "-m", "Add feature.txt"])?;

        // Push the feature branch to remote
        Self::run_git(&repo.repo_path, &["push", "-u", "origin", "feature-remote"])?;

        // Return to main branch
        Self::run_git(&repo.repo_path, &["checkout", "main"])?;

        // Fetch to ensure jj knows about the remote branch
        if init {
            let _ = treq_lib::jj::jj_git_fetch(&repo.repo_path);
        }

        Ok(repo)
    }

    /// Run a git command in the specified directory.
    pub fn run_git(cwd: &str, args: &[&str]) -> Result<String, String> {
        let output = Command::new("git")
            .current_dir(cwd)
            .args(args)
            .output()
            .map_err(|e| format!("Failed to execute git: {}", e))?;

        if !output.status.success() {
            return Err(format!(
                "Git command failed: {}",
                String::from_utf8_lossy(&output.stderr)
            ));
        }

        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    }

    /// Create a file in the repository.
    pub fn create_file(&self, relative_path: &str, content: &str) -> Result<PathBuf, String> {
        let file_path = Path::new(&self.repo_path).join(relative_path);

        if let Some(parent) = file_path.parent() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create parent dirs: {}", e))?;
        }

        fs::write(&file_path, content).map_err(|e| format!("Failed to write file: {}", e))?;

        Ok(file_path)
    }

    /// Create a commit with a file change.
    pub fn commit_file(
        &self,
        relative_path: &str,
        content: &str,
        message: &str,
    ) -> Result<(), String> {
        self.create_file(relative_path, content)?;
        Self::run_git(&self.repo_path, &["add", relative_path])?;
        Self::run_git(&self.repo_path, &["commit", "-m", message])?;
        Ok(())
    }

    /// Create a commit in the bare remote (requires with_remote()).
    /// Uses a temporary git clone of the remote to make the commit and push,
    /// so the local repo is never modified.
    pub fn remote_commit_file(
        &self,
        relative_path: &str,
        content: &str,
        message: &str,
    ) -> Result<(), String> {
        let remote_path = self.temp_dir.path().join("remote.git");
        let clone_path = self.temp_dir.path().join("remote_clone");

        // Clone the bare remote into a temporary working copy
        Self::run_git(
            &self.temp_dir.path().to_string_lossy(),
            &["clone", remote_path.to_str().unwrap(), clone_path.to_str().unwrap()],
        )?;

        let clone_path_str = clone_path.to_string_lossy().to_string();

        // Configure git user in the clone
        Self::run_git(&clone_path_str, &["config", "user.email", "test@example.com"])?;
        Self::run_git(&clone_path_str, &["config", "user.name", "Test User"])?;

        // Write file, commit, and push from the clone
        let file_path = clone_path.join(relative_path);
        if let Some(parent) = file_path.parent() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create parent dirs: {}", e))?;
        }
        fs::write(&file_path, content)
            .map_err(|e| format!("Failed to write file in remote clone: {}", e))?;

        Self::run_git(&clone_path_str, &["add", relative_path])?;
        Self::run_git(&clone_path_str, &["commit", "-m", message])?;
        Self::run_git(&clone_path_str, &["push", "origin", "main"])?;

        // Clean up the clone
        fs::remove_dir_all(&clone_path)
            .map_err(|e| format!("Failed to clean up remote clone: {}", e))?;

        Ok(())
    }

    /// Push a branch to remote (requires with_remote()).
    pub fn push_branch(&self, branch_name: &str) -> Result<(), String> {
        Self::run_git(&self.repo_path, &["push", "origin", branch_name])?;
        Ok(())
    }

    /// Create a commit on a specific branch in the bare remote (requires with_remote()).
    /// Clones the remote to a temp dir, checks out the given branch, commits, and pushes back.
    /// The local repo is never modified — use jj_git_fetch after this to see the new remote commit.
    pub fn remote_commit_on_branch(
        &self,
        branch_name: &str,
        relative_path: &str,
        content: &str,
        message: &str,
    ) -> Result<(), String> {
        let remote_path = self.temp_dir.path().join("remote.git");
        let clone_path = self.temp_dir.path().join("remote_clone_branch");

        // Remove stale clone if it exists
        if clone_path.exists() {
            fs::remove_dir_all(&clone_path)
                .map_err(|e| format!("Failed to remove stale clone: {}", e))?;
        }

        // Clone the bare remote into a temporary working copy
        Self::run_git(
            &self.temp_dir.path().to_string_lossy(),
            &[
                "clone",
                remote_path.to_str().unwrap(),
                clone_path.to_str().unwrap(),
            ],
        )?;

        let clone_path_str = clone_path.to_string_lossy().to_string();

        // Configure git user in the clone
        Self::run_git(&clone_path_str, &["config", "user.email", "test@example.com"])?;
        Self::run_git(&clone_path_str, &["config", "user.name", "Test User"])?;

        // Checkout the target branch (fetch it if it's a remote-tracking branch)
        let checkout_result = Self::run_git(&clone_path_str, &["checkout", branch_name]);
        if checkout_result.is_err() {
            // Try checking out from origin
            Self::run_git(
                &clone_path_str,
                &["checkout", "-b", branch_name, &format!("origin/{}", branch_name)],
            )?;
        }

        // Write file, commit, and push from the clone
        let file_path = clone_path.join(relative_path);
        if let Some(parent) = file_path.parent() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create parent dirs: {}", e))?;
        }
        fs::write(&file_path, content)
            .map_err(|e| format!("Failed to write file in remote clone: {}", e))?;

        Self::run_git(&clone_path_str, &["add", relative_path])?;
        Self::run_git(&clone_path_str, &["commit", "-m", message])?;
        Self::run_git(&clone_path_str, &["push", "origin", branch_name])?;

        // Clean up the clone
        fs::remove_dir_all(&clone_path)
            .map_err(|e| format!("Failed to clean up remote clone: {}", e))?;

        Ok(())
    }

    /// Get the path to the .treq directory.
    pub fn treq_dir(&self) -> PathBuf {
        Path::new(&self.repo_path).join(".treq")
    }

    /// Create and initialize a database for this repo.
    pub fn create_db(&self) -> Result<treq_lib::db::Database, String> {
        let treq_dir = self.treq_dir();
        std::fs::create_dir_all(&treq_dir)
            .map_err(|e| format!("Failed to create .treq dir: {}", e))?;
        let db_path = treq_dir.join("test.db");
        let db = treq_lib::db::Database::new(db_path)
            .map_err(|e| format!("Failed to create database: {}", e))?;
        db.init()
            .map_err(|e| format!("Failed to init database: {}", e))?;
        Ok(db)
    }

    /// Get the path to the workspaces directory.
    pub fn workspaces_dir(&self) -> PathBuf {
        self.treq_dir().join("workspaces")
    }

    /// Ensure the .treq/workspaces directory exists.
    /// Call this before creating workspaces.
    pub fn ensure_workspaces_dir(&self) -> Result<(), String> {
        let dir = self.workspaces_dir();
        fs::create_dir_all(&dir).map_err(|e| format!("Failed to create workspaces dir: {}", e))
    }

    /// Check if jj is initialized for this repo.
    pub fn is_jj_initialized(&self) -> bool {
        Path::new(&self.repo_path).join(".jj").exists()
    }

    /// Check if the local database exists.
    pub fn has_local_db(&self) -> bool {
        self.treq_dir().join("local.db").exists()
    }

    /// Get the contents of .gitignore.
    pub fn read_gitignore(&self) -> Result<String, String> {
        let gitignore_path = Path::new(&self.repo_path).join(".gitignore");
        if !gitignore_path.exists() {
            return Ok(String::new());
        }
        fs::read_to_string(&gitignore_path).map_err(|e| format!("Failed to read .gitignore: {}", e))
    }
}

/// Helpers for verifying jj state
pub struct JjVerifier;

#[allow(dead_code)]
impl JjVerifier {
    /// Get the jj binary path, using treq's binary detection (same as jj.rs internals).
    fn jj_binary() -> String {
        treq_lib::binary_paths::detect_binary("jj")
            .unwrap_or_else(|| "jj".to_string())
    }

    /// Get list of jj workspaces via `jj workspace list`
    pub fn list_workspaces(repo_path: &str) -> Result<Vec<String>, String> {
        let output = Command::new(Self::jj_binary())
            .current_dir(repo_path)
            .args(["workspace", "list"])
            .output()
            .map_err(|e| format!("Failed to execute jj workspace list: {}", e))?;

        if !output.status.success() {
            return Err(format!(
                "jj workspace list failed: {}",
                String::from_utf8_lossy(&output.stderr)
            ));
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        let workspaces: Vec<String> = stdout
            .lines()
            .filter_map(|line| {
                let trimmed = line.trim();
                if trimmed.is_empty() {
                    return None;
                }
                // Format: "workspace_name: commit_id description"
                trimmed.split(':').next().map(|s| s.trim().to_string())
            })
            .collect();

        Ok(workspaces)
    }

    /// Get jj log output for a workspace
    pub fn get_log(workspace_path: &str, limit: usize) -> Result<String, String> {
        let output = Command::new(Self::jj_binary())
            .current_dir(workspace_path)
            .args(["log", "-n", &limit.to_string(), "--no-graph"])
            .output()
            .map_err(|e| format!("Failed to execute jj log: {}", e))?;

        if !output.status.success() {
            return Err(format!(
                "jj log failed: {}",
                String::from_utf8_lossy(&output.stderr)
            ));
        }

        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    }

    /// Get jj log output for a workspace
    pub fn get_log_previous_commit(workspace_path: &str) -> Result<String, String> {
        let output = Command::new(Self::jj_binary())
            .current_dir(workspace_path)
            .args(["log", "-n", "1", "--no-graph", "-r", "@-"])
            .output()
            .map_err(|e| format!("Failed to execute jj log: {}", e))?;

        if !output.status.success() {
            return Err(format!(
                "jj log failed: {}",
                String::from_utf8_lossy(&output.stderr)
            ));
        }

        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    }
    /// Get current bookmark (branch) for a workspace
    pub fn get_current_bookmark(workspace_path: &str) -> Result<Option<String>, String> {
        let output = Command::new(Self::jj_binary())
            .current_dir(workspace_path)
            .args(["bookmark", "list", "--all"])
            .output()
            .map_err(|e| format!("Failed to execute jj bookmark list: {}", e))?;

        if !output.status.success() {
            return Err(format!(
                "jj bookmark list failed: {}",
                String::from_utf8_lossy(&output.stderr)
            ));
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        // Find bookmark pointing to @ (current working copy)
        for line in stdout.lines() {
            if line.contains("@") && !line.contains("@origin") {
                // Extract bookmark name (first word before colon)
                if let Some(name) = line.split(':').next() {
                    let name = name.trim().trim_start_matches('*').trim();
                    if !name.is_empty() {
                        return Ok(Some(name.to_string()));
                    }
                }
            }
        }

        Ok(None)
    }

    /// Get list of all bookmarks in workspace
    pub fn list_bookmarks(repo_path: &str) -> Result<Vec<String>, String> {
        let output = Command::new(Self::jj_binary())
            .current_dir(repo_path)
            .args(["bookmark", "list", "--all"])
            .output()
            .map_err(|e| format!("Failed to execute jj bookmark list: {}", e))?;

        if !output.status.success() {
            return Err(format!(
                "jj bookmark list failed: {}",
                String::from_utf8_lossy(&output.stderr)
            ));
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        let bookmarks: Vec<String> = stdout
            .lines()
            .filter_map(|line| {
                let trimmed = line.trim();
                if trimmed.is_empty() {
                    return None;
                }
                // Extract bookmark name (before colon, strip leading *)
                trimmed
                    .split(':')
                    .next()
                    .map(|s| s.trim().trim_start_matches('*').trim().to_string())
            })
            .filter(|s| !s.is_empty() && !s.contains('@'))
            .collect();

        Ok(bookmarks)
    }

    /// Check if jj working copy has changes (is dirty)
    pub fn has_changes(workspace_path: &str) -> Result<bool, String> {
        let output = Command::new(Self::jj_binary())
            .current_dir(workspace_path)
            .args(["diff", "--stat"])
            .output()
            .map_err(|e| format!("Failed to execute jj diff: {}", e))?;

        if !output.status.success() {
            return Err(format!(
                "jj diff failed: {}",
                String::from_utf8_lossy(&output.stderr)
            ));
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        Ok(!stdout.trim().is_empty())
    }

    /// Get jj status output
    pub fn get_status(workspace_path: &str) -> Result<String, String> {
        let output = Command::new(Self::jj_binary())
            .current_dir(workspace_path)
            .args(["status"])
            .output()
            .map_err(|e| format!("Failed to execute jj status: {}", e))?;

        if !output.status.success() {
            return Err(format!(
                "jj status failed: {}",
                String::from_utf8_lossy(&output.stderr)
            ));
        }

        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    }

    /// Check if a file exists in the jj working copy
    pub fn file_exists_in_workspace(workspace_path: &str, file_path: &str) -> bool {
        Path::new(workspace_path).join(file_path).exists()
    }

    /// Get the parent commit of the current working copy
    pub fn get_parent_info(workspace_path: &str) -> Result<String, String> {
        let output = Command::new(Self::jj_binary())
            .current_dir(workspace_path)
            .args([
                "log",
                "-r",
                "@-",
                "-n",
                "1",
                "--no-graph",
                "-T",
                "description",
            ])
            .output()
            .map_err(|e| format!("Failed to execute jj log: {}", e))?;

        if !output.status.success() {
            return Err(format!(
                "jj log failed: {}",
                String::from_utf8_lossy(&output.stderr)
            ));
        }

        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    }

    /// Verify workspace is properly initialized
    /// jj workspaces may have different structure than git worktrees
    pub fn verify_workspace_structure(workspace_path: &str) -> Result<(), String> {
        let path = Path::new(workspace_path);

        // Check workspace directory exists
        if !path.exists() {
            return Err(format!("Workspace directory not found: {}", workspace_path));
        }

        if !path.is_dir() {
            return Err(format!(
                "Workspace path is not a directory: {}",
                workspace_path
            ));
        }

        // jj workspaces might have .git file/dir or be jj-native
        // Check for either .git or verify jj recognizes this as a workspace
        let git_path = path.join(".git");
        let has_git = git_path.exists();

        // Try running jj status to verify it's a valid jj workspace
        let jj_works = Command::new(Self::jj_binary())
            .current_dir(workspace_path)
            .args(["status"])
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false);

        if !has_git && !jj_works {
            return Err(format!(
                "Workspace is not a valid git/jj workspace: {}",
                workspace_path
            ));
        }

        Ok(())
    }
}
