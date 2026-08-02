use crate::core;

pub(crate) fn print_workspace_partial_status(status: &core::WorkspaceSidebarStatus) {
    let flags = if status.has_conflicts {
        " [CONFLICTS]"
    } else {
        ""
    };
    println!("  {} {}{}", "●", status.current.branch_name, flags);
    if let Some(ref description) = status.current.description {
        println!("    Description: {}", description);
    }
    if let Some(ref target) = status.current.target_branch {
        println!("    Target: {}", target);
    }
}

pub(crate) fn print_workspace_status_detail(status: &core::WorkspaceStatus) {
    println!("Workspace: {}", status.partial.current.branch_name);
    if let Some(ref description) = status.partial.current.description {
        println!("  Description: {}", description);
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
