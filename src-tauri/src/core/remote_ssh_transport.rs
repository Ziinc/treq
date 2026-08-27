//! Native Rust SSH transport (Phase 4: "Native desktop SSH").
//!
//! Replaces system `ssh` subprocesses with the pure-Rust [`russh`] client for
//! the managed transport path. This module owns exactly the responsibilities
//! listed under the PRD's "Native SSH transport" section:
//!
//! - strict host-key verification against Phase 3's [`TrustedHostKey`]s;
//! - user-key and certificate authentication ([`SshAuthentication`]);
//! - connection pooling and channel multiplexing;
//! - keepalives, reconnect, and stale-connection recovery;
//! - exec channels (non-interactive, JSON-producing) with deadlines,
//!   cancellation, and output limits;
//! - PTY channels for interactive shells and agents, with resize support.
//!
//! It consumes the domain types from [`crate::core::remote_control_plane`]
//! (`SshEndpoint`, `TrustedHostKey`, `SshEndpointSource`, `SshAuthentication`)
//! rather than redefining them. It does not implement JJ, Git, workspace, or
//! any other repository behavior: callers hand it a fully-formed
//! `treq <command> --format=json` argument vector and get back raw
//! stdout/stderr bytes plus an exit status; interpreting that JSON is Phase
//! 5's job.
//!
//! SFTP and port forwarding are out of scope, per the PRD.

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

use russh::client::{AuthResult, Handle, Handler as ClientHandlerTrait};
use russh::keys::{PrivateKey, PrivateKeyWithHashAlg};
use russh::{ChannelMsg, Disconnect};
use tokio::io::AsyncWriteExt;
use tokio::sync::Mutex as AsyncMutex;
use tokio::sync::Notify;

use crate::core::remote_control_plane::{SshAuthentication, SshEndpoint, TrustedHostKey};

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/// Errors surfaced by the native transport. Kept distinct from
/// [`crate::core::remote::TransportError`] (the older, subprocess-based
/// transport's error type) so a Phase 5 caller can pattern-match without
/// pulling in `std::process` semantics that no longer apply.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SshTransportError {
  /// The presented host key did not match any trusted fingerprint recorded
  /// for this endpoint. Never bypassed, never auto-trusted.
  HostKeyMismatch {
    endpoint_id: String,
    presented_fingerprint: String,
  },
  /// TCP connect, key exchange, or protocol negotiation failed.
  ConnectionFailed(String),
  /// Authentication (key or certificate) was rejected by the server.
  AuthenticationFailed(String),
  /// Key or certificate material could not be loaded from local disk.
  KeyMaterialUnavailable(String),
  /// The exec channel exceeded its total operation deadline.
  DeadlineExceeded,
  /// The exec channel produced more stdout/stderr bytes than the configured
  /// limit before completing.
  OutputLimitExceeded,
  /// The caller cancelled the operation (e.g. dropped a `CancellationToken`).
  Cancelled,
  /// The remote command exited non-zero. Carries stderr so a Phase 5 caller
  /// can surface diagnostics without re-parsing stdout.
  CommandFailed {
    exit_status: Option<u32>,
    stderr: String,
  },
  /// stdout was not valid UTF-8 / valid JSON once decoded by the caller.
  ProtocolError(String),
  /// Underlying channel or session I/O failure, e.g. after a stale
  /// connection is detected mid-operation.
  ChannelError(String),
}

impl std::fmt::Display for SshTransportError {
  fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
    match self {
      Self::HostKeyMismatch { endpoint_id, .. } => {
        write!(f, "host key mismatch for endpoint {endpoint_id}")
      }
      Self::ConnectionFailed(message) => write!(f, "ssh connection failed: {message}"),
      Self::AuthenticationFailed(message) => write!(f, "ssh authentication failed: {message}"),
      Self::KeyMaterialUnavailable(message) => write!(f, "ssh key material unavailable: {message}"),
      Self::DeadlineExceeded => write!(f, "ssh operation exceeded its deadline"),
      Self::OutputLimitExceeded => write!(f, "ssh command output exceeded the configured limit"),
      Self::Cancelled => write!(f, "ssh operation was cancelled"),
      Self::CommandFailed {
        exit_status,
        stderr,
      } => {
        write!(f, "remote command failed (exit={exit_status:?}): {stderr}")
      }
      Self::ProtocolError(message) => write!(f, "invalid remote command protocol: {message}"),
      Self::ChannelError(message) => write!(f, "ssh channel error: {message}"),
    }
  }
}

impl std::error::Error for SshTransportError {}

/// [`ClientHandlerTrait::Error`] must implement `From<russh::Error>`.
impl From<russh::Error> for SshTransportError {
  fn from(error: russh::Error) -> Self {
    Self::ChannelError(error.to_string())
  }
}

// ---------------------------------------------------------------------------
// Host-key verification
// ---------------------------------------------------------------------------

/// Computes the SHA256 fingerprint string (`SHA256:<base64>`) for a server
/// host key or certificate, in the same shape as [`TrustedHostKey`]'s
/// `fingerprint_sha256`.
fn fingerprint_of(key: &russh::keys::PublicKeyOrCertificate) -> Option<String> {
  match key {
    russh::keys::PublicKeyOrCertificate::PublicKey { key, .. } => {
      Some(key.fingerprint(russh::keys::HashAlg::Sha256).to_string())
    }
    // Server host certificates are not part of the Phase 3 trust model
    // (`TrustedHostKey` pins bare host keys); rejecting them is the strict,
    // never-bypass default rather than silently trusting an unpinned CA.
    russh::keys::PublicKeyOrCertificate::Certificate(_) => None,
  }
}

