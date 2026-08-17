import { describe, expect, it } from "vitest";
import { createMockCommit } from "../../test/factories/commit.factory";
import { resolvableConflictedCommits } from "./resolvable-conflicted-commits";

describe("resolvableConflictedCommits", () => {
  it("includes mutable workspace conflicted commits", () => {
    const commit = createMockCommit({
      has_conflicts: true,
      is_immutable: false,
      on_target_only: false,
    });
    expect(resolvableConflictedCommits([commit], true)).toEqual([commit]);
  });

  it("includes immutable workspace conflicted commits when all conflicts are workspace-only", () => {
    const commit = createMockCommit({
      has_conflicts: true,
      is_immutable: true,
      on_target_only: false,
    });
    expect(resolvableConflictedCommits([commit], true)).toEqual([commit]);
  });

  it("excludes immutable commits when any conflicted commit is on the target only", () => {
    const workspaceImmutable = createMockCommit({
      change_id: "ws",
      has_conflicts: true,
      is_immutable: true,
      on_target_only: false,
    });
    const targetConflict = createMockCommit({
      change_id: "tgt",
      has_conflicts: true,
      is_immutable: true,
      on_target_only: true,
    });
    expect(
      resolvableConflictedCommits([workspaceImmutable, targetConflict], true),
    ).toEqual([]);
  });

  it("still includes mutable workspace conflicts when the target is also conflicted", () => {
    const workspaceMutable = createMockCommit({
      change_id: "ws",
      has_conflicts: true,
      is_immutable: false,
      on_target_only: false,
    });
    const targetConflict = createMockCommit({
      change_id: "tgt",
      has_conflicts: true,
      is_immutable: true,
      on_target_only: true,
    });
    expect(
      resolvableConflictedCommits([workspaceMutable, targetConflict], true),
    ).toEqual([workspaceMutable]);
  });

  it("excludes immutable conflicts on the home or default branch", () => {
    const commit = createMockCommit({
      has_conflicts: true,
      is_immutable: true,
      on_target_only: false,
    });
    expect(resolvableConflictedCommits([commit], false)).toEqual([]);
  });

  it("ignores working-copy conflicted commits", () => {
    const commit = createMockCommit({
      has_conflicts: true,
      is_working_copy: true,
      is_immutable: false,
    });
    expect(resolvableConflictedCommits([commit], true)).toEqual([]);
  });
});
