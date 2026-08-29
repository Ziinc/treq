// Frontend entry point for Phase 5's typed remote command dispatch
// (`remote_dispatch_local` / `remote_dispatch_over_ssh` in
// `src-tauri/src/commands/remote_control.rs`). Every call sends a fully
// typed `TreqCommandRequest` variant - never a raw string - so the
// allow-list holds at the IPC boundary the same way it holds inside the
// exec transport.
//
// This is intentionally a separate, small surface from `src/lib/api.ts`
// rather than a rewrite of it: the existing ~50 local Tauri commands in
// `api.ts` are not yet mirrored one-to-one by `TreqCommandRequest` variants,
// so making every local data hook transport-aware is future work. What is
// wired here is the read-only review surface (status, changes, commits,
// conflicts) needed to replace the remote placeholder screen, plus the
// mutations the PRD calls "not yet supported" so the UI can disable them
// instead of sending a request that always fails.

import { invoke } from "@tauri-apps/api/core";
import type { SshEndpoint } from "./api-types-remote";

export type TreqCommandRequest =
  | { kind: "ProbeRepo"; repo: string }
  | { kind: "InspectRepository"; repo: string }
  | { kind: "RepositoryStatus"; repo: string }
  | { kind: "ListBranches"; repo: string }
  | { kind: "ListWorkspaces"; repo: string }
  | { kind: "ListChanges"; repo: string; workspace?: string | null }
  | {
      kind: "DiffFile";
      repo: string;
      workspace?: string | null;
      path: string;
    }
  | { kind: "ListCommits"; repo: string; workspace?: string | null }
  | { kind: "ListConflicts"; repo: string; workspace?: string | null }
  | { kind: "GitFetch"; repo: string; idempotency_key?: string | null }
  | {
      kind: "AgentStart";
      repo: string;
      workspace: string;
      agent: string;
      prompt: string;
      idempotency_key?: string | null;
    }
  | { kind: "AgentStatus"; repo: string; workspace: string }
  | { kind: "AgentStop"; repo: string; workspace: string };

/**
 * Remote commands the PRD or Phase 5 explicitly marks `not_implemented` over
 * the exec channel. The UI must disable the corresponding action rather than
 * let a user trigger a request that always fails - see "Main application
 * integration": "disabling any action not yet supported remotely."
 */
export const REMOTE_NOT_IMPLEMENTED = new Set([
  "SplitCommit",
  "AgentInput",
]);

export function isRemoteActionSupported(kind: string): boolean {
  return !REMOTE_NOT_IMPLEMENTED.has(kind);
}

export function dispatchLocal<T = unknown>(
  request: TreqCommandRequest,
): Promise<T> {
  return invoke("remote_dispatch_local", { request });
}

export function dispatchOverSsh<T = unknown>(
  endpoint: SshEndpoint,
  request: TreqCommandRequest,
): Promise<T> {
  return invoke("remote_dispatch_over_ssh", { endpoint, request });
}

/** Dispatches locally or over SSH depending on whether an endpoint is given. */
export function dispatch<T = unknown>(
  endpoint: SshEndpoint | null,
  request: TreqCommandRequest,
): Promise<T> {
  return endpoint ? dispatchOverSsh<T>(endpoint, request) : dispatchLocal<T>(request);
}
