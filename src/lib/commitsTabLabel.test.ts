import { describe, expect, it } from "vitest";
import {
  commitsTabCountClassName,
  getCommitsTabLabel,
} from "./commitsTabLabel";

describe("getCommitsTabLabel", () => {
  it("returns null for home with no conflict", () => {
    expect(
      getCommitsTabLabel({
        isHomeRepo: true,
        commitCount: 5,
        hasConflict: false,
      }),
    ).toBeNull();
  });

  it("returns home-conflict for home with conflict (ignores count)", () => {
    expect(
      getCommitsTabLabel({
        isHomeRepo: true,
        commitCount: 3,
        hasConflict: true,
      }),
    ).toEqual({ kind: "home-conflict" });
  });

  it("returns null for workspace with zero commits", () => {
    expect(
      getCommitsTabLabel({
        isHomeRepo: false,
        commitCount: 0,
        hasConflict: false,
      }),
    ).toBeNull();
  });

  it("returns grey count for workspace commits without conflict", () => {
    expect(
      getCommitsTabLabel({
        isHomeRepo: false,
        commitCount: 2,
        hasConflict: false,
      }),
    ).toEqual({ kind: "count", count: 2, tone: "default" });
  });

  it("returns red count for workspace commits with conflict", () => {
    expect(
      getCommitsTabLabel({
        isHomeRepo: false,
        commitCount: 1,
        hasConflict: true,
      }),
    ).toEqual({ kind: "count", count: 1, tone: "conflict" });
  });
});

describe("commitsTabCountClassName", () => {
  it("maps conflict to destructive classes", () => {
    expect(commitsTabCountClassName("conflict")).toContain("destructive");
  });

  it("maps default to muted classes", () => {
    expect(commitsTabCountClassName("default")).toContain("muted");
  });
});
