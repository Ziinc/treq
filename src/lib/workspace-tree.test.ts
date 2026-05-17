import { describe, expect, it } from "vitest";
import type { WorkspaceSidebarStatus } from "./api-types";
import { buildWorkspaceTree, flattenWorkspaceTree } from "./workspace-tree";

function makeStatus(
	id: number,
	branchName: string,
	targetBranch: string | null,
): WorkspaceSidebarStatus {
	return {
		current: {
			id,
			repo_path: "/tmp/repo",
			workspace_name: branchName,
			workspace_path: `ws/${branchName}`,
			branch_name: branchName,
			created_at: "2026-01-01T00:00:00.000Z",
			target_branch: targetBranch,
			not_on_remote: false,
		},
		has_conflicts: false,
	};
}

function expectTree(
	statuses: WorkspaceSidebarStatus[],
	expectedRootCount: number,
	expectedBranches: string[],
	expectedDepths: number[],
): void {
	const roots = buildWorkspaceTree(statuses);
	const flattened = flattenWorkspaceTree(roots);

	expect(roots).toHaveLength(expectedRootCount);
	expect(flattened.map((node) => node.branchName)).toEqual(expectedBranches);
	expect(flattened.map((node) => node.depth)).toEqual(expectedDepths);
}

describe("workspace tree root detection", () => {
	it("self-target workspace is rendered as root", () => {
		expectTree([makeStatus(1, "main", "main")], 1, ["main"], [0]);
	});

	it("external target remains root", () => {
		expectTree([makeStatus(1, "feature/a", "main")], 1, ["feature/a"], [0]);
	});

	it("cycle with no natural roots falls back to all roots", () => {
		expectTree(
			[makeStatus(1, "a", "b"), makeStatus(2, "b", "a")],
			2,
			["a", "b"],
			[0, 0],
		);
	});

	it("normal acyclic hierarchy remains unchanged", () => {
		expectTree(
			[
				makeStatus(1, "alpha", null),
				makeStatus(2, "beta", "alpha"),
				makeStatus(3, "gamma", "beta"),
			],
			1,
			["alpha", "beta", "gamma"],
			[0, 1, 2],
		);
	});
});
