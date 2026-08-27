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

#[derive(Debug, Clone, PartialEq, Eq)]
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
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FileRevision {
    WorkingCopy,
    Parent,
}

impl TreqCommandRequest {
    /// Convert a typed request into remote CLI arguments. Values remain separate
    /// process arguments so no frontend-provided value is interpreted as shell.
    pub fn cli_args(&self) -> Result<Vec<String>, String> {
        let (command, action, repo, workspace, path) = match self {
            Self::InspectRepository { repo } => ("repo", "inspect", repo, None, None),
            Self::RepositoryStatus { repo } => ("repo", "status", repo, None, None),
            Self::ListBranches { repo } => ("repo", "branches", repo, None, None),
            Self::ListWorkspaces { repo } => ("workspace", "list", repo, None, None),
            Self::InspectWorkspace { repo, workspace } => {
                ("workspace", "inspect", repo, Some(workspace), None)
            }
            Self::ListChanges { repo, workspace } => {
                ("changes", "list", repo, workspace.as_ref(), None)
            }
            Self::DiffFile {
                repo,
                workspace,
                path,
            } => ("changes", "diff", repo, workspace.as_ref(), Some(path)),
            Self::ReadFile {
                repo,
                workspace,
                path,
                ..
            } => ("file", "read", repo, workspace.as_ref(), Some(path)),
            Self::ListCommits { repo, workspace } => {
                ("commits", "list", repo, workspace.as_ref(), None)
            }
            Self::ListConflicts { repo, workspace } => {
                ("conflicts", "list", repo, workspace.as_ref(), None)
            }
        };
        validate_remote_path(repo)?;
        if let Some(path) = path {
            if path.trim().is_empty() {
                return Err("Remote file path is required".to_string());
            }
        }
        let mut args = vec![command.into(), action.into(), "--repo".into(), repo.clone()];
        if let Some(workspace) = workspace {
            if workspace.trim().is_empty() {
                return Err("Remote workspace is required".to_string());
            }
            args.extend(["--workspace".into(), workspace.clone()]);
        }
        if let Some(path) = path {
            args.extend(["--path".into(), path.clone()]);
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
    fn execute<T: DeserializeOwned>(
        &self,
        request: TreqCommandRequest,
    ) -> Result<T, TransportError>;
}

pub struct SshCliTransport {
    host: String,
}

/// In-process counterpart to [`SshCliTransport`]. Both transports serialize the
/// same core DTOs, which keeps local and remote callers on one response contract.
pub struct LocalTransport;

impl TreqCommandTransport for LocalTransport {
    fn execute<T: DeserializeOwned>(
        &self,
        request: TreqCommandRequest,
    ) -> Result<T, TransportError> {
        let value = execute_local_request(request).map_err_command()?;
        serde_json::from_value(value)
            .map_err(|error| TransportError::InvalidJson(error.to_string()))
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
        TreqCommandRequest::ListBranches { repo } => {
            json(crate::core::repo::list_repo_branches(&repo))
        }
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
            let workspace_path = match id {
                None => repo.clone(),
                Some(id) => {
                    let workspace = crate::local_db::get_workspace_by_id(&repo, id)
                        .map_err(|error| error.to_string())?
                        .ok_or_else(|| {
                            format!("workspace_not_found: Workspace {id} was not found")
                        })?;
                    Path::new(&repo)
                        .join(".treq")
                        .join("workspaces")
                        .join(workspace.workspace_path)
                        .to_string_lossy()
                        .into_owned()
                }
            };
            let files = crate::jj::get_conflicted_files(&workspace_path, None)
                .map_err(|error| format!("jj_command_failed: {error}"))?;
            serde_json::to_value(files).map_err(|error| error.to_string())
        }
    }
}

impl SshCliTransport {
    pub fn new(host: String) -> Result<Self, String> {
        validate_host_alias(&host)?;
        Ok(Self { host })
    }
}

impl TreqCommandTransport for SshCliTransport {
    fn execute<T: DeserializeOwned>(
        &self,
        request: TreqCommandRequest,
    ) -> Result<T, TransportError> {
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
            if alias == "*" || alias.contains('*') || alias.contains('?') || alias.starts_with('!')
            {
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
    let script = "set -u; for c in treq jj git; do command -v $c >/dev/null 2>&1 && echo $c:ok || echo $c:missing; done; for c in claude codex cursor-agent cursor; do command -v $c >/dev/null 2>&1 && echo agent:$c:ok; done";
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
            }),
            [name, "missing"] => checks.push(RemoteReadinessCheck {
                name: (*name).to_string(),
                available: false,
                detail: "missing from PATH".to_string(),
            }),
            ["agent", name, "ok"] => checks.push(RemoteReadinessCheck {
                name: format!("agent:{name}"),
                available: true,
                detail: "available".to_string(),
            }),
            _ => {}
        }
    }
    Ok(RemoteReadiness {
        host: host.to_string(),
        connected: output.status.success(),
        checks,
    })
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
}
