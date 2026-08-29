// Client for the `remote-instance` and `remote-ssh-trust` Supabase Edge
// Functions (prds/remote-ssh.md, Phases 2-3). This is the only place the
// frontend talks to the managed-VM control plane; UI components go through
// the hooks in `src/hooks/useRemoteInstance.ts` instead of calling these
// directly, so caching/query-key rules stay in one place.
//
// Provider credentials and the SSH CA private key never reach this file or
// any response it receives - see the edge functions themselves.

import { supabase } from "./supabase";
import type {
  DeleteInstanceRequest,
  InstanceStatusResponse,
  ListRegionsResponse,
  ListSizePresetsResponse,
  OperationResponse,
  ProvisionInstanceRequest,
  RegionCode,
  ReprovisionInstanceRequest,
  RevokeClientKeyRequest,
  SizePreset,
  WakeInstanceRequest,
} from "./api-types-remote";

async function invokeRemoteInstance<T>(
  action: string,
  body: object = {},
): Promise<T> {
  const { data, error } = await supabase.functions.invoke("remote-instance", {
    body: { action, ...body },
  });
  if (error) throw error;
  return data as T;
}

async function invokeRemoteTrust<T>(
  action: string,
  body: object = {},
): Promise<T> {
  const { data, error } = await supabase.functions.invoke("remote-ssh-trust", {
    body: { action, ...body },
  });
  if (error) throw error;
  return data as T;
}

// -- Instance lifecycle (remote-instance) -----------------------------------

export const listRegions = (): Promise<RegionCode[]> =>
  invokeRemoteInstance<ListRegionsResponse>("list_regions").then(
    (r) => r.regions,
  );

export const listSizePresets = (): Promise<SizePreset[]> =>
  invokeRemoteInstance<ListSizePresetsResponse>("list_sizes").then(
    (r) => r.presets,
  );

export const getInstanceStatus = (): Promise<InstanceStatusResponse> =>
  invokeRemoteInstance<InstanceStatusResponse>("status");

export const ensureInstance = (
  request: Omit<ProvisionInstanceRequest, "idempotency_key"> & {
    idempotency_key: string;
  },
): Promise<OperationResponse> => invokeRemoteInstance("ensure", request);

export const wakeInstance = (
  request: WakeInstanceRequest,
): Promise<OperationResponse> => invokeRemoteInstance("wake", request);

export const reprovisionInstance = (
  request: ReprovisionInstanceRequest,
): Promise<OperationResponse> => invokeRemoteInstance("reprovision", request);

export const deleteInstance = (
  request: DeleteInstanceRequest,
): Promise<OperationResponse> => invokeRemoteInstance("delete", request);

// -- SSH trust and authentication (remote-ssh-trust) ------------------------
//
// Only `revoke_client_key` is wired to UI today (the managed-VM lifecycle
// panel's "Revoke key" action). Registering a new client key, issuing a
// certificate, and re-running a host-key scan are real edge-function actions
// (see `supabase/functions/remote-ssh-trust`) that do not yet have a calling
// UI surface - they belong with the certificate-issuance step of "Managed VM
// certificate flow", which Phase 6 did not build a screen for.

export const revokeClientKey = (
  request: RevokeClientKeyRequest,
): Promise<OperationResponse> =>
  invokeRemoteTrust("revoke_client_key", request);

// User-managed endpoints and their repositories are not control-plane
// resources: the PRD's user-managed mode does not require control-plane
// certificate issuance, and there is no `remote_instance_endpoints` /
// `remote_repositories` write path in the current edge functions for them.
// They are persisted locally instead - see `src/lib/remote-endpoints.ts`.
