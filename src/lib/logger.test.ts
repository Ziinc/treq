import { describe, expect, it } from "vitest";
import { serializeLogArgument } from "./logger";

describe("serializeLogArgument", () => {
  it("serializes Error instances with name, message, stack, and cause", () => {
    const cause = new Error("socket hang up");
    const error = new Error("Failed to fetch") as Error & { cause?: unknown };
    error.name = "AuthRetryableFetchError";
    error.cause = cause;

    const serialized = serializeLogArgument(error);
    const parsed = JSON.parse(serialized) as {
      name: string;
      message: string;
      stack?: string;
      cause: { name: string; message: string; stack?: string };
    };

    expect(parsed.name).toBe("AuthRetryableFetchError");
    expect(parsed.message).toBe("Failed to fetch");
    expect(parsed.stack).toContain("Failed to fetch");
    expect(parsed.cause).toMatchObject({
      name: "Error",
      message: "socket hang up",
    });
  });

  it("does not serialize Error as an empty object", () => {
    expect(serializeLogArgument(new TypeError("boom"))).not.toBe("{}");
  });

  it("JSON-stringifies plain objects and falls back on circular values", () => {
    expect(serializeLogArgument({ code: "ECONNREFUSED" })).toBe(
      '{"code":"ECONNREFUSED"}',
    );

    const circular: { self?: unknown } = {};
    circular.self = circular;
    expect(serializeLogArgument(circular)).toBe("[object Object]");
  });

  it("stringifies primitives", () => {
    expect(serializeLogArgument("hello")).toBe("hello");
    expect(serializeLogArgument(42)).toBe("42");
    expect(serializeLogArgument(null)).toBe("null");
  });
});
