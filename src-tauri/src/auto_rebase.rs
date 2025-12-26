use crate::db::Workspace;
use crate::jj::{self, JjRebaseResult};
use crate::local_db;
use std::collections::HashMap;

/// Result for auto-rebase operation on a group of workspaces
#[derive(Debug)]
pub struct AutoRebaseResult {
    pub target_branch: String,
    pub workspaces_rebased: Vec<String>,
    pub rebase_result: JjRebaseResult,
}

/// Rebase workspaces targeting a specific branch if they have changes
pub fn rebase_workspaces_for_target(
    repo_path: &str,
    target_branch: &str,
) -> Result<Option<AutoRebaseResult>, String> {
    // Get all workspaces targeting this branch
    let workspaces = local_db::get_workspaces_by_target_branch(repo_path, target_branch)?;

    if workspaces.is_empty() {
        return Ok(None);
    }

    // Collect branch names for rebase
    let workspace_branches: Vec<String> = workspaces
        .iter()
        .map(|w| w.branch_name.clone())
        .collect();

    // Perform the multi-workspace rebase
    let rebase_result = jj::jj_rebase_workspaces_onto_target(
        repo_path,
        target_branch,
        workspace_branches.clone(),
    )
    .map_err(|e| format!("Rebase failed: {}", e))?;

    // Checkout each branch in git to keep git HEAD in sync with jj (avoid detached HEAD)
    for workspace in &workspaces {
        let checkout_result = std::process::Command::new("git")
            .current_dir(&workspace.workspace_path)
            .args(["checkout", &workspace.branch_name])
            .output();

        if let Err(e) = checkout_result {
            eprintln!(
                "Warning: Failed to checkout git branch '{}' in workspace '{}': {}",
                workspace.branch_name, workspace.workspace_name, e
            );
        }
    }

    // Update has_conflicts flag for each workspace
    for workspace in &workspaces {
        // For now, we'll mark all workspaces as potentially having conflicts if any conflict was detected
        // A more sophisticated approach would check each workspace individually
        local_db::update_workspace_has_conflicts(
            repo_path,
            workspace.id,
            rebase_result.has_conflicts,
        )?;
    }

    Ok(Some(AutoRebaseResult {
        target_branch: target_branch.to_string(),
        workspaces_rebased: workspace_branches,
        rebase_result,
    }))
}

/// Called after a commit - rebase workspaces that target the committed branch
pub fn rebase_after_commit(
    repo_path: &str,
    committed_branch: &str,
) -> Result<Option<AutoRebaseResult>, String> {
    // Rebase all workspaces targeting the committed branch
    rebase_workspaces_for_target(repo_path, committed_branch)
}

/// Check and rebase all workspaces in the repo, grouped by target branch
pub fn check_and_rebase_all(repo_path: &str) -> Result<Vec<AutoRebaseResult>, String> {
    // Get all workspaces
    let all_workspaces = local_db::get_workspaces(repo_path)?;

    // Group workspaces by their target_branch
    let mut grouped: HashMap<String, Vec<Workspace>> = HashMap::new();
    for workspace in all_workspaces {
        if let Some(target) = &workspace.target_branch {
            grouped
                .entry(target.clone())
                .or_insert_with(Vec::new)
                .push(workspace);
        }
    }

    // Rebase each group
    let mut results = Vec::new();
    for (target_branch, workspaces) in grouped {
        let workspace_branches: Vec<String> = workspaces
            .iter()
            .map(|w| w.branch_name.clone())
            .collect();

        let rebase_result = jj::jj_rebase_workspaces_onto_target(
            repo_path,
            &target_branch,
            workspace_branches.clone(),
        )
        .map_err(|e| format!("Rebase failed for target '{}': {}", target_branch, e))?;

        // Checkout each branch in git to keep git HEAD in sync with jj (avoid detached HEAD)
        for workspace in &workspaces {
            let checkout_result = std::process::Command::new("git")
                .current_dir(&workspace.workspace_path)
                .args(["checkout", &workspace.branch_name])
                .output();

            if let Err(e) = checkout_result {
                eprintln!(
                    "Warning: Failed to checkout git branch '{}' in workspace '{}': {}",
                    workspace.branch_name, workspace.workspace_name, e
                );
            }
        }

        // Update has_conflicts flag for each workspace in this group
        for workspace in &workspaces {
            local_db::update_workspace_has_conflicts(
                repo_path,
                workspace.id,
                rebase_result.has_conflicts,
            )?;
        }

        results.push(AutoRebaseResult {
            target_branch: target_branch.clone(),
            workspaces_rebased: workspace_branches,
            rebase_result,
        });
    }

    Ok(results)
}
