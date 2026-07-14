use std::path::Path;

#[derive(serde::Serialize)]
pub struct GitRemoteInfo {
    pub owner: String,
    pub repo: String,
    pub full_name: String,
}

/// Parse owner/repo from a GitHub remote URL in either HTTPS or SSH form.
fn parse_github_remote(url: &str) -> Option<GitRemoteInfo> {
    let url = url.trim();

    // SSH: git@github.com:owner/repo.git
    if let Some(rest) = url.strip_prefix("git@github.com:") {
        let path = rest.trim_end_matches(".git");
        let (owner, repo) = path.split_once('/')?;
        return Some(GitRemoteInfo {
            owner: owner.to_string(),
            repo: repo.to_string(),
            full_name: format!("{}/{}", owner, repo),
        });
    }

    // HTTPS: https://github.com/owner/repo.git
    for prefix in &["https://github.com/", "http://github.com/"] {
        if let Some(rest) = url.strip_prefix(prefix) {
            let path = rest.trim_end_matches(".git");
            let (owner, repo) = path.split_once('/')?;
            return Some(GitRemoteInfo {
                owner: owner.to_string(),
                repo: repo.to_string(),
                full_name: format!("{}/{}", owner, repo),
            });
        }
    }

    None
}

/// Read the GitHub remote URL from .git/config and parse owner/repo.
/// Returns None if no GitHub remote is found.
#[tauri::command]
pub fn get_git_remote_url(repo_path: String) -> Result<Option<GitRemoteInfo>, String> {
    let git_config_path = Path::new(&repo_path).join(".git").join("config");
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
