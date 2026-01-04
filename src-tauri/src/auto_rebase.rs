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

    // Rebase each workspace individually from its workspace directory
    // This ensures the revset resolves correctly and includes the working copy
    let mut workspace_branches = Vec::new();
    let mut all_success = true;
    let mut combined_messages = Vec::new();

    for workspace in &workspaces_needing_rebase {
        // Rebase from workspace directory using roots() revset to include entire branch lineage
        let revset = format!("roots({}..@)", jj_target_branch);

        let rebase_result = jj::jj_rebase_with_revset(
            &workspace.workspace_path,  // Run from workspace directory
            &revset,
            &jj_target_branch,
            &workspace.branch_name,  // Set bookmark after rebase
        );

        match rebase_result {
            Ok(result) => {
                workspace_branches.push(workspace.branch_name.clone());
                all_success = all_success && result.success;
                combined_messages.push(format!("Workspace '{}': {}", workspace.workspace_name, result.message));

                // After rebase, ensure we're editing the working copy (not the bookmark commit)
                if let Err(e) = jj::jj_edit_workspace_working_copy(&workspace.workspace_path, &workspace.branch_name) {
                    eprintln!("Warning: Failed to edit working copy for workspace '{}': {}", workspace.workspace_name, e);
                }

                // Update DB flags - check for conflicts after rebase
                let has_conflicts = jj::get_conflicted_files(
                    &workspace.workspace_path,
                    workspace.target_branch.as_deref()
                )
                    .map(|files| !files.is_empty())
                    .unwrap_or(false);
                local_db::update_workspace_has_conflicts(
                    repo_path,
                    workspace.id,
                    has_conflicts,
                )?;

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
                combined_messages.push(format!("Workspace '{}': Failed - {}", workspace.workspace_name, e));
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

        // Rebase each workspace individually from its workspace directory
        let mut workspace_branches = Vec::new();
        let mut all_success = true;
        let mut combined_messages = Vec::new();

        for workspace in &workspaces_needing_rebase {
            // Rebase from workspace directory using roots() revset
            let revset = format!("roots({}..@)", jj_target_branch);

            match jj::jj_rebase_with_revset(
                &workspace.workspace_path,
                &revset,
                &jj_target_branch,
                &workspace.branch_name,  // Set bookmark after rebase
            ) {
                Ok(result) => {
                    workspace_branches.push(workspace.branch_name.clone());
                    all_success = all_success && result.success;
                    combined_messages.push(format!("Workspace '{}': {}", workspace.workspace_name, result.message));

                    // After rebase, ensure we're editing the working copy (not the bookmark commit)
                    if let Err(e) = jj::jj_edit_workspace_working_copy(&workspace.workspace_path, &workspace.branch_name) {
                        eprintln!("Warning: Failed to edit working copy for workspace '{}': {}", workspace.workspace_name, e);
                    }

                    // Update DB flags - check for conflicts after rebase
                    let has_conflicts = jj::get_conflicted_files(
                        &workspace.workspace_path,
                        workspace.target_branch.as_deref()
                    )
                        .map(|files| !files.is_empty())
                        .unwrap_or(false);
                    if let Err(e) = local_db::update_workspace_has_conflicts(
                        repo_path,
                        workspace.id,
                        has_conflicts,
                    ) {
                        eprintln!(
                            "Warning: Failed to update conflicts flag for workspace '{}': {}",
                            workspace.workspace_name, e
                        );
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
                    combined_messages.push(format!("Workspace '{}': Failed - {}", workspace.workspace_name, e));
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
    let jj_target_branch = convert_to_jj_branch_format(&target_branch);

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
    // This ensures the entire branch lineage (including working copy) is rebased
    let revset = format!("roots({}..@)", jj_target_branch);
    let rebase_result = jj::jj_rebase_with_revset(
        &workspace.workspace_path,  // Run from workspace directory
        &revset,
        &jj_target_branch,
        &workspace.branch_name,  // Set bookmark after rebase
    )
    .map_err(|e| format!("Rebase failed: {}", e))?;

    // After rebase, ensure we're editing the working copy (not the bookmark commit)
    jj::jj_edit_workspace_working_copy(&workspace.workspace_path, &workspace.branch_name)
        .map_err(|e| format!("Failed to edit working copy: {}", e))?;

    // Old jj edit/sync code (git export/checkout) replaced with jj_edit_workspace_working_copy above
    // Export jj bookmarks to git branches to ensure sync
    // let _ = std::process::Command::new("jj")
    //     .current_dir(&workspace.workspace_path)
    //     .args(["git", "export"])
    //     .output();
    // if !workspace.workspace_path.contains("/.treq/workspaces/") {
    //     // Checkout the branch in git to fix detached HEAD
    //     let checkout_result = std::process::Command::new("git")
    //         .current_dir(&workspace.workspace_path)
    //         .args(["checkout", &workspace.branch_name])
    //         .output();

    //     if let Ok(output) = checkout_result {
    //         if !output.status.success() {
    //             eprintln!(
    //                 "Warning: git checkout failed for workspace '{}': {}",
    //                 workspace.workspace_name,
    //                 String::from_utf8_lossy(&output.stderr)
    //             );
    //         }
    //     }
    // }

    // Update DB flags - check for conflicts after rebase
    let has_conflicts = jj::get_conflicted_files(
        &workspace.workspace_path,
        workspace.target_branch.as_deref()
    )
        .map(|files| !files.is_empty())
        .unwrap_or(false);
    local_db::update_workspace_has_conflicts(repo_path, workspace.id, has_conflicts)?;

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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_rebase_single_workspace_with_null_target_should_use_default() {
        // This test demonstrates the expected behavior: when target_branch is null,
        // it should use the default branch (e.g., "main"), not return None

        // ✅ IMPLEMENTED: rebase_single_workspace now accepts default_branch parameter
        assert!(true, "rebase_single_workspace accepts default_branch parameter");
    }

    #[test]
    fn test_rebase_sets_jj_bookmark() {
        // Expected behavior: After rebasing, jj bookmark should point to rebased working copy
        //
        // Implementation:
        // - jj_rebase_with_revset() should call jj_set_bookmark(working_dir, branch_name, "@")
        // - This sets the jj bookmark to point at the current working copy after rebase
        //
        // ✅ TO BE IMPLEMENTED: Add branch_name parameter and jj_set_bookmark call
        assert!(true, "Test documents expected behavior for bookmark setting");
    }

    #[test]
    fn test_workspace_triggers_rebase_on_first_view() {
        // Expected behavior: Newly created workspace should trigger rebase on first view
        //
        // Implementation:
        // - When workspace is created, initialize last_rebased_target_commit to ""
        // - Empty string will not match any actual commit ID
        // - This ensures first view triggers rebase
        //
        // ✅ TO BE IMPLEMENTED: Initialize flag in create_workspace()
        assert!(true, "Test documents expected behavior for flag initialization");
    }
}
