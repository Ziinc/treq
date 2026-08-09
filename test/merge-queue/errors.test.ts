import { describe, expect, it } from "vitest";
import {
  backoffSeconds,
  classifyError,
  isExhausted,
  LeaseContentionError,
  MAX_ATTEMPTS,
  RetryableError,
  TerminalError,
} from "../../supabase/functions/_shared/merge-queue/errors.ts";

describe("classifyError", () => {
  it("honours explicit classifications", () => {
    expect(classifyError(new RetryableError("later"))).toBe("retryable");
    expect(classifyError(new TerminalError("never"))).toBe("terminal");
    expect(classifyError(new LeaseContentionError("q-1"))).toBe("retryable");
  });

  it("retries GitHub rate limits and server errors", () => {
    expect(
      classifyError(new Error("GitHub POST https://x → 429: slow down")),
    ).toBe("retryable");
    expect(
      classifyError(new Error("GitHub GET https://x → 502: bad gateway")),
    ).toBe("retryable");
    expect(
      classifyError(
        new Error("GitHub GET https://x → 403: API rate limit exceeded"),
      ),
    ).toBe("retryable");
  });

  it("treats other GitHub 4xx responses as terminal", () => {
    expect(
      classifyError(new Error("GitHub PUT https://x → 404: not found")),
    ).toBe("terminal");
    expect(
      classifyError(new Error("GitHub POST https://x → 422: validation")),
    ).toBe("terminal");
    expect(
      classifyError(new Error("GitHub PUT https://x → 403: forbidden")),
    ).toBe("terminal");
  });

  it("retries network failures and unknown errors", () => {
    expect(classifyError(new Error("fetch failed"))).toBe("retryable");
    expect(classifyError(new Error("connection timed out"))).toBe("retryable");
    expect(classifyError(new Error("something odd"))).toBe("retryable");
    expect(classifyError("string error")).toBe("retryable");
  });
});

describe("backoff schedule", () => {
  it("follows the bounded exponential schedule", () => {
    expect(backoffSeconds(1)).toBe(15);
    expect(backoffSeconds(2)).toBe(60);
    expect(backoffSeconds(3)).toBe(300);
    expect(backoffSeconds(4)).toBe(900);
    // Clamped at the top of the schedule.
    expect(backoffSeconds(10)).toBe(900);
    expect(backoffSeconds(0)).toBe(15);
  });

  it("exhausts after the configured attempt cap", () => {
    expect(MAX_ATTEMPTS).toBe(5);
    expect(isExhausted(4)).toBe(false);
    expect(isExhausted(5)).toBe(true);
    expect(isExhausted(6)).toBe(true);
  });

  it("carries explicit retry delays", () => {
    const err = new RetryableError("checks pending", { delaySeconds: 60 });
    expect(err.delaySeconds).toBe(60);
  });
});
