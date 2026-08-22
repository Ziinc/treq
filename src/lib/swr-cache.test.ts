import { describe, expect, it } from "vitest";
import { keyMatchesPrefix } from "./swr-cache";

describe("keyMatchesPrefix", () => {
  it("matches exact and longer array keys", () => {
    expect(keyMatchesPrefix(["workspaces", "/repo"], ["workspaces"])).toBe(
      true,
    );
    expect(
      keyMatchesPrefix(["workspaces", "/repo"], ["workspaces", "/repo"]),
    ).toBe(true);
  });

  it("rejects shorter or mismatched keys", () => {
    expect(keyMatchesPrefix(["workspaces"], ["workspaces", "/repo"])).toBe(
      false,
    );
    expect(keyMatchesPrefix(["sessions", "/repo"], ["workspaces"])).toBe(false);
    expect(keyMatchesPrefix("workspaces", ["workspaces"])).toBe(false);
  });
});
