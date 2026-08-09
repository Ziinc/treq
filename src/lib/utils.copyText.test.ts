import { afterEach, describe, expect, it, vi } from "vitest";
import { copyTextToClipboard } from "./utils";

describe("copyTextToClipboard", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses navigator.clipboard.writeText when available", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(navigator.clipboard, "writeText").mockImplementation(writeText);

    await copyTextToClipboard("src/example.ts");

    expect(writeText).toHaveBeenCalledWith("src/example.ts");
  });

  it("propagates clipboard writeText failures", async () => {
    vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(
      new Error("denied"),
    );

    await expect(copyTextToClipboard("nope")).rejects.toThrow("denied");
  });

  it("throws when the Clipboard API is unavailable", async () => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: undefined,
    });

    await expect(copyTextToClipboard("nope")).rejects.toThrow(
      "Clipboard API unavailable",
    );
  });
});
