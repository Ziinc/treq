use std::path::Path;

use tauri_plugin_cli::Matches;

use crate::core;
use crate::local_db;

use super::status_output::{
    print_workspace_partial_status, print_workspace_status_detail, WorkspacePrStatus,
};
use super::{
    detect_repo_path, dispatch_agent_request, parse_agent_mode_or_default, resolve_default_agent,
};

fn get_arg_value(matches: &Matches, name: &str) -> Option<String> {
    matches.args.get(name).and_then(|arg| {
        arg.value
            .as_str()
            .filter(|s| !s.is_empty())
            .map(|s| s.to_string())
    })
}

fn get_arg_flag(matches: &Matches, name: &str) -> bool {
    matches
        .args
        .get(name)
        .and_then(|arg| arg.value.as_bool())
        .unwrap_or(false)
}

fn workspace_checkout_path(repo_path: &Path, stored_path: &str) -> std::path::PathBuf {
    let stored_path = Path::new(stored_path);
    if stored_path.is_absolute() {
        stored_path.to_path_buf()
    } else {
        repo_path.join(".treq").join("workspaces").join(stored_path)
    }
}

fn github_pr_status(repo_path: &str, branch_name: &str) -> Option<WorkspacePrStatus> {
    let remote = crate::github::get_git_remote_url_impl(repo_path).ok()??;
    let gh = crate::binary_paths::get_binary_path("gh")
        .or_else(|| crate::binary_paths::detect_binary("gh"))?;
    let path = crate::binary_paths::get_extended_path();
    let pr = crate::github::get_pr_info_via_gh_impl(&gh, repo_path, branch_name, &path).ok()??;
    let checks = crate::github::get_pr_checks_via_gh_impl(&gh, repo_path, branch_name, &path)
        .ok()
        .flatten();
    Some(WorkspacePrStatus {
        github_id: format!("{}#{}", remote.full_name, pr.number),
        checks,
    })
}

fn get_arg_values(matches: &Matches, name: &str) -> Vec<String> {
    let Some(arg) = matches.args.get(name) else {
        return Vec::new();
    };
    match &arg.value {
        serde_json::Value::Array(values) => values
            .iter()
            .filter_map(|value| value.as_str())
            .map(|value| value.to_string())
            .filter(|value| !value.is_empty())
            .collect(),
        serde_json::Value::String(value) if !value.is_empty() => vec![value.to_string()],
        _ => Vec::new(),
    }
}

pub(super) fn handle_workspace_add(matches: &Matches) {
    let branch_name = match get_arg_value(matches, "branch_name") {
        Some(name) => name,
        None => {
            eprintln!("Error: branch name is required");
            eprintln!(
                "Usage: treq add <branch_name> [-d description] [-l title] [-s source_branch] [-p sparse_path]..."
            );
            return;
        }
    };

    let description = get_arg_value(matches, "description");
    let source_branch = get_arg_value(matches, "source-branch");
    let sparse_patterns = get_arg_values(matches, "sparse");
    let sparse_patterns = (!sparse_patterns.is_empty()).then_some(sparse_patterns);

    let repo_path = match detect_repo_path() {
        Ok(p) => p,
        Err(e) => {
            eprintln!("Error: {}", e);
            return;
        }
    };

    // Ensure the repo is initialized
    if let Err(e) = core::init(&repo_path) {
        eprintln!("Error initializing repo: {}", e);
        return;
    }

    match core::create_workspace(
        &repo_path,
        &branch_name,
        description,
        None,
        source_branch.as_deref(),
        None,
        sparse_patterns,
    ) {
        Ok(workspace) => {
            println!("Created workspace: {}", workspace.branch_name);
            if let Some(ref description) = workspace.description {
                println!("  Description: {}", description);
            }
            let full_path = Path::new(&repo_path)
                .join(".treq")
                .join("workspaces")
                .join(&workspace.workspace_path);
            println!("  Path: {}", full_path.display());
        }
        Err(e) => {
            eprintln!("Error creating workspace: {}", e);
        }
    }
}