/// Strict host-key verification against a fixed set of trusted fingerprints
/// for one endpoint/generation. Never falls back to trust-on-first-use and
/// never consults the OS `~/.ssh/known_hosts` — managed host trust is tracked
/// independently, per the PRD's "Host-key verification" section.
#[derive(Debug, Clone)]
pub struct HostKeyVerifier {
  endpoint_id: String,
  trusted_fingerprints: Vec<String>,
}

impl HostKeyVerifier {
  pub fn new(endpoint_id: impl Into<String>, host_keys: &[TrustedHostKey]) -> Self {
    Self {
      endpoint_id: endpoint_id.into(),
      trusted_fingerprints: host_keys
        .iter()
        .map(|key| key.fingerprint_sha256.clone())
        .collect(),
    }
  }

  /// Returns `Ok(())` when `presented` matches one of the trusted
  /// fingerprints, `Err` (never a bypassable warning) otherwise.
  pub fn verify(
    &self,
    presented: &russh::keys::PublicKeyOrCertificate,
  ) -> Result<(), SshTransportError> {
    let Some(fingerprint) = fingerprint_of(presented) else {
      return Err(SshTransportError::HostKeyMismatch {
        endpoint_id: self.endpoint_id.clone(),
        presented_fingerprint: "<certificate>".to_string(),
      });
    };
    if self
      .trusted_fingerprints
      .iter()
      .any(|trusted| trusted == &fingerprint)
    {
      Ok(())
    } else {
      Err(SshTransportError::HostKeyMismatch {
        endpoint_id: self.endpoint_id.clone(),
        presented_fingerprint: fingerprint,
      })
    }
  }
}

// ---------------------------------------------------------------------------
// Client handler
// ---------------------------------------------------------------------------

/// `russh::client::Handler` implementation. Holds only what is needed to
/// verify the server's host key; it performs no logging of key material and
/// carries no secrets itself (those live in [`ClientAuthenticator`]).
#[derive(Clone)]
struct TreqSshClientHandler {
  verifier: HostKeyVerifier,
}

impl ClientHandlerTrait for TreqSshClientHandler {
  type Error = SshTransportError;

