import { describe, expect, it } from "vitest";
import { countUniqueReviewChangePaths } from "./git-utils";

describe("countUniqueReviewChangePaths", () => {
  it("counts uncommitted files alone", () => {
    expect(
      countUniqueReviewChangePaths([{ path: "a.txt" }, { path: "b.txt" }]),
    ).toBe(2);
  });

  it("counts committed and uncommitted as a unique total", () => {
    expect(
      countUniqueReviewChangePaths(
        [{ path: "uncommitted-only.txt" }, { path: "shared.txt" }],
        [{ path: "committed-only.txt" }, { path: "shared.txt" }],
      ),
    ).toBe(3);
  });

  it("returns 0 for empty inputs", () => {
    expect(countUniqueReviewChangePaths([], [])).toBe(0);
  });
});
