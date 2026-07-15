use std::path::Path;

#[derive(serde::Serialize, Clone)]
pub struct GitRemoteInfo {
    pub owner: String,
    pub repo: String,
    pub full_name: String,
}

#[derive(serde::Serialize, serde::Deserialize, Clone)]
pub struct PrInfo {
    pub number: u64,
    pub title: String,
    pub state: String,
    pub url: String,
    pub head_ref_name: String,
    pub base_ref_name: String,
    pub merge_state_status: Option<String>,
}

/// Parse owner/repo from a GitHub remote URL in SSH or HTTPS form.
/// Returns None if the URL is not a recognized GitHub remote.
pub fn parse_github_remote(url: &str) -> Option<GitRemoteInfo> {
    let url = url.trim();

    // SSH: git@github.com:owner/repo.git
    if let Some(rest) = url.strip_prefix("git@github.com:") {
        let path = rest.trim_end_matches(".git");
        let (owner, repo) = path.split_once('/')?;
        return Some(GitRemoteInfo {
            owner: owner.to_string(),
            repo: repo.to_string(),
            full_name: format!("{owner}/{repo}"),
        });
    }

    // HTTPS: https://github.com/owner/repo[.git]
    for prefix in &["https://github.com/", "http://github.com/"] {
        if let Some(rest) = url.strip_prefix(prefix) {
            let path = rest.trim_end_matches(".git");
            let (owner, repo) = path.split_once('/')?;
            return Some(GitRemoteInfo {
                owner: owner.to_string(),
                repo: repo.to_string(),
                full_name: format!("{owner}/{repo}"),
            });
        }
    }

    None
}

/// Read the GitHub remote URL from .git/config and parse owner/repo.
/// Returns None if no GitHub remote is found or the directory is not a git repo.
pub fn get_git_remote_url_impl(repo_path: &str) -> Result<Option<GitRemoteInfo>, String> {
    let git_config_path = Path::new(repo_path).join(".git").join("config");
    if !git_config_path.exists() {
        return Ok(None);
    }

    let contents = std::fs::read_to_string(&git_config_path).map_err(|e| e.to_string())?;

    // Parse INI-style .git/config: find [remote "origin"] section and its url
    let mut in_origin_remote = false;
    for line in contents.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with('[') {
            in_origin_remote = trimmed == r#"[remote "origin"]"#;
            continue;
        }
        if in_origin_remote {
            if let Some(rest) = trimmed.strip_prefix("url") {
                let rest = rest.trim_start();
                if let Some(url) = rest.strip_prefix('=') {
                    if let Some(info) = parse_github_remote(url.trim()) {
                        return Ok(Some(info));
                    }
                }
            }
        }
    }

    Ok(None)
}

