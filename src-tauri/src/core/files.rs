use super::changes::resolve_workspace_dir;
use crate::core::WorkspaceEntry;
use crate::jj;
use std::collections::HashSet;
use std::path::Path;

/// Status of a file (or, for a directory, the most severe status among its
/// descendants) relative to the working copy and target branch.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum FileStatus {
  /// Unresolved conflict somewhere in the tree.
  Conflicted,
  /// Modified by the mutable working-copy change (`@`).
  WorkingCopy,
  /// Modified by an already-committed ancestor, relative to the target branch.
  Committed,
}

impl FileStatus {
  fn as_str(self) -> &'static str {
    match self {
      FileStatus::Conflicted => "conflict",
      FileStatus::WorkingCopy => "workingCopy",
      FileStatus::Committed => "committed",
    }
  }
}

/// List the immediate children of `dir` (a directory inside the workspace),
/// annotated with each entry's file status so the UI can highlight it.
///
/// A directory's status is the most severe status found among any of its
/// descendants (conflict > working copy change > committed). Entries with no
/// status are untouched since the merge base with `target_branch`.
pub fn list_workspace_files(
  repo_path: &str,
  workspace_id: Option<i64>,
  dir: &str,
  target_branch: Option<&str>,
) -> Result<Vec<WorkspaceEntry>, String> {
  let workspace_path = resolve_workspace_dir(repo_path, workspace_id)?;

  let base_path = Path::new(dir);
  if !base_path.is_dir() {
    return Err(format!("Directory does not exist: {}", dir));
  }

  let mut entries = Vec::new();
  for entry in
    std::fs::read_dir(base_path).map_err(|e| format!("Failed to read directory {}: {}", dir, e))?
  {
    let entry = entry.map_err(|e| e.to_string())?;
    let name = entry.file_name().to_string_lossy().to_string();
    if name == ".jj" || name == ".git" || name == ".treq" {
      continue;
    }
    let entry_path = entry.path();
    let is_directory = entry_path.is_dir();
    let path_str = entry_path.to_string_lossy().to_string();

    let modified_at = entry
      .metadata()
      .ok()
      .and_then(|meta| meta.modified().ok())
      .map(|modified| chrono::DateTime::<chrono::Utc>::from(modified).to_rfc3339());

    entries.push(WorkspaceEntry {
      name,
      path: path_str,
      is_directory,
      modified_at,
      submodule_pin: None,
      submodule_synced: None,
      status: None,
    });
  }

  annotate_entry_statuses(&workspace_path, &mut entries, target_branch);

  entries.sort_by(|a, b| match (a.is_directory, b.is_directory) {
    (true, false) => std::cmp::Ordering::Less,
    (false, true) => std::cmp::Ordering::Greater,
    _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
  });

  Ok(entries)
}

/// Populate `status` on each entry (file or directory) in place, based on
/// each entry's path relative to `workspace_path`. Entries whose `path` isn't
/// inside `workspace_path` are left untouched (no status).
pub fn annotate_entry_statuses(
  workspace_path: &str,
  entries: &mut [WorkspaceEntry],
  target_branch: Option<&str>,
) {
  let conflicted: HashSet<String> = jj::get_conflicted_files(workspace_path, target_branch)
    .unwrap_or_default()
    .into_iter()
    .collect();
  let working_copy: HashSet<String> = jj::jj_get_changed_files(workspace_path)
    .unwrap_or_default()
    .into_iter()
    .map(|f| f.path)
    .collect();
  let committed: HashSet<String> = jj::jj_get_committed_files(workspace_path, target_branch)
    .unwrap_or_default()
    .into_iter()
    .collect();

  for entry in entries.iter_mut() {
    let rel_path = relative_path(workspace_path, &entry.path);
    let status = if entry.is_directory {
      directory_status(&rel_path, &conflicted, &working_copy, &committed)
    } else {
      file_status(&rel_path, &conflicted, &working_copy, &committed)
    };
    entry.status = status.map(|s| s.as_str().to_string());
  }
}

fn relative_path(workspace_path: &str, full_path: &str) -> String {
  let prefix = format!("{}/", workspace_path.trim_end_matches('/'));
  full_path
    .strip_prefix(&prefix)
    .unwrap_or(full_path)
    .to_string()
}

fn file_status(
  rel_path: &str,
  conflicted: &HashSet<String>,
  working_copy: &HashSet<String>,
  committed: &HashSet<String>,
) -> Option<FileStatus> {
  if conflicted.contains(rel_path) {
    Some(FileStatus::Conflicted)
  } else if working_copy.contains(rel_path) {
    Some(FileStatus::WorkingCopy)
  } else if committed.contains(rel_path) {
    Some(FileStatus::Committed)
  } else {
    None
  }
}

fn directory_status(
  rel_dir: &str,
  conflicted: &HashSet<String>,
  working_copy: &HashSet<String>,
  committed: &HashSet<String>,
) -> Option<FileStatus> {
  let prefix = format!("{}/", rel_dir);
  let contains = |set: &HashSet<String>| set.iter().any(|path| path.starts_with(&prefix));

  if contains(conflicted) {
    Some(FileStatus::Conflicted)
  } else if contains(working_copy) {
    Some(FileStatus::WorkingCopy)
  } else if contains(committed) {
    Some(FileStatus::Committed)
  } else {
    None
  }
}
