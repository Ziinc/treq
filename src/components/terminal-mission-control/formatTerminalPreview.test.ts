import { describe, expect, it } from "vitest";
import { formatTerminalPreview } from "./formatTerminalPreview";

describe("formatTerminalPreview", () => {
  it("strips ANSI escape sequences and keeps the newest lines", () => {
    const raw = [
      "old line",
      "\x1b[32mgreen\x1b[0m middle",
      "latest output",
      "",
    ].join("\n");

    expect(formatTerminalPreview(raw, { maxLines: 2 })).toBe(
      "green middle\nlatest output",
    );
  });

  it("returns an empty string when there is no printable output", () => {
    expect(formatTerminalPreview("\x1b[2J\x1b[H")).toBe("");
    expect(formatTerminalPreview("")).toBe("");
  });

  it("normalizes carriage returns from terminal redraws", () => {
    expect(formatTerminalPreview("prompt> \rprompt> done")).toBe(
      "prompt> done",
    );
  });
});
