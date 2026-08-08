use std::path::Path;

use tauri_plugin_cli::Matches;

use crate::core;
use crate::local_db;

use super::status_output::{
    format_workspace_stack_lines, print_workspace_partial_status, print_workspace_status_detail,
    WorkspacePrStatus,
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

pub(super) fn handle_workspace_add(matches: &Matches) -> bool {
    let branch_name = match get_arg_value(matches, "branch_name") {
        Some(name) => name,
        None => {
            super::log_cli_error("Error: branch name is required");
            eprintln!(
                "Usage: treq add <branch_name> [-d description] [-l title] [-s source_branch] [-p sparse_path]... [-k symlink_path]..."
            );
            return false;
        }
    };

    let description = get_arg_value(matches, "description");
    let source_branch = get_arg_value(matches, "source-branch");
    let sparse_patterns = get_arg_values(matches, "sparse");
    let sparse_patterns = (!sparse_patterns.is_empty()).then_some(sparse_patterns);
    let symlinked_dirs = get_arg_values(matches, "symlink");
    let symlinked_dirs = (!symlinked_dirs.is_empty()).then_some(symlinked_dirs);

    let repo_path = match detect_repo_path() {
        Ok(p) => p,
        Err(e) => {
            super::log_cli_error(&format!("Error: {}", e));
            return false;
        }
    };

    // Ensure the repo is initialized
    if let Err(e) = core::init(&repo_path) {
        super::log_cli_error(&format!("Error initializing repo: {}", e));
        return false;
    }

    match core::create_workspace_with_symlinked_dirs(
        &repo_path,
        &branch_name,
        description,
        None,
        source_branch.as_deref(),
        None,
        sparse_patterns,
        symlinked_dirs.clone(),
    ) {
        Ok(workspace) => {
            println!("Created workspace: {}", workspace.branch_name);
            if let Some(ref description) = workspace.description {
                println!("  Description: {}", description);
            }
            if let Some(ref dirs) = symlinked_dirs {
                println!("  Symlinked: {}", dirs.join(", "));
            }
            let full_path = Path::new(&repo_path)
                .join(".treq")
                .join("workspaces")
                .join(&workspace.workspace_path);
            println!("  Path: {}", full_path.display());
            true
        }
        Err(e) => {
            super::log_cli_error(&format!("Error creating workspace: {}", e));
            false
        }
    }
}

pub(super) fn handle_workspace_set(matches: &Matches) -> bool {
    let workspace_name = match get_arg_value(matches, "workspace_name") {
        Some(name) => name,
        None => {
            super::log_cli_error("Error: workspace name is required");
            eprintln!(
                "Usage: treq set <workspace_name> [-d description] [-l title] [-t target_branch]"
            );
            return false;
        }
    };

    let description = get_arg_value(matches, "description");
    let title = get_arg_value(matches, "title");
    let target_branch = get_arg_value(matches, "target-branch");

    if description.is_none() && target_branch.is_none() && title.is_none() {
        super::log_cli_error(
            "Error: specify at least one of -d (description), -l (title), or -t (target branch)",
        );
        return false;
    }

    let repo_path = match detect_repo_path() {
        Ok(p) => p,
        Err(e) => {
            super::log_cli_error(&format!("Error: {}", e));
            return false;
        }
    };

    // Look up workspace by branch name
    let workspace = match local_db::get_workspace_by_branch(&repo_path, &workspace_name) {
        Ok(Some(ws)) => ws,
        Ok(None) => {
            super::log_cli_error(&format!("Error: workspace '{}' not found", workspace_name));
            return false;
        }
        Err(e) => {
            super::log_cli_error(&format!("Error looking up workspace: {}", e));
            return false;
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
            true
        }
        Err(e) => {
            super::log_cli_error(&format!("Error updating workspace: {}", e));
            false
        }
    }
}

pub(super) fn handle_workspace_status(matches: &Matches) -> bool {
    let workspace_name = get_arg_value(matches, "workspace_name");

    let repo_path = match detect_repo_path() {
        Ok(p) => p,
        Err(e) => {
            super::log_cli_error(&format!("Error: {}", e));
            return false;
        }
    };

    match workspace_name {
        Some(name) => {
            // Show status for a specific workspace
            let workspace = match local_db::get_workspace_by_branch(&repo_path, &name) {
                Ok(Some(ws)) => ws,
                Ok(None) => {
                    super::log_cli_error(&format!("Error: workspace '{}' not found", name));
                    return false;
                }
                Err(e) => {
                    super::log_cli_error(&format!("Error looking up workspace: {}", e));
                    return false;
                }
            };

            match core::workspace_status(&repo_path, Some(workspace.id)) {
                Ok(status) => {
                    let pr = github_pr_status(
                        &status.partial.current.workspace_path,
                        &status.partial.current.branch_name,
                    );
                    print_workspace_status_detail(&status, pr.as_ref());
                    true
                }
                Err(e) => {
                    super::log_cli_error(&format!("Error getting workspace status: {}", e));
                    false
                }
            }
        }
        None => {
            // Show status for all workspaces
            match core::list_workspace_statuses(&repo_path) {
                Ok(statuses) => {
                    if statuses.is_empty() {
                        println!("No workspaces found.");
                        return true;
                    }
                    for line in format_workspace_stack_lines(&statuses) {
                        println!("{line}");
                    }
                    println!("Details:");
                    for status in &statuses {
                        let pr = github_pr_status(
                            &status.current.workspace_path,
                            &status.current.branch_name,
                        );
                        print_workspace_partial_status(status, pr.as_ref());
                    }
                    true
                }
                Err(e) => {
                    super::log_cli_error(&format!("Error listing workspace statuses: {}", e));
                    false
                }
            }
        }
    }
}

pub(super) fn handle_workspace_move(matches: &Matches) -> bool {
    let source = match get_arg_value(matches, "source") {
        Some(value) => value,
        None => {
            super::log_cli_error("Error: source workspace is required");
            eprintln!(
                "Usage: treq mv <source> <destination> -f [FILES...] -r [RANGES...] -c [COMMITS...]  (use '.' for the home repo)"
            );
            return false;
        }
    };
    let destination = match get_arg_value(matches, "destination") {
        Some(value) => value,
        None => {
            super::log_cli_error("Error: destination workspace is required");
            eprintln!(
                "Usage: treq mv <source> <destination> -f [FILES...] -r [RANGES...] -c [COMMITS...]  (use '.' for the home repo)"
            );
            return false;
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
                super::log_cli_error(&format!("Error: {}", error));
                return false;
            }
        }
    }

    let request = core::WorkspaceMoveRequest {
        files,
        hunks,
        commits,
    };
    if !request.has_selectors() {
        super::log_cli_error("Error: specify at least one of -f, -r, or -c");
        return false;
    }

    let repo_path = match detect_repo_path() {
        Ok(path) => path,
        Err(error) => {
            super::log_cli_error(&format!("Error: {}", error));
            return false;
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
                tracing::warn!("{}", warning);
            }
            true
        }
        Err(error) => {
            super::log_cli_error(&format!("Error moving workspace changes: {}", error));
            false
        }
    }
}

