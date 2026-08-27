//! Provider-neutral managed compute contracts.
//!
//! This module defines the domain model for a Treq-managed VM: the normalized
//! lifecycle state machine, the [`ManagedComputeProvider`] adapter trait that a
//! vendor integration (Fly Sprites first) implements, VM size presets, region
//! records, and the versioned boot manifest. Nothing here talks to a vendor
//! API; that begins in a later phase. UI and repository code must depend only
//! on the types in this module, never on vendor SDK types or status strings.

use serde::{Deserialize, Serialize};

/// Normalized lifecycle state for a managed instance. Provider-specific status
/// strings are mapped into this enum by the adapter; nothing outside the
/// adapter should see a raw vendor status.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ManagedInstanceState {
  /// No instance has been provisioned for this user yet.
  Unprovisioned,
  /// A create request has been accepted by the provider and is in progress.
  Provisioning,
  /// The instance exists and is installing the boot manifest.
  Bootstrapping,
  /// Access material (host key trust, certificate authority trust) is being
  /// installed on the instance.
  InstallingAccess,
  /// Expanded readiness checks are running.
  Verifying,
  /// The instance passed readiness and is available for use.
  Ready,
  /// The provider reports the instance suspended (typically vendor-driven
  /// idleness). Treq records this; it does not run a second idle timer.
  Suspended,
  /// A wake request has been issued and Treq is waiting for the instance to
  /// become reachable again.
  Waking,
  /// The instance is being replaced (new size, region, or manifest). The
  /// generation is incremented when this transition begins.
  Reprovisioning,
  /// The instance is reachable but failed a readiness or reconciliation
  /// check and requires attention.
  Degraded,
  /// The instance failed to provision, bootstrap, or reprovision.
  Failed,
  /// A delete request has been accepted and teardown is in progress.
  Deleting,
  /// The instance and its provider-side resources have been removed.
  Deleted,
}

impl ManagedInstanceState {
  /// True when the instance is expected to serve SSH connections.
  pub fn is_connectable(self) -> bool {
    matches!(self, Self::Ready)
  }

  /// True when the state is terminal and no further reconciliation applies
  /// without a new user-initiated operation.
  pub fn is_terminal(self) -> bool {
    matches!(self, Self::Deleted | Self::Failed)
  }
}

/// A small, Treq-defined set of VM size presets. Presets map to
/// provider-specific CPU, memory, and storage settings inside the adapter;
/// callers outside the adapter select only from this closed set.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SizePreset {
  Small,
  Medium,
  Large,
}

/// Static metadata describing a [`SizePreset`] for display purposes. Values
/// here are Treq-facing approximations, not a live provider quote.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct SizePresetInfo {
  pub preset: SizePreset,
  pub label: &'static str,
  pub vcpus: u32,
  pub memory_gb: u32,
  pub storage_gb: u32,
}

/// The full, ordered list of size presets offered to users. Order is the
/// display order (smallest to largest).
pub const SIZE_PRESETS: &[SizePresetInfo] = &[
  SizePresetInfo {
    preset: SizePreset::Small,
    label: "Small",
    vcpus: 1,
    memory_gb: 2,
    storage_gb: 20,
  },
  SizePresetInfo {
    preset: SizePreset::Medium,
    label: "Medium",
    vcpus: 2,
    memory_gb: 4,
    storage_gb: 40,
  },
  SizePresetInfo {
    preset: SizePreset::Large,
    label: "Large",
    vcpus: 4,
    memory_gb: 8,
    storage_gb: 80,
  },
];

/// A selectable provisioning region. Region codes are Treq-defined identifiers
/// that the adapter maps to provider-specific region names.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RegionCode {
  UsEast,
  UsWest,
  EuWest,
  ApSoutheast,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct RegionInfo {
  pub code: RegionCode,
  pub label: &'static str,
}

/// The full list of regions offered to users, in display order.
pub const REGIONS: &[RegionInfo] = &[
  RegionInfo {
    code: RegionCode::UsEast,
    label: "US East",
  },
  RegionInfo {
    code: RegionCode::UsWest,
    label: "US West",
  },
  RegionInfo {
    code: RegionCode::EuWest,
    label: "Europe West",
  },
  RegionInfo {
    code: RegionCode::ApSoutheast,
    label: "Asia Pacific Southeast",
  },
];

/// Identifies which managed compute vendor backs an instance. Additional
/// providers extend this enum without changing the domain model above it.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ProviderKind {
  FlySprites,
}

/// A pinned agent binary version to install as part of the boot manifest.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct BootManifestAgent {
  pub name: String,
  pub version: String,
}

/// Versioned description of what must be installed on a managed VM before it
/// is considered bootstrapped. This is an internal control-plane and
/// image-build artifact: it is not exposed as a user-facing Treq CLI command.
/// The exact installation mechanism (base image, vendor init command, or
/// bootstrap script) is a Phase 2 concern; this type only fixes the shape.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct BootManifest {
  /// Monotonically increasing manifest schema version.
  pub manifest_version: u32,
  pub treq_version: String,
  pub jj_version: String,
  pub git_version: String,
  pub agents: Vec<BootManifestAgent>,
}

