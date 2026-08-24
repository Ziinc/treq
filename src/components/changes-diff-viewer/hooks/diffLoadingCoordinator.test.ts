import { describe, expect, it } from "vitest";
import {
  applyHunkBatch,
  chunkPaths,
  replaceGeneration,
} from "./diffLoadingCoordinator";

describe("diff loading coordinator", () => {
  it("splits paths into deterministic batches of at most 32", () => {
    const paths = Array.from({ length: 65 }, (_, index) => `${index}.ts`);
    expect(chunkPaths(paths, 32).map((batch) => batch.length)).toEqual([
      32, 32, 1,
    ]);
    expect(chunkPaths(paths, 32).flat()).toEqual(paths);
  });

  it("atomically removes paths absent from a new generation", () => {
    const old = new Map([
      ["keep.ts", { filePath: "keep.ts", hunks: [], isLoading: false }],
      ["gone.ts", { filePath: "gone.ts", hunks: [], isLoading: false }],
    ]);
    const next = replaceGeneration(old, ["keep.ts"]);
    expect([...next.keys()]).toEqual(["keep.ts"]);
    expect(next.get("keep.ts")).toBe(old.get("keep.ts"));
  });

  it("preserves object identity for matching hashes and replaces changed files", () => {
    const unchanged = {
      filePath: "same.ts",
      hunks: [],
      isLoading: false,
      contentHash: "same",
    };
    const current = new Map([["same.ts", unchanged]]);
    const next = applyHunkBatch(current, [
      { path: "same.ts", contentHash: "same", hunks: [] },
      { path: "new.ts", contentHash: "new", hunks: [] },
    ]);
    expect(next.get("same.ts")).toBe(unchanged);
    expect(next.get("new.ts")).not.toBeUndefined();
  });
});
