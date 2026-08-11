import { describe, expect, it } from "vitest";
import type { ConflictRegion } from "./api-types";
import {
  getConflictDeletedSides,
  isDeletedFileStatus,
} from "./conflict-deleted-sides";

function regionFixture(
  overrides: Partial<ConflictRegion> &
    Pick<ConflictRegion, "marker_style" | "lines">,
): ConflictRegion {
  return {
    id: "shared.txt-conflict-1",
    file_path: "shared.txt",
    conflict_number: 1,
    total_conflicts: 1,
    start_line: 1,
    end_line: 5,
    content: "",
    line_map: [],
    comparison: {
      left_line_indexes: [],
      base_line_indexes: [],
      right_line_indexes: [],
    },
    ...overrides,
  };
}

describe("getConflictDeletedSides", () => {
  it("marks side #2 deleted when right content is absent", () => {
    const region = regionFixture({
      marker_style: "jj_git_diff3",
      lines: [
        {
          raw: "<<<<<<< Side #1 (Conflict 1 of 1)",
          kind: "marker",
          role: "start",
          file_line: 1,
        },
        {
          raw: "workspace side",
          kind: "content",
          role: "left",
          file_line: 2,
        },
        {
          raw: "||||||| Base",
          kind: "marker",
          role: "base",
          file_line: 3,
        },
        { raw: "base", kind: "content", role: "base", file_line: 4 },
        {
          raw: "=======",
          kind: "marker",
          role: "separator",
          file_line: 5,
        },
        {
          raw: ">>>>>>> Side #2 (Conflict 1 of 1)",
          kind: "marker",
          role: "end",
          file_line: 6,
        },
      ],
    });

    expect(getConflictDeletedSides(region)).toEqual({
      left: false,
      right: true,
    });
  });

  it("marks side #1 deleted when left content is absent", () => {
    const region = regionFixture({
      marker_style: "git_merge",
      lines: [
        {
          raw: "<<<<<<<",
          kind: "marker",
          role: "start",
          file_line: 1,
        },
        {
          raw: "=======",
          kind: "marker",
          role: "separator",
          file_line: 2,
        },
        {
          raw: "kept side",
          kind: "content",
          role: "right",
          file_line: 3,
        },
        {
          raw: ">>>>>>>",
          kind: "marker",
          role: "end",
          file_line: 4,
        },
      ],
    });

    expect(getConflictDeletedSides(region)).toEqual({
      left: true,
      right: false,
    });
  });

  it("treats whitespace-only side content as deleted", () => {
    const region = regionFixture({
      marker_style: "git_diff3",
      lines: [
        {
          raw: "<<<<<<<",
          kind: "marker",
          role: "start",
          file_line: 1,
        },
        {
          raw: "kept",
          kind: "content",
          role: "left",
          file_line: 2,
        },
        {
          raw: "|||||||",
          kind: "marker",
          role: "base",
          file_line: 3,
        },
        { raw: "base", kind: "content", role: "base", file_line: 4 },
        {
          raw: "=======",
          kind: "marker",
          role: "separator",
          file_line: 5,
        },
        { raw: "", kind: "content", role: "right", file_line: 6 },
        {
          raw: ">>>>>>>",
          kind: "marker",
          role: "end",
          file_line: 7,
        },
      ],
    });

    expect(getConflictDeletedSides(region)).toEqual({
      left: false,
      right: true,
    });
  });

  it("does not flag deletions for jj diff-style markers", () => {
    const region = regionFixture({
      marker_style: "jj_diff",
      lines: [
        {
          raw: "<<<<<<<",
          kind: "marker",
          role: "start",
          file_line: 1,
        },
        {
          raw: "%%%%%%%",
          kind: "marker",
          role: "separator",
          file_line: 2,
        },
        {
          raw: "+++++++",
          kind: "marker",
          role: "separator",
          file_line: 3,
        },
        {
          raw: ">>>>>>>",
          kind: "marker",
          role: "end",
          file_line: 4,
        },
      ],
    });

    expect(getConflictDeletedSides(region)).toEqual({
      left: false,
      right: false,
    });
  });
});

describe("isDeletedFileStatus", () => {
  it("returns true only for D", () => {
    expect(isDeletedFileStatus("D")).toBe(true);
    expect(isDeletedFileStatus("M")).toBe(false);
    expect(isDeletedFileStatus(undefined)).toBe(false);
  });
});