pub(super) fn handle_workspace_agent(matches: &Matches) -> bool {
    let branch = match get_arg_value(matches, "branch") {
        Some(value) => value,
        None => {
            super::log_cli_error("Error: branch is required");
            eprintln!("Usage: treq agent <branch> <prompt> [-m <edit|plan>]");
            return false;
        }
    };

    let prompt = match get_arg_value(matches, "prompt") {
        Some(value) => value,
        None => {
            super::log_cli_error("Error: prompt is required");
            eprintln!("Usage: treq agent <branch> <prompt> [-m <edit|plan>]");
            return false;
        }
    };

    let mode = match parse_agent_mode_or_default(get_arg_value(matches, "mode").as_deref()) {
        Ok(mode) => mode.to_string(),
        Err(error) => {
            super::log_cli_error(&format!("Error: {}", error));
            return false;
        }
    };

    let repo_path = match detect_repo_path() {
        Ok(path) => path,
        Err(error) => {
            super::log_cli_error(&format!("Error: {}", error));
            return false;
        }
    };

    if let Err(error) = core::init(&repo_path) {
        super::log_cli_error(&format!("Error initializing repo: {}", error));
        return false;
    }

    let workspace = match local_db::get_workspace_by_branch(&repo_path, &branch) {
        Ok(Some(workspace)) => workspace,
        Ok(None) => {
            super::log_cli_error(&format!(
                "Error: workspace branch '{}' not found. Create it first with `treq add {}`.",
                branch, branch
            ));
            return false;
        }
        Err(error) => {
            super::log_cli_error(&format!("Error looking up workspace: {}", error));
            return false;
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
        super::log_cli_error(&format!("Error dispatching agent request: {}", error));
        return false;
    }
    true
}

pub(super) fn handle_workspace_commit(matches: &Matches) -> bool {
    let workspace_name = match get_arg_value(matches, "workspace_name") {
        Some(value) => value,
        None => {
            super::log_cli_error("Error: workspace name is required");
            eprintln!("Usage: treq commit <workspace_name> -m <message> [--push]");
            return false;
        }
    };

    let message = match get_arg_value(matches, "message") {
        Some(value) => value,
        None => {
            super::log_cli_error("Error: commit message is required (-m)");
            eprintln!("Usage: treq commit <workspace_name> -m <message> [--push]");
            return false;
        }
    };

    let push = get_arg_flag(matches, "push");

    let repo_path = match detect_repo_path() {
        Ok(path) => path,
        Err(error) => {
            super::log_cli_error(&format!("Error: {}", error));
            return false;
        }
    };

    let workspace = match local_db::get_workspace_by_branch(&repo_path, &workspace_name) {
        Ok(Some(ws)) => ws,
        Ok(None) => {
            super::log_cli_error(&format!("Error: workspace '{}' not found", workspace_name));
            return false;
        }
        Err(error) => {
            super::log_cli_error(&format!("Error looking up workspace: {}", error));
            return false;
        }
    };

    match core::commit_workspace(&repo_path, workspace.id, &message) {
        Ok(result) => println!("{}", result),
        Err(error) => {
            super::log_cli_error(&format!("Error creating commit: {}", error));
            return false;
        }
    }

    if push {
        match core::push_workspace_to_remote(&repo_path, Some(workspace.id)) {
            Ok(result) => println!("{}", result),
            Err(error) => {
                super::log_cli_error(&format!("Error pushing to remote: {}", error));
                return false;
            }
        }
    }

    true
}
