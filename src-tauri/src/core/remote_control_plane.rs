//! Control-plane contracts: SSH endpoint model, trusted host keys, and the
//! request/response shapes Supabase Edge Functions will expose.
//!
//! Nothing in this module performs network I/O or talks to Supabase. It only
//! fixes the wire shapes so the desktop client, the Edge Functions (Phase 2+),
//! and the Supabase schema (see `supabase/migrations`) agree on one contract.
//! Every mutating request carries an idempotency key, matching the PRD's
//! "Every mutating control-plane request includes an idempotency key"
//! requirement.

use serde::{Deserialize, Serialize};

use crate::core::remote_provider::{ManagedInstanceRecord, RegionCode, SizePreset};

/// A verified SSH host public key, pinned by the control plane. Managed host
/// trust is tracked independently of the user's global `known_hosts` file.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct TrustedHostKey {
  /// e.g. "ssh-ed25519", "rsa-sha2-512".
  pub algorithm: String,
  pub fingerprint_sha256: String,
  pub comment: Option<String>,
}

/// How the client authenticates to an [`SshEndpoint`].
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum SshAuthentication {
  /// A short-lived certificate signed by the Treq CA, presented alongside
  /// the user's own private key. Used for managed instances.
  Certificate { key_reference: String },
  /// Direct authentication with a user-selected public key. Treq never
  /// generates or holds the private half.
  PublicKey { key_reference: String },
}

/// Where an [`SshEndpoint`] came from. `ExplicitAlias` requires the user to
/// have explicitly selected alias mode; discovering an alias from
/// `~/.ssh/config` (see `core::remote::list_configured_hosts`) never creates
/// trust by itself.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum SshEndpointSource {
  Managed { provider: String, generation: u64 },
  UserManaged,
  ExplicitAlias { alias: String },
}

/// A fully trusted, connectable SSH endpoint. Repository identity references
/// `id` and a canonical remote path rather than only a host string, so a
/// managed instance's hostname can change across reprovisioning while the
/// endpoint identity (and its generation) stays stable.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SshEndpoint {
  pub id: String,
  pub instance_id: Option<String>,
  pub source: SshEndpointSource,
  pub hostname: String,
  pub port: u16,
  pub username: String,
  pub host_keys: Vec<TrustedHostKey>,
  pub authentication: SshAuthentication,
}

/// Newtype wrapper for idempotency keys carried on mutating requests. A
/// repeated request with the same key must return the existing operation
/// rather than create a second one.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct IdempotencyKey(pub String);

/// Normalized status of a recorded control-plane operation (provision, wake,
/// reprovision, delete, key registration, etc.), independent of instance
/// lifecycle state.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum OperationStatus {
  Pending,
  InProgress,
  Succeeded,
  Failed,
}

/// Generic envelope returned for any mutating control-plane call. Repeated
/// calls with the same idempotency key return the same `operation_id`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct OperationResponse {
  pub operation_id: String,
  pub status: OperationStatus,
}

// -- Instance lifecycle requests --------------------------------------------

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ProvisionInstanceRequest {
  pub region: RegionCode,
  pub size_preset: SizePreset,
  pub idempotency_key: IdempotencyKey,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct WakeInstanceRequest {
  pub instance_id: String,
  pub idempotency_key: IdempotencyKey,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ReprovisionInstanceRequest {
  pub instance_id: String,
  pub region: RegionCode,
  pub size_preset: SizePreset,
  pub idempotency_key: IdempotencyKey,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct DeleteInstanceRequest {
  pub instance_id: String,
  pub idempotency_key: IdempotencyKey,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct InstanceStatusResponse {
  pub instance: Option<ManagedInstanceRecord>,
  pub endpoint: Option<SshEndpoint>,
}

// -- Client keys and certificates -------------------------------------------

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RegisterClientKeyRequest {
  /// OpenSSH authorized_keys-format public key.
  pub public_key: String,
  pub comment: Option<String>,
  pub idempotency_key: IdempotencyKey,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RevokeClientKeyRequest {
  pub key_id: String,
  pub idempotency_key: IdempotencyKey,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct IssueCertificateRequest {
  pub instance_id: String,
  pub key_id: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct IssueCertificateResponse {
  /// OpenSSH certificate text, signed by the server-side CA.
  pub certificate: String,
  pub serial: String,
  pub expires_at: String,
  pub endpoint: SshEndpoint,
}

// -- User-managed endpoints ---------------------------------------------------

/// Registers a fully explicit user-owned VM endpoint. Every field is supplied
/// by the user; an `~/.ssh/config` alias may only prefill `alias` as an
/// autocomplete suggestion (see `core::remote::list_configured_hosts`) and
/// never implies trust on its own.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RegisterEndpointRequest {
  pub display_name: String,
  pub hostname: String,
  pub port: u16,
  pub username: String,
  pub host_key_fingerprint: String,
  pub auth_identity_reference: String,
  /// Set only when the user explicitly chose alias mode for this endpoint.
  pub alias: Option<String>,
  pub idempotency_key: IdempotencyKey,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RegisterRepositoryRequest {
  pub endpoint_id: String,
  pub remote_path: String,
  pub display_name: String,
  pub idempotency_key: IdempotencyKey,
}

// -- Catalog reads -------------------------------------------------------------

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ListRegionsResponse {
  pub regions: Vec<RegionCode>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ListSizePresetsResponse {
  pub presets: Vec<SizePreset>,
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn provision_request_round_trips_through_json() {
    let request = ProvisionInstanceRequest {
      region: RegionCode::UsEast,
      size_preset: SizePreset::Small,
      idempotency_key: IdempotencyKey("abc-123".to_string()),
    };
    let json = serde_json::to_string(&request).unwrap();
    let round_tripped: ProvisionInstanceRequest = serde_json::from_str(&json).unwrap();
    assert_eq!(request, round_tripped);
  }

  #[test]
  fn register_endpoint_request_alias_is_optional() {
    let request = RegisterEndpointRequest {
      display_name: "Dev box".to_string(),
      hostname: "10.0.0.5".to_string(),
      port: 22,
      username: "dev".to_string(),
      host_key_fingerprint: "SHA256:abc".to_string(),
      auth_identity_reference: "key:local-default".to_string(),
      alias: None,
      idempotency_key: IdempotencyKey("register-1".to_string()),
    };
    let json = serde_json::to_value(&request).unwrap();
    assert!(json.get("alias").unwrap().is_null());
  }
}
