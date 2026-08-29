// Local persistence for user-managed SSH endpoints and the remote
// repositories opened on them. User-managed endpoints do not go through the
// control plane (prds/remote-ssh.md, "User modes" - no certificate issuance
// required), so they are recorded on-device, keyed by endpoint id, using the
// same `getSetting`/`setSetting` local settings store the app already uses
// for "last opened remote repo" and recent-host memory.
//
// A saved repository is restored only after the caller re-runs readiness and
// host-trust validation (see `restoreSavedRemoteRepository` in
// `remote-repository.ts`) - this module only persists the descriptors, it
// never assumes they are still trustworthy.

import { getSetting, setSetting } from "./api";
import type { SshAuthentication, TrustedHostKey } from "./api-types-remote";

const ENDPOINTS_KEY = "remote_user_managed_endpoints";
const SAVED_REPOS_KEY = "remote_saved_repositories";

export interface UserManagedEndpointRecord {
  id: string;
  display_name: string;
  hostname: string;
  port: number;
  username: string;
  host_key_fingerprint: string;
  auth_identity_reference: string;
  /** Set only when the user explicitly chose alias mode for this endpoint. */
  alias: string | null;
  created_at: string;
}

export interface SavedRemoteRepositoryRecord {
  id: string;
  endpoint_id: string;
  remote_path: string;
  display_name: string;
  /** Generation of the endpoint at the time this was saved, for trust-transition detection. */
  endpoint_generation: number;
}

async function readJson<T>(key: string, fallback: T): Promise<T> {
  const raw = await getSetting(key).catch(() => null);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export async function listUserManagedEndpoints(): Promise<
  UserManagedEndpointRecord[]
> {
  return readJson(ENDPOINTS_KEY, []);
}

export async function saveUserManagedEndpoint(
  record: UserManagedEndpointRecord,
): Promise<void> {
  const existing = await listUserManagedEndpoints();
  const next = [
    record,
    ...existing.filter((endpoint) => endpoint.id !== record.id),
  ];
  await setSetting(ENDPOINTS_KEY, JSON.stringify(next));
}

export async function listSavedRemoteRepositories(): Promise<
  SavedRemoteRepositoryRecord[]
> {
  return readJson(SAVED_REPOS_KEY, []);
}

export async function saveRemoteRepository(
  record: SavedRemoteRepositoryRecord,
): Promise<void> {
  const existing = await listSavedRemoteRepositories();
  const next = [record, ...existing.filter((repo) => repo.id !== record.id)];
  await setSetting(SAVED_REPOS_KEY, JSON.stringify(next));
}

/** Builds the trusted-host-key record from a user-entered fingerprint. */
export function trustedHostKeyFromFingerprint(
  fingerprint: string,
): TrustedHostKey {
  return {
    algorithm: "unknown",
    fingerprint_sha256: fingerprint,
    comment: null,
  };
}

export function publicKeyAuthentication(
  keyReference: string,
): SshAuthentication {
  return { type: "public_key", key_reference: keyReference };
}
