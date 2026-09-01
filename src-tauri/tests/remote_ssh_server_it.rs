//! Real-`sshd` counterpart to `core::remote_ssh_transport`'s `mod tests`.
//!
//! Every test in that module runs against an in-process mock
//! `russh::server` - real code under test, but a fake server. This file
//! drives the same production transport (`SshConnectionPool`,
//! `HostKeyVerifier`, `exec_command`) against a *real*, independently
//! implemented `sshd` (the `linuxserver/openssh-server` container started as
//! a GitHub Actions service in `.github/workflows/remote-ssh-server-it.yml`),
//! closing part of the gap `remote_e2e_README.md` documents under "Valid/
//! expired/revoked certificate acceptance against a real `sshd`" - the
//! publickey-auth-against-a-real-server half of it, not the certificate half
//! (that still needs a real Supabase-issued cert, out of scope here).
//!
//! `exec_command` always runs `treq <args>` on the far end (see
//! `build_remote_command_line`), so a real Treq CLI would be needed to
//! assert on real subcommand output. Standing one up inside a minimal
//! `openssh-server` container (musl/Alpine, no GTK/WebKit) is out of scope
//! for what this file proves. Instead the CI workflow installs a tiny stub
//! `treq` shim (see the workflow's "Install stub treq CLI" step) that only
//! echoes back its arguments and exit codes. That is enough to prove, for
//! real, over a real network SSH exec channel: publickey auth against a real
//! server, host-key pinning accept/reject against a real presented key,
//! connection pooling/reuse, and that argument quoting survives the round
//! trip - the actual thing this file is testing. It proves nothing about
//! `TreqCommandRequest`'s JSON payloads or the real CLI's behavior; that is
//! still gap #11 in `remote_e2e_README.md`.
//!
//! ## Running this suite
//!
//! Gated on `TREQ_SSH_SERVER_IT=1` plus connection details for a reachable
//! `sshd`. With no opt-in, every test prints "SKIP: ..." and passes - it
//! never fakes an assertion against no server.
//!
//! - `TREQ_SSH_SERVER_IT=1`: explicit opt-in.
//! - `TREQ_SSH_IT_HOST` (default `127.0.0.1`).
//! - `TREQ_SSH_IT_PORT` (default `2222`).
//! - `TREQ_SSH_IT_USERNAME` (default `treq`).
//! - `TREQ_SSH_IT_KEY_PATH`: path to the OpenSSH private key authorized on
//!   the server (the CI workflow uses the throwaway test-only key committed
//!   at `src-tauri/tests/fixtures/remote_ssh_it/id_ed25519` - it only ever
//!   grants access to an ephemeral, network-isolated CI container, so it is
//!   deliberately not a secret).
//! - `TREQ_SSH_IT_HOST_KEY_ALGORITHM` (default `ssh-ed25519`).
//! - `TREQ_SSH_IT_HOST_KEY_FINGERPRINT`: the server's real SHA256 host-key
//!   fingerprint, discovered at CI time via `ssh-keyscan` (never hardcoded -
//!   pinning a value nobody derived from the live server would defeat the
//!   point of this test).

use std::sync::Once;
use std::time::Duration;

use treq_lib::core::remote_control_plane::{
  SshAuthentication, SshEndpoint, SshEndpointSource, TrustedHostKey,
};
use treq_lib::core::remote_ssh_transport::{
  exec_command, CancellationToken, ExecLimits, SshConnectionPool, SshTransportError,
};

struct ItConfig {
  endpoint: SshEndpoint,
}

/// Central skip gate, mirroring `remote_e2e.rs::e2e_config`: every test
/// calls this first and returns early (test passes, prints why) when it is
/// `None`, so a run with no real server never fakes a passing assertion.
fn it_config() -> Option<ItConfig> {
  static PRINT_BANNER: Once = Once::new();

  if std::env::var("TREQ_SSH_SERVER_IT").as_deref() != Ok("1") {
    PRINT_BANNER.call_once(|| {
      eprintln!(
        "[remote-ssh-server-it] SKIP: TREQ_SSH_SERVER_IT=1 not set. Real-sshd \
         tests in remote_ssh_server_it.rs do not run. See \
         .github/workflows/remote-ssh-server-it.yml and this file's header."
      );
    });
    return None;
  }

  let hostname = std::env::var("TREQ_SSH_IT_HOST").unwrap_or_else(|_| "127.0.0.1".to_string());
  let port: u16 = std::env::var("TREQ_SSH_IT_PORT")
    .ok()
    .and_then(|v| v.parse().ok())
    .unwrap_or(2222);
  let username = std::env::var("TREQ_SSH_IT_USERNAME").unwrap_or_else(|_| "treq".to_string());
  let key_reference = std::env::var("TREQ_SSH_IT_KEY_PATH").ok()?;
  let algorithm =
    std::env::var("TREQ_SSH_IT_HOST_KEY_ALGORITHM").unwrap_or_else(|_| "ssh-ed25519".to_string());
  let fingerprint_sha256 = std::env::var("TREQ_SSH_IT_HOST_KEY_FINGERPRINT").ok()?;

  Some(ItConfig {
    endpoint: SshEndpoint {
      id: "remote-ssh-server-it".to_string(),
      instance_id: None,
      source: SshEndpointSource::UserManaged,
      hostname,
      port,
      username,
      host_keys: vec![TrustedHostKey {
        algorithm,
        fingerprint_sha256,
        comment: None,
      }],
      authentication: SshAuthentication::PublicKey { key_reference },
    },
  })
}

