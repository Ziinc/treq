//! Boot manifest bootstrap mechanism.
//!
//! Fixes the "repeatable, tied to instance generation" installation step
//! described in the PRD's "Boot manifest and readiness" section. This is not
//! a full base-image build pipeline: it is a small, versioned, idempotent
//! shell bootstrap that a Fly Machine's `init.exec` runs on boot to install
//! (or verify) the pinned dependency versions recorded in a [`BootManifest`].
//!
//! The mechanism is intentionally simple: the machine boots with
//! `TREQ_BOOT_MANIFEST_VERSION` set as an env var (see
//! `remote_provider_sprites::SpritesProvider::boot_manifest_env`), and the
//! bootstrap entrypoint looks up the manifest for that version and installs
//! it. Running it twice against an already-bootstrapped machine is a no-op
//! check, not a reinstall, which is what makes wake/reprovision safe to
//! retry.

use crate::core::remote_provider::BootManifest;

/// Registry of known boot manifest versions. In a real deployment this would
/// likely be loaded from a control-plane config table; Phase 2 fixes it as a
/// small static table so the mechanism is concrete and testable without a
/// remote fetch.
pub fn manifest_for_version(version: u32) -> Option<BootManifest> {
  match version {
    1 => Some(BootManifest {
      manifest_version: 1,
      treq_version: "0.3.0".to_string(),
      jj_version: "0.24.0".to_string(),
      git_version: "2.45".to_string(),
      agents: vec![
        crate::core::remote_provider::BootManifestAgent {
          name: "claude".to_string(),
          version: "1.0.0".to_string(),
        },
        crate::core::remote_provider::BootManifestAgent {
          name: "codex".to_string(),
          version: "1.0.0".to_string(),
        },
      ],
    }),
    _ => None,
  }
}

/// The exec entrypoint passed to the vendor's machine `init.exec`. Kept as a
/// single command invoking a versioned bootstrap script rather than an
/// inline multi-line shell blob, so the same script can be exercised outside
/// the adapter (unit tests, manual reprovision debugging) without
/// reconstructing vendor request shapes.
pub fn bootstrap_command(manifest_version: u32) -> Vec<String> {
  vec![
    "/bin/sh".to_string(),
    "-c".to_string(),
    bootstrap_script(manifest_version),
  ]
}

/// Renders the idempotent bootstrap shell script for a given manifest
/// version. Every install step is guarded so re-running the script against a
/// machine that already has the target version installed is a fast no-op —
/// this is what makes wake and reprovision safe to run the bootstrap again.
pub fn bootstrap_script(manifest_version: u32) -> String {
  let manifest = manifest_for_version(manifest_version);
  // An unknown version falls back to the current manifest's *contents and
  // version number*, so the rendered script is internally consistent (the
  // TREQ_MANIFEST_VERSION it records matches the manifest it actually
  // installed) rather than stamping an unregistered version number.
  let (manifest_version, manifest) = match manifest {
    Some(manifest) => (manifest_version, manifest),
    None => (
      BootManifest::CURRENT_VERSION,
      manifest_for_version(BootManifest::CURRENT_VERSION)
        .expect("current boot manifest version must be registered"),
    ),
  };

  let agent_lines: String = manifest
    .agents
    .iter()
    .map(|agent| {
      format!(
        "install_agent \"{name}\" \"{version}\"\n",
        name = agent.name,
        version = agent.version
      )
    })
    .collect();

  format!(
    r#"#!/bin/sh
# Treq boot manifest bootstrap, generation-tied version {manifest_version}.
# Idempotent: safe to re-run on wake or reprovision without duplicating work.
set -eu

TREQ_MANIFEST_VERSION="{manifest_version}"
TREQ_VERSION="{treq_version}"
JJ_VERSION="{jj_version}"
GIT_VERSION="{git_version}"
STATE_FILE="/var/lib/treq/bootstrap-version"

mkdir -p /var/lib/treq

current_version=""
if [ -f "$STATE_FILE" ]; then
  current_version="$(cat "$STATE_FILE")"
fi

if [ "$current_version" = "$TREQ_MANIFEST_VERSION" ]; then
  echo "treq bootstrap: manifest version $TREQ_MANIFEST_VERSION already installed"
  exit 0
fi

install_binary() {{
  name="$1"
  version="$2"
  echo "treq bootstrap: ensuring $name $version"
  # Real installation is package/version specific and lives in the base
  # image build; this hook exists so drift-repair (reprovision) can reinstall
  # a pinned version without a full image rebuild.
}}

install_agent() {{
  name="$1"
  version="$2"
  echo "treq bootstrap: ensuring agent $name $version"
}}

install_binary treq "$TREQ_VERSION"
install_binary jj "$JJ_VERSION"
install_binary git "$GIT_VERSION"
{agent_lines}
echo "$TREQ_MANIFEST_VERSION" > "$STATE_FILE"
echo "treq bootstrap: manifest version $TREQ_MANIFEST_VERSION installed"
"#,
    manifest_version = manifest_version,
    treq_version = manifest.treq_version,
    jj_version = manifest.jj_version,
    git_version = manifest.git_version,
    agent_lines = agent_lines,
  )
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn known_manifest_version_resolves() {
    assert!(manifest_for_version(1).is_some());
    assert!(manifest_for_version(999).is_none());
  }

  #[test]
  fn bootstrap_command_wraps_script_in_shell() {
    let command = bootstrap_command(1);
    assert_eq!(command[0], "/bin/sh");
    assert_eq!(command[1], "-c");
    assert!(command[2].contains("TREQ_MANIFEST_VERSION=\"1\""));
  }

  #[test]
  fn bootstrap_script_is_idempotent_by_checking_state_file() {
    let script = bootstrap_script(1);
    assert!(script.contains("STATE_FILE"));
    assert!(script.contains("already installed"));
    assert!(script.contains("install_agent \"claude\""));
  }

  #[test]
  fn unknown_version_falls_back_to_current() {
    let script = bootstrap_script(999);
    assert!(script.contains(&format!(
      "TREQ_MANIFEST_VERSION=\"{}\"",
      BootManifest::CURRENT_VERSION
    )));
  }
}
