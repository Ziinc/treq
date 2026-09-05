import { invoke } from "@tauri-apps/api/core";
import type {
  RemoteRepoProbe,
  RemoteRepository,
  ResolvedSshAlias,
  SshEndpoint,
} from "./api-types";

/**
 * Resolves an explicitly-selected `~/.ssh/config` alias into its hostname,
 * port, username, and identity fields. Autocomplete only: this performs no
 * network I/O and never grants trust by itself. The user still supplies and
 * confirms the expected host-key fingerprint before
 * {@link buildExplicitAliasSshEndpoint} ever runs.
 */
export const resolveSshConfigAlias = (
  alias: string,
): Promise<ResolvedSshAlias> => invoke("resolve_ssh_config_alias", { alias });

/**
 * Builds a fully-explicit, trust-pinned native `SshEndpoint` for an
 * explicitly-selected alias, after the user has supplied the expected
 * host-key fingerprint. The returned endpoint is only ever connected to
 * through the native SSH transport (`remoteProbeRepoOverSsh` /
 * `remoteOpenRepoOverSsh` / `remoteCloneRepoOverSsh` /
 * `remoteDispatchOverSsh`), never a system `ssh` subprocess.
 */
export const buildExplicitAliasSshEndpoint = (params: {
  endpointId: string;
  alias: string;
  expectedFingerprint: string;
  hostKeyAlgorithm: string;
  usernameOverride?: string | null;
  keyReference: string;
}): Promise<SshEndpoint> =>
  invoke("build_explicit_alias_ssh_endpoint", {
    endpointId: params.endpointId,
    alias: params.alias,
    expectedFingerprint: params.expectedFingerprint,
    hostKeyAlgorithm: params.hostKeyAlgorithm,
    usernameOverride: params.usernameOverride ?? null,
    keyReference: params.keyReference,
  });

export const remoteProbeRepoOverSsh = (
  endpoint: SshEndpoint,
  path: string,
): Promise<RemoteRepoProbe> =>
  invoke("remote_probe_repo_over_ssh", { endpoint, path });

export const remoteCloneRepoOverSsh = (
  endpoint: SshEndpoint,
  repoUrl: string,
  destination: string,
): Promise<RemoteRepository> =>
  invoke("remote_clone_repo_over_ssh", { endpoint, repoUrl, destination });

export const remoteOpenRepoOverSsh = (
  endpoint: SshEndpoint,
  path: string,
): Promise<RemoteRepository> =>
  invoke("remote_open_repo_over_ssh", { endpoint, path });
