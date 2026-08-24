import { describe, expect, it } from "vitest";
import { flattenExpandedTree } from "./flattenTree";

describe("flattenExpandedTree", () => {
  it("includes only descendants of expanded directories with stable depths", () => {
    const dir = { name: "src", path: "/repo/src", is_directory: true };
    const file = { name: "a.ts", path: "/repo/src/a.ts", is_directory: false };
    expect(
      flattenExpandedTree(
        [dir],
        new Set([dir.path]),
        new Map([[dir.path, [file]]]),
      ),
    ).toEqual([
      { entry: dir, depth: 0 },
      { entry: file, depth: 1 },
    ]);
    expect(flattenExpandedTree([dir], new Set(), new Map())).toEqual([
      { entry: dir, depth: 0 },
    ]);
  });
});