macro_rules! require_it {
  () => {
    match it_config() {
      Some(cfg) => cfg,
      None => {
        eprintln!(
          "[remote-ssh-server-it] SKIP {}: missing TREQ_SSH_SERVER_IT=1 / \
           TREQ_SSH_IT_KEY_PATH / TREQ_SSH_IT_HOST_KEY_FINGERPRINT",
          module_path!()
        );
        return;
      }
    }
  };
}

#[tokio::test]
async fn exec_command_runs_the_stub_cli_over_a_real_ssh_connection() {
  let cfg = require_it!();
  let pool = SshConnectionPool::new();
  let cancellation = CancellationToken::new();

  let output = exec_command(
    &pool,
    &cfg.endpoint,
    &["ok".to_string(), "hello world".to_string()],
    ExecLimits::default(),
    &cancellation,
  )
  .await
  .expect("exec_command against a real sshd should succeed");

  assert_eq!(
    String::from_utf8_lossy(&output.stdout).trim(),
    "stub-ok:hello world",
    "argument containing a space must survive shell_quote's round trip \
     through a real exec channel, not just the in-process mock"
  );
}

#[tokio::test]
async fn exec_command_surfaces_the_stub_cli_nonzero_exit_and_stderr() {
  let cfg = require_it!();
  let pool = SshConnectionPool::new();
  let cancellation = CancellationToken::new();

  let error = exec_command(
    &pool,
    &cfg.endpoint,
    &["fail".to_string(), "boom".to_string()],
    ExecLimits::default(),
    &cancellation,
  )
  .await
  .expect_err("a nonzero exit from a real remote command must be reported as an error");

  match error {
    SshTransportError::CommandFailed {
      exit_status,
      stderr,
      ..
    } => {
      assert_eq!(exit_status, Some(7));
      assert!(
        stderr.contains("stub-fail:boom"),
        "stderr should carry the stub's message, got: {stderr:?}"
      );
    }
    other => panic!("expected CommandFailed, got {other:?}"),
  }
}

#[tokio::test]
async fn pool_reuses_one_connection_across_multiple_execs_against_a_real_server() {
  let cfg = require_it!();
  let pool = SshConnectionPool::new();

  for i in 0..3 {
    let cancellation = CancellationToken::new();
    let output = exec_command(
      &pool,
      &cfg.endpoint,
      &["ok".to_string(), format!("round-{i}")],
      ExecLimits::default(),
      &cancellation,
    )
    .await
    .unwrap_or_else(|error| panic!("exec {i} against real sshd failed: {error}"));
    assert_eq!(
      String::from_utf8_lossy(&output.stdout).trim(),
      format!("stub-ok:round-{i}")
    );
  }

  assert_eq!(
    pool.pooled_connection_count().await,
    1,
    "three sequential commands against the same endpoint must reuse one \
     pooled network connection to the real server, not open three"
  );
}

#[tokio::test]
async fn exec_command_rejects_a_real_server_whose_host_key_is_not_the_pinned_one() {
  let mut cfg = require_it!();
  // Corrupt the pinned fingerprint so it no longer matches the real
  // server's actual host key. This proves `HostKeyVerifier` rejects a live,
  // correctly-behaving `sshd` the same way it rejects the mock server in
  // `remote_ssh_transport.rs`'s unit tests - i.e. that the reject path is
  // not an artifact of the mock server never presenting a "real" key.
  cfg.endpoint.host_keys[0].fingerprint_sha256 = "SHA256:not-the-real-host-key".to_string();
  cfg.endpoint.id = "remote-ssh-server-it-wrong-fingerprint".to_string();

  let pool = SshConnectionPool::new();
  let cancellation = CancellationToken::new();

  let error = exec_command(
    &pool,
    &cfg.endpoint,
    &["ok".to_string(), "should-not-run".to_string()],
    ExecLimits::default(),
    &cancellation,
  )
  .await
  .expect_err("a mismatched pinned host key must reject the real server, not connect to it");

  assert!(
    matches!(
      error,
      SshTransportError::HostKeyMismatch { .. } | SshTransportError::ConnectionFailed(_)
    ),
    "expected a host-key rejection, got {error:?}"
  );
}

#[tokio::test]
async fn exec_command_enforces_deadline_against_a_real_slow_command() {
  let cfg = require_it!();
  let pool = SshConnectionPool::new();
  let cancellation = CancellationToken::new();

  let error = exec_command(
    &pool,
    &cfg.endpoint,
    &["sleep".to_string(), "5".to_string()],
    ExecLimits {
      deadline: Duration::from_millis(300),
      ..ExecLimits::default()
    },
    &cancellation,
  )
  .await
  .expect_err("a command that outlives the deadline must time out, not hang the test");

  assert!(matches!(error, SshTransportError::DeadlineExceeded));
}
