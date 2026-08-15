import { describe, expect, it } from "vitest";
import { consumePtyEcho } from "./consumePtyEcho";

describe("consumePtyEcho", () => {
  it("treats a matching keystroke echo as no process output", () => {
    expect(consumePtyEcho("a", "a")).toEqual({
      pendingEcho: "",
      processOutput: "",
    });
  });

  it("leaves unmatched process output after consuming echo", () => {
    expect(consumePtyEcho("ls\r", "ls\r\nREADME\n")).toEqual({
      pendingEcho: "",
      processOutput: "README\n",
    });
  });

  it("keeps leftover pending echo across chunks", () => {
    expect(consumePtyEcho("ab", "a")).toEqual({
      pendingEcho: "b",
      processOutput: "",
    });
  });

  it("treats the whole chunk as process output when nothing is pending", () => {
    expect(consumePtyEcho("", "hello\n")).toEqual({
      pendingEcho: "",
      processOutput: "hello\n",
    });
  });
});