pub(super) fn handle_workspace_set(matches: &Matches) {
    let workspace_name = match get_arg_value(matches, "workspace_name") {
        Some(name) => name,
        None => {
            eprintln!("Error: workspace name is required");
            eprintln!(
                "Usage: treq set <workspace_name> [-d description] [-l title] [-t target_branch]"
            );
            return;
        }
    };

    let description = get_arg_value(matches, "description");
    let title = get_arg_value(matches, "title");
    let target_branch = get_arg_value(matches, "target-branch");

    if description.is_none() && target_branch.is_none() && title.is_none() {
        eprintln!(
            "Error: specify at least one of -d (description), -l (title), or -t (target branch)"
        );
        return;
    }

    let repo_path = match detect_repo_path() {
        Ok(p) => p,
        Err(e) => {
            eprintln!("Error: {}", e);
            return;
        }
    };

    // Look up workspace by branch name
    let workspace = match local_db::get_workspace_by_branch(&repo_path, &workspace_name) {
        Ok(Some(ws)) => ws,
        Ok(None) => {
            eprintln!("Error: workspace '{}' not found", workspace_name);
            return;
        }
        Err(e) => {
            eprintln!("Error looking up workspace: {}", e);
            return;
        }
    };

    let description_param = match description {
        Some(i) => core::MaybeEmptyParam::Some(i),
        None => core::MaybeEmptyParam::Omitted,
    };
    let title_param = match title {
        Some(t) => core::MaybeEmptyParam::Some(t),
        None => core::MaybeEmptyParam::Omitted,
    };

    let target_param = match target_branch {
        Some(t) => core::MaybeEmptyParam::Some(t),
        None => core::MaybeEmptyParam::Omitted,
    };

    match core::update_workspace_with_title(
        &repo_path,
        workspace.id,
        target_param,
        title_param,
        description_param,
    ) {
        Ok(updated) => {
            println!("Updated workspace: {}", updated.branch_name);
            println!("  Title: {}", updated.title);
            if let Some(ref description) = updated.description {
                println!("  Description: {}", description);
            }
            if let Some(ref target) = updated.target_branch {
                println!("  Target: {}", target);
            }
        }
        Err(e) => {
            eprintln!("Error updating workspace: {}", e);
        }
    }
}

pub(super) fn handle_workspace_status(matches: &Matches) {
    let workspace_name = get_arg_value(matches, "workspace_name");

    let repo_path = match detect_repo_path() {
        Ok(p) => p,
        Err(e) => {
            eprintln!("Error: {}", e);
            return;
        }
    };

    match workspace_name {
        Some(name) => {
            // Show status for a specific workspace
            let workspace = match local_db::get_workspace_by_branch(&repo_path, &name) {
                Ok(Some(ws)) => ws,
                Ok(None) => {
                    eprintln!("Error: workspace '{}' not found", name);
                    return;
                }
                Err(e) => {
                    eprintln!("Error looking up workspace: {}", e);
                    return;
                }
            };

            match core::workspace_status(&repo_path, Some(workspace.id)) {
                Ok(status) => {
                    let workspace_path = workspace_checkout_path(
                        Path::new(&repo_path),
                        &status.partial.current.workspace_path,
                    );
                    let pr = github_pr_status(
                        &workspace_path.to_string_lossy(),
                        &status.partial.current.branch_name,
                    );
                    print_workspace_status_detail(&status, pr.as_ref());
                }
                Err(e) => {
                    eprintln!("Error getting workspace status: {}", e);
                }
            }
        }
        None => {
            // Show status for all workspaces
            match core::list_workspace_statuses(&repo_path) {
                Ok(statuses) => {
                    if statuses.is_empty() {
                        println!("No workspaces found.");
                        return;
                    }
                    for status in &statuses {
                        let workspace_path = workspace_checkout_path(
                            Path::new(&repo_path),
                            &status.current.workspace_path,
                        );
                        let pr = github_pr_status(
                            &workspace_path.to_string_lossy(),
                            &status.current.branch_name,
                        );
                        print_workspace_partial_status(status, pr.as_ref());
                    }
                }
                Err(e) => {
                    eprintln!("Error listing workspace statuses: {}", e);
                }
            }
        }
    }
}

