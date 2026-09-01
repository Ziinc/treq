use crate::core::WorkspaceEntry;
use crate::jj;
use std::collections::HashSet;

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
