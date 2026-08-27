// Audit event helper for remote_audit_events, per the PRD's "Observability
// and audit" section. `detail` must never contain a provider token, CA key
// material, or repository content — callers pass only normalized lifecycle
// fields (region, size, generation, manifest version, provider request ids,
// readiness stage).

import type { SupabaseClient } from "@supabase/supabase-js";

export type RemoteAuditEventType =
  | "instance_create_requested"
  | "instance_create_succeeded"
  | "instance_create_failed"
  | "instance_wake_requested"
  | "instance_wake_succeeded"
  | "instance_wake_failed"
  | "instance_replace_requested"
  | "instance_replace_succeeded"
  | "instance_replace_failed"
  | "instance_delete_requested"
  | "instance_delete_succeeded"
  | "instance_delete_failed"
  | "host_key_registered"
  | "host_key_rotated"
  | "host_keyscan_failed"
  | "readiness_stage_failed"
  | "client_key_registered"
  | "client_key_revoked"
  | "certificate_issued"
  | "certificate_issue_failed"
  | "authorized_key_installed"
  | "authorized_key_removed"
  | "ca_trust_installed"
  | "ca_trust_install_failed";

export async function recordAuditEvent(
  supabase: SupabaseClient,
  params: {
    ownerUserId: string;
    instanceId?: string | null;
    endpointId?: string | null;
    eventType: RemoteAuditEventType;
    // deno-lint-ignore no-explicit-any
    detail?: Record<string, any>;
  },
): Promise<void> {
  const { error } = await supabase.from("remote_audit_events").insert({
    owner_user_id: params.ownerUserId,
    instance_id: params.instanceId ?? null,
    endpoint_id: params.endpointId ?? null,
    event_type: params.eventType,
    detail: params.detail ?? {},
  });
  // Audit recording failures must not silently vanish, but they also must
  // not fail the underlying lifecycle operation the caller already
  // committed to the provider — log and continue.
  if (error) {
    console.error(`failed to record audit event ${params.eventType}: ${error.message}`);
  }
}
