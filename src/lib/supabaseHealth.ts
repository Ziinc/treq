/**
 * Health checks and restore-error classification for desktop Supabase auth.
 * Used to fail fast when Treq Cloud is unreachable instead of waiting on
 * Supabase's long internal refresh retry window.
 */

export type AuthAvailability = "checking" | "available" | "unavailable";

export type SessionRestoreErrorKind =
  | "network"
  | "invalid_token"
  | "malformed_json"
  | "unknown";

/** Short timeout so startup does not block on a dead cloud API. */
export const HEALTH_CHECK_TIMEOUT_MS = 1500;

/** Backoff schedule for automatic reconnection attempts (ms). */
export const AUTH_RETRY_BACKOFF_MS = [
  1000, 2000, 5000, 10_000, 30_000,
] as const;

export function authRetryDelayMs(attempt: number): number {
  const index = Math.min(
    Math.max(attempt, 0),
    AUTH_RETRY_BACKOFF_MS.length - 1,
  );
  return AUTH_RETRY_BACKOFF_MS[index];
}

export async function checkSupabaseAuthHealth(
  supabaseUrl: string,
  options?: {
    timeoutMs?: number;
    fetchFn?: typeof fetch;
  },
): Promise<boolean> {
  const timeoutMs = options?.timeoutMs ?? HEALTH_CHECK_TIMEOUT_MS;
  const fetchFn = options?.fetchFn ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchFn(
      `${supabaseUrl.replace(/\/$/, "")}/auth/v1/health`,
      {
        method: "GET",
        signal: controller.signal,
      },
    );
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null && "message" in error) {
    const { message } = error as { message: unknown };
    if (typeof message === "string") return message;
  }
  return String(error ?? "");
}

function errorName(error: unknown): string {
  if (error instanceof Error) return error.name;
  if (typeof error === "object" && error !== null && "name" in error) {
    const { name } = error as { name: unknown };
    if (typeof name === "string") return name;
  }
  return "";
}

function errorStatus(error: unknown): number | undefined {
  if (typeof error === "object" && error !== null && "status" in error) {
    const { status } = error as { status: unknown };
    if (typeof status === "number") return status;
  }
  return undefined;
}

function errorCode(error: unknown): string | undefined {
  if (typeof error === "object" && error !== null && "code" in error) {
    const { code } = error as { code: unknown };
    if (typeof code === "string") return code;
  }
  return undefined;
}

export function classifySessionRestoreError(
  error: unknown,
): SessionRestoreErrorKind {
  if (error instanceof SyntaxError) {
    return "malformed_json";
  }

  const name = errorName(error);
  const message = errorMessage(error).toLowerCase();
  const status = errorStatus(error);
  const code = errorCode(error)?.toLowerCase();

  if (
    name === "AbortError" ||
    name === "TimeoutError" ||
    name === "AuthRetryableFetchError" ||
    message.includes("failed to fetch") ||
    message.includes("network") ||
    message.includes("timeout") ||
    message.includes("fetch failed") ||
    message.includes("econnrefused") ||
    message.includes("enotfound") ||
    message.includes("socket hang up")
  ) {
    return "network";
  }

  if (
    code === "refresh_token_not_found" ||
    code === "invalid_grant" ||
    code === "session_not_found" ||
    message.includes("refresh_token") ||
    message.includes("refresh token") ||
    message.includes("invalid jwt") ||
    message.includes("invalid claim") ||
    message.includes("session_not_found") ||
    status === 401 ||
    (status === 400 &&
      (message.includes("token") || message.includes("jwt") || !!code))
  ) {
    return "invalid_token";
  }

  if (
    message.includes("unexpected token") ||
    message.includes("is not valid json") ||
    (message.includes("json") && message.includes("parse"))
  ) {
    return "malformed_json";
  }

  return "unknown";
}
