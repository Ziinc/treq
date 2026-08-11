import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AUTH_RETRY_BACKOFF_MS,
  authRetryDelayMs,
  checkSupabaseAuthHealth,
  classifySessionRestoreError,
  HEALTH_CHECK_TIMEOUT_MS,
} from "./supabaseHealth";

describe("checkSupabaseAuthHealth", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("returns true when the health endpoint responds ok", async () => {
    const fetchFn = vi.fn().mockResolvedValue({ ok: true });
    await expect(
      checkSupabaseAuthHealth("http://127.0.0.1:54321", { fetchFn }),
    ).resolves.toBe(true);
    expect(fetchFn).toHaveBeenCalledWith(
      "http://127.0.0.1:54321/auth/v1/health",
      expect.objectContaining({ method: "GET", signal: expect.any(AbortSignal) }),
    );
  });

  it("returns false when the health endpoint is unreachable", async () => {
    const fetchFn = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(
      checkSupabaseAuthHealth("http://127.0.0.1:54321", { fetchFn }),
    ).resolves.toBe(false);
  });

  it("returns false when the health check times out", async () => {
    vi.useFakeTimers();
    const fetchFn = vi.fn(
      (_url: string, init?: { signal?: AbortSignal }) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("Aborted", "AbortError"));
          });
        }),
    );

    const pending = checkSupabaseAuthHealth("http://127.0.0.1:54321", {
      fetchFn: fetchFn as typeof fetch,
      timeoutMs: HEALTH_CHECK_TIMEOUT_MS,
    });

    await vi.advanceTimersByTimeAsync(HEALTH_CHECK_TIMEOUT_MS);
    await expect(pending).resolves.toBe(false);
  });
});

describe("classifySessionRestoreError", () => {
  it("classifies network and timeout failures", () => {
    expect(classifySessionRestoreError(new TypeError("Failed to fetch"))).toBe(
      "network",
    );
    const aborted = new DOMException("Aborted", "AbortError");
    expect(classifySessionRestoreError(aborted)).toBe("network");
    const retryable = new Error("fetch failed");
    retryable.name = "AuthRetryableFetchError";
    expect(classifySessionRestoreError(retryable)).toBe("network");
  });

  it("classifies invalid or revoked refresh tokens", () => {
    expect(
      classifySessionRestoreError(
        Object.assign(new Error("Invalid Refresh Token"), {
          status: 400,
          code: "refresh_token_not_found",
        }),
      ),
    ).toBe("invalid_token");
    expect(
      classifySessionRestoreError(
        Object.assign(new Error("invalid jwt"), { status: 401 }),
      ),
    ).toBe("invalid_token");
  });

  it("classifies malformed stored JSON", () => {
    expect(
      classifySessionRestoreError(new SyntaxError("Unexpected token")),
    ).toBe("malformed_json");
  });
});

describe("authRetryDelayMs", () => {
  it("returns backoff delays and caps at the last interval", () => {
    expect(authRetryDelayMs(0)).toBe(AUTH_RETRY_BACKOFF_MS[0]);
    expect(authRetryDelayMs(1)).toBe(AUTH_RETRY_BACKOFF_MS[1]);
    expect(authRetryDelayMs(AUTH_RETRY_BACKOFF_MS.length + 5)).toBe(
      AUTH_RETRY_BACKOFF_MS[AUTH_RETRY_BACKOFF_MS.length - 1],
    );
  });
});
