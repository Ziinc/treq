use crate::jj::{self, BookmarkConflictCommit, JjRebaseResult};
use crate::local_db::{self, Workspace};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};

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
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AutoRebaseResult {
    pub target_branch: String,
    pub workspaces_rebased: Vec<String>,
    pub rebase_result: JjRebaseResult,
    pub bookmark_conflicts: Vec<WorkspaceBookmarkConflict>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkspaceBookmarkConflict {
    pub workspace_id: i64,
    pub workspace_name: String,
    pub workspace_path: String,
    pub branch_name: String,
    pub bookmark: String,
    pub commits: Vec<BookmarkConflictCommit>,
}

/// Convert git remote branch format to jj format using centralized logic
fn convert_to_jj_branch_format(branch: &str, repo_path: &str) -> String {
    jj::convert_git_branch_to_jj_format_public(branch, repo_path)
}

struct BookmarkConflictResolution {
    _was_conflicted: bool,
    _local_commits_rebased: usize,
}

/// If `branch_name` is conflicted (local and remote diverged), resolve it by:
/// 1. Capturing local-only mutable commits
/// 2. Pointing the local bookmark to the remote tip
/// 3. Rebasing any local commits onto the new tip
/// Returns early (not conflicted) if bookmark is clean.
fn resolve_bookmark_conflict_if_needed(
    workspace_path: &str,
    branch_name: &str,
    conflict_marker_style: &str,
) -> Result<BookmarkConflictResolution, String> {
    if !jj::jj_is_bookmark_conflicted(workspace_path, branch_name) {
        return Ok(BookmarkConflictResolution {
            _was_conflicted: false,
            _local_commits_rebased: 0,
        });
    }

    // Capture local-only commits before resolving the bookmark
    let remote_ref = format!("{}@origin", branch_name);
    let local_revset = format!("({}..@-) & mutable()", remote_ref);
    let local_commit_ids = jj::jj_log_revset_commit_ids(workspace_path, &local_revset)
        .map_err(|e| format!("Failed to capture local commits: {}", e))?;

    let commits_rebased = local_commit_ids.len();

    // Resolve: point local bookmark to remote tip
    jj::jj_set_bookmark(workspace_path, branch_name, &remote_ref)
        .map_err(|e| format!("Failed to resolve bookmark conflict: {}", e))?;

    // Rebase local commits onto resolved bookmark (if any exist)
    if !local_commit_ids.is_empty() {
        let ids_revset = local_commit_ids.join(" | ");
        let roots_revset = format!("roots({})", ids_revset);

        jj::jj_rebase_with_revset(
            workspace_path,
            &roots_revset,
            branch_name,
            branch_name,
            conflict_marker_style,
        )
        .map_err(|e| {
            format!(
                "Failed to rebase local commits after conflict resolution: {}",
                e
            )
        })?;
    }

    log::debug!(
        "Resolved bookmark conflict for '{}': rebased {} local commit(s) onto remote tip",
        branch_name,
        commits_rebased
    );

    Ok(BookmarkConflictResolution {
        _was_conflicted: true,
        _local_commits_rebased: commits_rebased,
    })
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

    // Rebase each workspace from its directory so revset resolution includes the working copy.
    let mut workspace_branches = Vec::new();
    let mut all_success = true;
    let mut combined_messages = Vec::new();
    let mut bookmark_conflicts = Vec::new();

    for workspace in &workspaces_needing_rebase {
        let full_path = get_full_workspace_path(workspace);

        // Resolve bookmark conflicts before building revsets like roots(target..branch_name).
        if let Err(e) = resolve_bookmark_conflict_if_needed(
            &full_path,
            &workspace.branch_name,
            conflict_marker_style,
        ) {
            eprintln!(
                "Warning: Failed to resolve bookmark conflict for workspace '{}': {}",
                workspace.workspace_name, e
            );
            all_success = false;
            combined_messages.push(format!(
                "Workspace '{}': Failed to resolve conflict - {}",
                workspace.workspace_name, e
            ));
            continue;
        }

        // Use roots() from the workspace directory and rebase committed bookmark history only.
        let revset = format!("roots({}..{})", jj_target_branch, workspace.branch_name);

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

                // Auto-sync working copy when safe (empty working copy) from the workspace dir.
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
                    Err(jj::JjError::BookmarkConflict(info)) => {
                        bookmark_conflicts.push(WorkspaceBookmarkConflict {
                            workspace_id: workspace.id,
                            workspace_name: workspace.workspace_name.clone(),
                            workspace_path: full_path.clone(),
                            branch_name: workspace.branch_name.clone(),
                            bookmark: info.bookmark.clone(),
                            commits: info.commits.clone(),
                        });
                        eprintln!(
                            "Warning: Working copy for workspace '{}' has conflicted bookmark '{}'",
                            workspace.workspace_name, info.bookmark
                        );
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
        bookmark_conflicts,
    }))
}

