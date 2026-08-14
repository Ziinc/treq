import type { Workspace } from "./api";

/**
 * Get display title for a workspace - always returns branch_name
 */
export function getWorkspaceTitle(
  workspace: Workspace | { metadata?: string; branch_name: string },
): string {
  return workspace.branch_name;
}

/**
 * Get the human-facing display title for a workspace: explicit title, then
 * metadata.title, then branch_name as a last resort.
 */
export function getWorkspaceDisplayTitle(workspace: Workspace): string {
  if (workspace.title) return workspace.title;

  if (workspace.metadata) {
    try {
      const parsed = JSON.parse(workspace.metadata) as { title?: string };
      if (parsed.title) return parsed.title;
    } catch {
      // Malformed metadata falls through to branch_name below.
    }
  }

  return workspace.branch_name;
}

export function isWorkspaceHidden(
  workspace: { hidden_until?: string | null },
  nowMs: number = Date.now(),
): boolean {
  if (!workspace.hidden_until) return false;
  const until = Date.parse(workspace.hidden_until);
  return Number.isFinite(until) && until > nowMs;
}

/** `datetime-local` value in the user's timezone. */
export function toDatetimeLocalValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function datetimeLocalToRfc3339(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error("Invalid date");
  }
  return parsed.toISOString();
}

export function defaultScheduleDatetimeLocal(now: Date = new Date()): string {
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(9, 0, 0, 0);
  return toDatetimeLocalValue(tomorrow);
}
