use crate::jj::{self, JjRebaseResult};
use crate::local_db::{self, Workspace};
use std::collections::HashMap;

/// Reconstruct full workspace path from a Workspace object.
/// The workspace_path in DB may be just the directory name, so we prepend
/// {repo_path}/.treq/workspaces/ if it's not already an absolute path.
fn get_full_workspace_path(workspace: &Workspace) -> String {
    if workspace.workspace_path.starts_with("/") {
        workspace.workspace_path.clone()
    } else {
        format!(
            "{}/.treq/workspaces/{}",
            workspace.repo_path, workspace.workspace_path
        )
    }
}

/// Result for auto-rebase operation on a group of workspaces
#[derive(Debug)]
pub struct AutoRebaseResult {
    pub target_branch: String,
    pub workspaces_rebased: Vec<String>,
    pub rebase_result: JjRebaseResult,
}

/// Convert git remote branch format to jj format using centralized logic
fn convert_to_jj_branch_format(branch: &str, repo_path: &str) -> String {
    jj::convert_git_branch_to_jj_format_public(branch, repo_path)
}

/// Rebase workspaces targeting a specific branch if they have changes
pub fn rebase_workspaces_for_target(
    repo_path: &str,
    target_branch: &str,
    conflict_marker_style: &str,
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
    let jj_target_branch = convert_to_jj_branch_format(target_branch, repo_path);

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

    // Rebase each workspace individually from its workspace directory
    // This ensures the revset resolves correctly and includes the working copy
    let mut workspace_branches = Vec::new();
    let mut all_success = true;
    let mut combined_messages = Vec::new();

    for workspace in &workspaces_needing_rebase {
        // Rebase from workspace directory using roots() revset to include entire branch lineage
        // Use workspace bookmark instead of @ to work only with committed changes
        let revset = format!("roots({}..{})", jj_target_branch, workspace.branch_name);

        let full_path = get_full_workspace_path(workspace);
        let rebase_result = jj::jj_rebase_with_revset(
            &full_path, // Run from workspace directory
            &revset,
            &jj_target_branch,
            &workspace.branch_name, // Set bookmark after rebase
            conflict_marker_style,
        );

        match rebase_result {
            Ok(result) => {
                workspace_branches.push(workspace.branch_name.clone());
                all_success = all_success && result.success;
                combined_messages.push(format!(
                    "Workspace '{}': {}",
                    workspace.workspace_name, result.message
                ));

                // Auto-sync working copy to bookmark if safe (empty working copy)
                // This runs FROM the workspace directory to avoid staleness
                match jj::jj_sync_working_copy_if_safe(&full_path, &workspace.branch_name) {
                    Ok(true) => {
                        log::info!(
                            "Auto-synced working copy for workspace '{}'",
                            workspace.workspace_name
                        );
                    }
                    Ok(false) => {
                        // Skipped (already synced or has uncommitted changes) - this is fine
                    }
                    Err(e) => {
                        eprintln!(
                            "Warning: Failed to auto-sync working copy for workspace '{}': {}",
                            workspace.workspace_name, e
                        );
                        // Don't fail entire rebase - bookmark is correctly rebased
                    }
                }

                local_db::update_workspace_last_rebased_commit(
                    repo_path,
                    workspace.id,
                    &current_target_commit,
                )?;
            }
            Err(e) => {
                eprintln!(
                    "Warning: Failed to rebase workspace '{}': {}",
                    workspace.workspace_name, e
                );
                all_success = false;
                combined_messages.push(format!(
                    "Workspace '{}': Failed - {}",
                    workspace.workspace_name, e
                ));
            }
        }
    }

    Ok(Some(AutoRebaseResult {
        target_branch: target_branch.to_string(),
        workspaces_rebased: workspace_branches,
        rebase_result: jj::JjRebaseResult {
            success: all_success,
            message: combined_messages.join("\n"),
        },
    }))
}

/// Called after a commit - rebase workspaces that target the committed branch
pub fn rebase_after_commit(
    repo_path: &str,
    committed_branch: &str,
) -> Result<Option<AutoRebaseResult>, String> {
    // Rebase all workspaces targeting the committed branch
    // Use default "diff" style for fire-and-forget background rebase
    rebase_workspaces_for_target(repo_path, committed_branch, "diff")
}