impl BootManifest {
  pub const CURRENT_VERSION: u32 = 1;
}

/// Provider-independent record of a managed instance, matching the "Suggested
/// resources" / domain-record fields in the PRD's compute-provider model.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ManagedInstanceRecord {
  pub instance_id: String,
  pub owner_user_id: String,
  pub provider_kind: ProviderKind,
  pub provider_resource_id: Option<String>,
  pub region: RegionCode,
  pub size_preset: SizePreset,
  pub status: ManagedInstanceState,
  /// Incremented on every replace (reprovision) operation. Clients treat an
  /// endpoint or host-key change as an explicit trust transition when this
  /// increases.
  pub generation: u64,
  pub endpoint_id: Option<String>,
  pub image_manifest_version: u32,
  pub created_at: String,
  pub ready_at: Option<String>,
}

/// Errors an adapter may return. Vendor-specific error detail should be
/// captured in `provider_message` rather than by extending this enum with
/// vendor concepts.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum ProviderError {
  NotFound,
  AlreadyExists,
  QuotaExceeded,
  InvalidRequest { message: String },
  Unavailable { message: String },
  Timeout,
  Other { message: String },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CreateInstanceRequest {
  pub owner_user_id: String,
  pub region: RegionCode,
  pub size_preset: SizePreset,
  pub manifest_version: u32,
  /// Caller-supplied idempotency key. The adapter and control plane must
  /// treat repeated calls with the same key as one logical operation.
  pub idempotency_key: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ReplaceInstanceRequest {
  pub provider_resource_id: String,
  pub region: RegionCode,
  pub size_preset: SizePreset,
  pub manifest_version: u32,
  pub idempotency_key: String,
}

/// Normalized instance snapshot returned by the provider adapter. UI and
/// repository code must consume only this type, never a vendor SDK response.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ProviderInstance {
  pub provider_resource_id: String,
  pub state: ManagedInstanceState,
  pub region: RegionCode,
  pub size_preset: SizePreset,
  /// Hostname or address the control plane should record as trusted
  /// endpoint metadata once verified, if the provider has assigned one yet.
  pub address: Option<String>,
}

/// Provider-neutral adapter interface. Method bodies are intentionally
/// unimplemented in Phase 1: the first concrete implementation (Fly Sprites)
/// arrives in Phase 2. `async_trait` keeps the trait object-safe so callers
/// can hold a `Box<dyn ManagedComputeProvider>` once a real adapter exists.
#[async_trait::async_trait]
pub trait ManagedComputeProvider: Send + Sync {
  /// Which vendor this adapter implements.
  fn provider_kind(&self) -> ProviderKind;

  /// Create a new managed instance. Must be idempotent on
  /// `request.idempotency_key`.
  async fn create_instance(
    &self,
    request: CreateInstanceRequest,
  ) -> Result<ProviderInstance, ProviderError>;

  /// Fetch the current provider-reported state of an instance.
  async fn get_instance(&self, provider_id: &str) -> Result<ProviderInstance, ProviderError>;

  /// Request that a suspended instance resume. Returns once the wake request
  /// is accepted, not once the instance is ready.
  async fn wake_instance(&self, provider_id: &str) -> Result<(), ProviderError>;

  /// Replace an instance (new size, region, or manifest). Must be idempotent
  /// on `request.idempotency_key` and must increment the domain-record
  /// generation on success.
  async fn replace_instance(
    &self,
    request: ReplaceInstanceRequest,
  ) -> Result<ProviderInstance, ProviderError>;

  /// Delete an instance and release its provider-side resources.
  async fn delete_instance(&self, provider_id: &str) -> Result<(), ProviderError>;
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn ready_state_is_connectable() {
    assert!(ManagedInstanceState::Ready.is_connectable());
    assert!(!ManagedInstanceState::Suspended.is_connectable());
  }

  #[test]
  fn terminal_states_are_deleted_and_failed() {
    assert!(ManagedInstanceState::Deleted.is_terminal());
    assert!(ManagedInstanceState::Failed.is_terminal());
    assert!(!ManagedInstanceState::Ready.is_terminal());
  }

  #[test]
  fn size_presets_are_defined_smallest_first() {
    assert_eq!(SIZE_PRESETS.first().unwrap().preset, SizePreset::Small);
    assert!(SIZE_PRESETS.windows(2).all(|w| w[0].vcpus <= w[1].vcpus));
  }

  #[test]
  fn boot_manifest_round_trips_through_json() {
    let manifest = BootManifest {
      manifest_version: BootManifest::CURRENT_VERSION,
      treq_version: "0.2.0".to_string(),
      jj_version: "0.24.0".to_string(),
      git_version: "2.45".to_string(),
      agents: vec![BootManifestAgent {
        name: "claude".to_string(),
        version: "1.0.0".to_string(),
      }],
    };
    let json = serde_json::to_string(&manifest).unwrap();
    let round_tripped: BootManifest = serde_json::from_str(&json).unwrap();
    assert_eq!(manifest, round_tripped);
  }
}