/// Called after a commit - rebase workspaces that target the committed branch
pub fn rebase_after_commit(
    repo_path: &str,
    committed_branch: &str,
) -> Result<Option<AutoRebaseResult>, String> {
    // Rebase all workspaces targeting this branch using default "diff" markers.
    rebase_workspaces_for_target(repo_path, committed_branch, "diff")
}

/// Check and rebase all workspaces in the repo, grouped by target branch
pub fn check_and_rebase_all(
    repo_path: &str,
    conflict_marker_style: &str,
) -> Result<Vec<AutoRebaseResult>, String> {
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
        let mut bookmark_conflicts = Vec::new();

        for workspace in &workspaces_needing_rebase {
            let full_path = get_full_workspace_path(workspace);

            // Resolve bookmark conflicts before building revsets like roots(target..branch_name).
            if let Err(e) = resolve_bookmark_conflict_if_needed(
                &full_path,
                &workspace.branch_name,
                conflict_marker_style,
            ) {
                eprintln!(
                    "Warning: Failed to resolve bookmark conflict for workspace '{}': {}",
                    workspace.workspace_name, e
                );
                all_success = false;
                combined_messages.push(format!(
                    "Workspace '{}': Failed to resolve conflict - {}",
                    workspace.workspace_name, e
                ));
                continue;
            }

            // Rebase using roots() from workspace dir and only committed bookmark history.
            let revset = format!("roots({}..{})", jj_target_branch, workspace.branch_name);

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

                    // Auto-sync working copy when safe (empty working copy) from workspace dir.
                    match jj::jj_sync_working_copy_if_safe(&full_path, &workspace.branch_name) {
                        Ok(true) => {
                            log::info!(
                                "Auto-synced working copy for workspace '{}'",
                                workspace.workspace_name
                            );
                        }
                        Ok(false) => {} // Skipped - this is fine
                        Err(jj::JjError::BookmarkConflict(info)) => {
                            bookmark_conflicts.push(WorkspaceBookmarkConflict {
                                workspace_id: workspace.id,
                                workspace_name: workspace.workspace_name.clone(),
                                workspace_path: full_path.clone(),
                                branch_name: workspace.branch_name.clone(),
                                bookmark: info.bookmark.clone(),
                                commits: info.commits.clone(),
                            });
                            eprintln!(
                                "Warning: Working copy for workspace '{}' has conflicted bookmark '{}'",
                                workspace.workspace_name, info.bookmark
                            );
                        }
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
                bookmark_conflicts,
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

    // Skip the needs-rebase check only when force=true.
    if !force {
        let last_rebased = local_db::get_workspace_last_rebased_commit(repo_path, workspace.id)
            .ok()
            .flatten();

        let needs_rebase = last_rebased.as_ref() != Some(&current_target_commit);

        if !needs_rebase {
            return Ok(None);
        }
    }

    let full_path = get_full_workspace_path(&workspace);

    // Resolve bookmark conflicts before building revsets like roots(target..branch_name).
    resolve_bookmark_conflict_if_needed(&full_path, &workspace.branch_name, conflict_marker_style)
        .map_err(|e| format!("Failed to resolve bookmark conflict: {}", e))?;

    // Rebase mutable committed history only, excluding @ to keep working copy anchored.
    let revset = format!(
        "roots(mutable() & ({}..{}) ~ @)",
        jj_target_branch, workspace.branch_name
    );
    let rebase_result = jj::jj_rebase_with_revset(
        &full_path, // Run from workspace directory
        &revset,
        &jj_target_branch,
        &workspace.branch_name, // Set bookmark after rebase
        conflict_marker_style,
    )
    .map_err(|e| format!("Rebase failed: {}", e))?;

    // Auto-sync working copy when safe (empty working copy) from workspace dir.
    let mut bookmark_conflicts = Vec::new();
    match jj::jj_sync_working_copy_if_safe(&full_path, &workspace.branch_name) {
        Ok(true) => {
            log::info!(
                "Auto-synced working copy for workspace '{}'",
                workspace.workspace_name
            );
        }
        Ok(false) => {} // Skipped - this is fine
        Err(jj::JjError::BookmarkConflict(info)) => {
            bookmark_conflicts.push(WorkspaceBookmarkConflict {
                workspace_id: workspace.id,
                workspace_name: workspace.workspace_name.clone(),
                workspace_path: full_path.clone(),
                branch_name: workspace.branch_name.clone(),
                bookmark: info.bookmark.clone(),
                commits: info.commits.clone(),
            });
            eprintln!(
                "Warning: Working copy for workspace '{}' has conflicted bookmark '{}'",
                workspace.workspace_name, info.bookmark
            );
        }
        Err(e) => {
            eprintln!(
                "Warning: Failed to auto-sync working copy for workspace '{}': {}",
                workspace.workspace_name, e
            );
            // For single-workspace rebase, log sync failures without failing successful bookmark rebase.
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
        bookmark_conflicts,
    }))
}

fn resolve_rooted_subtree_ordered(
    workspaces: &[Workspace],
    start_workspace_id: i64,
) -> Result<(Workspace, Vec<Workspace>), String> {
    let by_id: HashMap<i64, &Workspace> = workspaces.iter().map(|w| (w.id, w)).collect();
    let by_branch: HashMap<String, &Workspace> = workspaces
        .iter()
        .map(|w| (w.branch_name.clone(), w))
        .collect();
    let start = by_id
        .get(&start_workspace_id)
        .ok_or_else(|| format!("Workspace {} not found", start_workspace_id))?;

    let mut root = *start;
    let mut seen = HashSet::new();
    seen.insert(root.branch_name.clone());
    while let Some(target_branch) = &root.target_branch {
        if target_branch == &root.branch_name {
            break;
        }
        let Some(parent) = by_branch.get(target_branch) else {
            break;
        };
        if !seen.insert(parent.branch_name.clone()) {
            break;
        }
        root = parent;
    }

    let mut children_by_branch: HashMap<String, Vec<&Workspace>> = HashMap::new();
    for ws in workspaces {
        if let Some(target) = &ws.target_branch {
            children_by_branch
                .entry(target.clone())
                .or_default()
                .push(ws);
        }
    }
    for children in children_by_branch.values_mut() {
        children.sort_by(|a, b| a.branch_name.cmp(&b.branch_name));
    }

    let mut ordered = Vec::new();
    let mut stack = vec![root];
    let mut visited = HashSet::new();
    while let Some(node) = stack.pop() {
        if !visited.insert(node.branch_name.clone()) {
            continue;
        }
        ordered.push(node.clone());
        if let Some(children) = children_by_branch.get(&node.branch_name) {
            for child in children.iter().rev() {
                stack.push(child);
            }
        }
    }

    Ok((root.clone(), ordered))
}

pub fn rebase_root_subtree_from_workspace_force(
    repo_path: &str,
    workspace_id: i64,
    default_branch: &str,
    conflict_marker_style: &str,
) -> Result<Option<AutoRebaseResult>, String> {
    let workspaces = local_db::get_workspaces(repo_path)?;
    let (root, scoped) = resolve_rooted_subtree_ordered(&workspaces, workspace_id)?;
    if scoped.is_empty() {
        return Ok(None);
    }

    let mut workspace_branches = Vec::new();
    let mut all_success = true;
    let mut combined_messages = Vec::new();
    let mut bookmark_conflicts = Vec::new();
    let mut summary_target_branch = default_branch.to_string();

    for workspace in &scoped {
        if workspace.id == root.id {
            combined_messages.push(format!(
                "Workspace '{}': Skipped root workspace",
                workspace.workspace_name
            ));
            continue;
        }

        let target_branch = workspace
            .target_branch
            .clone()
            .unwrap_or_else(|| default_branch.to_string());
        summary_target_branch = target_branch.clone();
        if workspace.branch_name == target_branch {
            combined_messages.push(format!(
                "Workspace '{}': Skipped self-target rebase",
                workspace.workspace_name
            ));
            continue;
        }

        let full_path = get_full_workspace_path(workspace);
        if let Err(e) = resolve_bookmark_conflict_if_needed(
            &full_path,
            &workspace.branch_name,
            conflict_marker_style,
        ) {
            all_success = false;
            combined_messages.push(format!(
                "Workspace '{}': Failed to resolve conflict - {}",
                workspace.workspace_name, e
            ));
            continue;
        }

        match jj::jj_rebase_workspace_bookmark_onto_deferred_checkout(
            &full_path,
            &workspace.branch_name,
            &target_branch,
        ) {
            Ok(result) => {
                workspace_branches.push(workspace.branch_name.clone());
                all_success = all_success && result.success;
                combined_messages.push(format!(
                    "Workspace '{}': {} (wc refresh deferred)",
                    workspace.workspace_name, result.message
                ));

                if let Ok(current_target_commit) = jj::jj_get_commit_id(
                    repo_path,
                    &convert_to_jj_branch_format(&target_branch, repo_path),
                ) {
                    let _ = local_db::update_workspace_last_rebased_commit(
                        repo_path,
                        workspace.id,
                        &current_target_commit,
                    );
                }

                match jj::jj_sync_working_copy_if_safe(&full_path, &workspace.branch_name) {
                    Ok(_) => {}
                    Err(jj::JjError::BookmarkConflict(info)) => {
                        bookmark_conflicts.push(WorkspaceBookmarkConflict {
                            workspace_id: workspace.id,
                            workspace_name: workspace.workspace_name.clone(),
                            workspace_path: full_path.clone(),
                            branch_name: workspace.branch_name.clone(),
                            bookmark: info.bookmark.clone(),
                            commits: info.commits.clone(),
                        });
                    }
                    Err(_) => {}
                }
            }
            Err(e) => {
                all_success = false;
                combined_messages.push(format!(
                    "Workspace '{}': Failed - {}",
                    workspace.workspace_name, e
                ));
            }
        }
    }

    Ok(Some(AutoRebaseResult {
        target_branch: summary_target_branch,
        workspaces_rebased: workspace_branches,
        rebase_result: JjRebaseResult {
            success: all_success,
            message: combined_messages.join("\n"),
        },
        bookmark_conflicts,
    }))
}

#[cfg(test)]
mod tests {
    use super::resolve_rooted_subtree_ordered;
    use crate::local_db::Workspace;

    fn ws(id: i64, branch: &str, target: Option<&str>) -> Workspace {
        Workspace {
            id,
            repo_path: "/tmp/repo".to_string(),
            workspace_name: branch.to_string(),
            workspace_path: format!("ws-{}", id),
            branch_name: branch.to_string(),
            created_at: "".to_string(),
            refreshed_at: None,
            metadata: None,
            target_branch: target.map(ToString::to_string),
            intent: None,
            moved_files: None,
            not_on_remote: false,
        }
    }

    #[test]
    fn rooted_subtree_scope_includes_siblings_and_cousins() {
        let workspaces = vec![
            ws(1, "A", Some("main")),
            ws(2, "B", Some("A")),
            ws(3, "C", Some("B")),
            ws(4, "D", Some("A")),
        ];

        let (_, from_b) = resolve_rooted_subtree_ordered(&workspaces, 2).unwrap();
        let (_, from_c) = resolve_rooted_subtree_ordered(&workspaces, 3).unwrap();
        let branches_from_b: Vec<String> = from_b.into_iter().map(|w| w.branch_name).collect();
        let branches_from_c: Vec<String> = from_c.into_iter().map(|w| w.branch_name).collect();
        assert_eq!(branches_from_b, vec!["A", "B", "C", "D"]);
        assert_eq!(branches_from_c, vec!["A", "B", "C", "D"]);
    }
}