/// Check and rebase all workspaces in the repo, grouped by target branch
pub fn check_and_rebase_all(repo_path: &str, conflict_marker_style: &str) -> Result<Vec<AutoRebaseResult>, String> {
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
        let jj_target_branch = convert_to_jj_branch_format(&target_branch, repo_path);

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

        // Rebase each workspace individually from its workspace directory
        let mut workspace_branches = Vec::new();
        let mut all_success = true;
        let mut combined_messages = Vec::new();

        for workspace in &workspaces_needing_rebase {
            // Rebase from workspace directory using roots() revset
            // Use workspace bookmark instead of @ to work only with committed changes
            let revset = format!("roots({}..{})", jj_target_branch, workspace.branch_name);
            let full_path = get_full_workspace_path(workspace);

            match jj::jj_rebase_with_revset(
                &full_path,
                &revset,
                &jj_target_branch,
                &workspace.branch_name, // Set bookmark after rebase
                conflict_marker_style,
            ) {
                Ok(result) => {
                    workspace_branches.push(workspace.branch_name.clone());
                    all_success = all_success && result.success;
                    combined_messages.push(format!(
                        "Workspace '{}': {}",
                        workspace.workspace_name, result.message
                    ));

                    // Auto-sync working copy to bookmark if safe (empty working copy)
                    // This runs FROM the workspace directory to avoid staleness
                    match jj::jj_sync_working_copy_if_safe(&full_path, &workspace.branch_name) {
                        Ok(true) => {
                            log::info!(
                                "Auto-synced working copy for workspace '{}'",
                                workspace.workspace_name
                            );
                        }
                        Ok(false) => {} // Skipped - this is fine
                        Err(e) => {
                            eprintln!(
                                "Warning: Failed to auto-sync working copy for workspace '{}': {}",
                                workspace.workspace_name, e
                            );
                        }
                    }

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
                Err(e) => {
                    eprintln!(
                        "Warning: Failed to rebase workspace '{}': {}",
                        workspace.workspace_name, e
                    );
                    all_success = false;
                    combined_messages.push(format!(
                        "Workspace '{}': Failed - {}",
                        workspace.workspace_name, e
                    ));
                }
            }
        }

        if !workspace_branches.is_empty() {
            results.push(AutoRebaseResult {
                target_branch: target_branch.clone(),
                workspaces_rebased: workspace_branches,
                rebase_result: jj::JjRebaseResult {
                    success: all_success,
                    message: combined_messages.join("\n"),
                },
            });
        }
    }

    // Log errors but don't fail the entire operation
    for error in &errors {
        eprintln!("Auto-rebase warning: {}", error);
    }

    Ok(results)
}

/// Rebase a single workspace if it's in detached HEAD state or needs rebasing
/// Returns Some(result) if rebase was performed, None if no rebase needed
/// If force is true, bypasses the needs_rebase check and always performs rebase
pub fn rebase_single_workspace(
    repo_path: &str,
    workspace_id: i64,
    default_branch: &str,
    force: bool,
    conflict_marker_style: &str,
) -> Result<Option<AutoRebaseResult>, String> {
    // Get the specific workspace from DB
    let workspace = local_db::get_workspace_by_id(repo_path, workspace_id)?
        .ok_or_else(|| format!("Workspace {} not found", workspace_id))?;

    // Use workspace target_branch if set, otherwise use default_branch
    let target_branch = workspace
        .target_branch
        .as_ref()
        .unwrap_or(&default_branch.to_string())
        .clone();

    // Skip if branch_name == target_branch (self-rebase)
    if workspace.branch_name == target_branch {
        return Ok(None);
    }

    // Convert target branch to jj format
    let jj_target_branch = convert_to_jj_branch_format(&target_branch, repo_path);

    // Get current target commit
    let current_target_commit = jj::jj_get_commit_id(repo_path, &jj_target_branch)
        .map_err(|e| format!("Failed to get target commit: {}", e))?;

    // Check if rebase is needed (last_rebased_commit differs from current)
    // Skip check if force is true
    if !force {
        let last_rebased = local_db::get_workspace_last_rebased_commit(repo_path, workspace.id)
            .ok()
            .flatten();

        let needs_rebase = last_rebased.as_ref() != Some(&current_target_commit);

        if !needs_rebase {
            return Ok(None);
        }
    }

    // Perform the rebase from workspace directory using roots() revset
    // Use workspace bookmark instead of @ to work only with committed changes
    let revset = format!("roots({}..{})", jj_target_branch, workspace.branch_name);
    let full_path = get_full_workspace_path(&workspace);
    let rebase_result = jj::jj_rebase_with_revset(
        &full_path, // Run from workspace directory
        &revset,
        &jj_target_branch,
        &workspace.branch_name, // Set bookmark after rebase
        conflict_marker_style,
    )
    .map_err(|e| format!("Rebase failed: {}", e))?;

    // Auto-sync working copy to bookmark if safe (empty working copy)
    // This runs FROM the workspace directory to avoid staleness
    match jj::jj_sync_working_copy_if_safe(&full_path, &workspace.branch_name) {
        Ok(true) => {
            log::info!(
                "Auto-synced working copy for workspace '{}'",
                workspace.workspace_name
            );
        }
        Ok(false) => {} // Skipped - this is fine
        Err(e) => {
            eprintln!(
                "Warning: Failed to auto-sync working copy for workspace '{}': {}",
                workspace.workspace_name, e
            );
            // For single workspace rebase, we log warning but don't fail
            // The bookmark rebase succeeded, which is the primary goal
        }
    }

    local_db::update_workspace_last_rebased_commit(
        repo_path,
        workspace.id,
        &current_target_commit,
    )?;

    Ok(Some(AutoRebaseResult {
        target_branch,
        workspaces_rebased: vec![workspace.branch_name],
        rebase_result,
    }))
}
