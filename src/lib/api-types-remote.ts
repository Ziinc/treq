export interface SshHost {
  alias: string;
}

export interface LocalSshIdentity {
  reference: string;
  label: string;
  fingerprint_sha256: string;
  algorithm: string;
}

export interface RemoteReadinessCheck {
  name: string;
  available: boolean;
  detail: string;
}

export interface RemoteReadiness {
  host: string;
  connected: boolean;
  checks: RemoteReadinessCheck[];
}

export interface RemoteRepoProbe {
  host: string;
  path: string;
  exists: boolean;
  is_repo: boolean;
  needs_clone: boolean;
}

/**
 * Cheap, pollable change marker for a workspace's JJ operation log (PRD
 * "Change propagation across concurrent clients"). A client stores the
 * last `operation_id` it observed for a workspace and compares it against
 * the latest value; a mismatch means VM-side repository state moved for a
 * reason other than the client's own in-flight mutation, and the client
 * should refresh rather than merge or reconcile anything.
 */
export interface WorkspaceChangeMarker {
  operation_id: string;
}

export type RepositoryLocation =
  | { type: "local"; path: string }
  | { type: "ssh"; host: string; path: string };

export interface RepositoryDescriptor {
  id: string;
  location: RepositoryLocation;
  display_name: string;
}

export interface RepositoryInspection {
  root: string;
  repository_type: string;
  current_branch: string | null;
  default_branch: string;
  current_change_id: string;
  current_commit_id: string;
  descriptor: RepositoryDescriptor;
}

export interface RemoteRepository {
  host: string;
  path: string;
  display_name: string;
  repo_uri: string;
  inspection: RepositoryInspection;
}

// -- Managed compute provider contracts (Phase 1: neutral domain model) -----
//
// These types mirror src-tauri/src/core/remote_provider.rs and
// src-tauri/src/core/remote_control_plane.rs. Nothing here talks to a
// provider or Supabase yet; they exist so a later phase's UI and control-plane
// client agree on one wire shape. No vendor SDK type or status string may
// leak past this boundary.

export type ManagedInstanceState =
  | "unprovisioned"
  | "provisioning"
  | "bootstrapping"
  | "installing_access"
  | "verifying"
  | "ready"
  | "suspended"
  | "waking"
  | "reprovisioning"
  | "degraded"
  | "failed"
  | "deleting"
  | "deleted";

export type SizePreset = "small" | "medium" | "large";

export interface SizePresetInfo {
  preset: SizePreset;
  label: string;
  vcpus: number;
  memory_gb: number;
  storage_gb: number;
}

export type RegionCode = "us_east" | "us_west" | "eu_west" | "ap_southeast";

export interface RegionInfo {
  code: RegionCode;
  label: string;
}

export type ProviderKind = "fly_sprites";

export interface BootManifestAgent {
  name: string;
  version: string;
}

export interface BootManifest {
  manifest_version: number;
  treq_version: string;
  jj_version: string;
  git_version: string;
  agents: BootManifestAgent[];
}

export interface ManagedInstanceRecord {
  instance_id: string;
  owner_user_id: string;
  provider_kind: ProviderKind;
  provider_resource_id: string | null;
  region: RegionCode;
  size_preset: SizePreset;
  status: ManagedInstanceState;
  generation: number;
  endpoint_id: string | null;
  image_manifest_version: number;
  created_at: string;
  ready_at: string | null;
}

export interface TrustedHostKey {
  algorithm: string;
  fingerprint_sha256: string;
  comment: string | null;
}

export type SshAuthentication =
  | { type: "certificate"; key_reference: string }
  | { type: "public_key"; key_reference: string };

export type SshEndpointSource =
  | { type: "managed"; provider: string; generation: number }
  | { type: "user_managed" }
  | { type: "explicit_alias"; alias: string };

export interface SshEndpoint {
  id: string;
  instance_id: string | null;
  source: SshEndpointSource;
  hostname: string;
  port: number;
  username: string;
  host_keys: TrustedHostKey[];
  authentication: SshAuthentication;
}

export type OperationStatus =
  | "pending"
  | "in_progress"
  | "succeeded"
  | "failed";

export interface OperationResponse {
  operation_id: string;
  status: OperationStatus;
}

export interface ProvisionInstanceRequest {
  region: RegionCode;
  size_preset: SizePreset;
  idempotency_key: string;
}

export interface WakeInstanceRequest {
  instance_id: string;
  idempotency_key: string;
}

export interface ReprovisionInstanceRequest {
  instance_id: string;
  region: RegionCode;
  size_preset: SizePreset;
  idempotency_key: string;
}

export interface DeleteInstanceRequest {
  instance_id: string;
  idempotency_key: string;
}

export interface InstanceStatusResponse {
  instance: ManagedInstanceRecord | null;
  endpoint: SshEndpoint | null;
}

export interface RegisterClientKeyRequest {
  public_key: string;
  comment: string | null;
  idempotency_key: string;
}

export interface RevokeClientKeyRequest {
  key_id: string;
  idempotency_key: string;
}

export interface IssueCertificateRequest {
  instance_id: string;
  key_id: string;
}

export interface IssueCertificateResponse {
  certificate: string;
  serial: string;
  expires_at: string;
  endpoint: SshEndpoint;
}

/**
 * Registers a fully explicit user-owned VM endpoint. `alias` is set only when
 * the user explicitly chose alias mode; it must never be populated purely
 * from `~/.ssh/config` discovery/autocomplete (see `listSshHosts`).
 */
export interface RegisterEndpointRequest {
  display_name: string;
  hostname: string;
  port: number;
  username: string;
  host_key_fingerprint: string;
  auth_identity_reference: string;
  alias: string | null;
  idempotency_key: string;
}

export interface RegisterRepositoryRequest {
  endpoint_id: string;
  remote_path: string;
  display_name: string;
  idempotency_key: string;
}

export interface ListRegionsResponse {
  regions: RegionCode[];
}

export interface ListSizePresetsResponse {
  presets: SizePreset[];
}
