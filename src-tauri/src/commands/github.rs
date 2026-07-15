use std::path::Path;

use crate::binary_paths::{detect_binary, get_binary_path};

#[derive(serde::Serialize)]
pub struct GitRemoteInfo {
    pub owner: String,
    pub repo: String,
    pub full_name: String,
}

#[derive(serde::Serialize, serde::Deserialize)]
pub struct PrInfo {
    pub number: u64,
    pub title: String,
    pub state: String,
    pub url: String,
    pub head_ref_name: String,
    pub base_ref_name: String,
    pub merge_state_status: Option<String>,
}

/// Run `gh pr view` for the given branch in the given repo directory.
/// Returns None if gh is not installed, not authenticated, or no PR exists.
#[tauri::command]
pub fn get_pr_info_via_gh(
    repo_path: String,
    branch_name: String,
) -> Result<Option<PrInfo>, String> {
    let gh = get_binary_path("gh")
        .or_else(|| detect_binary("gh"))
        .ok_or_else(|| "gh CLI not found".to_string())?;

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

    let output = std::process::Command::new(&gh)
        .args([
            "pr",
            "view",
            &branch_name,
            "--json",
            "number,title,state,url,headRefName,baseRefName,mergeStateStatus",
        ])
        .current_dir(&repo_path)
        .env(
            "PATH",
            crate::binary_paths::get_extended_path(),
        )
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
