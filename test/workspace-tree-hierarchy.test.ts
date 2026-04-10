import { describe, expect, test } from "vitest";
import type { Workspace } from "../src/lib/api";

// Import functions we'll implement
import {
	getDescendants,
	getEntireStack,
	getStackRoot,
	isDescendantOf,
} from "../src/lib/workspace-tree";

function makeWorkspace(
	overrides: Partial<Workspace> & { branch_name: string },
): Workspace {
	return {
		id: 1,
		repo_path: "/test/repo",
		workspace_name: overrides.branch_name,
		workspace_path: overrides.branch_name,
		created_at: "2024-01-01",
		not_on_remote: false,
		target_branch: null,
		...overrides,
	};
}

/**
 * Test tree structure:
 *
 *   main (external, not a workspace)
 *     ├── A (target_branch: main)
 *     │   ├── B (target_branch: A)
 *     │   │   └── D (target_branch: B)
 *     │   └── C (target_branch: A)
 *     └── E (target_branch: main)
 *
 *   F (target_branch: null, standalone root)
 */
const workspaces: Workspace[] = [
	makeWorkspace({ id: 1, branch_name: "A", target_branch: "main" }),
	makeWorkspace({ id: 2, branch_name: "B", target_branch: "A" }),
	makeWorkspace({ id: 3, branch_name: "C", target_branch: "A" }),
	makeWorkspace({ id: 4, branch_name: "D", target_branch: "B" }),
	makeWorkspace({ id: 5, branch_name: "E", target_branch: "main" }),
	makeWorkspace({ id: 6, branch_name: "F", target_branch: null }),
];

describe("getDescendants", () => {
	test("returns all descendants of A", () => {
		const descendants = getDescendants(workspaces, "A");
		const names = descendants.map((w) => w.branch_name).sort();
		expect(names).toEqual(["B", "C", "D"]);
	});

	test("returns all descendants of B", () => {
		const descendants = getDescendants(workspaces, "B");
		const names = descendants.map((w) => w.branch_name);
		expect(names).toEqual(["D"]);
	});

	test("returns empty for leaf node D", () => {
		const descendants = getDescendants(workspaces, "D");
		expect(descendants).toEqual([]);
	});

	test("returns empty for standalone root F", () => {
		const descendants = getDescendants(workspaces, "F");
		expect(descendants).toEqual([]);
	});

	test("returns empty for non-existent branch", () => {
		const descendants = getDescendants(workspaces, "nonexistent");
		expect(descendants).toEqual([]);
	});

	test("returns descendants of E (none)", () => {
		const descendants = getDescendants(workspaces, "E");
		expect(descendants).toEqual([]);
	});
});

describe("getStackRoot", () => {
	test('finds root for deeply nested D (follows D→B→A, A targets external "main")', () => {
		const root = getStackRoot(workspaces, "D");
		expect(root).toBe("A");
	});

	test('finds root for B (follows B→A, A targets external "main")', () => {
		const root = getStackRoot(workspaces, "B");
		expect(root).toBe("A");
	});

	test('A is its own root (targets external "main")', () => {
		const root = getStackRoot(workspaces, "A");
		expect(root).toBe("A");
	});

	test("F is its own root (target_branch is null)", () => {
		const root = getStackRoot(workspaces, "F");
		expect(root).toBe("F");
	});

	test('E is its own root (targets external "main")', () => {
		const root = getStackRoot(workspaces, "E");
		expect(root).toBe("E");
	});

	test("returns the branchName itself for non-existent branch", () => {
		const root = getStackRoot(workspaces, "nonexistent");
		expect(root).toBe("nonexistent");
	});
});

describe("getEntireStack", () => {
	test("returns entire stack for D (A + B + C + D)", () => {
		const stack = getEntireStack(workspaces, "D");
		const names = stack.map((w) => w.branch_name).sort();
		expect(names).toEqual(["A", "B", "C", "D"]);
	});

	test("returns entire stack for A (A + B + C + D)", () => {
		const stack = getEntireStack(workspaces, "A");
		const names = stack.map((w) => w.branch_name).sort();
		expect(names).toEqual(["A", "B", "C", "D"]);
	});

	test("returns just F for standalone root", () => {
		const stack = getEntireStack(workspaces, "F");
		const names = stack.map((w) => w.branch_name);
		expect(names).toEqual(["F"]);
	});

	test("returns just E for leaf root", () => {
		const stack = getEntireStack(workspaces, "E");
		const names = stack.map((w) => w.branch_name);
		expect(names).toEqual(["E"]);
	});
});

describe("isDescendantOf", () => {
	test("D is descendant of A", () => {
		expect(isDescendantOf(workspaces, "D", "A")).toBe(true);
	});

	test("D is descendant of B", () => {
		expect(isDescendantOf(workspaces, "D", "B")).toBe(true);
	});

	test("B is not descendant of D", () => {
		expect(isDescendantOf(workspaces, "B", "D")).toBe(false);
	});

	test("A is not descendant of A (self)", () => {
		expect(isDescendantOf(workspaces, "A", "A")).toBe(false);
	});

	test("C is descendant of A", () => {
		expect(isDescendantOf(workspaces, "C", "A")).toBe(true);
	});

	test("E is not descendant of A", () => {
		expect(isDescendantOf(workspaces, "E", "A")).toBe(false);
	});

	test("F is not descendant of anything", () => {
		expect(isDescendantOf(workspaces, "F", "A")).toBe(false);
	});

	test("handles non-existent candidate", () => {
		expect(isDescendantOf(workspaces, "nonexistent", "A")).toBe(false);
	});

	test("handles non-existent ancestor", () => {
		expect(isDescendantOf(workspaces, "D", "nonexistent")).toBe(false);
	});

	test("handles cycle in workspace graph", () => {
		const cyclic: Workspace[] = [
			makeWorkspace({ id: 1, branch_name: "X", target_branch: "Y" }),
			makeWorkspace({ id: 2, branch_name: "Y", target_branch: "X" }),
		];
		// Should not infinite loop
		expect(isDescendantOf(cyclic, "X", "Y")).toBe(true);
		expect(isDescendantOf(cyclic, "Y", "X")).toBe(true);
	});
});
