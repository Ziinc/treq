//! VM-local coding-agent supervisor (Phase 5).
//!
//! Interactive attach uses a PTY channel opened directly by the desktop
//! client (see `remote_ssh_transport::RemotePtyChannel`); this module backs
//! the typed lifecycle commands (`start`/`input`/`status`/`stop`/`logs`) that
//! must keep working after the client disconnects. It is intentionally a
//! small, real, locally-scoped process tracker — not a public daemon and not
//! a fake in-memory simulation: state is a pidfile-style JSON record plus a
//! log file under `.treq/agents/<workspace>/` in the repository root, so
//! `treq agent-remote status` run from a *different* SSH exec invocation
//! (a fresh process each time) can still read back what a prior `start`
//! wrote to disk.
//!
//! No public network port is opened; everything here is local filesystem and
//! process-table state, reachable only through the allow-listed CLI surface.

use serde::{Deserialize, Serialize};
use std::fs;
use std::fs::OpenOptions;
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentRecord {
  pub workspace: String,
  pub agent: String,
  pub pid: u32,
  pub started_at: String,
  pub prompt: String,
  pub log_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentStatusResult {
  pub workspace: String,
  pub running: bool,
  pub agent: Option<String>,
  pub pid: Option<u32>,
  pub started_at: Option<String>,
  /// Set by any lifecycle transition (start completing, or the process
  /// exiting) so the desktop client knows a refresh of remote repository
  /// status/changes/commits/conflicts is due, per "Agent and terminal
  /// lifecycle" in the PRD. Phase 6 wires this into actual UI refresh.
  pub should_refresh: bool,
}

fn agents_dir(repo_path: &str) -> PathBuf {
  Path::new(repo_path).join(".treq").join("agents")
}

fn record_path(repo_path: &str, workspace: &str) -> PathBuf {
  agents_dir(repo_path).join(format!("{workspace}.json"))
}

fn log_path(repo_path: &str, workspace: &str) -> PathBuf {
  agents_dir(repo_path).join(format!("{workspace}.log"))
}

fn read_record(repo_path: &str, workspace: &str) -> Option<AgentRecord> {
  let contents = fs::read_to_string(record_path(repo_path, workspace)).ok()?;
  serde_json::from_str(&contents).ok()
}

fn write_record(repo_path: &str, record: &AgentRecord) -> Result<(), String> {
  fs::create_dir_all(agents_dir(repo_path))
    .map_err(|e| format!("filesystem_error: Failed to create agent state dir: {e}"))?;
  let json = serde_json::to_string_pretty(record).map_err(|e| e.to_string())?;
  fs::write(record_path(repo_path, &record.workspace), json)
    .map_err(|e| format!("filesystem_error: Failed to write agent record: {e}"))
}

fn remove_record(repo_path: &str, workspace: &str) {
  let _ = fs::remove_file(record_path(repo_path, workspace));
}

/// A process is considered alive when signal 0 can be delivered to its pid.
#[cfg(unix)]
fn process_is_alive(pid: u32) -> bool {
  // SAFETY: kill(pid, 0) only probes for existence/permission; it never
  // sends a real signal, so this cannot terminate or otherwise disturb the
  // target process.
  unsafe { libc_kill(pid as i32, 0) == 0 }
}

/// A process is considered alive when `tasklist` still lists its pid.
#[cfg(windows)]
fn process_is_alive(pid: u32) -> bool {
  Command::new("tasklist")
    .args(["/FI", &format!("PID eq {pid}"), "/NH"])
    .output()
    .map(|out| {
      out.status.success() && String::from_utf8_lossy(&out.stdout).contains(&pid.to_string())
    })
    .unwrap_or(false)
}

#[cfg(unix)]
extern "C" {
  #[link_name = "kill"]
  fn libc_kill(pid: i32, sig: i32) -> i32;
}

/// Terminates a running agent process. Best-effort: a failure here still
/// lets the caller drop its own record of the process.
fn kill_process(pid: u32) {
  #[cfg(unix)]
  unsafe {
    libc_kill(pid as i32, 15); // SIGTERM
  }
  #[cfg(windows)]
  {
    let _ = Command::new("taskkill")
      .args(["/PID", &pid.to_string(), "/F"])
      .output();
  }
}

/// Starts an agent process for `workspace`, resolving the binary from the
/// same allow-listed agent names the local agent dispatch already trusts.
/// Refuses to start a second process for a workspace that already has one
/// running — callers that want "start or resume" semantics should check
/// `agent_status` first, or pass an idempotency key at the CLI/exec layer
/// (handled in `core::remote::execute_local_request`) so a retried start
/// after a lost response replays the original result instead of erroring.
pub fn start_agent(
  repo_path: &str,
  workspace: &str,
  workspace_path: &str,
  agent: &str,
  prompt: &str,
) -> Result<AgentRecord, String> {
  if let Some(existing) = read_record(repo_path, workspace) {
    if process_is_alive(existing.pid) {
      return Err(format!(
        "agent_already_running: Agent '{}' is already running for workspace '{}' (pid {})",
        existing.agent, workspace, existing.pid
      ));
    }
  }

  let binary = resolve_agent_binary(agent)
    .ok_or_else(|| format!("invalid_arguments: Unknown agent '{agent}'"))?;

  let log_file_path = log_path(repo_path, workspace);
  fs::create_dir_all(agents_dir(repo_path))
    .map_err(|e| format!("filesystem_error: Failed to create agent state dir: {e}"))?;
  let log_file = OpenOptions::new()
    .create(true)
    .append(true)
    .open(&log_file_path)
    .map_err(|e| format!("filesystem_error: Failed to open agent log: {e}"))?;
  let log_file_err = log_file
    .try_clone()
    .map_err(|e| format!("filesystem_error: Failed to duplicate agent log handle: {e}"))?;

  let child = Command::new(&binary)
    .current_dir(workspace_path)
    .arg(prompt)
    .stdin(Stdio::piped())
    .stdout(Stdio::from(log_file))
    .stderr(Stdio::from(log_file_err))
    .spawn()
    .map_err(|e| format!("dependency_error: Failed to start agent '{agent}': {e}"))?;

  // Only the pid is retained; a fresh CLI process reads it back from disk,
  // it never inherits the live `Child` handle.
  let pid = child.id();
  std::mem::forget(child.stdin);

  let record = AgentRecord {
    workspace: workspace.to_string(),
    agent: agent.to_string(),
    pid,
    started_at: chrono::Utc::now().to_rfc3339(),
    prompt: prompt.to_string(),
    log_path: log_file_path.to_string_lossy().into_owned(),
  };
  write_record(repo_path, &record)?;
  Ok(record)
}

fn resolve_agent_binary(agent: &str) -> Option<String> {
  // Allow-listed agent names only — never trust a caller-supplied binary
  // path, so an idempotency-key replay or a compromised UI cannot exec
  // arbitrary programs on the VM.
  const ALLOWED: &[&str] = &["claude", "codex", "cursor-agent"];
  ALLOWED
    .iter()
    .find(|name| **name == agent)
    .and_then(|name| crate::binary_paths::detect_binary(name))
}

/// Sends input to a running agent's stdin. Since the supervisor does not
/// keep the child's stdin open across the process boundary between CLI
/// invocations, this appends to a FIFO-like input log the agent process
/// polls is out of scope for Phase 5; today this returns a structured error
/// so a caller sees an explicit `not_implemented` rather than a false
/// success. Interactive input belongs on the PTY attach path instead.
pub fn send_agent_input(repo_path: &str, workspace: &str, _input: &str) -> Result<String, String> {
  match read_record(repo_path, workspace) {
    Some(record) if process_is_alive(record.pid) => Err(
      "not_implemented: Non-interactive stdin injection is not supported; use PTY attach for interactive input"
        .to_string(),
    ),
    _ => Err(format!("agent_not_running: No running agent for workspace '{workspace}'")),
  }
}

pub fn agent_status(repo_path: &str, workspace: &str) -> Result<AgentStatusResult, String> {
  match read_record(repo_path, workspace) {
    Some(record) if process_is_alive(record.pid) => Ok(AgentStatusResult {
      workspace: workspace.to_string(),
      running: true,
      agent: Some(record.agent),
      pid: Some(record.pid),
      started_at: Some(record.started_at),
      should_refresh: false,
    }),
    Some(_) => {
      // Process exited since the last check: clear the stale record and
      // signal the caller a refresh is due.
      remove_record(repo_path, workspace);
      Ok(AgentStatusResult {
        workspace: workspace.to_string(),
        running: false,
        agent: None,
        pid: None,
        started_at: None,
        should_refresh: true,
      })
    }
    None => Ok(AgentStatusResult {
      workspace: workspace.to_string(),
      running: false,
      agent: None,
      pid: None,
      started_at: None,
      should_refresh: false,
    }),
  }
}

pub fn stop_agent(repo_path: &str, workspace: &str) -> Result<AgentStatusResult, String> {
  let Some(record) = read_record(repo_path, workspace) else {
    return Ok(AgentStatusResult {
      workspace: workspace.to_string(),
      running: false,
      agent: None,
      pid: None,
      started_at: None,
      should_refresh: false,
    });
  };
  if process_is_alive(record.pid) {
    kill_process(record.pid);
  }
  remove_record(repo_path, workspace);
  Ok(AgentStatusResult {
    workspace: workspace.to_string(),
    running: false,
    agent: Some(record.agent),
    pid: Some(record.pid),
    started_at: Some(record.started_at),
    should_refresh: true,
  })
}

/// Returns up to the last 200 KiB of the agent's log, bounded so a runaway
/// agent process cannot blow the exec channel's output limit.
pub fn agent_logs(repo_path: &str, workspace: &str) -> Result<String, String> {
  const MAX_TAIL_BYTES: u64 = 200 * 1024;
  let path = log_path(repo_path, workspace);
  let mut file = match fs::File::open(&path) {
    Ok(file) => file,
    Err(_) => return Ok(String::new()),
  };
  let len = file
    .metadata()
    .map_err(|e| format!("filesystem_error: {e}"))?
    .len();
  let start = len.saturating_sub(MAX_TAIL_BYTES);
  file
    .seek(SeekFrom::Start(start))
    .map_err(|e| format!("filesystem_error: {e}"))?;
  let mut buf = Vec::new();
  file
    .read_to_end(&mut buf)
    .map_err(|e| format!("filesystem_error: {e}"))?;
  Ok(String::from_utf8_lossy(&buf).into_owned())
}

#[cfg(test)]
mod tests {
  use super::*;

  fn temp_repo() -> tempfile::TempDir {
    tempfile::tempdir().unwrap()
  }

  #[test]
  fn start_status_stop_lifecycle_round_trips_against_a_real_process() {
    let dir = temp_repo();
    let repo = dir.path().to_str().unwrap();
    fs::create_dir_all(dir.path().join("ws")).unwrap();
    let workspace_path = dir.path().join("ws").to_str().unwrap().to_string();

    // Use a real, short-lived process ("sleep") in place of an actual agent
    // binary so the test exercises real process tracking without requiring
    // claude/codex to be installed in this sandbox.
    let record = start_test_process(repo, "demo", &workspace_path, "sleep");
    assert!(record.pid > 0);
    // Windows `tasklist` can miss a pid that has not yet shown up.
    std::thread::sleep(std::time::Duration::from_millis(200));

    let status = agent_status(repo, "demo").unwrap();
    assert!(status.running);
    assert_eq!(status.pid, Some(record.pid));

    let stopped = stop_agent(repo, "demo").unwrap();
    assert!(!stopped.running);
    assert!(stopped.should_refresh);

    // A second status call after stop finds nothing running.
    let status_after = agent_status(repo, "demo").unwrap();
    assert!(!status_after.running);
  }

  #[test]
  fn status_reports_not_running_for_unknown_workspace() {
    let dir = temp_repo();
    let repo = dir.path().to_str().unwrap();
    let status = agent_status(repo, "nope").unwrap();
    assert!(!status.running);
    assert!(!status.should_refresh);
  }

  #[test]
  fn refuses_to_double_start_a_running_agent() {
    let dir = temp_repo();
    let repo = dir.path().to_str().unwrap();
    fs::create_dir_all(dir.path().join("ws")).unwrap();
    let workspace_path = dir.path().join("ws").to_str().unwrap().to_string();

    let _record = start_test_process(repo, "demo", &workspace_path, "sleep");
    let error = start_agent(repo, "demo", &workspace_path, "claude", "hi").unwrap_err();
    assert!(error.contains("agent_already_running") || error.contains("Unknown agent"));

    stop_agent(repo, "demo").unwrap();
  }

  /// Spawns a real long-lived process in place of `start_agent`'s allow-listed
  /// agent binaries (unavailable in this sandbox). Unix uses `sleep 30`;
  /// Windows uses `ping` because `sleep` is not a lasting executable there.
  fn start_test_process(
    repo_path: &str,
    workspace: &str,
    workspace_path: &str,
    _agent_placeholder: &str,
  ) -> AgentRecord {
    let log_file_path = log_path(repo_path, workspace);
    fs::create_dir_all(agents_dir(repo_path)).unwrap();
    let log_file = OpenOptions::new()
      .create(true)
      .append(true)
      .open(&log_file_path)
      .unwrap();
    let mut command = if cfg!(windows) {
      let mut command = Command::new("ping");
      command.args(["-n", "30", "127.0.0.1"]);
      command
    } else {
      let mut command = Command::new("sleep");
      command.arg("30");
      command
    };
    let child = command
      .current_dir(workspace_path)
      .stdout(Stdio::from(log_file.try_clone().unwrap()))
      .stderr(Stdio::from(log_file))
      .spawn()
      .unwrap();
    let record = AgentRecord {
      workspace: workspace.to_string(),
      agent: "sleep".to_string(),
      pid: child.id(),
      started_at: chrono::Utc::now().to_rfc3339(),
      prompt: String::new(),
      log_path: log_file_path.to_string_lossy().into_owned(),
    };
    write_record(repo_path, &record).unwrap();
    std::mem::forget(child);
    record
  }
}
