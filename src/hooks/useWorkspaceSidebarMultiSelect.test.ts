import { describe, expect, it } from "vitest";
import { idsInVisibleRange } from "./useWorkspaceSidebarMultiSelect";
import type { FlattenedWorkspaceNode } from "../lib/workspace-tree";

function node(id: number, branchName: string): FlattenedWorkspaceNode {
  return {
    branchName,
    depth: 0,
    hasChildren: false,
    parentBranch: null,
    status: {
      current: {
        id,
        branch_name: branchName,
      } as FlattenedWorkspaceNode["status"]["current"],
      has_conflicts: false,
    },
  } as FlattenedWorkspaceNode;
}

describe("idsInVisibleRange", () => {
  it("returns inclusive ids between two visible indices", () => {
    const nodes = [
      node(1, "dduck-joke-readme"),
      node(2, "rubber-test-123"),
      node(3, "zebra-notes"),
      node(4, "feat/alpha"),
      node(5, "feat/beta"),
      node(6, "gumbo-notes"),
    ];
    expect([...idsInVisibleRange(nodes, 0, 5)]).toEqual([1, 2, 3, 4, 5, 6]);
    expect([...idsInVisibleRange(nodes, 0, 3)]).toEqual([1, 2, 3, 4]);
  });
});
