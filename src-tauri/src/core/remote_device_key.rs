//! Mobile device SSH key generation and storage.
//!
//! Desktop identifies with the user's existing `~/.ssh` keys (see
//! `remote_local_keys`). Mobile has no such directory and no user-facing
//! concept of one, so the app generates a dedicated ed25519 keypair per
//! device the first time it is needed.
//!
//! STOPGAP: the private key is currently written to the app's local data
//! directory with owner-only permissions where the platform supports them.
//! This is not yet the platform-protected storage (Android Keystore / iOS
//! Keychain) the mobile PRD requires before shipping - see
//! `prds/mobile.md`, Phase 2. Swapping the storage backend later does not
//! change any caller of this module: `ensure_device_key` only ever returns
//! public material.

use russh::keys::ssh_key::private::{Ed25519Keypair, KeypairData};
use russh::keys::ssh_key::{HashAlg, PrivateKey};
use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};

const DEVICE_KEY_FILENAME: &str = "mobile_device_key";

#[derive(Debug, Clone, Serialize)]
pub struct DeviceKeyInfo {
  pub public_key: String,
  pub fingerprint_sha256: String,
}

fn key_path(app_local_data_dir: &Path) -> PathBuf {
  app_local_data_dir.join(DEVICE_KEY_FILENAME)
}

/// Loads the device's ed25519 keypair, generating and persisting one on
/// first use. Returns only the public key line and its fingerprint - the
/// private key never leaves this module.
pub fn ensure_device_key(app_local_data_dir: &Path) -> Result<DeviceKeyInfo, String> {
  let path = key_path(app_local_data_dir);

  let key = if path.exists() {
    let contents =
      fs::read_to_string(&path).map_err(|e| format!("failed to read device key: {e}"))?;
    contents
      .parse::<PrivateKey>()
      .map_err(|e| format!("failed to parse device key: {e}"))?
  } else {
    let mut seed = [0u8; 32];
    getrandom::fill(&mut seed).map_err(|e| format!("failed to source randomness: {e}"))?;
    let keypair = Ed25519Keypair::from_seed(&seed);
    let key = PrivateKey::new(KeypairData::Ed25519(keypair), "treq-mobile-device")
      .map_err(|e| format!("failed to generate device key: {e}"))?;
    fs::create_dir_all(app_local_data_dir)
      .map_err(|e| format!("failed to create app data dir: {e}"))?;
    let openssh = key
      .to_openssh(Default::default())
      .map_err(|e| format!("failed to encode device key: {e}"))?;
    fs::write(&path, openssh.as_bytes()).map_err(|e| format!("failed to write device key: {e}"))?;
    #[cfg(unix)]
    {
      use std::os::unix::fs::PermissionsExt;
      fs::set_permissions(&path, fs::Permissions::from_mode(0o600))
        .map_err(|e| format!("failed to set device key permissions: {e}"))?;
    }
    key
  };

  let public_key = key.public_key();
  let public_key_line = public_key
    .to_openssh()
    .map_err(|e| format!("failed to encode device public key: {e}"))?;
  let fingerprint_sha256 = public_key.fingerprint(HashAlg::Sha256).to_string();

  Ok(DeviceKeyInfo {
    public_key: public_key_line,
    fingerprint_sha256,
  })
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn generates_and_persists_a_stable_key() {
    let dir = tempfile::tempdir().unwrap();
    let first = ensure_device_key(dir.path()).unwrap();
    let second = ensure_device_key(dir.path()).unwrap();
    assert_eq!(first.public_key, second.public_key);
    assert_eq!(first.fingerprint_sha256, second.fingerprint_sha256);
    assert!(first.public_key.starts_with("ssh-ed25519 "));
  }
}
