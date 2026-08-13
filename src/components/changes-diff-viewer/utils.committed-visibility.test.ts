import { describe, expect, it } from "vitest";
import { filterVisibleCommittedFiles, shouldShowCommittedFile } from "./utils";

describe("committed Show visibility", () => {
  const alwaysVisible = new Set(["dirty.txt", "conflict.txt"]);

  it("shows every committed file when Show is on", () => {
    expect(shouldShowCommittedFile("clean.txt", true, alwaysVisible)).toBe(
      true,
    );
    expect(shouldShowCommittedFile("dirty.txt", true, alwaysVisible)).toBe(
      true,
    );
  });

  it("hides only clean committed files when Show is off", () => {
    expect(shouldShowCommittedFile("clean.txt", false, alwaysVisible)).toBe(
      false,
    );
    expect(shouldShowCommittedFile("dirty.txt", false, alwaysVisible)).toBe(
      true,
    );
    expect(shouldShowCommittedFile("conflict.txt", false, alwaysVisible)).toBe(
      true,
    );
  });

  it("filters committed lists down to always-visible paths when hidden", () => {
    const files = [
      { path: "clean.txt" },
      { path: "dirty.txt" },
      { path: "other-clean.ts" },
    ];
    expect(filterVisibleCommittedFiles(files, true, alwaysVisible)).toEqual(
      files,
    );
    expect(filterVisibleCommittedFiles(files, false, alwaysVisible)).toEqual([
      { path: "dirty.txt" },
    ]);
  });
});
