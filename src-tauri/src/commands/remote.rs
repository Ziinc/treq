use crate::core::feature_preview::PreviewFeature;
use crate::core::remote::{self, RemoteReadiness, RemoteRepoProbe, RemoteRepository, SshHost};
use crate::core::remote_device_key::{self, DeviceKeyInfo};
use crate::core::remote_local_keys::{self, LocalSshIdentity};
use crate::AppState;
use tauri::State;

fn require_remote_ssh(state: &State<AppState>) -> Result<(), String> {
  crate::commands::feature_preview::require(state, PreviewFeature::RemoteSsh)
}

#[tauri::command]
pub fn list_ssh_hosts(state: State<AppState>) -> Result<Vec<SshHost>, String> {
  require_remote_ssh(&state)?;
  remote::list_configured_hosts()
}

/// Lists the user's existing local SSH public-key identities, for the
/// managed-VM setup flow's identity picker. Never reads or returns private
/// key material - see `core::remote_local_keys`.
#[tauri::command]
pub fn list_local_ssh_identities(state: State<AppState>) -> Result<Vec<LocalSshIdentity>, String> {
  require_remote_ssh(&state)?;
  remote_local_keys::list_local_ssh_identities()
}

/// Reads the raw OpenSSH public-key text for a `list_local_ssh_identities`
/// reference, so the managed-VM setup flow can register it with the
/// control plane. Never reads or returns private key material - see
/// `core::remote_local_keys::read_local_public_key`.
#[tauri::command]
pub fn read_local_ssh_public_key(
  state: State<AppState>,
  reference: String,
) -> Result<String, String> {
  require_remote_ssh(&state)?;
  remote_local_keys::read_local_public_key(&reference)
}

#[tauri::command]
pub async fn check_ssh_host(
  state: State<'_, AppState>,
  host: String,
) -> Result<RemoteReadiness, String> {
  require_remote_ssh(&state)?;
  tauri::async_runtime::spawn_blocking(move || remote::check_readiness(&host))
    .await
    .map_err(|e| format!("Failed to join check_ssh_host task: {e}"))?
}

#[tauri::command]
pub async fn remote_probe_repo(
  state: State<'_, AppState>,
  host: String,
  path: String,
) -> Result<RemoteRepoProbe, String> {
  require_remote_ssh(&state)?;
  tauri::async_runtime::spawn_blocking(move || remote::probe_repo(&host, &path))
    .await
    .map_err(|e| format!("Failed to join remote_probe_repo task: {e}"))?
}

#[tauri::command]
pub async fn remote_clone_repo(
  state: State<'_, AppState>,
  host: String,
  repo_url: String,
  destination: String,
) -> Result<RemoteRepository, String> {
  require_remote_ssh(&state)?;
  tauri::async_runtime::spawn_blocking(move || remote::clone_repo(&host, &repo_url, &destination))
    .await
    .map_err(|e| format!("Failed to join remote_clone_repo task: {e}"))?
}

#[tauri::command]
pub fn remote_open_repo(
  state: State<AppState>,
  host: String,
  path: String,
) -> Result<RemoteRepository, String> {
  require_remote_ssh(&state)?;
  remote::open_repo(&host, &path)
}

/// Ensures this device has an ed25519 keypair for control-plane
/// registration and certificate-based SSH auth, generating one on first
/// use. Returns only public material - see `core::remote_device_key`.
#[tauri::command]
pub fn ensure_mobile_device_key(
  state: State<AppState>,
  app: tauri::AppHandle,
) -> Result<DeviceKeyInfo, String> {
  require_remote_ssh(&state)?;
  remote_device_key::ensure_device_key(&app)
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn remote_open_repo_rejects_unsafe_host_before_ssh() {
    let error = crate::core::remote::open_repo("dev;rm", "/srv/project")
      .expect_err("unsafe host should fail before SSH");

    assert_eq!(error, "SSH host must be a host alias from ssh config");
  }
}
