// Runtime validation for merge queue command messages.
//
// Unknown versions and malformed payloads are rejected as terminal so they
// dead-letter instead of retrying forever.

import type { MergeQueueCommand } from "./messages.ts";
import { MESSAGE_VERSION } from "./messages.ts";

export type ParseResult =
  | { ok: true; command: MergeQueueCommand }
  | { ok: false; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

const DEQUEUE_REASONS = new Set([
  "label_removed",
  "closed",
  "synchronized",
  "manual",
]);

const DRIVE_REASONS = new Set([
  "entry_added",
  "entry_removed",
  "ci_completed",
  "lane_completed",
  "manual",
  "reconciliation",
]);

const INSTALLATION_ACTIONS = new Set([
  "created",
  "repositories_changed",
  "deleted",
]);

export function parseCommand(raw: unknown): ParseResult {
  if (!isRecord(raw)) {
    return { ok: false, error: "message is not an object" };
  }

  if (raw.version !== MESSAGE_VERSION) {
    return { ok: false, error: `unknown message version: ${String(raw.version)}` };
  }

  if (!isNonEmptyString(raw.commandId)) {
    return { ok: false, error: "missing commandId" };
  }
  if (!isNonEmptyString(raw.occurredAt)) {
    return { ok: false, error: "missing occurredAt" };
  }

  switch (raw.type) {
    case "entry.enqueue": {
      if (!isNonEmptyString(raw.deliveryId)) {
        return { ok: false, error: "entry.enqueue: missing deliveryId" };
      }
      if (!isNonEmptyString(raw.repositoryId)) {
        return { ok: false, error: "entry.enqueue: missing repositoryId" };
      }
      if (!isNonEmptyString(raw.queueId)) {
        return { ok: false, error: "entry.enqueue: missing queueId" };
      }
      if (typeof raw.pullRequestNumber !== "number") {
        return { ok: false, error: "entry.enqueue: missing pullRequestNumber" };
      }
      if (!isNonEmptyString(raw.headSha)) {
        return { ok: false, error: "entry.enqueue: missing headSha" };
      }
      if (!isNonEmptyString(raw.baseBranch)) {
        return { ok: false, error: "entry.enqueue: missing baseBranch" };
      }
      return { ok: true, command: raw as unknown as MergeQueueCommand };
    }
    case "entry.dequeue": {
      if (!isNonEmptyString(raw.deliveryId)) {
        return { ok: false, error: "entry.dequeue: missing deliveryId" };
      }
      if (!isNonEmptyString(raw.repositoryId)) {
        return { ok: false, error: "entry.dequeue: missing repositoryId" };
      }
      if (!isNonEmptyString(raw.queueId)) {
        return { ok: false, error: "entry.dequeue: missing queueId" };
      }
      if (typeof raw.pullRequestNumber !== "number") {
        return { ok: false, error: "entry.dequeue: missing pullRequestNumber" };
      }
      if (!DEQUEUE_REASONS.has(raw.reason as string)) {
        return { ok: false, error: `entry.dequeue: invalid reason: ${String(raw.reason)}` };
      }
      if (raw.reason === "synchronized" && !isNonEmptyString(raw.headSha)) {
        return { ok: false, error: "entry.dequeue: synchronized requires headSha" };
      }
      return { ok: true, command: raw as unknown as MergeQueueCommand };
    }
    case "queue.drive": {
      if (!isNonEmptyString(raw.queueId)) {
        return { ok: false, error: "queue.drive: missing queueId" };
      }
      if (!DRIVE_REASONS.has(raw.reason as string)) {
        return { ok: false, error: `queue.drive: invalid reason: ${String(raw.reason)}` };
      }
      return { ok: true, command: raw as unknown as MergeQueueCommand };
    }
    case "ci.completed": {
      if (!isNonEmptyString(raw.deliveryId)) {
        return { ok: false, error: "ci.completed: missing deliveryId" };
      }
      if (!isNonEmptyString(raw.queueId)) {
        return { ok: false, error: "ci.completed: missing queueId" };
      }
      if (!isNonEmptyString(raw.ciRunId)) {
        return { ok: false, error: "ci.completed: missing ciRunId" };
      }
      if (!isNonEmptyString(raw.testedSha)) {
        return { ok: false, error: "ci.completed: missing testedSha" };
      }
      if (!isNonEmptyString(raw.conclusion)) {
        return { ok: false, error: "ci.completed: missing conclusion" };
      }
      return { ok: true, command: raw as unknown as MergeQueueCommand };
    }
    case "installation.sync": {
      if (!isNonEmptyString(raw.deliveryId)) {
        return { ok: false, error: "installation.sync: missing deliveryId" };
      }
      if (typeof raw.installationId !== "number") {
        return { ok: false, error: "installation.sync: missing installationId" };
      }
      if (!INSTALLATION_ACTIONS.has(raw.action as string)) {
        return { ok: false, error: `installation.sync: invalid action: ${String(raw.action)}` };
      }
      return { ok: true, command: raw as unknown as MergeQueueCommand };
    }
    default:
      return { ok: false, error: `unknown command type: ${String(raw.type)}` };
  }
}
