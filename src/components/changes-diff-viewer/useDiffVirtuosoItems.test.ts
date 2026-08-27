import { describe, expect, it } from "vitest";
import { renderHook } from "@testing-library/react";
import { useDiffVirtuosoItems } from "./useDiffVirtuosoItems";
import type { ParsedFileChange } from "../../lib/git-utils";
import type { FileHunksData } from "./types";
import type { BuildDiffVirtuosoItemsArgs } from "./buildDiffVirtuosoItems";

function file(path: string): ParsedFileChange {
  return { path, workspaceStatus: "M", isConflicted: false };
}

function hunks(path: string, lines: string[]): Map<string, FileHunksData> {
  return new Map([
    [
      path,
      {
        filePath: path,
        isLoading: false,
        hunks: [
          {
            id: "h1",
            header: `@@ -1,0 +1,${lines.length} @@`,
            lines,
            patch: "",
          },
        ],
      },
    ],
  ]);
}

function baseArgs(
  overrides: Partial<BuildDiffVirtuosoItemsArgs> = {},
): BuildDiffVirtuosoItemsArgs {
  const path = "big.ts";
  const lines = Array.from({ length: 600 }, (_, i) => `+line ${i}`);
  return {
    actualConflictedFiles: [],
    allFileHunks: hunks(path, lines),
    collapsedFiles: new Set(),
    committedFileHunks: new Map(),
    committedFiles: [],
    conflictLineLookups: new Map(),
    expandedContext: new Map(),
    expandedLargeDiffs: new Set([path]),
    files: [file(path)],
    getFileCommentsForFile: () => [],
    getOutdatedCommentsForFile: () => [],
    getUnplacedThreadsForFile: () => [],
    pendingComment: null,
    showCommentInput: false,
    viewedFiles: new Map(),
    ...overrides,
  };
}

describe("useDiffVirtuosoItems", () => {
  it("returns a stable items array across re-renders when nothing relevant changed", () => {
    const args = baseArgs();
    const { result, rerender } = renderHook(
      (props: BuildDiffVirtuosoItemsArgs) => useDiffVirtuosoItems(props),
      { initialProps: args },
    );
    const first = result.current.items;
    expect(first.length).toBeGreaterThan(600);

    // Re-render with a brand-new args object (as happens on every parent
    // render in DiffContentArea), but with the same underlying data
    // references -- this simulates an unrelated re-render (e.g. mouse
    // hover updating selection state elsewhere in the tree).
    rerender({ ...args });

    expect(result.current.items).toBe(first);
  });

  it("recomputes items when the underlying diff data actually changes", () => {
    const args = baseArgs();
    const { result, rerender } = renderHook(
      (props: BuildDiffVirtuosoItemsArgs) => useDiffVirtuosoItems(props),
      { initialProps: args },
    );
    const first = result.current.items;

    rerender({ ...args, collapsedFiles: new Set(["big.ts"]) });

    expect(result.current.items).not.toBe(first);
    expect(result.current.items).toHaveLength(1);
  });
});
