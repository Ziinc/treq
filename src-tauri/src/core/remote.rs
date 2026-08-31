use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use std::collections::BTreeSet;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

use crate::jj;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SshHost {
  pub alias: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RemoteReadinessCheck {
  pub name: String,
  pub available: bool,
  pub detail: String,
  /// Distinct structured error code for this check, when it failed for a
  /// reason more specific than "unavailable" (PRD "Resource quotas": quota
  /// failures "must be a distinct, structured readiness or mutation error
  /// so the UI can explain the quota rather than surfacing a generic
  /// filesystem or provider failure"). `None` for ordinary binary-presence
  /// checks; `Some("disk_quota_exceeded")` when the base disk quota check
  /// fails.
  #[serde(skip_serializing_if = "Option::is_none", default)]
  pub code: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RemoteReadiness {
  pub host: String,
  pub connected: bool,
  pub checks: Vec<RemoteReadinessCheck>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RemoteRepoProbe {
  pub host: String,
  pub path: String,
  pub exists: bool,
  pub is_repo: bool,
  pub needs_clone: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum RepositoryLocation {
  Local { path: String },
  Ssh { host: String, path: String },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RepositoryDescriptor {
  pub id: String,
  pub location: RepositoryLocation,
  pub display_name: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RepositoryInspection {
  pub root: String,
  pub repository_type: String,
  pub current_branch: Option<String>,
  pub default_branch: String,
  pub current_change_id: String,
  pub current_commit_id: String,
  pub descriptor: RepositoryDescriptor,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RemoteRepository {
  pub host: String,
  pub path: String,
  pub display_name: String,
  pub repo_uri: String,
  pub inspection: RepositoryInspection,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CliErrorBody {
  pub error: CliErrorDetail,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CliErrorDetail {
  pub code: String,
  pub message: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind")]
pub enum TreqCommandRequest {
  InspectRepository {
    repo: String,
  },
  RepositoryStatus {
    repo: String,
  },
  ListBranches {
    repo: String,
  },
  ListWorkspaces {
    repo: String,
  },
  InspectWorkspace {
    repo: String,
    workspace: String,
  },
  ListChanges {
    repo: String,
    workspace: Option<String>,
  },
  DiffFile {
    repo: String,
    workspace: Option<String>,
    path: String,
  },
  ReadFile {
    repo: String,
    workspace: Option<String>,
    path: String,
    revision: FileRevision,
    start_line: Option<usize>,
    end_line: Option<usize>,
  },
  ListCommits {
    repo: String,
    workspace: Option<String>,
  },
  ListConflicts {
    repo: String,
    workspace: Option<String>,
  },
  // -- Phase 5: probe/clone/init as typed commands ---------------------------
  ProbeRepo {
    repo: String,
  },
  CloneRepo {
    repo_url: String,
    destination: String,
    idempotency_key: Option<String>,
  },
  InitRepo {
    repo: String,
    idempotency_key: Option<String>,
  },
  // -- Phase 5: workspace mutations -------------------------------------------
  CreateWorkspace {
    repo: String,
    branch_name: String,
    source_branch: Option<String>,
    idempotency_key: Option<String>,
  },
  RenameWorkspace {
    repo: String,
    workspace: String,
    new_name: String,
  },
  UpdateWorkspace {
    repo: String,
    workspace: String,
    target_branch: Option<String>,
    description: Option<String>,
  },
  DeleteWorkspace {
    repo: String,
    workspace: String,
  },
  MoveWorkspaceChanges {
    repo: String,
    workspace: String,
    destination: String,
    commits: Vec<String>,
    idempotency_key: Option<String>,
  },
  RebaseWorkspace {
    repo: String,
    workspace: String,
    target_branch: String,
  },
  // -- Phase 5: file mutations -------------------------------------------------
  RestoreFile {
    repo: String,
    workspace: Option<String>,
    path: String,
  },
  PatchFile {
    repo: String,
    workspace: Option<String>,
    path: String,
    patch_base64: String,
    idempotency_key: Option<String>,
  },
  // -- Phase 5: commit mutations ------------------------------------------------
  CreateCommit {
    repo: String,
    workspace: Option<String>,
    message: String,
    idempotency_key: Option<String>,
  },
  DescribeCommit {
    repo: String,
    workspace: String,
    commit: String,
    message: String,
  },
  SplitCommit {
    repo: String,
    workspace: String,
    commit: String,
  },
  MoveCommit {
    repo: String,
    workspace: String,
    commit: String,
    target_workspace: String,
  },
  AbandonCommit {
    repo: String,
    workspace: String,
    commit: String,
  },
  // -- Phase 5: conflict mutations ----------------------------------------------
  ResolveConflict {
    repo: String,
    revision: String,
    sides: Vec<String>,
  },
  // -- Phase 5: git operations ---------------------------------------------------
  GitFetch {
    repo: String,
  },
  GitBookmarkTrack {
    repo: String,
    bookmark: String,
    remote_name: String,
  },
  GitPush {
    repo: String,
    workspace: Option<String>,
    idempotency_key: Option<String>,
  },
  // -- Phase 5: agent lifecycle (VM-local supervisor) -----------------------------
  AgentStart {
    repo: String,
    workspace: String,
    agent: String,
    prompt: String,
    idempotency_key: Option<String>,
  },
  AgentInput {
    repo: String,
    workspace: String,
    input: String,
  },
  AgentStatus {
    repo: String,
    workspace: String,
  },
  AgentStop {
    repo: String,
    workspace: String,
  },
  AgentLogs {
    repo: String,
    workspace: String,
  },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum FileRevision {
  WorkingCopy,
  Parent,
}

/// Allow-listed argument fields shared by every Phase 5 typed command. Only
/// commands built from a [`TreqCommandRequest`] variant can populate these —
/// no frontend-provided raw string is ever assembled into this shape, which
/// is what keeps arbitrary commands out of the exec channel.
#[derive(Default)]
struct CliArgFields<'a> {
  workspace: Option<&'a str>,
  path: Option<&'a str>,
  target: Option<&'a str>,
  value: Option<String>,
  idempotency_key: Option<&'a str>,
}

impl TreqCommandRequest {
  /// Convert a typed request into remote CLI arguments. Values remain separate
  /// process arguments so no frontend-provided value is interpreted as shell.
  pub fn cli_args(&self) -> Result<Vec<String>, String> {
    let mut fields = CliArgFields::default();
    let (command, action, repo): (&str, &str, &str) = match self {
      Self::InspectRepository { repo } => ("repo", "inspect", repo),
      Self::RepositoryStatus { repo } => ("repo", "status", repo),
      Self::ListBranches { repo } => ("repo", "branches", repo),
      Self::ProbeRepo { repo } => ("repo", "probe", repo),
      Self::InitRepo {
        repo,
        idempotency_key,
      } => {
        fields.idempotency_key = idempotency_key.as_deref();
        ("repo", "init", repo)
      }
      Self::CloneRepo {
        repo_url,
        destination,
        idempotency_key,
      } => {
        if repo_url.trim().is_empty() {
          return Err("Repository URL is required".to_string());
        }
        fields.value = Some(repo_url.clone());
        fields.idempotency_key = idempotency_key.as_deref();
        ("repo", "clone", destination)
      }
      Self::ListWorkspaces { repo } => ("workspace", "list", repo),
      Self::InspectWorkspace { repo, workspace } => {
        fields.workspace = Some(workspace);
        ("workspace", "inspect", repo)
      }
      Self::CreateWorkspace {
        repo,
        branch_name,
        source_branch,
        idempotency_key,
      } => {
        fields.value = Some(branch_name.clone());
        fields.target = source_branch.as_deref();
        fields.idempotency_key = idempotency_key.as_deref();
        ("workspace", "create", repo)
      }
      Self::RenameWorkspace {
        repo,
        workspace,
        new_name,
      } => {
        fields.workspace = Some(workspace);
        fields.value = Some(new_name.clone());
        ("workspace", "rename", repo)
      }
      Self::UpdateWorkspace {
        repo,
        workspace,
        target_branch,
        description,
      } => {
        fields.workspace = Some(workspace);
        fields.target = target_branch.as_deref();
        fields.value = description.clone();
        ("workspace", "update", repo)
      }
      Self::DeleteWorkspace { repo, workspace } => {
        fields.workspace = Some(workspace);
        ("workspace", "delete", repo)
      }
      Self::MoveWorkspaceChanges {
        repo,
        workspace,
        destination,
        commits,
        idempotency_key,
      } => {
        fields.workspace = Some(workspace);
        fields.target = Some(destination);
        fields.value = Some(commits.join(","));
        fields.idempotency_key = idempotency_key.as_deref();
        ("workspace", "move", repo)
      }
      Self::RebaseWorkspace {
        repo,
        workspace,
        target_branch,
      } => {
        fields.workspace = Some(workspace);
        fields.target = Some(target_branch);
        ("workspace", "rebase", repo)
      }
      Self::ListChanges { repo, workspace } => {
        fields.workspace = workspace.as_deref();
        ("changes", "list", repo)
      }
      Self::DiffFile {
        repo,
        workspace,
        path,
      } => {
        fields.workspace = workspace.as_deref();
        fields.path = Some(path);
        ("changes", "diff", repo)
      }
      Self::ReadFile {
        repo,
        workspace,
        path,
        ..
      } => {
        fields.workspace = workspace.as_deref();
        fields.path = Some(path);
        ("file", "read", repo)
      }
      Self::RestoreFile {
        repo,
        workspace,
        path,
      } => {
        fields.workspace = workspace.as_deref();
        fields.path = Some(path);
        ("file", "restore", repo)
      }
      Self::PatchFile {
        repo,
        workspace,
        path,
        patch_base64,
        idempotency_key,
      } => {
        fields.workspace = workspace.as_deref();
        fields.path = Some(path);
        fields.value = Some(patch_base64.clone());
        fields.idempotency_key = idempotency_key.as_deref();
        ("file", "patch", repo)
      }
      Self::ListCommits { repo, workspace } => {
        fields.workspace = workspace.as_deref();
        ("commits", "list", repo)
      }
      Self::CreateCommit {
        repo,
        workspace,
        message,
        idempotency_key,
      } => {
        fields.workspace = workspace.as_deref();
        fields.value = Some(message.clone());
        fields.idempotency_key = idempotency_key.as_deref();
        ("commits", "create", repo)
      }
      Self::DescribeCommit {
        repo,
        workspace,
        commit,
        message,
      } => {
        fields.workspace = Some(workspace);
        fields.target = Some(commit);
        fields.value = Some(message.clone());
        ("commits", "describe", repo)
      }
      Self::SplitCommit {
        repo,
        workspace,
        commit,
      } => {
        fields.workspace = Some(workspace);
        fields.target = Some(commit);
        ("commits", "split", repo)
      }
      Self::MoveCommit {
        repo,
        workspace,
        commit,
        target_workspace,
      } => {
        fields.workspace = Some(workspace);
        fields.target = Some(commit);
        fields.value = Some(target_workspace.clone());
        ("commits", "move", repo)
      }
      Self::AbandonCommit {
        repo,
        workspace,
        commit,
      } => {
        fields.workspace = Some(workspace);
        fields.target = Some(commit);
        ("commits", "abandon", repo)
      }
      Self::ListConflicts { repo, workspace } => {
        fields.workspace = workspace.as_deref();
        ("conflicts", "list", repo)
      }
      Self::ResolveConflict {
        repo,
        revision,
        sides,
      } => {
        fields.target = Some(revision);
        fields.value = Some(sides.join(","));
        ("conflicts", "resolve", repo)
      }
      Self::GitFetch { repo } => ("git", "fetch", repo),
      Self::GitBookmarkTrack {
        repo,
        bookmark,
        remote_name,
      } => {
        fields.value = Some(bookmark.clone());
        fields.target = Some(remote_name);
        ("git", "bookmark-track", repo)
      }
      Self::GitPush {
        repo,
        workspace,
        idempotency_key,
      } => {
        fields.workspace = workspace.as_deref();
        fields.idempotency_key = idempotency_key.as_deref();
        ("git", "push", repo)
      }
      Self::AgentStart {
        repo,
        workspace,
        agent,
        prompt,
        idempotency_key,
      } => {
        fields.workspace = Some(workspace);
        fields.target = Some(agent);
        fields.value = Some(prompt.clone());
        fields.idempotency_key = idempotency_key.as_deref();
        ("agent-remote", "start", repo)
      }
      Self::AgentInput {
        repo,
        workspace,
        input,
      } => {
        fields.workspace = Some(workspace);
        fields.value = Some(input.clone());
        ("agent-remote", "input", repo)
      }
      Self::AgentStatus { repo, workspace } => {
        fields.workspace = Some(workspace);
        ("agent-remote", "status", repo)
      }
      Self::AgentStop { repo, workspace } => {
        fields.workspace = Some(workspace);
        ("agent-remote", "stop", repo)
      }
      Self::AgentLogs { repo, workspace } => {
        fields.workspace = Some(workspace);
        ("agent-remote", "logs", repo)
      }
    };
    validate_remote_path(repo)?;
    if let Some(path) = fields.path {
      if path.trim().is_empty() {
        return Err("Remote file path is required".to_string());
      }
    }
    let mut args = vec![
      command.into(),
      action.into(),
      "--repo".into(),
      repo.to_string(),
    ];
    if let Some(workspace) = fields.workspace {
      if workspace.trim().is_empty() {
        return Err("Remote workspace is required".to_string());
      }
      args.extend(["--workspace".into(), workspace.to_string()]);
    }
    if let Some(path) = fields.path {
      args.extend(["--path".into(), path.to_string()]);
    }
    if let Some(target) = fields.target {
      args.extend(["--target".into(), target.to_string()]);
    }
    if let Some(value) = &fields.value {
      args.extend(["--value".into(), value.clone()]);
    }
    if let Some(key) = fields.idempotency_key {
      if key.trim().is_empty() {
        return Err("Idempotency key must not be empty when provided".to_string());
      }
      args.extend(["--idempotency-key".into(), key.to_string()]);
    }
    if let Self::ReadFile {
      revision,
      start_line,
      end_line,
      ..
    } = self
    {
      args.extend([
        "--revision".into(),
        match revision {
          FileRevision::WorkingCopy => "working-copy",
          FileRevision::Parent => "parent",
        }
        .into(),
      ]);
      if let Some(line) = start_line {
        args.extend(["--start-line".into(), line.to_string()]);
      }
      if let Some(line) = end_line {
        args.extend(["--end-line".into(), line.to_string()]);
      }
    }
    args.extend(["--format".into(), "json".into()]);
    Ok(args)
  }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum TransportError {
  SshConnectionFailed(String),
  CommandFailed { code: Option<i32>, message: String },
  InvalidJson(String),
}

pub trait TreqCommandTransport {
  fn execute<T: DeserializeOwned>(&self, request: TreqCommandRequest) -> Result<T, TransportError>;
}

pub struct SshCliTransport {
  host: String,
}

/// In-process counterpart to [`SshCliTransport`]. Both transports serialize the
/// same core DTOs, which keeps local and remote callers on one response contract.
pub struct LocalTransport;

impl TreqCommandTransport for LocalTransport {
  fn execute<T: DeserializeOwned>(&self, request: TreqCommandRequest) -> Result<T, TransportError> {
    let value = execute_local_request(request).map_err_command()?;
    serde_json::from_value(value).map_err(|error| TransportError::InvalidJson(error.to_string()))
  }
}

// ---------------------------------------------------------------------------
// Idempotency
// ---------------------------------------------------------------------------
//
// Mutations that could duplicate work on retry (create, movement, git push,
// agent start) accept an idempotency key. A repeated call with the same key
// replays the cached response instead of re-running the mutation. This is an
// in-process, per-`treq` invocation-boundary cache: on the remote VM the CLI
// process starting fresh for every exec channel would defeat it, so the
// process-wide store here matters most for the VM-local agent supervisor
// (Phase 5 scope) and for local/dev use; a durable cross-process store would
// be a natural Phase 7 (observability/ops) follow-up.
//
// Naturally idempotent operations (describe/update, which simply overwrite;
// fetch/inspect/list, which are read-only) do not accept a key at all —
// adding dedupe machinery for those would be needless per the PRD's own
// carve-out.
static IDEMPOTENCY_STORE: std::sync::OnceLock<
  std::sync::Mutex<std::collections::HashMap<String, serde_json::Value>>,
> = std::sync::OnceLock::new();

fn idempotency_store(
) -> &'static std::sync::Mutex<std::collections::HashMap<String, serde_json::Value>> {
  IDEMPOTENCY_STORE.get_or_init(|| std::sync::Mutex::new(std::collections::HashMap::new()))
}

/// Runs `run` unless `key` was already used for `operation`, in which case the
/// previously recorded response is replayed and `run` is never invoked again.
fn with_idempotency_key<F>(
  operation: &str,
  key: Option<&str>,
  run: F,
) -> Result<serde_json::Value, String>
where
  F: FnOnce() -> Result<serde_json::Value, String>,
{
  let Some(key) = key.filter(|k| !k.trim().is_empty()) else {
    return run();
  };
  let cache_key = format!("{operation}:{key}");
  if let Some(cached) = idempotency_store().lock().unwrap().get(&cache_key) {
    return Ok(cached.clone());
  }
  let result = run()?;
  idempotency_store()
    .lock()
    .unwrap()
    .insert(cache_key, result.clone());
  Ok(result)
}

fn resolve_workspace_path(repo: &str, id: Option<i64>) -> Result<String, String> {
  match id {
    None => Ok(repo.to_string()),
    Some(id) => {
      let workspace = crate::local_db::get_workspace_by_id(repo, id)
        .map_err(|error| error.to_string())?
        .ok_or_else(|| format!("workspace_not_found: Workspace {id} was not found"))?;
      Ok(
        Path::new(repo)
          .join(".treq")
          .join("workspaces")
          .join(workspace.workspace_path)
          .to_string_lossy()
          .into_owned(),
      )
    }
  }
}

fn workspace_id(value: Option<&String>) -> Result<Option<i64>, String> {
  value
    .map(|value| {
      value
        .parse::<i64>()
        .map_err(|_| "invalid_arguments: workspace must be a numeric id".to_string())
    })
    .transpose()
}

/// Dispatches typed CLI requests to the same core functions used by Tauri.
pub fn execute_local_request(request: TreqCommandRequest) -> Result<serde_json::Value, String> {
  request.cli_args()?;
  fn json<T: Serialize>(result: Result<T, String>) -> Result<serde_json::Value, String> {
    serde_json::to_value(result?).map_err(|error| error.to_string())
  }
  match request {
    TreqCommandRequest::InspectRepository { repo } => json(inspect_repository_path(&repo)),
    TreqCommandRequest::RepositoryStatus { repo } => {
      json(crate::core::workspaces::workspace_status(&repo, None))
    }
    TreqCommandRequest::ListBranches { repo } => json(crate::core::repo::list_repo_branches(&repo)),
    TreqCommandRequest::ListWorkspaces { repo } => {
      json(crate::core::workspaces::list_workspaces(&repo))
    }
    TreqCommandRequest::InspectWorkspace { repo, workspace } => json(
      crate::core::workspaces::workspace_status(&repo, workspace_id(Some(&workspace))?),
    ),
    TreqCommandRequest::ListChanges { repo, workspace } => json(
      crate::core::changes::list_changed_files(&repo, workspace_id(workspace.as_ref())?),
    ),
    TreqCommandRequest::DiffFile {
      repo,
      workspace,
      path,
    } => json(crate::core::changes::list_file_hunks(
      &repo,
      workspace_id(workspace.as_ref())?,
      &path,
      "git",
    )),
    TreqCommandRequest::ReadFile {
      repo,
      workspace,
      path,
      revision,
      start_line,
      end_line,
    } => json(crate::core::changes::get_file_lines(
      &repo,
      workspace_id(workspace.as_ref())?,
      &path,
      revision == FileRevision::Parent,
      start_line.unwrap_or(1),
      end_line.unwrap_or(300),
    )),
    TreqCommandRequest::ListCommits { repo, workspace } => {
      json(crate::core::commits::list_commits(
        &repo,
        workspace_id(workspace.as_ref())?,
        false,
        None,
        None,
      ))
    }
    TreqCommandRequest::ListConflicts { repo, workspace } => {
      let id = workspace_id(workspace.as_ref())?;
      let workspace_path = resolve_workspace_path(&repo, id)?;
      let files = crate::jj::get_conflicted_files(&workspace_path, None)
        .map_err(|error| format!("jj_command_failed: {error}"))?;
      serde_json::to_value(files).map_err(|error| error.to_string())
    }
    TreqCommandRequest::ProbeRepo { repo } => json(probe_repo_path(&repo)),
    TreqCommandRequest::InitRepo {
      repo,
      idempotency_key,
    } => with_idempotency_key("repo.init", idempotency_key.as_deref(), || {
      json(init_repo_path(&repo))
    }),
    TreqCommandRequest::CloneRepo {
      repo_url,
      destination,
      idempotency_key,
    } => with_idempotency_key("repo.clone", idempotency_key.as_deref(), || {
      json(clone_repo_local(&repo_url, &destination))
    }),
    TreqCommandRequest::CreateWorkspace {
      repo,
      branch_name,
      source_branch,
      idempotency_key,
    } => with_idempotency_key("workspace.create", idempotency_key.as_deref(), || {
      json(crate::core::workspaces::create_workspace(
        &repo,
        &branch_name,
        None,
        None,
        source_branch.as_deref(),
        None,
        None,
      ))
    }),
    TreqCommandRequest::RenameWorkspace {
      repo,
      workspace,
      new_name,
    } => json(crate::core::workspaces::rename_workspace(
      &repo,
      workspace_id(Some(&workspace))?.ok_or("invalid_arguments: workspace is required")?,
      &new_name,
      false,
    )),
    TreqCommandRequest::UpdateWorkspace {
      repo,
      workspace,
      target_branch,
      description,
    } => json(crate::core::workspaces::update_workspace(
      &repo,
      workspace_id(Some(&workspace))?.ok_or("invalid_arguments: workspace is required")?,
      target_branch.map_or(
        crate::core::workspaces::MaybeEmptyParam::Omitted,
        crate::core::workspaces::MaybeEmptyParam::Some,
      ),
      description.map_or(
        crate::core::workspaces::MaybeEmptyParam::Omitted,
        crate::core::workspaces::MaybeEmptyParam::Some,
      ),
    )),
    TreqCommandRequest::DeleteWorkspace { repo, workspace } => {
      let id = workspace_id(Some(&workspace))?.ok_or("invalid_arguments: workspace is required")?;
      json(crate::core::workspaces::delete_workspace(&repo, &id))
    }
    TreqCommandRequest::MoveWorkspaceChanges {
      repo,
      workspace,
      destination,
      commits,
      idempotency_key,
    } => with_idempotency_key("workspace.move", idempotency_key.as_deref(), || {
      let request = crate::core::workspaces::WorkspaceMoveRequest {
        files: vec![],
        hunks: vec![],
        commits: commits.iter().filter(|c| !c.is_empty()).cloned().collect(),
      };
      json(crate::core::workspaces::move_workspace_changes(
        &repo,
        &workspace,
        &destination,
        request,
      ))
    }),
    TreqCommandRequest::RebaseWorkspace {
      repo,
      workspace,
      target_branch,
    } => {
      let id = workspace_id(Some(&workspace))?.ok_or("invalid_arguments: workspace is required")?;
      json(crate::core::workspaces::retarget_workspace(
        &repo,
        id,
        &target_branch,
        "main",
      ))
    }
    TreqCommandRequest::RestoreFile {
      repo,
      workspace,
      path,
    } => {
      let workspace_path = resolve_workspace_path(&repo, workspace_id(workspace.as_ref())?)?;
      json(crate::core::changes::discard_file_changes(
        &workspace_path,
        &path,
      ))
    }
    TreqCommandRequest::PatchFile {
      repo,
      workspace,
      path,
      patch_base64,
      idempotency_key,
    } => with_idempotency_key("file.patch", idempotency_key.as_deref(), || {
      json(apply_remote_patch(
        &repo,
        workspace_id(workspace.as_ref())?,
        &path,
        &patch_base64,
      ))
    }),
    TreqCommandRequest::CreateCommit {
      repo,
      workspace,
      message,
      idempotency_key,
    } => with_idempotency_key("commit.create", idempotency_key.as_deref(), || {
      json(crate::core::workspaces::commit_workspace_with_auto_push(
        &repo,
        workspace_id(workspace.as_ref())?,
        &message,
      ))
    }),
    TreqCommandRequest::DescribeCommit {
      repo,
      workspace,
      commit,
      message,
    } => {
      let id = workspace_id(Some(&workspace))?.ok_or("invalid_arguments: workspace is required")?;
      // Naturally idempotent: it overwrites the description each call, so no
      // idempotency key is needed or accepted.
      json(crate::core::commits::describe_commit(
        &repo, id, &commit, &message,
      ))
    }
    TreqCommandRequest::SplitCommit { .. } => Err(
      "not_implemented: remote commit split requires an interactive hunk selector and is not yet available over the exec channel"
        .to_string(),
    ),
    TreqCommandRequest::MoveCommit {
      repo,
      workspace,
      commit,
      target_workspace,
    } => {
      let source_id =
        workspace_id(Some(&workspace))?.ok_or("invalid_arguments: workspace is required")?;
      let target_id = workspace_id(Some(&target_workspace))?
        .ok_or("invalid_arguments: target workspace is required")?;
      json(crate::core::commits::move_commit_to_existing_workspace(
        &repo, source_id, &commit, target_id,
      ))
    }
    TreqCommandRequest::AbandonCommit {
      repo,
      workspace,
      commit,
    } => {
      let id = workspace_id(Some(&workspace))?.ok_or("invalid_arguments: workspace is required")?;
      json(crate::core::commits::abandon_commit(&repo, id, &commit))
    }
    TreqCommandRequest::ResolveConflict {
      repo,
      revision,
      sides,
    } => {
      let sides = crate::core::resolve::parse_resolve_sides(
        &sides.into_iter().filter(|s| !s.is_empty()).collect::<Vec<_>>(),
      )?;
      json(crate::core::resolve::resolve_commit(
        &repo, &revision, &sides, None,
      ))
    }
    TreqCommandRequest::GitFetch { repo } => json(
      crate::jj::jj_git_fetch(&repo).map_err(|error| format!("jj_command_failed: {error}")),
    ),
    TreqCommandRequest::GitBookmarkTrack {
      repo,
      bookmark,
      remote_name,
    } => {
      // Tracking an already-tracked bookmark is a no-op in jj, so this is
      // naturally idempotent and does not need a key.
      json(
        crate::jj::jj_bookmark_track(&repo, &bookmark, &remote_name)
          .map_err(|error| format!("jj_command_failed: {error}")),
      )
    }
    TreqCommandRequest::GitPush {
      repo,
      workspace,
      idempotency_key,
    } => with_idempotency_key("git.push", idempotency_key.as_deref(), || {
      json(crate::core::workspaces::push_workspace_to_remote(
        &repo,
        workspace_id(workspace.as_ref())?,
      ))
    }),
    TreqCommandRequest::AgentStart {
      repo,
      workspace,
      agent,
      prompt,
      idempotency_key,
    } => with_idempotency_key("agent.start", idempotency_key.as_deref(), || {
      let id = workspace_id(Some(&workspace))?.ok_or("invalid_arguments: workspace is required")?;
      let workspace_path = resolve_workspace_path(&repo, Some(id))?;
      json(crate::core::agent_supervisor::start_agent(
        &repo,
        &workspace,
        &workspace_path,
        &agent,
        &prompt,
      ))
    }),
    TreqCommandRequest::AgentInput {
      repo,
      workspace,
      input,
    } => json(crate::core::agent_supervisor::send_agent_input(
      &repo, &workspace, &input,
    )),
    TreqCommandRequest::AgentStatus { repo, workspace } => json(
      crate::core::agent_supervisor::agent_status(&repo, &workspace),
    ),
    TreqCommandRequest::AgentStop { repo, workspace } => {
      json(crate::core::agent_supervisor::stop_agent(&repo, &workspace))
    }
    TreqCommandRequest::AgentLogs { repo, workspace } => {
      json(crate::core::agent_supervisor::agent_logs(&repo, &workspace))
    }
  }
}

fn probe_repo_path(repo_path: &str) -> Result<RemoteRepoProbe, String> {
  let trimmed = repo_path.trim();
  if trimmed.is_empty() {
    return Err("Remote path is required".to_string());
  }
  let path = Path::new(trimmed);
  let exists = path.exists();
  let is_repo = exists && (path.join(".jj").is_dir() || path.join(".git").exists());
  Ok(RemoteRepoProbe {
    host: String::new(),
    path: trimmed.to_string(),
    exists,
    is_repo,
    needs_clone: !is_repo,
  })
}

/// Recursively sums file sizes under `root` (best effort: unreadable entries
/// are skipped rather than failing the whole walk) as the "disk used"
/// figure for base-disk-quota enforcement. This walks the repository root
/// rather than statvfs-ing the whole volume, since the quota is scoped to
/// what the user's repositories occupy, not the base image itself.
fn directory_usage_bytes(root: &Path) -> u64 {
  let mut total = 0u64;
  let mut stack = vec![root.to_path_buf()];
  while let Some(dir) = stack.pop() {
    let Ok(entries) = fs::read_dir(&dir) else {
      continue;
    };
    for entry in entries.flatten() {
      let Ok(metadata) = entry.metadata() else {
        continue;
      };
      if metadata.is_dir() {
        stack.push(entry.path());
      } else {
        total += metadata.len();
      }
    }
  }
  total
}

/// Enforces the base disk quota (PRD "Resource quotas") before a
/// write-triggering mutation (repo init, clone, patch apply) proceeds.
/// Returns the distinct `disk_quota_exceeded: ...` structured error the PRD
/// requires instead of letting the write fail as a generic filesystem
/// error. `root` is the directory whose usage counts against the quota —
/// callers pass the repository root (or its parent, before it exists) so
/// the check reflects what the write is about to add to.
fn enforce_disk_quota(root: &Path) -> Result<(), String> {
  enforce_disk_quota_against(root, crate::core::remote_provider::BASE_DISK_QUOTA_BYTES)
}

/// Same as [`enforce_disk_quota`] but against an arbitrary `quota_bytes`
/// ceiling, so tests can exercise the failure path without writing 5 GB of
/// fixture data to disk.
fn enforce_disk_quota_against(root: &Path, quota_bytes: u64) -> Result<(), String> {
  let scan_root = if root.exists() {
    root.to_path_buf()
  } else {
    root
      .parent()
      .map(Path::to_path_buf)
      .unwrap_or_else(|| root.to_path_buf())
  };
  let used_bytes = directory_usage_bytes(&scan_root);
  crate::core::remote_provider::check_disk_quota_against(used_bytes, quota_bytes)
    .map_err(|err| err.to_string())
}

fn init_repo_path(repo_path: &str) -> Result<RepositoryInspection, String> {
  let trimmed = repo_path.trim();
  if trimmed.is_empty() {
    return Err("Remote path is required".to_string());
  }
  let path = Path::new(trimmed);
  enforce_disk_quota(path)?;
  fs::create_dir_all(path)
    .map_err(|e| format!("filesystem_error: Failed to create {trimmed}: {e}"))?;
  if !path.join(".jj").is_dir() && !path.join(".git").exists() {
    let output = Command::new("jj")
      .current_dir(path)
      .args(["git", "init", "--colocate", "."])
      .output()
      .map_err(|e| format!("dependency_error: Failed to run jj: {e}"))?;
    if !output.status.success() {
      return Err(format!(
        "jj_command_failed: {}",
        String::from_utf8_lossy(&output.stderr).trim()
      ));
    }
  }
  inspect_repository_path(trimmed)
}

fn clone_repo_local(repo_url: &str, destination: &str) -> Result<RepositoryInspection, String> {
  if repo_url.trim().is_empty() {
    return Err("Repository URL is required".to_string());
  }
  validate_remote_path(destination)?;
  enforce_disk_quota(Path::new(destination))?;
  let output = Command::new("git")
    .args(["clone", repo_url, destination])
    .output()
    .map_err(|e| format!("dependency_error: Failed to run git: {e}"))?;
  if !output.status.success() {
    return Err(format!(
      "git_command_failed: {}",
      String::from_utf8_lossy(&output.stderr).trim()
    ));
  }
  inspect_repository_path(destination)
}

/// Applies a base64-encoded unified diff to `path` inside the given
/// workspace (or the repo root) using `git apply`. Base64 keeps the exec
/// argument vector a plain string even though the payload contains newlines.
fn apply_remote_patch(
  repo: &str,
  workspace: Option<i64>,
  path: &str,
  patch_base64: &str,
) -> Result<String, String> {
  use std::io::Write;
  let workspace_path = resolve_workspace_path(repo, workspace)?;
  enforce_disk_quota(Path::new(&workspace_path))?;
  let decoded = decode_base64(patch_base64.trim())
    .map_err(|e| format!("invalid_arguments: patch is not valid base64: {e}"))?;
  let mut child = Command::new("git")
    .current_dir(&workspace_path)
    .args(["apply", "--whitespace=nowarn", "--", path])
    .stdin(std::process::Stdio::piped())
    .stdout(std::process::Stdio::piped())
    .stderr(std::process::Stdio::piped())
    .spawn()
    .map_err(|e| format!("dependency_error: Failed to run git apply: {e}"))?;
  child
    .stdin
    .take()
    .ok_or("dependency_error: Failed to open git apply stdin")?
    .write_all(&decoded)
    .map_err(|e| format!("filesystem_error: Failed to write patch input: {e}"))?;
  let output = child
    .wait_with_output()
    .map_err(|e| format!("dependency_error: git apply failed: {e}"))?;
  if !output.status.success() {
    return Err(format!(
      "git_command_failed: {}",
      String::from_utf8_lossy(&output.stderr).trim()
    ));
  }
  Ok(format!("Applied patch to {path}"))
}

/// Minimal RFC 4648 base64 decoder (standard alphabet, `=` padding) so patch
/// payloads can travel through the plain-string exec argument vector without
/// pulling in an extra crate dependency.
fn decode_base64(input: &str) -> Result<Vec<u8>, String> {
  fn value(byte: u8) -> Option<u8> {
    match byte {
      b'A'..=b'Z' => Some(byte - b'A'),
      b'a'..=b'z' => Some(byte - b'a' + 26),
      b'0'..=b'9' => Some(byte - b'0' + 52),
      b'+' => Some(62),
      b'/' => Some(63),
      _ => None,
    }
  }
  let cleaned: Vec<u8> = input.bytes().filter(|b| !b.is_ascii_whitespace()).collect();
  let mut out = Vec::with_capacity(cleaned.len() / 4 * 3);
  for chunk in cleaned.chunks(4) {
    if chunk.len() < 2 {
      return Err("truncated base64 input".to_string());
    }
    let padding = chunk.iter().filter(|&&b| b == b'=').count();
    let vals: Vec<u8> = chunk
      .iter()
      .filter(|&&b| b != b'=')
      .map(|&b| value(b).ok_or_else(|| "invalid base64 character".to_string()))
      .collect::<Result<_, _>>()?;
    let mut buf = [0u8; 4];
    for (i, v) in vals.iter().enumerate() {
      buf[i] = *v;
    }
    out.push((buf[0] << 2) | (buf[1] >> 4));
    if padding < 2 && vals.len() > 2 {
      out.push((buf[1] << 4) | (buf[2] >> 2));
    }
    if padding < 1 && vals.len() > 3 {
      out.push((buf[2] << 6) | buf[3]);
    }
  }
  Ok(out)
}

impl SshCliTransport {
  pub fn new(host: String) -> Result<Self, String> {
    validate_host_alias(&host)?;
    Ok(Self { host })
  }
}

impl TreqCommandTransport for SshCliTransport {
  fn execute<T: DeserializeOwned>(&self, request: TreqCommandRequest) -> Result<T, TransportError> {
    let args = request.cli_args().map_err_command()?;
    let output = Command::new("ssh")
      .arg("-o")
      .arg("BatchMode=yes")
      .arg("-o")
      .arg("ConnectTimeout=10")
      .arg(&self.host)
      .arg("env")
      .arg("LC_ALL=C")
      .arg("treq")
      .args(args)
      .output()
      .map_err(|e| TransportError::SshConnectionFailed(e.to_string()))?;

    if !output.status.success() {
      let stdout_error = serde_json::from_slice::<CliErrorBody>(&output.stdout)
        .ok()
        .map(|body| body.error.message);
      let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
      return Err(TransportError::CommandFailed {
        code: output.status.code(),
        message: stdout_error.unwrap_or_else(|| {
          if stderr.is_empty() {
            "Remote treq command failed".to_string()
          } else {
            stderr
          }
        }),
      });
    }

    serde_json::from_slice::<T>(&output.stdout)
      .map_err(|e| TransportError::InvalidJson(e.to_string()))
  }
}

// ---------------------------------------------------------------------------
// Native (Phase 4) SSH exec transport for typed commands
// ---------------------------------------------------------------------------
//
// `SshCliTransport` above is the legacy alias/subprocess transport, kept for
// the explicit-alias endpoint mode (`SshEndpointSource::ExplicitAlias`) where
// a user has deliberately opted into an ambient `~/.ssh` alias rather than a
// fully-modeled `SshEndpoint`. Every other path — managed and user-managed
// endpoints with real host-key pinning — goes through `SshExecTransport`,
// which never shells out to a system `ssh` binary and instead reuses the
// Phase 4 pooled `russh` connection.

/// Structured error for a typed command executed over the native transport.
/// Distinguishes a transport-layer failure (connection/host-key/auth/limits —
/// see [`crate::core::remote_ssh_transport::SshTransportError`]) from a
/// command-layer failure the remote Treq CLI itself reported, so a caller
/// can tell "we could not reach the CLI" from "the CLI ran and rejected the
/// request" and keep the CLI's own error code intact either way.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RemoteCommandError {
  Transport(String),
  Command {
    code: String,
    message: String,
  },
  InvalidJson(String),
  /// The endpoint's credential is under hard cutoff (PRD "Hard cutoff on
  /// revocation or expiry") — no further structured commands may be sent
  /// until the user reauthenticates. Kept distinct from `Transport` so a
  /// caller (the Tauri command layer, the UI) can drive a reauth prompt
  /// instead of a generic transport-error toast.
  CredentialCutOff {
    endpoint_id: String,
    reason: String,
  },
}

impl std::fmt::Display for RemoteCommandError {
  fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
    match self {
      Self::Transport(message) => write!(f, "transport_error: {message}"),
      Self::Command { code, message } => write!(f, "{code}: {message}"),
      Self::InvalidJson(message) => write!(f, "invalid_remote_json: {message}"),
      Self::CredentialCutOff {
        endpoint_id,
        reason,
      } => {
        write!(f, "credential_cut_off: endpoint {endpoint_id} ({reason})")
      }
    }
  }
}

impl std::error::Error for RemoteCommandError {}

/// Executes a typed `TreqCommandRequest` against `endpoint` over the pooled
/// native SSH transport's exec channel and decodes the JSON result. This is
/// the only path by which a Phase 5 mutation, read-only command, probe,
/// clone, or agent lifecycle call reaches the wire — `request` is always
/// built from an allow-listed enum variant, never a raw string, so no
/// frontend-provided arbitrary command can enter the exec channel.
pub async fn execute_remote_command<T: DeserializeOwned>(
  pool: &crate::core::remote_ssh_transport::SshConnectionPool,
  endpoint: &crate::core::remote_control_plane::SshEndpoint,
  request: TreqCommandRequest,
  limits: crate::core::remote_ssh_transport::ExecLimits,
  cancellation: &crate::core::remote_ssh_transport::CancellationToken,
) -> Result<T, RemoteCommandError> {
  let args = request
    .cli_args()
    .map_err(|error| RemoteCommandError::Command {
      code: "invalid_arguments".to_string(),
      message: error,
    })?;
  let output =
    crate::core::remote_ssh_transport::exec_command(pool, endpoint, &args, limits, cancellation)
      .await
      .map_err(|error| match error {
        crate::core::remote_ssh_transport::SshTransportError::CredentialCutOff {
          endpoint_id,
          reason,
        } => RemoteCommandError::CredentialCutOff {
          endpoint_id,
          reason: reason.to_string(),
        },
        crate::core::remote_ssh_transport::SshTransportError::CommandFailed {
          stderr,
          stdout,
          ..
        } => {
          // The CLI always emits `{"error":{"code":...,"message":...}}` on
          // stdout for a structured failure, so prefer that over stderr: it is
          // what lets the CLI's own error code survive transport mapping rather
          // than collapsing to a generic string.
          if let Ok(body) = serde_json::from_str::<CliErrorBody>(&stdout) {
            RemoteCommandError::Command {
              code: body.error.code,
              message: body.error.message,
            }
          } else {
            RemoteCommandError::Command {
              code: "treq_command_failed".to_string(),
              message: if stderr.is_empty() {
                "Remote treq command failed".to_string()
              } else {
                stderr
              },
            }
          }
        }
        other => RemoteCommandError::Transport(other.to_string()),
      })?;
  serde_json::from_slice::<T>(&output.stdout)
    .map_err(|error| RemoteCommandError::InvalidJson(error.to_string()))
}

impl TransportError {
  fn command_failed_from_message(message: String) -> Self {
    Self::CommandFailed {
      code: None,
      message,
    }
  }
}

trait TransportErrorExt<T> {
  fn map_err_command(self) -> Result<T, TransportError>;
}

impl<T> TransportErrorExt<T> for Result<T, String> {
  fn map_err_command(self) -> Result<T, TransportError> {
    self.map_err(TransportError::command_failed_from_message)
  }
}

pub fn inspect_repository_path(repo_path: &str) -> Result<RepositoryInspection, String> {
  let root = validate_repository_path(repo_path)?;
  let repository_type = detect_repository_type(&root)?;
  let branch = crate::core::repo::get_repo_current_branch(&root).ok();
  let default_branch =
    crate::core::repo::get_repo_default_branch(&root).unwrap_or_else(|_| "main".to_string());
  let current_commit_id = jj::jj_get_commit_id(&root, "@").unwrap_or_default();
  let current_change_id = String::new();
  let display_name = repository_display_name(&root);

  Ok(RepositoryInspection {
    root: root.clone(),
    repository_type,
    current_branch: branch.and_then(|branch| branch.current_branch),
    default_branch,
    current_change_id,
    current_commit_id,
    descriptor: RepositoryDescriptor {
      id: format!("local:{root}"),
      location: RepositoryLocation::Local { path: root },
      display_name,
    },
  })
}

pub fn remote_repository_from_inspection(
  host: &str,
  mut inspection: RepositoryInspection,
) -> RemoteRepository {
  let path = inspection.root.clone();
  let display_name = format!("{host}:{}", repository_display_name(&path));
  inspection.descriptor = RepositoryDescriptor {
    id: format!("ssh:{host}:{path}"),
    location: RepositoryLocation::Ssh {
      host: host.to_string(),
      path: path.clone(),
    },
    display_name: display_name.clone(),
  };
  RemoteRepository {
    host: host.to_string(),
    path: path.clone(),
    display_name,
    repo_uri: format!("ssh://{host}{path}"),
    inspection,
  }
}

pub fn parse_ssh_config_hosts(contents: &str) -> Vec<SshHost> {
  let mut aliases = BTreeSet::new();
  for line in contents.lines() {
    let trimmed = line.trim();
    if trimmed.is_empty() || trimmed.starts_with('#') {
      continue;
    }
    let mut parts = trimmed.split_whitespace();
    let Some(keyword) = parts.next() else {
      continue;
    };
    if !keyword.eq_ignore_ascii_case("host") {
      continue;
    }
    for alias in parts {
      if alias == "*" || alias.contains('*') || alias.contains('?') || alias.starts_with('!') {
        continue;
      }
      aliases.insert(alias.to_string());
    }
  }
  aliases.into_iter().map(|alias| SshHost { alias }).collect()
}

pub fn list_configured_hosts() -> Result<Vec<SshHost>, String> {
  list_configured_hosts_from_paths(ssh_config_paths())
}

pub fn list_configured_hosts_from_paths(paths: Vec<PathBuf>) -> Result<Vec<SshHost>, String> {
  let mut all = BTreeSet::new();
  for path in paths {
    if let Ok(contents) = fs::read_to_string(path) {
      for host in parse_ssh_config_hosts(&contents) {
        all.insert(host.alias);
      }
    }
  }
  Ok(all.into_iter().map(|alias| SshHost { alias }).collect())
}

pub fn check_readiness(host: &str) -> Result<RemoteReadiness, String> {
  validate_host_alias(host)?;
  // The trailing `df` term reports how many 1K blocks are in use on the
  // instance's home volume, which feeds the "sufficient disk space ...
  // remain within the user's base disk quota" expanded-readiness check
  // (PRD "Boot manifest and readiness").
  let script = "set -u; for c in treq jj git; do command -v $c >/dev/null 2>&1 && echo $c:ok || echo $c:missing; done; for c in claude codex cursor-agent cursor; do command -v $c >/dev/null 2>&1 && echo agent:$c:ok; done; df -Pk /home/treq 2>/dev/null | awk 'NR==2{print \"disk_used_kb:\"$3}'";
  let output = ssh_output(host, script)?;
  let stdout = String::from_utf8_lossy(&output.stdout);
  let mut checks = Vec::new();
  for line in stdout.lines() {
    let parts: Vec<_> = line.split(':').collect();
    match parts.as_slice() {
      [name, "ok"] => checks.push(RemoteReadinessCheck {
        name: (*name).to_string(),
        available: true,
        detail: "available".to_string(),
        code: None,
      }),
      [name, "missing"] => checks.push(RemoteReadinessCheck {
        name: (*name).to_string(),
        available: false,
        detail: "missing from PATH".to_string(),
        code: None,
      }),
      ["agent", name, "ok"] => checks.push(RemoteReadinessCheck {
        name: format!("agent:{name}"),
        available: true,
        detail: "available".to_string(),
        code: None,
      }),
      ["disk_used_kb", used_kb] => {
        if let Ok(used_kb) = used_kb.parse::<u64>() {
          checks.push(disk_quota_readiness_check(used_kb * 1024));
        }
      }
      _ => {}
    }
  }
  Ok(RemoteReadiness {
    host: host.to_string(),
    connected: output.status.success(),
    checks,
  })
}

/// Builds the "disk_quota" expanded-readiness check for `used_bytes` against
/// the base disk quota (PRD "Resource quotas" / "Expanded readiness").
/// Failing this check is a distinct, structured readiness failure (`code:
/// Some("disk_quota_exceeded")`), not a generic filesystem failure.
fn disk_quota_readiness_check(used_bytes: u64) -> RemoteReadinessCheck {
  match crate::core::remote_provider::check_disk_quota(used_bytes) {
    Ok(()) => RemoteReadinessCheck {
      name: "disk_quota".to_string(),
      available: true,
      detail: format!(
        "{used_bytes} of {} bytes base disk quota used",
        crate::core::remote_provider::BASE_DISK_QUOTA_BYTES
      ),
      code: None,
    },
    Err(err) => RemoteReadinessCheck {
      name: "disk_quota".to_string(),
      available: false,
      detail: err.to_string(),
      code: Some("disk_quota_exceeded".to_string()),
    },
  }
}

pub fn probe_repo(host: &str, path: &str) -> Result<RemoteRepoProbe, String> {
  validate_host_alias(host)?;
  validate_remote_path(path)?;
  let quoted = shell_quote(path);
  let script = format!("if [ -d {quoted} ]; then echo exists; if [ -d {quoted}/.jj ] || [ -d {quoted}/.git ]; then echo repo; fi; else echo missing; fi");
  let output = ssh_output(host, &script)?;
  let stdout = String::from_utf8_lossy(&output.stdout);
  let exists = stdout.lines().any(|line| line == "exists");
  let is_repo = stdout.lines().any(|line| line == "repo");
  Ok(RemoteRepoProbe {
    host: host.to_string(),
    path: path.to_string(),
    exists,
    is_repo,
    needs_clone: !is_repo,
  })
}

pub fn clone_repo(
  host: &str,
  repo_url: &str,
  destination: &str,
) -> Result<RemoteRepository, String> {
  validate_host_alias(host)?;
  validate_remote_path(destination)?;
  if repo_url.trim().is_empty() {
    return Err("Repository URL is required".to_string());
  }
  let quoted_url = shell_quote(repo_url);
  let quoted_destination = shell_quote(destination);
  let script = format!("git clone {quoted_url} {quoted_destination} && cd {quoted_destination} && treq st >/dev/null 2>&1 || true");
  let output = ssh_output(host, &script)?;
  if !output.status.success() {
    return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
  }
  open_repo(host, destination)
}

pub fn open_repo(host: &str, path: &str) -> Result<RemoteRepository, String> {
  let transport = SshCliTransport::new(host.to_string())?;
  let inspection = transport
    .execute::<RepositoryInspection>(TreqCommandRequest::InspectRepository {
      repo: path.to_string(),
    })
    .map_err(|error| match error {
      TransportError::SshConnectionFailed(message) => {
        format!("ssh_connection_failed: {message}")
      }
      TransportError::CommandFailed { message, .. } => message,
      TransportError::InvalidJson(message) => format!("invalid_remote_json: {message}"),
    })?;
  Ok(remote_repository_from_inspection(host, inspection))
}

pub fn build_ssh_shell_command(
  host: &str,
  working_dir: Option<&str>,
  initial_command: Option<&str>,
) -> Result<(String, Vec<String>), String> {
  validate_host_alias(host)?;
  let mut remote_command = String::new();
  if let Some(dir) = working_dir {
    validate_remote_path(dir)?;
    remote_command.push_str("cd ");
    remote_command.push_str(&shell_quote(dir));
    remote_command.push_str(" && ");
  }
  remote_command.push_str("${SHELL:-/bin/sh} -l");
  if let Some(command) = initial_command {
    if !command.trim().is_empty() {
      remote_command.push_str(" -c ");
      remote_command.push_str(&shell_quote(command));
    }
  }
  Ok((
    "ssh".to_string(),
    vec![host.to_string(), "-t".to_string(), remote_command],
  ))
}

fn validate_repository_path(repo_path: &str) -> Result<String, String> {
  let trimmed = repo_path.trim();
  if trimmed.is_empty() {
    return Err("Repository path is required".to_string());
  }
  let path = Path::new(trimmed);
  if !path.exists() {
    return Err("repository_not_found: Repository path does not exist".to_string());
  }
  if !path.is_dir() {
    return Err("invalid_repository: Repository path is not a directory".to_string());
  }
  std::fs::canonicalize(path)
    .map_err(|e| format!("permission_denied: Failed to read repository path: {e}"))?
    .to_str()
    .map(|path| path.to_string())
    .ok_or_else(|| "invalid_repository: Repository path is not valid UTF-8".to_string())
}

fn detect_repository_type(root: &str) -> Result<String, String> {
  let path = Path::new(root);
  let has_jj = path.join(".jj").is_dir();
  let has_git = path.join(".git").exists();
  match (has_jj, has_git) {
    (true, true) => Ok("jj_colocated".to_string()),
    (true, false) => Ok("jj".to_string()),
    (false, true) => Ok("git".to_string()),
    (false, false) => Err("invalid_repository: No .jj or .git directory found".to_string()),
  }
}

fn repository_display_name(path: &str) -> String {
  Path::new(path)
    .file_name()
    .and_then(|name| name.to_str())
    .filter(|name| !name.is_empty())
    .unwrap_or(path)
    .to_string()
}

fn ssh_config_paths() -> Vec<PathBuf> {
  let mut paths = Vec::new();
  if let Ok(home) = std::env::var("HOME") {
    paths.push(PathBuf::from(home).join(".ssh").join("config"));
  }
  paths.push(PathBuf::from("/etc/ssh/ssh_config"));
  paths
}

fn ssh_output(host: &str, script: &str) -> Result<std::process::Output, String> {
  Command::new("ssh")
    .arg("-o")
    .arg("BatchMode=yes")
    .arg("-o")
    .arg("ConnectTimeout=10")
    .arg(host)
    .arg(script)
    .output()
    .map_err(|e| format!("Failed to run ssh: {e}"))
}

pub fn shell_quote(value: &str) -> String {
  format!("'{}'", value.replace('\'', "'\\''"))
}

fn validate_host_alias(host: &str) -> Result<(), String> {
  if host.trim().is_empty() {
    return Err("SSH host is required".to_string());
  }
  if host
    .chars()
    .any(|c| c.is_whitespace() || matches!(c, ';' | '&' | '|' | '`' | '$' | '<' | '>'))
  {
    return Err("SSH host must be a host alias from ssh config".to_string());
  }
  Ok(())
}

fn validate_remote_path(path: &str) -> Result<(), String> {
  if path.trim().is_empty() {
    return Err("Remote path is required".to_string());
  }
  Ok(())
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn parses_ssh_hosts_ignoring_patterns() {
    let hosts = parse_ssh_config_hosts("\nHost prod bastion\n  HostName example.com\nHost *\nHost !blocked *.internal test?\nHost dev\n");
    let aliases: Vec<_> = hosts.into_iter().map(|h| h.alias).collect();
    assert_eq!(aliases, vec!["bastion", "dev", "prod"]);
  }

  #[test]
  fn lists_configured_hosts_from_multiple_files() {
    let temp_dir = tempfile::tempdir().unwrap();
    let user_config = temp_dir.path().join("user_config");
    let system_config = temp_dir.path().join("system_config");
    std::fs::write(&user_config, "Host dev prod\n  User test\n").unwrap();
    std::fs::write(&system_config, "Host prod staging *.ignored\n").unwrap();

    let hosts = list_configured_hosts_from_paths(vec![user_config, system_config]).unwrap();
    let aliases: Vec<_> = hosts.into_iter().map(|host| host.alias).collect();

    assert_eq!(aliases, vec!["dev", "prod", "staging"]);
  }

  #[test]
  fn probe_repo_rejects_empty_path_before_ssh() {
    let error = probe_repo("devbox", "").unwrap_err();
    assert_eq!(error, "Remote path is required");
  }

  #[test]
  fn clone_repo_rejects_empty_url_before_ssh() {
    let error = clone_repo("devbox", "", "/srv/project").unwrap_err();
    assert_eq!(error, "Repository URL is required");
  }

  #[test]
  fn directory_usage_sums_nested_file_sizes() {
    let dir = tempfile::tempdir().unwrap();
    std::fs::write(dir.path().join("a.txt"), vec![0u8; 10]).unwrap();
    let nested = dir.path().join("nested");
    std::fs::create_dir(&nested).unwrap();
    std::fs::write(nested.join("b.txt"), vec![0u8; 5]).unwrap();
    assert_eq!(directory_usage_bytes(dir.path()), 15);
  }

  #[test]
  fn enforce_disk_quota_passes_under_the_limit() {
    let dir = tempfile::tempdir().unwrap();
    std::fs::write(dir.path().join("a.txt"), vec![0u8; 10]).unwrap();
    assert!(enforce_disk_quota_against(dir.path(), 100).is_ok());
  }

  #[test]
  fn enforce_disk_quota_returns_distinct_structured_error_over_the_limit() {
    let dir = tempfile::tempdir().unwrap();
    std::fs::write(dir.path().join("a.txt"), vec![0u8; 10]).unwrap();
    let error = enforce_disk_quota_against(dir.path(), 5).unwrap_err();
    assert!(
      error.starts_with("disk_quota_exceeded: "),
      "expected a distinct disk_quota_exceeded error, got: {error}"
    );
  }

  #[test]
  fn enforce_disk_quota_falls_back_to_parent_for_a_not_yet_created_path() {
    let dir = tempfile::tempdir().unwrap();
    std::fs::write(dir.path().join("existing.bin"), vec![0u8; 10]).unwrap();
    let not_yet_created = dir.path().join("new-repo");
    // The target path doesn't exist yet (this is `init_repo_path`'s case),
    // so usage is measured from its parent instead of failing the walk.
    let error = enforce_disk_quota_against(&not_yet_created, 5).unwrap_err();
    assert!(error.starts_with("disk_quota_exceeded: "));
    assert!(enforce_disk_quota_against(&not_yet_created, 100).is_ok());
  }

  #[test]
  fn disk_quota_readiness_check_reports_a_distinct_code_when_over_quota() {
    let over = disk_quota_readiness_check(crate::core::remote_provider::BASE_DISK_QUOTA_BYTES);
    assert!(!over.available);
    assert_eq!(over.code.as_deref(), Some("disk_quota_exceeded"));

    let under = disk_quota_readiness_check(1);
    assert!(under.available);
    assert_eq!(under.code, None);
  }

  #[test]
  fn quotes_remote_paths_with_single_quotes() {
    assert_eq!(shell_quote("/tmp/a b/it's"), "'/tmp/a b/it'\\''s'");
  }

  #[test]
  fn builds_ssh_shell_command_with_working_dir() {
    let (program, args) = build_ssh_shell_command("devbox", Some("/srv/my app"), None).unwrap();
    assert_eq!(program, "ssh");
    assert_eq!(args[0], "devbox");
    assert!(args[2].contains("cd '/srv/my app'"));
  }

  #[test]
  fn rejects_unsafe_host_aliases() {
    assert!(build_ssh_shell_command("dev; rm -rf /", None, None).is_err());
  }

  #[test]
  fn builds_remote_repository_from_inspection() {
    let inspection = RepositoryInspection {
      root: "/srv/project".to_string(),
      repository_type: "jj_colocated".to_string(),
      current_branch: Some("main".to_string()),
      default_branch: "main".to_string(),
      current_change_id: "change".to_string(),
      current_commit_id: "commit".to_string(),
      descriptor: RepositoryDescriptor {
        id: "local:/srv/project".to_string(),
        location: RepositoryLocation::Local {
          path: "/srv/project".to_string(),
        },
        display_name: "project".to_string(),
      },
    };

    let repo = remote_repository_from_inspection("devbox", inspection);
    assert_eq!(repo.display_name, "devbox:project");
    assert_eq!(repo.repo_uri, "ssh://devbox/srv/project");
    assert_eq!(repo.inspection.descriptor.id, "ssh:devbox:/srv/project");
    assert!(matches!(
        repo.inspection.descriptor.location,
        RepositoryLocation::Ssh { ref host, ref path }
            if host == "devbox" && path == "/srv/project"
    ));
  }

  #[test]
  fn builds_typed_remote_review_command_arguments() {
    assert_eq!(
      TreqCommandRequest::ListChanges {
        repo: "/srv/project".into(),
        workspace: Some("feature-auth".into()),
      }
      .cli_args()
      .unwrap(),
      vec![
        "changes",
        "list",
        "--repo",
        "/srv/project",
        "--workspace",
        "feature-auth",
        "--format",
        "json"
      ]
    );
  }

  #[test]
  fn rejects_invalid_paths_in_typed_requests() {
    let error = TreqCommandRequest::ReadFile {
      repo: "/srv/project".into(),
      workspace: Some("main".into()),
      path: "".into(),
      revision: FileRevision::WorkingCopy,
      start_line: None,
      end_line: None,
    }
    .cli_args()
    .unwrap_err();
    assert_eq!(error, "Remote file path is required");
  }

  #[test]
  fn builds_typed_probe_clone_init_arguments() {
    assert_eq!(
      TreqCommandRequest::ProbeRepo {
        repo: "/srv/project".into()
      }
      .cli_args()
      .unwrap(),
      vec![
        "repo",
        "probe",
        "--repo",
        "/srv/project",
        "--format",
        "json"
      ]
    );
    assert_eq!(
      TreqCommandRequest::CloneRepo {
        repo_url: "git@example.com:x/y.git".into(),
        destination: "/srv/project".into(),
        idempotency_key: Some("key-1".into()),
      }
      .cli_args()
      .unwrap(),
      vec![
        "repo",
        "clone",
        "--repo",
        "/srv/project",
        "--value",
        "git@example.com:x/y.git",
        "--idempotency-key",
        "key-1",
        "--format",
        "json"
      ]
    );
  }

  #[test]
  fn rejects_empty_idempotency_key() {
    let error = TreqCommandRequest::InitRepo {
      repo: "/srv/project".into(),
      idempotency_key: Some("  ".into()),
    }
    .cli_args()
    .unwrap_err();
    assert_eq!(error, "Idempotency key must not be empty when provided");
  }

  // -- Idempotency ------------------------------------------------------------

  #[test]
  fn idempotency_key_replays_cached_result_for_a_create_style_mutation_instead_of_rerunning() {
    let calls = std::sync::Arc::new(std::sync::atomic::AtomicUsize::new(0));
    let calls_clone = calls.clone();
    let run = move || {
      let n = calls_clone.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
      Ok(serde_json::json!({ "created_count": n }))
    };
    let key = format!("test-create-{}", uuid_like());
    let first = with_idempotency_key("test.create", Some(&key), run.clone()).unwrap();
    let second = with_idempotency_key("test.create", Some(&key), run).unwrap();
    // The second call must replay the first response rather than invoking
    // `run` again — a retried "create" mutation must not duplicate work.
    assert_eq!(first, second);
    assert_eq!(calls.load(std::sync::atomic::Ordering::SeqCst), 1);
  }

  #[test]
  fn missing_idempotency_key_always_reruns_the_operation() {
    let calls = std::sync::Arc::new(std::sync::atomic::AtomicUsize::new(0));
    for _ in 0..2 {
      let calls_clone = calls.clone();
      with_idempotency_key("test.no-key", None, move || {
        calls_clone.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
        Ok(serde_json::json!(null))
      })
      .unwrap();
    }
    assert_eq!(calls.load(std::sync::atomic::Ordering::SeqCst), 2);
  }

  /// `describe_commit`'s CLI dispatch takes no idempotency key at all: it is
  /// naturally idempotent (rewriting a description is safe to repeat), so
  /// the typed request has no field for one and every call always runs.
  #[test]
  fn describe_commit_request_has_no_idempotency_key_field() {
    let args = TreqCommandRequest::DescribeCommit {
      repo: "/srv/project".into(),
      workspace: "1".into(),
      commit: "abc123".into(),
      message: "new description".into(),
    }
    .cli_args()
    .unwrap();
    assert!(!args.iter().any(|a| a == "--idempotency-key"));
  }

  fn uuid_like() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    format!(
      "{}-{}",
      std::process::id(),
      SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_nanos()
    )
  }
}