pub(super) fn handle_workspace_move(matches: &Matches) {
    let source = match get_arg_value(matches, "source") {
        Some(value) => value,
        None => {
            eprintln!("Error: source workspace is required");
            eprintln!(
                "Usage: treq mv <source> <destination> -f [FILES...] -r [RANGES...] -c [COMMITS...]  (use '.' for the home repo)"
            );
            return;
        }
    };
    let destination = match get_arg_value(matches, "destination") {
        Some(value) => value,
        None => {
            eprintln!("Error: destination workspace is required");
            eprintln!(
                "Usage: treq mv <source> <destination> -f [FILES...] -r [RANGES...] -c [COMMITS...]  (use '.' for the home repo)"
            );
            return;
        }
    };

    let files = get_arg_values(matches, "files");
    let commits = get_arg_values(matches, "commits");
    let raw_hunks = get_arg_values(matches, "ranges");
    let mut hunks = Vec::new();
    for raw_hunk in raw_hunks {
        match core::parse_hunk_spec(&raw_hunk) {
            Ok(spec) => hunks.push(spec),
            Err(error) => {
                eprintln!("Error: {}", error);
                return;
            }
        }
    }

    let request = core::WorkspaceMoveRequest {
        files,
        hunks,
        commits,
    };
    if !request.has_selectors() {
        eprintln!("Error: specify at least one of -f, -r, or -c");
        return;
    }

    let repo_path = match detect_repo_path() {
        Ok(path) => path,
        Err(error) => {
            eprintln!("Error: {}", error);
            return;
        }
    };

    match core::move_workspace_changes(&repo_path, &source, &destination, request) {
        Ok(result) => {
            println!(
                "Moved changes from '{}' to '{}': commits={}, files={}, hunks_applied={}, hunks_skipped={}",
                source,
                destination,
                result.commits_moved,
                result.files_moved,
                result.hunks_applied,
                result.hunks_skipped
            );
            for warning in result.warnings {
                eprintln!("Warning: {}", warning);
            }
        }
        Err(error) => {
            eprintln!("Error moving workspace changes: {}", error);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolves_workspace_checkout_from_repo_and_stored_relative_path() {
        let repo = Path::new("repo-root");

        assert_eq!(
            workspace_checkout_path(repo, "feat-status-pr-info"),
            repo.join(".treq/workspaces/feat-status-pr-info")
        );
    }

    #[test]
    fn preserves_absolute_workspace_checkout_path() {
        let absolute = std::env::temp_dir().join("treq-workspace");

        assert_eq!(
            workspace_checkout_path(Path::new("repo-root"), absolute.to_str().unwrap()),
            absolute
        );
    }
}

pub(super) fn handle_workspace_agent(matches: &Matches) {
    let branch = match get_arg_value(matches, "branch") {
        Some(value) => value,
        None => {
            eprintln!("Error: branch is required");
            eprintln!("Usage: treq agent <branch> <prompt> [-m <edit|plan>]");
            return;
        }
    };

    let prompt = match get_arg_value(matches, "prompt") {
        Some(value) => value,
        None => {
            eprintln!("Error: prompt is required");
            eprintln!("Usage: treq agent <branch> <prompt> [-m <edit|plan>]");
            return;
        }
    };

    let mode = match parse_agent_mode_or_default(get_arg_value(matches, "mode").as_deref()) {
        Ok(mode) => mode.to_string(),
        Err(error) => {
            eprintln!("Error: {}", error);
            return;
        }
    };

    let repo_path = match detect_repo_path() {
        Ok(path) => path,
        Err(error) => {
            eprintln!("Error: {}", error);
            return;
        }
    };

    if let Err(error) = core::init(&repo_path) {
        eprintln!("Error initializing repo: {}", error);
        return;
    }

    let workspace = match local_db::get_workspace_by_branch(&repo_path, &branch) {
        Ok(Some(workspace)) => workspace,
        Ok(None) => {
            eprintln!(
                "Error: workspace branch '{}' not found. Create it first with `treq add {}`.",
                branch, branch
            );
            return;
        }
        Err(error) => {
            eprintln!("Error looking up workspace: {}", error);
            return;
        }
    };

    let request_id = format!(
        "cli-{}-{}",
        workspace.id,
        chrono::Utc::now().timestamp_millis()
    );
    let agent = resolve_default_agent(&repo_path);
    if let Err(error) = dispatch_agent_request(
        &repo_path,
        &workspace.branch_name,
        &prompt,
        &mode,
        &agent,
        &request_id,
    ) {
        eprintln!("Error dispatching agent request: {}", error);
        std::process::exit(1);
    }
}

pub(super) fn handle_workspace_commit(matches: &Matches) {
    let workspace_name = match get_arg_value(matches, "workspace_name") {
        Some(value) => value,
        None => {
            eprintln!("Error: workspace name is required");
            eprintln!("Usage: treq commit <workspace_name> -m <message> [--push]");
            return;
        }
    };

    let message = match get_arg_value(matches, "message") {
        Some(value) => value,
        None => {
            eprintln!("Error: commit message is required (-m)");
            eprintln!("Usage: treq commit <workspace_name> -m <message> [--push]");
            return;
        }
    };

    let push = get_arg_flag(matches, "push");

    let repo_path = match detect_repo_path() {
        Ok(path) => path,
        Err(error) => {
            eprintln!("Error: {}", error);
            return;
        }
    };

    let workspace = match local_db::get_workspace_by_branch(&repo_path, &workspace_name) {
        Ok(Some(ws)) => ws,
        Ok(None) => {
            eprintln!("Error: workspace '{}' not found", workspace_name);
            return;
        }
        Err(error) => {
            eprintln!("Error looking up workspace: {}", error);
            return;
        }
    };

    match core::commit_workspace(&repo_path, workspace.id, &message) {
        Ok(result) => println!("{}", result),
        Err(error) => {
            eprintln!("Error creating commit: {}", error);
            std::process::exit(1);
        }
    }

    if push {
        match core::push_workspace_to_remote(&repo_path, Some(workspace.id)) {
            Ok(result) => println!("{}", result),
            Err(error) => {
                eprintln!("Error pushing to remote: {}", error);
                std::process::exit(1);
            }
        }
    }
}
