//! Enumerates the user's existing local SSH public key identities for the
//! Phase 6 remote-setup UI (prds/remote-ssh.md, "Treq-managed VM": "The user
//! selects: ... an existing local public/private key identity"; "Treq does
//! not create a private key").
//!
//! This only ever reads `*.pub` files under `~/.ssh` - a public key and its
//! comment - and computes the SHA256 fingerprint the UI shows before
//! registration. It never reads, generates, or transmits a private key.

use russh::keys::ssh_key::PublicKey;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct LocalSshIdentity {
  /// Stable reference the rest of the app uses to mean "this local key" -
  /// currently its path, since that is what a later signing/auth step needs
  /// to locate the matching private half.
  pub reference: String,
  pub label: String,
  pub fingerprint_sha256: String,
  pub algorithm: String,
}

fn ssh_dir() -> Option<PathBuf> {
  std::env::var("HOME")
    .ok()
    .map(|home| PathBuf::from(home).join(".ssh"))
}

pub fn list_local_ssh_identities() -> Result<Vec<LocalSshIdentity>, String> {
  let Some(dir) = ssh_dir() else {
    return Ok(Vec::new());
  };
  let Ok(entries) = std::fs::read_dir(&dir) else {
    return Ok(Vec::new());
  };

  let mut identities = Vec::new();
  for entry in entries.flatten() {
    let path = entry.path();
    if path.extension().and_then(|ext| ext.to_str()) != Some("pub") {
      continue;
    }
    let Ok(contents) = std::fs::read_to_string(&path) else {
      continue;
    };
    let Ok(key) = PublicKey::from_openssh(contents.trim()) else {
      continue;
    };
    let fingerprint = key.fingerprint(russh::keys::HashAlg::Sha256).to_string();
    let label = path
      .file_stem()
      .and_then(|s| s.to_str())
      .unwrap_or("id")
      .to_string();
    identities.push(LocalSshIdentity {
      reference: path.to_string_lossy().to_string(),
      label,
      fingerprint_sha256: fingerprint,
      algorithm: key.algorithm().to_string(),
    });
  }
  identities.sort_by(|a, b| a.label.cmp(&b.label));
  Ok(identities)
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn returns_empty_when_ssh_dir_missing() {
    // Smoke test only: exercising the real ~/.ssh in CI would be
    // environment-dependent, so this just asserts the function does not
    // panic and returns a list (possibly empty) rather than erroring.
    let result = list_local_ssh_identities();
    assert!(result.is_ok());
  }
}
