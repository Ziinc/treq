use std::collections::HashMap;
use std::path::Path;
use tauri_plugin_cli::{Matches, SubcommandMatches};

use crate::binary_paths;
use crate::core;
use crate::local_db;

/// Walk up from CWD to find a directory containing `.treq` or `.jj`.
pub fn detect_repo_path() -> Result<String, String> {
    let cwd = std::env::current_dir().map_err(|e| format!("Failed to get CWD: {}", e))?;

    let mut dir = cwd.as_path();
    loop {
        if dir.join(".treq").is_dir() || dir.join(".jj").is_dir() {
            return dir
                .to_str()
                .map(|s| s.to_string())
                .ok_or_else(|| "Path is not valid UTF-8".to_string());
        }
        match dir.parent() {
            Some(parent) => dir = parent,
            None => break,
        }
    }

    Err("Not inside a treq repository (no .treq or .jj directory found)".to_string())
}

/// Initialize binary paths cache for CLI mode (no database needed).
pub fn init_cli_binary_paths() {
    let mut paths = HashMap::new();
    for name in ["jj", "git"] {
        if let Some(path) = binary_paths::detect_binary(name) {
            paths.insert(name.to_string(), path);
        }
    }
    binary_paths::init_binary_paths_cache(paths);
}

/// Top-level CLI dispatch. Returns `true` if a CLI command was handled.
pub fn handle_cli_command(subcommand: &SubcommandMatches) -> bool {
    match subcommand.name.as_str() {
        "workspace" => {
            if let Some(ref sub) = subcommand.matches.subcommand {
                handle_workspace_subcommand(sub);
            } else {
                eprintln!("Usage: treq workspace <add|set|st|ls>");
                eprintln!("Run `treq workspace --help` for details.");
            }
            true
        }
_ => false,
    }
}

fn handle_workspace_subcommand(subcommand: &SubcommandMatches) {
    let name = &subcommand.name;
    let matches = &subcommand.matches;

    match name.as_str() {
        "add" => handle_workspace_add(matches),
        "set" => handle_workspace_set(matches),
        "st" => handle_workspace_status(matches),
        "ls" => handle_workspace_list(),
        _ => {
            eprintln!("Unknown workspace command: {}", name);
            eprintln!("Available: add, set, st, ls");
        }
    }
}

fn get_arg_value(matches: &Matches, name: &str) -> Option<String> {
    matches.args.get(name).and_then(|arg| {
        arg.value
            .as_str()
            .filter(|s| !s.is_empty())
            .map(|s| s.to_string())
    })
}

fn handle_workspace_add(matches: &Matches) {
    let branch_name = match get_arg_value(matches, "branch_name") {
        Some(name) => name,
        None => {
            eprintln!("Error: branch name is required");
            eprintln!("Usage: treq workspace add <branch_name> [-i intent] [-s source_branch]");
            return;
        }
    };

    let intent = get_arg_value(matches, "intent");
    let source_branch = get_arg_value(matches, "source-branch");

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
        intent,
        None,
        source_branch.as_deref(),
    ) {
        Ok(workspace) => {
            println!("Created workspace: {}", workspace.branch_name);
            if let Some(ref intent) = workspace.intent {
                println!("  Intent: {}", intent);
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

fn handle_workspace_set(matches: &Matches) {
    let workspace_name = match get_arg_value(matches, "workspace_name") {
        Some(name) => name,
        None => {
            eprintln!("Error: workspace name is required");
            eprintln!("Usage: treq workspace set <workspace_name> [-i intent] [-t target_branch]");
            return;
        }
    };

    let intent = get_arg_value(matches, "intent");
    let target_branch = get_arg_value(matches, "target-branch");

    if intent.is_none() && target_branch.is_none() {
        eprintln!("Error: specify at least one of -i (intent) or -t (target branch)");
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

    let intent_param = match intent {
        Some(i) => core::MaybeEmptyParam::Some(i),
        None => core::MaybeEmptyParam::Omitted,
    };

    let target_param = match target_branch {
        Some(t) => core::MaybeEmptyParam::Some(t),
        None => core::MaybeEmptyParam::Omitted,
    };

    match core::update_workspace(&repo_path, workspace.id, target_param, intent_param) {
        Ok(updated) => {
            println!("Updated workspace: {}", updated.branch_name);
            if let Some(ref intent) = updated.intent {
                println!("  Intent: {}", intent);
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

fn handle_workspace_status(matches: &Matches) {
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
                    print_workspace_status_detail(&status);
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
                        print_workspace_partial_status(status);
                    }
                }
                Err(e) => {
                    eprintln!("Error listing workspace statuses: {}", e);
                }
            }
        }
    }
}

fn handle_workspace_list() {
    let repo_path = match detect_repo_path() {
        Ok(p) => p,
        Err(e) => {
            eprintln!("Error: {}", e);
            return;
        }
    };

    match core::list_workspace_statuses(&repo_path) {
        Ok(statuses) => {
            if statuses.is_empty() {
                println!("No workspaces found.");
                return;
            }
            println!(
                "{:<30} {:<15} {:<10} {:<10}",
                "BRANCH", "TARGET", "CHANGES", "CONFLICTS"
            );
            println!("{}", "-".repeat(65));
            for status in &statuses {
                let target = status.current.target_branch.as_deref().unwrap_or("main");
                let changes = if status.has_changes { "yes" } else { "no" };
                let conflicts = if status.has_conflicts { "YES" } else { "no" };
                println!(
                    "{:<30} {:<15} {:<10} {:<10}",
                    status.current.branch_name, target, changes, conflicts
                );
            }
        }
        Err(e) => {
            eprintln!("Error listing workspaces: {}", e);
        }
    }
}

fn print_workspace_partial_status(status: &core::WorkspacePartialStatus) {
    let flags = match (status.has_changes, status.has_conflicts) {
        (true, true) => " [changes] [CONFLICTS]",
        (true, false) => " [changes]",
        (false, true) => " [CONFLICTS]",
        (false, false) => "",
    };
    println!("  {} {}{}", "●", status.current.branch_name, flags);
    if let Some(ref intent) = status.current.intent {
        println!("    Intent: {}", intent);
    }
    if let Some(ref target) = status.current.target_branch {
        println!("    Target: {}", target);
    }
}

fn print_workspace_status_detail(status: &core::WorkspaceStatus) {
    println!("Workspace: {}", status.partial.current.branch_name);
    if let Some(ref intent) = status.partial.current.intent {
        println!("  Intent: {}", intent);
    }
    if let Some(ref target) = &status.target {
        println!("  Target: {}", target.branch_name);
    }
    println!(
        "  Changes: {}",
        if status.partial.has_changes {
            "yes"
        } else {
            "no"
        }
    );
    println!(
        "  Conflicts: {}",
        if status.partial.has_conflicts {
            "YES"
        } else {
            "no"
        }
    );
    println!("  Commits ahead: {}", status.commits_ahead_of_target.len());

    if !status.children.is_empty() {
        println!("  Children:");
        for child in &status.children {
            println!("    - {}", child.branch_name);
        }
    }

    if !status.commits_ahead_of_target.is_empty() {
        println!("  Commits:");
        for commit in &status.commits_ahead_of_target {
            let msg = commit.message.lines().next().unwrap_or("");
            println!("    {} {}", &commit.hash[..8.min(commit.hash.len())], msg);
        }
    }
}