/// Run `gh pr view` for the given branch in the given repo directory.
/// Returns None if gh is not installed, not authenticated, or no PR exists.
/// The `gh_path` argument is the resolved path to the gh binary.
pub fn get_pr_info_via_gh_impl(
    gh_path: &str,
    repo_path: &str,
    branch_name: &str,
    extended_path: &str,
) -> Result<Option<PrInfo>, String> {
    #[derive(serde::Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct GhPrView {
        number: u64,
        title: String,
        state: String,
        url: String,
        head_ref_name: String,
        base_ref_name: String,
        merge_state_status: Option<String>,
    }

    let output = std::process::Command::new(gh_path)
        .args([
            "pr",
            "view",
            branch_name,
            "--json",
            "number,title,state,url,headRefName,baseRefName,mergeStateStatus",
        ])
        .current_dir(repo_path)
        .env("PATH", extended_path)
        .output()
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        // gh exits non-zero when no PR exists or not authenticated — treat as None
        return Ok(None);
    }

    let raw: GhPrView = serde_json::from_slice(&output.stdout)
        .map_err(|e| format!("Failed to parse gh output: {e}"))?;

    Ok(Some(PrInfo {
        number: raw.number,
        title: raw.title,
        state: raw.state,
        url: raw.url,
        head_ref_name: raw.head_ref_name,
        base_ref_name: raw.base_ref_name,
        merge_state_status: raw.merge_state_status,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::io::Write;
    use tempfile::TempDir;

    // ── parse_github_remote ──────────────────────────────────────────────────

    #[test]
    fn test_parse_ssh_url() {
        let info = parse_github_remote("git@github.com:owner/repo.git").unwrap();
        assert_eq!(info.owner, "owner");
        assert_eq!(info.repo, "repo");
        assert_eq!(info.full_name, "owner/repo");
    }

    #[test]
    fn test_parse_https_url() {
        let info = parse_github_remote("https://github.com/owner/repo.git").unwrap();
        assert_eq!(info.owner, "owner");
        assert_eq!(info.repo, "repo");
        assert_eq!(info.full_name, "owner/repo");
    }

    #[test]
    fn test_parse_https_url_no_dot_git() {
        let info = parse_github_remote("https://github.com/owner/repo").unwrap();
        assert_eq!(info.full_name, "owner/repo");
    }

    #[test]
    fn test_parse_non_github_url_returns_none() {
        assert!(parse_github_remote("https://gitlab.com/owner/repo.git").is_none());
    }

    #[test]
    fn test_parse_invalid_url_returns_none() {
        assert!(parse_github_remote("not-a-url").is_none());
    }

    #[test]
    fn test_parse_trims_whitespace() {
        let info = parse_github_remote("  git@github.com:owner/repo.git  ").unwrap();
        assert_eq!(info.full_name, "owner/repo");
    }

    // ── get_git_remote_url_impl ──────────────────────────────────────────────

    fn write_git_config(dir: &TempDir, content: &str) {
        let git_dir = dir.path().join(".git");
        fs::create_dir_all(&git_dir).unwrap();
        fs::write(git_dir.join("config"), content).unwrap();
    }

    #[test]
    fn test_get_git_remote_url_parses_ssh_origin() {
        let dir = TempDir::new().unwrap();
        write_git_config(
            &dir,
            r#"[core]
    repositoryformatversion = 0
[remote "origin"]
    url = git@github.com:ziinc/treq.git
    fetch = +refs/heads/*:refs/remotes/origin/*
"#,
        );
        let info = get_git_remote_url_impl(dir.path().to_str().unwrap())
            .unwrap()
            .unwrap();
        assert_eq!(info.owner, "ziinc");
        assert_eq!(info.repo, "treq");
        assert_eq!(info.full_name, "ziinc/treq");
    }

    #[test]
    fn test_get_git_remote_url_parses_https_origin() {
        let dir = TempDir::new().unwrap();
        write_git_config(
            &dir,
            r#"[remote "origin"]
    url = https://github.com/ziinc/treq.git
"#,
        );
        let info = get_git_remote_url_impl(dir.path().to_str().unwrap())
            .unwrap()
            .unwrap();
        assert_eq!(info.full_name, "ziinc/treq");
    }

    #[test]
    fn test_get_git_remote_url_non_github_remote_returns_none() {
        let dir = TempDir::new().unwrap();
        write_git_config(
            &dir,
            r#"[remote "origin"]
    url = https://gitlab.com/owner/repo.git
"#,
        );
        let result = get_git_remote_url_impl(dir.path().to_str().unwrap()).unwrap();
        assert!(result.is_none());
    }

    #[test]
    fn test_get_git_remote_url_missing_git_dir_returns_none() {
        let dir = TempDir::new().unwrap();
        let result = get_git_remote_url_impl(dir.path().to_str().unwrap()).unwrap();
        assert!(result.is_none());
    }

    #[test]
    fn test_get_git_remote_url_ignores_non_origin_remotes() {
        let dir = TempDir::new().unwrap();
        write_git_config(
            &dir,
            r#"[remote "upstream"]
    url = git@github.com:owner/repo.git
"#,
        );
        let result = get_git_remote_url_impl(dir.path().to_str().unwrap()).unwrap();
        assert!(result.is_none());
    }

    // ── get_pr_info_via_gh_impl ──────────────────────────────────────────────

    #[cfg(unix)]
    fn write_fake_gh(dir: &TempDir, script_body: &str) -> String {
        let path = dir.path().join("gh");
        let mut f = fs::File::create(&path).unwrap();
        writeln!(f, "#!/bin/sh").unwrap();
        write!(f, "{script_body}").unwrap();
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(&path, fs::Permissions::from_mode(0o755)).unwrap();
        path.to_str().unwrap().to_string()
    }

    #[test]
    #[cfg(unix)]
    fn test_get_pr_info_via_gh_returns_parsed_pr() {
        let bin_dir = TempDir::new().unwrap();
        let repo_dir = TempDir::new().unwrap();
        let gh_path = write_fake_gh(
            &bin_dir,
            r#"echo '{"number":42,"title":"My PR","state":"OPEN","url":"https://github.com/o/r/pull/42","headRefName":"feat","baseRefName":"main","mergeStateStatus":"CLEAN"}'"#,
        );

        let info = get_pr_info_via_gh_impl(
            &gh_path,
            repo_dir.path().to_str().unwrap(),
            "feat",
            "/usr/bin:/bin",
        )
        .unwrap()
        .unwrap();

        assert_eq!(info.number, 42);
        assert_eq!(info.title, "My PR");
        assert_eq!(info.state, "OPEN");
        assert_eq!(info.head_ref_name, "feat");
        assert_eq!(info.base_ref_name, "main");
        assert_eq!(info.merge_state_status.as_deref(), Some("CLEAN"));
    }

    #[test]
    #[cfg(unix)]
    fn test_get_pr_info_via_gh_nonzero_exit_returns_none() {
        let bin_dir = TempDir::new().unwrap();
        let repo_dir = TempDir::new().unwrap();
        let gh_path = write_fake_gh(&bin_dir, "exit 1");

        let result = get_pr_info_via_gh_impl(
            &gh_path,
            repo_dir.path().to_str().unwrap(),
            "feat",
            "/usr/bin:/bin",
        )
        .unwrap();

        assert!(result.is_none());
    }

    #[test]
    #[cfg(unix)]
    fn test_get_pr_info_via_gh_no_pr_state_returns_none() {
        let bin_dir = TempDir::new().unwrap();
        let repo_dir = TempDir::new().unwrap();
        // gh exits 1 with a "no pull requests found" message on stderr
        let gh_path = write_fake_gh(&bin_dir, "echo 'no pull requests found' >&2\nexit 1");

        let result = get_pr_info_via_gh_impl(
            &gh_path,
            repo_dir.path().to_str().unwrap(),
            "unknown-branch",
            "/usr/bin:/bin",
        )
        .unwrap();

        assert!(result.is_none());
    }

    #[test]
    fn test_get_pr_info_via_gh_bad_binary_returns_err() {
        let result = get_pr_info_via_gh_impl("/nonexistent/gh", "/tmp", "feat", "/usr/bin:/bin");
        assert!(result.is_err());
    }
}
