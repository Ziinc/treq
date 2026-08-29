//! Tauri command surface for Phase 5 typed remote commands: probe/clone/init,
//! read-only review commands, remote mutations, and agent lifecycle.
//!
//! Every command here takes a fully-typed [`crate::core::remote::TreqCommandRequest`]
//! (allow-listed at the type level — Tauri's own JSON deserialization rejects
//! any shape that is not one of the enum's known variants) rather than a raw
//! command string, so the "no frontend-provided arbitrary command enters an
//! exec channel" requirement holds at the IPC boundary too, not only inside
//! the exec transport.
//!
//! `remote_dispatch_local` reuses exactly the same core dispatch
//! (`execute_local_request`) that the CLI itself calls, so results share one
//! DTO with the local Tauri path. `remote_dispatch_over_ssh` runs the same
//! typed request against a real `SshEndpoint` over the Phase 4 native
//! transport. Neither is wired into any component yet — that is Phase 6's
//! job — but both are real, callable, and tested.

use crate::core::remote::{RemoteCommandError, TreqCommandRequest};
use crate::core::remote_control_plane::SshEndpoint;
use crate::core::remote_ssh_transport::{
  CancellationToken, ExecLimits, SshConnectionPool, SshTransportMetricsSnapshot,
};
use std::sync::Arc;
use tauri::State;

/// Shared connection pool for Phase 5 typed SSH exec commands, so repeated
/// calls from the UI reuse one multiplexed connection per endpoint instead
/// of reconnecting on every command (PRD: "native SSH transport reuses a
/// connection for multiple structured commands").
pub struct RemoteExecState(pub Arc<SshConnectionPool>);

impl Default for RemoteExecState {
  fn default() -> Self {
    Self(Arc::new(SshConnectionPool::new()))
  }
}

/// Runs a typed request against the local machine, through the same
/// dispatch the CLI and the SSH exec channel both use.
#[tauri::command]
pub async fn remote_dispatch_local(
  request: TreqCommandRequest,
) -> Result<serde_json::Value, String> {
  tauri::async_runtime::spawn_blocking(move || crate::core::remote::execute_local_request(request))
    .await
    .map_err(|e| format!("Failed to join remote_dispatch_local task: {e}"))?
}

/// Runs a typed request against a real `SshEndpoint` over the pooled native
/// SSH transport, returning the raw JSON result. Errors preserve the CLI's
/// own structured code where available (see `RemoteCommandError`).
#[tauri::command]
pub async fn remote_dispatch_over_ssh(
  endpoint: SshEndpoint,
  request: TreqCommandRequest,
  state: State<'_, RemoteExecState>,
) -> Result<serde_json::Value, String> {
  let pool = state.0.clone();
  let cancellation = CancellationToken::new();
  crate::core::remote::execute_remote_command::<serde_json::Value>(
    &pool,
    &endpoint,
    request,
    ExecLimits::default(),
    &cancellation,
  )
  .await
  .map_err(remote_command_error_to_string)
}

fn remote_command_error_to_string(error: RemoteCommandError) -> String {
  error.to_string()
}

/// Returns a snapshot of this session's SSH transport telemetry (PRD Phase 7
/// "Client and transport telemetry" — DNS/TCP and negotiation/auth duration,
/// host-key mismatches, pooled connection reuse, reconnects, exec channel
/// duration and exit categories, PTY start/exit, and version-mismatch
/// counts). A future diagnostics panel can poll this; it is not wired into
/// any UI component here.
#[tauri::command]
pub fn remote_transport_metrics(
  state: State<'_, RemoteExecState>,
) -> Result<SshTransportMetricsSnapshot, String> {
  Ok(state.0.metrics_snapshot())
}

#[cfg(test)]
mod tests {
  use super::*;

  #[tokio::test]
  async fn dispatch_local_rejects_arbitrary_unlisted_shapes_at_the_type_boundary() {
    // The request is always a `TreqCommandRequest` variant, so there is no
    // way to reach `remote_dispatch_local` with a raw string; the strongest
    // test we can run at this layer is that Tauri's own JSON deserialization
    // for the enum rejects an unknown tag rather than accepting it.
    let raw = serde_json::json!({ "kind": "ExecArbitraryShellCommand", "cmd": "rm -rf /" });
    let parsed = serde_json::from_value::<TreqCommandRequest>(raw);
    assert!(parsed.is_err());
  }

  #[tokio::test]
  async fn dispatch_local_runs_a_real_probe_against_the_filesystem() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().to_str().unwrap().to_string();
    let value = remote_dispatch_local(TreqCommandRequest::ProbeRepo { repo: path })
      .await
      .unwrap();
    assert_eq!(value["exists"], serde_json::Value::Bool(true));
    assert_eq!(value["is_repo"], serde_json::Value::Bool(false));
  }
}