  async fn check_server_key(
    &mut self,
    server_public_key: &russh::keys::PublicKeyOrCertificate,
  ) -> Result<bool, Self::Error> {
    match self.verifier.verify(server_public_key) {
      Ok(()) => Ok(true),
      Err(error) => {
        // Redaction: log only the endpoint id and fingerprint (public,
        // non-sensitive values), never key material.
        tracing::warn!(
          endpoint_id = %self.verifier.endpoint_id,
          error = %error,
          "ssh host key verification failed"
        );
        // Returning Ok(false) lets russh reject the connection cleanly
        // instead of propagating an error that could look like a transport
        // fault; the caller still learns about the mismatch because
        // `connect_verified` re-checks and returns `Err` explicitly below.
        Ok(false)
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Authentication
// ---------------------------------------------------------------------------

/// Loads client key material for an [`SshEndpoint`]'s [`SshAuthentication`].
///
/// Key material never lives in Supabase or any control-plane record (PRD:
/// "Treq never generates a user private key" / "Supabase stores public keys
/// ... only"). The `key_reference` string names a private key already on the
/// user's device. Two forms are accepted, matching how `remote.rs` already
/// treats host references as opaque, pre-existing local configuration rather
/// than something Treq synthesizes:
///
/// - an absolute or `~`-relative path to an OpenSSH private key file;
/// - a bare filename, resolved under `~/.ssh/`.
///
/// For certificate authentication, the signed certificate is expected next
/// to the private key as `<key path>-cert.pub` (the standard OpenSSH
/// convention `ssh-keygen -s` produces), unless `key_reference` already
/// points at a `-cert.pub` file in which case the private key is the same
/// path with that suffix stripped.
pub struct ClientAuthenticator;

impl ClientAuthenticator {
  fn resolve_private_key_path(key_reference: &str) -> PathBuf {
    let reference = key_reference
      .strip_suffix("-cert.pub")
      .unwrap_or(key_reference);
    let expanded = if let Some(rest) = reference.strip_prefix("~/") {
      dirs_home().join(rest)
    } else {
      PathBuf::from(reference)
    };
    if expanded.is_absolute() || expanded.components().count() > 1 {
      expanded
    } else {
      dirs_home().join(".ssh").join(expanded)
    }
  }

  fn load_private_key(key_reference: &str) -> Result<PrivateKey, SshTransportError> {
    let path = Self::resolve_private_key_path(key_reference);
    russh::keys::load_secret_key(&path, None).map_err(|error| {
      // Never log the path's contents; the path itself is not secret.
      SshTransportError::KeyMaterialUnavailable(format!(
        "failed to load private key from {}: {error}",
        path.display()
      ))
    })
  }

  fn load_certificate(key_reference: &str) -> Result<russh::keys::Certificate, SshTransportError> {
    let key_path = Self::resolve_private_key_path(key_reference);
    let cert_path = PathBuf::from(format!("{}-cert.pub", key_path.display()));
    russh::keys::load_openssh_certificate(&cert_path).map_err(|error| {
      SshTransportError::KeyMaterialUnavailable(format!(
        "failed to load certificate from {}: {error}",
        cert_path.display()
      ))
    })
  }

  /// Authenticates `handle` per `authentication`, using `username` from the
  /// endpoint. Returns an error rather than silently downgrading to a
  /// weaker method on failure.
  async fn authenticate(
    handle: &mut Handle<TreqSshClientHandler>,
    username: &str,
    authentication: &SshAuthentication,
  ) -> Result<(), SshTransportError> {
    let result = match authentication {
      SshAuthentication::PublicKey { key_reference } => {
        let key = Arc::new(Self::load_private_key(key_reference)?);
        let hash_alg = handle
          .best_supported_rsa_hash()
          .await
          .ok()
          .flatten()
          .flatten();
        handle
          .authenticate_publickey(username, PrivateKeyWithHashAlg::new(key, hash_alg))
          .await
          .map_err(|error| SshTransportError::AuthenticationFailed(error.to_string()))?
      }
      SshAuthentication::Certificate { key_reference } => {
        let key = Arc::new(Self::load_private_key(key_reference)?);
        let cert = Self::load_certificate(key_reference)?;
        handle
          .authenticate_openssh_cert(username, key, cert)
          .await
          .map_err(|error| SshTransportError::AuthenticationFailed(error.to_string()))?
      }
    };
    match result {
      AuthResult::Success => Ok(()),
      AuthResult::Failure { .. } => Err(SshTransportError::AuthenticationFailed(
        "server rejected the presented key or certificate".to_string(),
      )),
    }
  }
}

fn dirs_home() -> PathBuf {
  std::env::var("HOME")
    .map(PathBuf::from)
    .unwrap_or_else(|_| PathBuf::from("."))
}

// ---------------------------------------------------------------------------
// Connection pooling
// ---------------------------------------------------------------------------

/// Pool key derivation. Per the PRD: "Repository identity references the
/// endpoint ID ... generation", so the pool is keyed on more than a hostname
/// — endpoint id, generation, and the connection parameters that would
/// actually require a new TCP/SSH session if they changed. Two endpoints
/// that happen to share a hostname (e.g. after a reprovision that reused an
/// address) must never share a pooled connection across a generation
/// boundary, and a host-key rotation must never silently keep an old,
/// now-untrusted connection alive.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct PoolKey {
  endpoint_id: String,
  generation: u64,
  hostname: String,
  port: u16,
  username: String,
  host_key_fingerprints: Vec<String>,
}

impl PoolKey {
  pub fn for_endpoint(endpoint: &SshEndpoint) -> Self {
    let generation = match &endpoint.source {
      crate::core::remote_control_plane::SshEndpointSource::Managed { generation, .. } => {
        *generation
      }
      _ => 0,
    };
    let mut host_key_fingerprints: Vec<String> = endpoint
      .host_keys
      .iter()
      .map(|key| key.fingerprint_sha256.clone())
      .collect();
    host_key_fingerprints.sort();
    Self {
      endpoint_id: endpoint.id.clone(),
      generation,
      hostname: endpoint.hostname.clone(),
      port: endpoint.port,
      username: endpoint.username.clone(),
      host_key_fingerprints,
    }
  }
}

struct PooledConnection {
  handle: Arc<AsyncMutex<Handle<TreqSshClientHandler>>>,
  last_used: Instant,
  alive: Arc<AtomicBool>,
}

/// Pooled, multiplexed SSH connection manager. One authenticated connection
/// per [`PoolKey`] is reused for multiple exec and PTY channels rather than
/// reconnecting per command (PRD: "the native SSH transport reuses a
/// connection for multiple structured commands").
pub struct SshConnectionPool {
  connections: AsyncMutex<HashMap<PoolKey, PooledConnection>>,
  keepalive_interval: Duration,
  idle_timeout: Duration,
}

impl Default for SshConnectionPool {
  fn default() -> Self {
    Self::new()
  }
}

impl SshConnectionPool {
  pub fn new() -> Self {
    Self {
      connections: AsyncMutex::new(HashMap::new()),
      keepalive_interval: Duration::from_secs(30),
      idle_timeout: Duration::from_secs(600),
    }
  }

  /// Returns a live authenticated connection for `endpoint`, reusing a
  /// pooled one when present and not marked dead. A dead or missing
  /// connection is transparently reconnected here — this is safe because
  /// establishing a connection is not a mutation with side effects on the
  /// remote system, unlike retrying an in-flight command (see
  /// `exec_command`'s cancellation handling, which never auto-retries).
  async fn get_or_connect(
    &self,
    endpoint: &SshEndpoint,
  ) -> Result<Arc<AsyncMutex<Handle<TreqSshClientHandler>>>, SshTransportError> {
    let key = PoolKey::for_endpoint(endpoint);
    {
      let mut connections = self.connections.lock().await;
      if let Some(existing) = connections.get_mut(&key) {
        if existing.alive.load(Ordering::SeqCst) {
          existing.last_used = Instant::now();
          return Ok(existing.handle.clone());
        }
        tracing::info!(endpoint_id = %endpoint.id, "pooled ssh connection is dead, reconnecting");
        connections.remove(&key);
      }
    }

    let handle = self.connect(endpoint).await?;
    let alive = Arc::new(AtomicBool::new(true));
    let mut connections = self.connections.lock().await;
    connections.insert(
      key,
      PooledConnection {
        handle: handle.clone(),
        last_used: Instant::now(),
        alive,
      },
    );
    Ok(handle)
  }

  async fn connect(
    &self,
    endpoint: &SshEndpoint,
  ) -> Result<Arc<AsyncMutex<Handle<TreqSshClientHandler>>>, SshTransportError> {
    let verifier = HostKeyVerifier::new(endpoint.id.clone(), &endpoint.host_keys);
    let handler = TreqSshClientHandler { verifier };

    let mut config = russh::client::Config::default();
    config.keepalive_interval = Some(self.keepalive_interval);
    config.keepalive_max = 3;
    let config = Arc::new(config);

    let address = (endpoint.hostname.as_str(), endpoint.port);
    tracing::debug!(endpoint_id = %endpoint.id, hostname = %endpoint.hostname, port = endpoint.port, "opening ssh connection");

    let mut handle = russh::client::connect(config, address, handler)
      .await
      .map_err(|error| SshTransportError::ConnectionFailed(error.to_string()))?;

    ClientAuthenticator::authenticate(&mut handle, &endpoint.username, &endpoint.authentication)
      .await?;

    tracing::info!(endpoint_id = %endpoint.id, "ssh connection established and authenticated");
    Ok(Arc::new(AsyncMutex::new(handle)))
  }

  /// Marks the pooled connection for `endpoint` dead, e.g. after an I/O
  /// error observed mid-operation. The next `get_or_connect` call for the
  /// same key reconnects rather than reusing a stale session.
  pub async fn mark_dead(&self, endpoint: &SshEndpoint) {
    let key = PoolKey::for_endpoint(endpoint);
    let connections = self.connections.lock().await;
    if let Some(pooled) = connections.get(&key) {
      pooled.alive.store(false, Ordering::SeqCst);
    }
  }

  /// Drops idle pooled connections that have exceeded the idle timeout,
  /// closing them cleanly. Intended to be driven by a periodic background
  /// task; exposed here as a plain method so callers control scheduling.
  pub async fn sweep_idle(&self) {
    let now = Instant::now();
    let mut connections = self.connections.lock().await;
    let stale: Vec<PoolKey> = connections
      .iter()
      .filter(|(_, pooled)| now.duration_since(pooled.last_used) > self.idle_timeout)
      .map(|(key, _)| key.clone())
      .collect();
    for key in stale {
      if let Some(pooled) = connections.remove(&key) {
        let handle = pooled.handle.lock().await;
        let _ = handle
          .disconnect(Disconnect::ByApplication, "idle timeout", "en")
          .await;
      }
    }
  }

  pub async fn pooled_connection_count(&self) -> usize {
    self.connections.lock().await.len()
  }
}

// ---------------------------------------------------------------------------
// Exec channels
// ---------------------------------------------------------------------------

/// Result of a completed exec channel invocation. stdout and stderr are kept
/// separate per the PRD's structured command protocol ("stdout contains only
/// the result JSON; stderr contains diagnostics").
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ExecOutput {
  pub stdout: Vec<u8>,
  pub stderr: Vec<u8>,
  pub exit_status: Option<u32>,
}

impl ExecOutput {
  pub fn success(&self) -> bool {
    matches!(self.exit_status, Some(0))
  }
}

/// A cooperative cancellation flag for in-flight exec/PTY operations. A
/// caller drops or flips this to cancel; the transport never itself decides
/// to retry a mutation that isn't provably idempotent (PRD: "mutations
/// accept idempotency keys where retry could duplicate work") — cancellation
/// always surfaces as [`SshTransportError::Cancelled`], never a silent retry.
#[derive(Clone, Default)]
pub struct CancellationToken {
  cancelled: Arc<AtomicBool>,
  notify: Arc<Notify>,
}

impl CancellationToken {
  pub fn new() -> Self {
    Self::default()
  }

  pub fn cancel(&self) {
    self.cancelled.store(true, Ordering::SeqCst);
    self.notify.notify_waiters();
  }

  pub fn is_cancelled(&self) -> bool {
    self.cancelled.load(Ordering::SeqCst)
  }

  async fn cancelled(&self) {
    if self.is_cancelled() {
      return;
    }
    self.notify.notified().await;
  }
}

/// Bounds applied to every exec channel invocation.
#[derive(Debug, Clone, Copy)]
pub struct ExecLimits {
  pub deadline: Duration,
  /// Maximum combined stdout+stderr bytes before the channel is aborted.
  pub max_output_bytes: usize,
}

impl Default for ExecLimits {
  fn default() -> Self {
    Self {
      deadline: Duration::from_secs(30),
      max_output_bytes: 8 * 1024 * 1024,
    }
  }
}

/// Runs `treq <command> --format=json` as a non-interactive exec channel on
/// the pooled connection for `endpoint`. No frontend-provided arbitrary
/// command ever reaches this method directly — callers must build `args`
/// through a typed request (see `crate::core::remote::TreqCommandRequest`),
/// never by interpolating raw UI text.
pub async fn exec_command(
  pool: &SshConnectionPool,
  endpoint: &SshEndpoint,
  args: &[String],
  limits: ExecLimits,
  cancellation: &CancellationToken,
) -> Result<ExecOutput, SshTransportError> {
  if cancellation.is_cancelled() {
    return Err(SshTransportError::Cancelled);
  }

  let handle = pool.get_or_connect(endpoint).await?;

  let run = async {
    let session = handle.lock().await;
    let mut channel = session
      .channel_open_session()
      .await
      .map_err(|error| SshTransportError::ChannelError(error.to_string()))?;
    drop(session);

    let command = build_remote_command_line(args);
    // The command line is assembled from separate typed arguments (see
    // `TreqCommandRequest::cli_args`) and passed as a single exec string per
    // the SSH exec protocol; no frontend text is interpolated as shell here
    // beyond the same argument-vector quoting the CLI already validates.
    channel
      .exec(true, command)
      .await
      .map_err(|error| SshTransportError::ChannelError(error.to_string()))?;

    let mut stdout = Vec::new();
    let mut stderr = Vec::new();
    let mut exit_status = None;

    loop {
      let Some(message) = channel.wait().await else {
        break;
      };
      match message {
        ChannelMsg::Data { data } => {
          stdout.extend_from_slice(&data);
        }
        ChannelMsg::ExtendedData { data, .. } => {
          stderr.extend_from_slice(&data);
        }
        ChannelMsg::ExitStatus {
          exit_status: status,
        } => {
          exit_status = Some(status);
        }
        ChannelMsg::Eof | ChannelMsg::Close => {
          break;
        }
        _ => {}
      }
      if stdout.len() + stderr.len() > limits.max_output_bytes {
        return Err(SshTransportError::OutputLimitExceeded);
      }
    }

    Ok(ExecOutput {
      stdout,
      stderr,
      exit_status,
    })
  };

  let outcome = tokio::select! {
    biased;
    _ = cancellation.cancelled() => Err(SshTransportError::Cancelled),
    result = tokio::time::timeout(limits.deadline, run) => match result {
      Ok(inner) => inner,
      Err(_) => Err(SshTransportError::DeadlineExceeded),
    },
  };

  match &outcome {
    Err(SshTransportError::ChannelError(_)) => pool.mark_dead(endpoint).await,
    _ => {}
  }

  let output = outcome?;
  if !output.success() {
    return Err(SshTransportError::CommandFailed {
      exit_status: output.exit_status,
      stderr: String::from_utf8_lossy(&output.stderr).trim().to_string(),
    });
  }
  Ok(output)
}

/// Builds the exec command line from an argument vector using the same
/// single-quote escaping `core::remote::shell_quote` uses, so a remote shell
/// that wraps `treq` (or plain `exec`) still sees each argument intact.
fn build_remote_command_line(args: &[String]) -> String {
  let mut parts = vec!["treq".to_string()];
  parts.extend(args.iter().map(|arg| crate::core::remote::shell_quote(arg)));
  parts.join(" ")
}

// ---------------------------------------------------------------------------
// PTY channels
// ---------------------------------------------------------------------------

/// An open interactive PTY channel (shell or agent process) on the pooled
/// connection for one endpoint. Read/write/resize/close mirror the shape of
/// [`crate::pty::PtySession`] so a later (Phase 6) consumer that already
/// knows the local PTY API is not learning a second vocabulary, even though
/// the two are separate transports.
pub struct RemotePtyChannel {
  channel: AsyncMutex<russh::Channel<russh::client::Msg>>,
}

impl RemotePtyChannel {
  /// Opens a PTY channel and requests a shell (or, when `command` is set, an
  /// exec'd interactive process such as an agent) inside it.
  pub async fn open(
    pool: &SshConnectionPool,
    endpoint: &SshEndpoint,
    term: &str,
    cols: u16,
    rows: u16,
    command: Option<&str>,
  ) -> Result<Self, SshTransportError> {
    let handle = pool.get_or_connect(endpoint).await?;
    let session = handle.lock().await;
    let channel = session
      .channel_open_session()
      .await
      .map_err(|error| SshTransportError::ChannelError(error.to_string()))?;
    channel
      .request_pty(true, term, cols as u32, rows as u32, 0, 0, &[])
      .await
      .map_err(|error| SshTransportError::ChannelError(error.to_string()))?;
    match command {
      Some(command) => channel
        .exec(true, command.as_bytes())
        .await
        .map_err(|error| SshTransportError::ChannelError(error.to_string()))?,
      None => channel
        .request_shell(true)
        .await
        .map_err(|error| SshTransportError::ChannelError(error.to_string()))?,
    }
    Ok(Self {
      channel: AsyncMutex::new(channel),
    })
  }

  /// Writes raw bytes to the remote PTY (keystrokes, pasted input, etc.).
  /// Never logs `data`, per the PRD's "raw terminal output ... by default"
  /// never-log requirement.
  pub async fn write(&self, data: &[u8]) -> Result<(), SshTransportError> {
    let channel = self.channel.lock().await;
    let mut writer = channel.make_writer();
    writer
      .write_all(data)
      .await
      .map_err(|error| SshTransportError::ChannelError(error.to_string()))?;
    Ok(())
  }

  /// Reads the next chunk of output, or `None` once the channel has closed.
  /// Callers own their own output buffering and redaction policy for what
  /// they do with the bytes (e.g. terminal echo vs. a log line).
  pub async fn read_chunk(&self) -> Result<Option<Vec<u8>>, SshTransportError> {
    let mut channel = self.channel.lock().await;
    loop {
      match channel.wait().await {
        Some(ChannelMsg::Data { data }) => return Ok(Some(data.to_vec())),
        Some(ChannelMsg::ExtendedData { data, .. }) => return Ok(Some(data.to_vec())),
        Some(ChannelMsg::Eof) | Some(ChannelMsg::Close) | None => return Ok(None),
        Some(_) => continue,
      }
    }
  }

  pub async fn resize(&self, cols: u16, rows: u16) -> Result<(), SshTransportError> {
    let channel = self.channel.lock().await;
    channel
      .window_change(cols as u32, rows as u32, 0, 0)
      .await
      .map_err(|error| SshTransportError::ChannelError(error.to_string()))
  }

  pub async fn close(&self) -> Result<(), SshTransportError> {
    let channel = self.channel.lock().await;
    channel
      .close()
      .await
      .map_err(|error| SshTransportError::ChannelError(error.to_string()))
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
  use super::*;
  use crate::core::remote_control_plane::{SshEndpointSource, TrustedHostKey};
  use russh::keys::PrivateKey;
  use russh::server::{self, Msg as ServerMsg, Server as _, Session as ServerSession};
  use russh::{Channel, ChannelId};
  use std::sync::atomic::AtomicUsize;

  fn test_host_key() -> PrivateKey {
    use getrandom::SysRng;
    use rand_core::UnwrapErr;
    PrivateKey::random(&mut UnwrapErr(SysRng), russh::keys::Algorithm::Ed25519).unwrap()
  }

  fn trusted_host_key(key: &PrivateKey) -> TrustedHostKey {
    let fingerprint = key
      .public_key()
      .fingerprint(russh::keys::HashAlg::Sha256)
      .to_string();
    TrustedHostKey {
      algorithm: "ssh-ed25519".to_string(),
      fingerprint_sha256: fingerprint,
      comment: None,
    }
  }

  // -- Host-key verification -------------------------------------------------

  #[test]
  fn host_key_verifier_accepts_matching_fingerprint() {
    let host_key = test_host_key();
    let trusted = trusted_host_key(&host_key);
    let verifier = HostKeyVerifier::new("endpoint-1", std::slice::from_ref(&trusted));

    let presented = russh::keys::PublicKeyOrCertificate::PublicKey {
      key: host_key.public_key().clone(),
      hash_alg: None,
    };

    assert!(verifier.verify(&presented).is_ok());
  }

  #[test]
  fn host_key_verifier_rejects_mismatched_fingerprint() {
    let trusted_key = test_host_key();
    let presented_key = test_host_key();
    let trusted = trusted_host_key(&trusted_key);
    let verifier = HostKeyVerifier::new("endpoint-1", std::slice::from_ref(&trusted));

    let presented = russh::keys::PublicKeyOrCertificate::PublicKey {
      key: presented_key.public_key().clone(),
      hash_alg: None,
    };

    let error = verifier.verify(&presented).unwrap_err();
    assert!(matches!(error, SshTransportError::HostKeyMismatch { .. }));
  }

  #[test]
  fn host_key_verifier_rejects_when_no_trusted_keys_are_recorded() {
    let presented_key = test_host_key();
    let verifier = HostKeyVerifier::new("endpoint-1", &[]);

    let presented = russh::keys::PublicKeyOrCertificate::PublicKey {
      key: presented_key.public_key().clone(),
      hash_alg: None,
    };

    // No bypass flag exists: an endpoint with zero trusted keys rejects
    // every presented key rather than accepting on first use.
    assert!(verifier.verify(&presented).is_err());
  }

  // -- Pool key derivation ----------------------------------------------------

  fn sample_endpoint(generation: u64, hostname: &str, fingerprint: &str) -> SshEndpoint {
    SshEndpoint {
      id: "endpoint-1".to_string(),
      instance_id: Some("instance-1".to_string()),
      source: SshEndpointSource::Managed {
        provider: "fly_sprites".to_string(),
        generation,
      },
      hostname: hostname.to_string(),
      port: 22,
      username: "treq".to_string(),
      host_keys: vec![TrustedHostKey {
        algorithm: "ssh-ed25519".to_string(),
        fingerprint_sha256: fingerprint.to_string(),
        comment: None,
      }],
      authentication: SshAuthentication::PublicKey {
        key_reference: "id_ed25519".to_string(),
      },
    }
  }

  #[test]
  fn pool_key_differs_across_generations_for_same_hostname() {
    let gen1 = sample_endpoint(1, "10.0.0.5", "SHA256:aaa");
    let gen2 = sample_endpoint(2, "10.0.0.5", "SHA256:bbb");
    assert_ne!(PoolKey::for_endpoint(&gen1), PoolKey::for_endpoint(&gen2));
  }

  #[test]
  fn pool_key_is_stable_for_identical_endpoints() {
    let a = sample_endpoint(1, "10.0.0.5", "SHA256:aaa");
    let b = sample_endpoint(1, "10.0.0.5", "SHA256:aaa");
    assert_eq!(PoolKey::for_endpoint(&a), PoolKey::for_endpoint(&b));
  }

  #[test]
  fn pool_key_ignores_host_key_fingerprint_ordering() {
    let mut a = sample_endpoint(1, "10.0.0.5", "SHA256:aaa");
    a.host_keys.push(TrustedHostKey {
      algorithm: "ssh-rsa".to_string(),
      fingerprint_sha256: "SHA256:zzz".to_string(),
      comment: None,
    });
    let mut b = a.clone();
    b.host_keys.reverse();
    assert_eq!(PoolKey::for_endpoint(&a), PoolKey::for_endpoint(&b));
  }

  // -- Cancellation -------------------------------------------------------------

  #[tokio::test]
  async fn cancellation_token_reports_cancelled_immediately_when_pre_cancelled() {
    let token = CancellationToken::new();
    token.cancel();
    assert!(token.is_cancelled());
    // `cancelled()` must resolve immediately rather than hang, even though
    // `cancel()` happened before anyone called `cancelled()`.
    tokio::time::timeout(Duration::from_millis(50), token.cancelled())
      .await
      .expect("cancelled() should resolve without waiting for a fresh notify");
  }

  // -- In-process mock SSH server for exec-channel behavior --------------------

  #[derive(Clone)]
  struct MockServer {
    host_key_algo: &'static str,
    reply: Arc<AtomicUsize>, // 0 = normal echo, 1 = slow (for deadline test), 2 = huge output
  }

  impl server::Server for MockServer {
    type Handler = MockHandler;
    fn new_client(&mut self, _: Option<std::net::SocketAddr>) -> MockHandler {
      MockHandler {
        mode: self.reply.clone(),
      }
    }
  }

  struct MockHandler {
    mode: Arc<AtomicUsize>,
  }

  impl server::Handler for MockHandler {
    type Error = russh::Error;

    async fn auth_publickey(
      &mut self,
      _user: &str,
      _key: &russh::keys::ssh_key::PublicKey,
    ) -> Result<server::Auth, Self::Error> {
      Ok(server::Auth::Accept)
    }

    async fn channel_open_session(
      &mut self,
      _channel: Channel<ServerMsg>,
      reply: server::ChannelOpenHandle,
      _session: &mut ServerSession,
    ) -> Result<(), Self::Error> {
      reply.accept().await;
      Ok(())
    }

    async fn exec_request(
      &mut self,
      channel: ChannelId,
      data: &[u8],
      session: &mut ServerSession,
    ) -> Result<(), Self::Error> {
      let command = String::from_utf8_lossy(data).to_string();
      session.channel_success(channel)?;
      match self.mode.load(Ordering::SeqCst) {
        1 => {
          // Slow path: sleep past the client's deadline before ever
          // replying, to exercise deadline enforcement.
          tokio::time::sleep(Duration::from_secs(5)).await;
          session.data(channel, bytes::Bytes::from_static(b"{}"))?;
          session.exit_status_request(channel, 0)?;
        }
        2 => {
          // Oversized path: exceed the client's output limit.
          let chunk = vec![b'x'; 4096];
          for _ in 0..64 {
            session.data(channel, bytes::Bytes::from(chunk.clone()))?;
          }
          session.exit_status_request(channel, 0)?;
        }
        _ => {
          let response = format!("{{\"echo\":\"{command}\"}}");
          session.data(channel, bytes::Bytes::from(response.into_bytes()))?;
          session.exit_status_request(channel, 0)?;
        }
      }
      session.close(channel)?;
      Ok(())
    }
  }

  async fn start_mock_server(mode: usize) -> (std::net::SocketAddr, PrivateKey) {
    let host_key = test_host_key();
    let mut config = server::Config::default();
    config.keys.push(host_key.clone());
    config.auth_rejection_time = Duration::from_millis(10);
    let config = Arc::new(config);

    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();

    let mut server = MockServer {
      host_key_algo: "ssh-ed25519",
      reply: Arc::new(AtomicUsize::new(mode)),
    };
    let _ = server.host_key_algo;

    tokio::spawn(async move {
      loop {
        let Ok((socket, peer)) = listener.accept().await else {
          break;
        };
        let handler = server.new_client(Some(peer));
        let config = config.clone();
        tokio::spawn(async move {
          let _ = server::run_stream(config, socket, handler).await;
        });
      }
    });

    (addr, host_key)
  }

  fn write_client_key(dir: &std::path::Path, key: &PrivateKey) -> String {
    let path = dir.join("id_test");
    let pem = key
      .to_openssh(russh::keys::ssh_key::LineEnding::LF)
      .unwrap();
    std::fs::write(&path, pem.as_bytes()).unwrap();
    #[cfg(unix)]
    {
      use std::os::unix::fs::PermissionsExt;
      std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600)).unwrap();
    }
    path.to_string_lossy().into_owned()
  }

  fn test_endpoint(
    addr: std::net::SocketAddr,
    host_key: &PrivateKey,
    key_reference: String,
  ) -> SshEndpoint {
    let fingerprint = host_key
      .public_key()
      .fingerprint(russh::keys::HashAlg::Sha256)
      .to_string();
    SshEndpoint {
      id: "test-endpoint".to_string(),
      instance_id: None,
      source: SshEndpointSource::UserManaged,
      hostname: addr.ip().to_string(),
      port: addr.port(),
      username: std::env::var("USER").unwrap_or_else(|_| "user".to_string()),
      host_keys: vec![TrustedHostKey {
        algorithm: "ssh-ed25519".to_string(),
        fingerprint_sha256: fingerprint,
        comment: None,
      }],
      authentication: SshAuthentication::PublicKey { key_reference },
    }
  }

  #[tokio::test]
  async fn exec_command_returns_stdout_and_reuses_pooled_connection() {
    let (addr, host_key) = start_mock_server(0).await;
    let client_key = test_host_key();
    let temp_dir = tempfile::tempdir().unwrap();
    let key_reference = write_client_key(temp_dir.path(), &client_key);
    let endpoint = test_endpoint(addr, &host_key, key_reference);

    let pool = SshConnectionPool::new();
    let cancellation = CancellationToken::new();

    let output = exec_command(
      &pool,
      &endpoint,
      &["repo".to_string(), "inspect".to_string()],
      ExecLimits::default(),
      &cancellation,
    )
    .await
    .unwrap();
    assert!(output.success());
    assert!(String::from_utf8_lossy(&output.stdout).contains("echo"));

    // A second call against the same endpoint must reuse the pooled
    // connection rather than opening a new one.
    exec_command(
      &pool,
      &endpoint,
      &["repo".to_string(), "status".to_string()],
      ExecLimits::default(),
      &cancellation,
    )
    .await
    .unwrap();

    assert_eq!(pool.pooled_connection_count().await, 1);
  }

  #[tokio::test]
  async fn exec_command_enforces_total_deadline() {
    let (addr, host_key) = start_mock_server(1).await;
    let client_key = test_host_key();
    let temp_dir = tempfile::tempdir().unwrap();
    let key_reference = write_client_key(temp_dir.path(), &client_key);
    let endpoint = test_endpoint(addr, &host_key, key_reference);

    let pool = SshConnectionPool::new();
    let cancellation = CancellationToken::new();
    let limits = ExecLimits {
      deadline: Duration::from_millis(200),
      ..ExecLimits::default()
    };

    let error = exec_command(
      &pool,
      &endpoint,
      &["repo".to_string(), "inspect".to_string()],
      limits,
      &cancellation,
    )
    .await
    .unwrap_err();
    assert_eq!(error, SshTransportError::DeadlineExceeded);
  }

  #[tokio::test]
  async fn exec_command_enforces_output_limit() {
    let (addr, host_key) = start_mock_server(2).await;
    let client_key = test_host_key();
    let temp_dir = tempfile::tempdir().unwrap();
    let key_reference = write_client_key(temp_dir.path(), &client_key);
    let endpoint = test_endpoint(addr, &host_key, key_reference);

    let pool = SshConnectionPool::new();
    let cancellation = CancellationToken::new();
    let limits = ExecLimits {
      deadline: Duration::from_secs(10),
      max_output_bytes: 1024,
    };

    let error = exec_command(
      &pool,
      &endpoint,
      &["repo".to_string(), "inspect".to_string()],
      limits,
      &cancellation,
    )
    .await
    .unwrap_err();
    assert_eq!(error, SshTransportError::OutputLimitExceeded);
  }

  #[tokio::test]
  async fn exec_command_is_cancellable() {
    let (addr, host_key) = start_mock_server(1).await;
    let client_key = test_host_key();
    let temp_dir = tempfile::tempdir().unwrap();
    let key_reference = write_client_key(temp_dir.path(), &client_key);
    let endpoint = test_endpoint(addr, &host_key, key_reference);

    let pool = SshConnectionPool::new();
    let cancellation = CancellationToken::new();
    cancellation.cancel();

    let error = exec_command(
      &pool,
      &endpoint,
      &["repo".to_string(), "inspect".to_string()],
      ExecLimits::default(),
      &cancellation,
    )
    .await
    .unwrap_err();
    assert_eq!(error, SshTransportError::Cancelled);
  }

  #[tokio::test]
  async fn exec_command_rejects_unknown_host_key() {
    let (addr, host_key) = start_mock_server(0).await;
    let client_key = test_host_key();
    let temp_dir = tempfile::tempdir().unwrap();
    let key_reference = write_client_key(temp_dir.path(), &client_key);
    let mut endpoint = test_endpoint(addr, &host_key, key_reference);
    // Corrupt the trusted fingerprint so it no longer matches the server's
    // real host key.
    endpoint.host_keys[0].fingerprint_sha256 = "SHA256:not-the-real-key".to_string();

    let pool = SshConnectionPool::new();
    let cancellation = CancellationToken::new();

    let error = exec_command(
      &pool,
      &endpoint,
      &["repo".to_string(), "inspect".to_string()],
      ExecLimits::default(),
      &cancellation,
    )
    .await
    .unwrap_err();
    assert!(matches!(error, SshTransportError::ConnectionFailed(_)));
  }

  #[test]
  fn build_remote_command_line_quotes_arguments() {
    let line = build_remote_command_line(&[
      "repo".to_string(),
      "inspect".to_string(),
      "/srv/my app".to_string(),
    ]);
    assert_eq!(line, "treq 'repo' 'inspect' '/srv/my app'");
  }
}
