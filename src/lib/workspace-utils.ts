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

export function defaultScheduleDate(now: Date = new Date()): Date {
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(9, 0, 0, 0);
  return tomorrow;
}

export function addHours(from: Date, hours: number): Date {
  return new Date(from.getTime() + hours * 60 * 60 * 1000);
}

export function addDaysAtHour(from: Date, days: number, hour: number): Date {
  const result = new Date(from);
  result.setDate(result.getDate() + days);
  result.setHours(hour, 0, 0, 0);
  return result;
}

/** Next occurrence of `weekday` (0=Sun … 6=Sat) at local hour. Uses today if still upcoming. */
export function nextWeekdayAt(from: Date, weekday: number, hour: number): Date {
  const result = new Date(from);
  result.setHours(hour, 0, 0, 0);
  const daysAhead = (weekday - from.getDay() + 7) % 7;
  if (daysAhead === 0 && result.getTime() <= from.getTime()) {
    result.setDate(result.getDate() + 7);
  } else {
    result.setDate(result.getDate() + daysAhead);
  }
  return result;
}

/** Always the following Monday at 9am, never today. */
export function followingMondayAtNine(from: Date): Date {
  const result = new Date(from);
  result.setHours(9, 0, 0, 0);
  const daysUntilMonday = (1 - from.getDay() + 7) % 7;
  result.setDate(
    result.getDate() + (daysUntilMonday === 0 ? 7 : daysUntilMonday),
  );
  return result;
}
