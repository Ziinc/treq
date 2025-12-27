use crate::jj::{self, JjRebaseResult};
use crate::local_db::{self, Workspace};
use std::collections::HashMap;

/// Result for auto-rebase operation on a group of workspaces
#[derive(Debug)]
pub struct AutoRebaseResult {
    pub target_branch: String,
    pub workspaces_rebased: Vec<String>,
    pub rebase_result: JjRebaseResult,
}

/// Convert git remote branch format to jj format
/// "origin/main" -> "main@origin"
fn convert_to_jj_branch_format(branch: &str) -> String {
    // Convert remote prefix format (e.g., "origin/main" -> "main@origin")
    if let Some(slash_pos) = branch.find('/') {
        let remote = &branch[..slash_pos];
        let branch_name = &branch[slash_pos + 1..];
        format!("{}@{}", branch_name, remote)
    } else {
        branch.to_string()
    }
}

/// Rebase workspaces targeting a specific branch if they have changes
pub fn rebase_workspaces_for_target(
    repo_path: &str,
    target_branch: &str,
) -> Result<Option<AutoRebaseResult>, String> {
    // Get all workspaces targeting this branch
    let workspaces = local_db::get_workspaces_by_target_branch(repo_path, target_branch)?;

    // Filter out workspaces where branch_name == target_branch (self-rebase)
    let workspaces: Vec<Workspace> = workspaces
        .into_iter()
        .filter(|w| w.branch_name != target_branch)
        .collect();

    if workspaces.is_empty() {
        return Ok(None);
    }

    // Convert target branch to jj format (origin/main -> main@origin)
    let jj_target_branch = convert_to_jj_branch_format(target_branch);

    // Get current target commit
    let current_target_commit = jj::jj_get_commit_id(repo_path, &jj_target_branch)
        .map_err(|e| format!("Failed to get target commit: {}", e))?;

    // Filter workspaces that need rebasing (where last_rebased_commit != current_commit)
    let workspaces_needing_rebase: Vec<&Workspace> = workspaces
        .iter()
        .filter(|w| {
            let last_rebased = local_db::get_workspace_last_rebased_commit(repo_path, w.id)
                .ok()
                .flatten();
            last_rebased.as_ref() != Some(&current_target_commit)
        })
        .collect();

    if workspaces_needing_rebase.is_empty() {
        return Ok(None); // All workspaces already up-to-date
    }

    // Collect branch names for rebase
    let workspace_branches: Vec<String> = workspaces_needing_rebase
        .iter()
        .map(|w| w.branch_name.clone())
        .collect();

    // Perform the multi-workspace rebase
    let rebase_result = jj::jj_rebase_workspaces_onto_target(
        repo_path,
        &jj_target_branch,
        workspace_branches.clone(),
    )
    .map_err(|e| format!("Rebase failed: {}", e))?;

    // Checkout each branch in git to keep git HEAD in sync with jj (avoid detached HEAD)
    for workspace in &workspaces_needing_rebase {
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

    // Update has_conflicts flag and last_rebased_commit for each workspace
    for workspace in &workspaces_needing_rebase {
        // For now, we'll mark all workspaces as potentially having conflicts if any conflict was detected
        // A more sophisticated approach would check each workspace individually
        local_db::update_workspace_has_conflicts(
            repo_path,
            workspace.id,
            rebase_result.has_conflicts,
        )?;

        // Track the commit we rebased onto
        local_db::update_workspace_last_rebased_commit(
            repo_path,
            workspace.id,
            &current_target_commit,
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
    let mut errors = Vec::new();

    for (target_branch, workspaces) in grouped {
        // Filter out workspaces where branch_name == target_branch (self-rebase)
        let workspaces: Vec<Workspace> = workspaces
            .into_iter()
            .filter(|w| w.branch_name != target_branch)
            .collect();

        if workspaces.is_empty() {
            continue;
        }

        // Convert target branch to jj format (origin/main -> main@origin)
        let jj_target_branch = convert_to_jj_branch_format(&target_branch);

        // Get current target commit
        let current_target_commit = match jj::jj_get_commit_id(repo_path, &jj_target_branch) {
            Ok(commit) => commit,
            Err(e) => {
                errors.push(format!(
                    "Failed to get commit ID for target '{}': {}",
                    target_branch, e
                ));
                continue;
            }
        };

        // Filter workspaces that need rebasing
        let workspaces_needing_rebase: Vec<&Workspace> = workspaces
            .iter()
            .filter(|w| {
                let last_rebased = local_db::get_workspace_last_rebased_commit(repo_path, w.id)
                    .ok()
                    .flatten();
                last_rebased.as_ref() != Some(&current_target_commit)
            })
            .collect();

        if workspaces_needing_rebase.is_empty() {
            continue; // All workspaces already up-to-date
        }

        let workspace_branches: Vec<String> = workspaces_needing_rebase
            .iter()
            .map(|w| w.branch_name.clone())
            .collect();

        // Use match instead of ? to continue on error
        match jj::jj_rebase_workspaces_onto_target(
            repo_path,
            &jj_target_branch,
            workspace_branches.clone(),
        ) {
            Ok(rebase_result) => {
                // Checkout each branch in git to keep git HEAD in sync with jj (avoid detached HEAD)
                for workspace in &workspaces_needing_rebase {
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

                // Update has_conflicts flag and last_rebased_commit for each workspace in this group
                for workspace in &workspaces_needing_rebase {
                    if let Err(e) = local_db::update_workspace_has_conflicts(
                        repo_path,
                        workspace.id,
                        rebase_result.has_conflicts,
                    ) {
                        eprintln!(
                            "Warning: Failed to update conflicts flag for workspace '{}': {}",
                            workspace.workspace_name, e
                        );
                    }

                    // Track the commit we rebased onto
                    if let Err(e) = local_db::update_workspace_last_rebased_commit(
                        repo_path,
                        workspace.id,
                        &current_target_commit,
                    ) {
                        eprintln!(
                            "Warning: Failed to update last rebased commit for workspace '{}': {}",
                            workspace.workspace_name, e
                        );
                    }
                }

                results.push(AutoRebaseResult {
                    target_branch: target_branch.clone(),
                    workspaces_rebased: workspace_branches,
                    rebase_result,
                });
            }
            Err(e) => {
                errors.push(format!("Failed to rebase target '{}': {}", target_branch, e));
                // Continue processing other groups
            }
        }
    }

    // Log errors but don't fail the entire operation
    for error in &errors {
        eprintln!("Auto-rebase warning: {}", error);
    }

    Ok(results)
}
