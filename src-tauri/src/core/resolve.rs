use std::collections::HashMap;
use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::jj;
use crate::local_db;

const RESOLVE_METADATA_KIND: &str = "resolve";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ResolveSide {
  Base,
  Side1,
  Side2,
}

impl ResolveSide {
  pub fn parse(raw: &str) -> Result<Self, String> {
    match raw.trim().to_ascii_lowercase().as_str() {
      "0" | "base" => Ok(Self::Base),
      "1" | "ours" | "left" | "side1" => Ok(Self::Side1),
      "2" | "theirs" | "right" | "side2" => Ok(Self::Side2),
      other => Err(format!(
        "Unknown conflict side '{}'. Expected 1/2/base/ours/theirs/both",
        other
      )),
    }
  }

  pub fn as_index(self) -> u8 {
    match self {
      Self::Base => 0,
      Self::Side1 => 1,
      Self::Side2 => 2,
    }
  }
}

/// Parse CLI side tokens. `both` expands to side1 then side2.
pub fn parse_resolve_sides(tokens: &[String]) -> Result<Vec<ResolveSide>, String> {
  let mut sides = Vec::new();
  for token in tokens {
    if token.eq_ignore_ascii_case("both") {
      sides.push(ResolveSide::Side1);
      sides.push(ResolveSide::Side2);
      continue;
    }
    sides.push(ResolveSide::parse(token)?);
  }
  Ok(sides)
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct ResolveWorkspaceMeta {
  kind: String,
  change_id: String,
  commit_id: String,
  source_workspace_id: Option<i64>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ResolveTarget {
  pub change_id: String,
  pub commit_id: String,
  pub description: String,
  pub conflicted_files: Vec<String>,
  pub resolve_path: String,
  pub workspace_id: i64,
  pub workspace_name: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ResolveConflictsSession {
  pub targets: Vec<ResolveTarget>,
  /// Absolute path the agent should start in (first target).
  pub agent_cwd: String,
  pub source_workspace_id: Option<i64>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ResolveCommitResult {
  pub success: bool,
  pub message: String,
  pub change_id: String,
  pub remaining_conflicts: Vec<String>,
}

pub fn is_resolve_workspace(workspace: &local_db::Workspace) -> bool {
  if workspace.workspace_name.starts_with("_resolve-")
    || workspace.branch_name.starts_with("treq/resolve/")
  {
    return true;
  }
  workspace
    .metadata
    .as_deref()
    .and_then(|raw| serde_json::from_str::<ResolveWorkspaceMeta>(raw).ok())
    .is_some_and(|meta| meta.kind == RESOLVE_METADATA_KIND)
}

fn find_existing_resolve_for_change(
  repo_path: &str,
  change_id: &str,
) -> Result<Option<local_db::Workspace>, String> {
  let all = local_db::get_workspaces(repo_path)?;
  Ok(all.into_iter().find(|w| {
    if !is_resolve_workspace(w) {
      return false;
    }
    w.metadata
      .as_deref()
      .and_then(|raw| serde_json::from_str::<ResolveWorkspaceMeta>(raw).ok())
      .is_some_and(|meta| {
        meta.kind == RESOLVE_METADATA_KIND
          && (meta.change_id == change_id
            || change_id.starts_with(&meta.change_id)
            || meta.change_id.starts_with(change_id))
      })
  }))
}

fn conflicted_files_or_empty(path: &str) -> Vec<String> {
  jj::get_conflicted_files(path, None).unwrap_or_else(|_| Vec::new())
}

fn build_resolve_target(
  repo_path: &str,
  source_workspace_id: Option<i64>,
  commit: &jj::JjLogCommit,
) -> Result<ResolveTarget, String> {
  if let Some(existing) = find_existing_resolve_for_change(repo_path, &commit.change_id)? {
    let resolve_path = Path::new(repo_path)
      .join(".treq")
      .join("workspaces")
      .join(&existing.workspace_path)
      .to_string_lossy()
      .to_string();
    let conflicted_files = conflicted_files_or_empty(&resolve_path);
    return Ok(ResolveTarget {
      change_id: commit.change_id.clone(),
      commit_id: commit.commit_id.clone(),
      description: commit.description.clone(),
      conflicted_files,
      resolve_path,
      workspace_id: existing.id,
      workspace_name: existing.workspace_name.clone(),
    });
  }

  let (workspace_name, resolve_path) =
    jj::create_resolve_workspace(repo_path, &commit.change_id).map_err(|e| e.to_string())?;
  let conflicted_files = conflicted_files_or_empty(&resolve_path);

  let meta = ResolveWorkspaceMeta {
    kind: RESOLVE_METADATA_KIND.to_string(),
    change_id: commit.change_id.clone(),
    commit_id: commit.commit_id.clone(),
    source_workspace_id,
  };
  let metadata = serde_json::to_string(&meta).unwrap_or_default();
  let branch_name = format!("treq/resolve/{}", commit.change_id);
  let workspace_id = local_db::add_workspace(
    repo_path,
    workspace_name.clone(),
    workspace_name.clone(),
    branch_name,
    Some(format!("Resolve {}", commit.change_id)),
    None,
    None,
  )?;
  local_db::set_workspace_metadata(repo_path, workspace_id, &metadata)?;

  Ok(ResolveTarget {
    change_id: commit.change_id.clone(),
    commit_id: commit.commit_id.clone(),
    description: commit.description.clone(),
    conflicted_files,
    resolve_path,
    workspace_id,
    workspace_name,
  })
}

/// Start short-lived resolve workspaces for conflicted commits.
///
/// When `change_ids` is `None`, every conflicted commit in the workspace (or home)
/// history is targeted. When provided, only matching change/commit ids are used.
pub fn start_resolve_conflicts(
  repo_path: &str,
  workspace_id: Option<i64>,
  change_ids: Option<Vec<String>>,
) -> Result<ResolveConflictsSession, String> {
  let log = super::list_commits(repo_path, workspace_id, false, None, None)?;
  let mut conflicted: Vec<jj::JjLogCommit> = log
    .commits
    .into_iter()
    .filter(|c| c.has_conflicts && !c.on_target_only && !c.is_working_copy)
    .collect();

  if let Some(ids) = change_ids {
    conflicted.retain(|c| {
      ids.iter().any(|id| {
        c.change_id.starts_with(id)
          || id.starts_with(&c.change_id)
          || c.commit_id.starts_with(id)
          || id.starts_with(&c.commit_id)
      })
    });
  }

  if conflicted.is_empty() {
    return Err("No conflicted commits found to resolve".to_string());
  }

  let mut targets = Vec::new();
  for commit in &conflicted {
    targets.push(build_resolve_target(repo_path, workspace_id, commit)?);
  }

  let agent_cwd = targets
    .first()
    .map(|t| t.resolve_path.clone())
    .unwrap_or_else(|| repo_path.to_string());

  Ok(ResolveConflictsSession {
    targets,
    agent_cwd,
    source_workspace_id: workspace_id,
  })
}

fn find_resolve_target_by_revision(
  repo_path: &str,
  revision: &str,
) -> Result<(local_db::Workspace, String), String> {
  let all = local_db::get_workspaces(repo_path)?;
  for workspace in all {
    if !is_resolve_workspace(&workspace) {
      continue;
    }
    let meta = workspace
      .metadata
      .as_deref()
      .and_then(|raw| serde_json::from_str::<ResolveWorkspaceMeta>(raw).ok());
    let Some(meta) = meta else {
      continue;
    };
    if meta.change_id.starts_with(revision)
      || revision.starts_with(&meta.change_id)
      || meta.commit_id.starts_with(revision)
      || revision.starts_with(&meta.commit_id)
    {
      let path = Path::new(repo_path)
        .join(".treq")
        .join("workspaces")
        .join(&workspace.workspace_path)
        .to_string_lossy()
        .to_string();
      return Ok((workspace, path));
    }
  }

  Err(format!(
    "No active resolve workspace for '{}'. Start one from the Commits tab first.",
    revision
  ))
}

fn cleanup_resolve_workspace(
  repo_path: &str,
  workspace: &local_db::Workspace,
) -> Result<(), String> {
  let full_path = Path::new(repo_path)
    .join(".treq")
    .join("workspaces")
    .join(&workspace.workspace_path);
  let full_path_str = full_path.to_string_lossy().to_string();

  // Detach `@` from the resolved change onto a disposable empty child before
  // forgetting the resolve workspace. Otherwise `remove_wc_commit` can hide the
  // rewritten change when it was the resolve WC tip.
  if Path::new(&full_path_str).exists() {
    let _ = jj::jj_detach_resolve_workspace_wc(&full_path_str);
  }

  let _ = jj::remove_workspace(repo_path, &full_path_str);
  if workspace.id >= 0 {
    let _ = local_db::delete_workspace(repo_path, workspace.id);
  }
  Ok(())
}

/// Apply side picks and/or file replacements, then finalize (cleanup) when clean.
pub fn resolve_commit(
  repo_path: &str,
  revision: &str,
  sides: &[ResolveSide],
  replacements: Option<HashMap<String, String>>,
) -> Result<ResolveCommitResult, String> {
  let (workspace, resolve_path) = find_resolve_target_by_revision(repo_path, revision)?;
  let had_replacements = replacements.is_some();

  if let Some(ref files) = replacements {
    jj::jj_apply_resolve_replacements(&resolve_path, files).map_err(|e| e.to_string())?;
  }

  if !sides.is_empty() {
    let indexes: Vec<u8> = sides.iter().map(|s| s.as_index()).collect();
    jj::jj_resolve_conflict_sides(&resolve_path, &indexes).map_err(|e| e.to_string())?;
  } else if !had_replacements {
    jj::jj_snapshot_resolve_workspace(&resolve_path).map_err(|e| e.to_string())?;
  }

  let remaining = conflicted_files_or_empty(&resolve_path);
  if !remaining.is_empty() {
    return Ok(ResolveCommitResult {
      success: false,
      message: format!(
        "Conflicts remain in: {}. Edit files or run `treq resolve {} 1|2|both`.",
        remaining.join(", "),
        revision
      ),
      change_id: revision.to_string(),
      remaining_conflicts: remaining,
    });
  }

  jj::jj_snapshot_resolve_workspace(&resolve_path).map_err(|e| e.to_string())?;
  cleanup_resolve_workspace(repo_path, &workspace)?;
  let _ = jj::reconcile_all_workspaces_after_rewrite(repo_path, None);

  Ok(ResolveCommitResult {
    success: true,
    message: format!(
      "Resolved change '{}' in place and cleaned up resolve workspace",
      revision
    ),
    change_id: revision.to_string(),
    remaining_conflicts: vec![],
  })
}

/// Build the default agent prompt listing resolve directories.
pub fn build_resolve_agent_prompt(user_prompt: &str, session: &ResolveConflictsSession) -> String {
  let mut out = String::new();
  out.push_str(
    "You are resolving jj conflicts for one or more commits without creating a new resolution commit.\n",
  );
  out.push_str(
    "Each directory below is a short-lived Treq resolve workspace checked out in edit mode on a conflicted change.\n",
  );
  out.push_str(
    "Edit the conflict markers in those directories, or run `treq resolve <change-id> [1|2|base|both]`.\n",
  );
  out.push_str(
    "You can also pipe a JSON object of path→content replacements: `echo '{\"file\": \"...\"}' | treq resolve <change-id>`.\n",
  );
  out.push_str(
    "When a change is fully resolved, `treq resolve` rewrites that commit in place and deletes its resolve workspace.\n\n",
  );
  out.push_str("Resolve directories:\n");
  for target in &session.targets {
    out.push_str(&format!(
      "- change {} ({}) → {}\n  files: {}\n  description: {}\n",
      target.change_id,
      target.commit_id,
      target.resolve_path,
      if target.conflicted_files.is_empty() {
        "(see directory)".to_string()
      } else {
        target.conflicted_files.join(", ")
      },
      target.description
    ));
  }
  if !user_prompt.trim().is_empty() {
    out.push('\n');
    out.push_str("User instructions:\n");
    out.push_str(user_prompt.trim());
    out.push('\n');
  }
  out
}
