use git2::{Repository, StatusOptions, Status as Git2Status, BranchType};
use crate::git::{GitStatus, BranchInfo, BranchDivergence};

/// Get git status using libgit2 (no subprocess)
pub fn get_status_git2(workspace_path: &str) -> Result<GitStatus, String> {
    let repo = Repository::open(workspace_path)
        .map_err(|e| format!("Failed to open repository: {}", e))?;

    let mut opts = StatusOptions::new();
    opts.include_untracked(true)
        .recurse_untracked_dirs(false) // Don't recurse to match git status behavior
        .exclude_submodules(true);

    let statuses = repo.statuses(Some(&mut opts))
        .map_err(|e| format!("Failed to get status: {}", e))?;

    let mut result = GitStatus {
        modified: 0,
        added: 0,
        deleted: 0,
        untracked: 0,
    };

    for entry in statuses.iter() {
        let status = entry.status();

        // Index (staged) changes
        if status.contains(Git2Status::INDEX_NEW) {
            result.added += 1;
        }
        if status.contains(Git2Status::INDEX_MODIFIED) {
            result.modified += 1;
        }
        if status.contains(Git2Status::INDEX_DELETED) {
            result.deleted += 1;
        }

        // Worktree (unstaged) changes
        if status.contains(Git2Status::WT_MODIFIED) {
            result.modified += 1;
        }
        if status.contains(Git2Status::WT_DELETED) {
            result.deleted += 1;
        }
        if status.contains(Git2Status::WT_NEW) {
            result.untracked += 1;
        }
    }

    Ok(result)
}

/// Get branch info using libgit2
pub fn get_branch_info_git2(workspace_path: &str) -> Result<BranchInfo, String> {
    let repo = Repository::open(workspace_path)
        .map_err(|e| format!("Failed to open repository: {}", e))?;

    let head = repo.head()
        .map_err(|e| format!("Failed to get HEAD: {}", e))?;

    let branch_name = if head.is_branch() {
        head.shorthand().unwrap_or("HEAD").to_string()
    } else {
        // Detached HEAD
        let commit = head.peel_to_commit()
            .map_err(|e| format!("Failed to get commit: {}", e))?;
        format!("HEAD (detached at {})", &commit.id().to_string()[..7])
    };

    // Get upstream info
    let (upstream, ahead, behind) = if head.is_branch() {
        get_upstream_info(&repo, &head)
    } else {
        (None, 0, 0)
    };

    Ok(BranchInfo {
        name: branch_name,
        ahead,
        behind,
        upstream,
    })
}

fn get_upstream_info(repo: &Repository, head: &git2::Reference) -> (Option<String>, usize, usize) {
    let branch_name = match head.shorthand() {
        Some(name) => name,
        None => return (None, 0, 0),
    };

    let branch = match repo.find_branch(branch_name, BranchType::Local) {
        Ok(b) => b,
        Err(_) => return (None, 0, 0),
    };

    let upstream = match branch.upstream() {
        Ok(u) => u,
        Err(_) => return (None, 0, 0),
    };

    let upstream_name = upstream.name()
        .ok()
        .flatten()
        .map(|s| s.to_string());

    // Calculate ahead/behind
    let local_oid = match head.target() {
        Some(oid) => oid,
        None => return (upstream_name, 0, 0),
    };

    let upstream_oid = match upstream.get().target() {
        Some(oid) => oid,
        None => return (upstream_name, 0, 0),
    };

    let (ahead, behind) = match repo.graph_ahead_behind(local_oid, upstream_oid) {
        Ok(counts) => counts,
        Err(_) => (0, 0),
    };

    (upstream_name, ahead, behind)
}

/// Get divergence from base branch using libgit2
pub fn get_divergence_git2(
    workspace_path: &str,
    base_branch: &str,
) -> Result<BranchDivergence, String> {
    let repo = Repository::open(workspace_path)
        .map_err(|e| format!("Failed to open repository: {}", e))?;

    let head = repo.head()
        .map_err(|e| format!("Failed to get HEAD: {}", e))?;

    let head_oid = head.target()
        .ok_or("Failed to get HEAD target")?;

    // Try to find base branch locally first, then in remotes
    let base_ref = repo.find_reference(&format!("refs/heads/{}", base_branch))
        .or_else(|_| repo.find_reference(&format!("refs/remotes/origin/{}", base_branch)))
        .map_err(|e| format!("Failed to find base branch '{}': {}", base_branch, e))?;

    let base_oid = base_ref.target()
        .ok_or("Failed to get base branch target")?;

    let (ahead, behind) = repo.graph_ahead_behind(head_oid, base_oid)
        .map_err(|e| format!("Failed to calculate divergence: {}", e))?;

    Ok(BranchDivergence { ahead, behind })
}
