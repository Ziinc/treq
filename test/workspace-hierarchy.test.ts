import { beforeEach, describe, expect, test, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import type { Workspace } from "../src/lib/api";

// Mock the API module
vi.mock("../src/lib/api", () => ({
	createWorkspace: vi.fn(),
	setWorkspaceTargetBranch: vi.fn(),
	getRepoSetting: vi.fn(),
	getWorkspaces: vi.fn(),
}));

// Mock the toast hook
vi.mock("../src/components/ui/toast", () => ({
	useToast: () => ({
		addToast: vi.fn(),
	}),
}));

// Mock useCreateStackedWorkspace
const mockCreateStackedWorkspace = vi.fn();
vi.mock("../src/hooks/useCreateStackedWorkspace", () => ({
	useCreateStackedWorkspace: () => ({
		createStackedWorkspace: mockCreateStackedWorkspace,
	}),
}));

import { useWorkspaceHierarchy } from "../src/hooks/useWorkspaceHierarchy";

function makeWorkspace(
	overrides: Partial<Workspace> & { id: number; branch_name: string },
): Workspace {
	return {
		repo_path: "/test/repo",
		workspace_name: overrides.branch_name,
		workspace_path: overrides.branch_name,
		created_at: "2024-01-01",
		not_on_remote: false,
		target_branch: null,
		...overrides,
	};
}

describe("useWorkspaceHierarchy", () => {
	let queryClient: QueryClient;

	const wrapper = ({ children }: { children: React.ReactNode }) => React.createElement(
			QueryClientProvider,
			{ client: queryClient },
			children,
		);

	beforeEach(() => {
		vi.clearAllMocks();
		queryClient = new QueryClient({
			defaultOptions: { queries: { retry: false } },
		});
	});

	const workspaceA = makeWorkspace({
		id: 1,
		branch_name: "A",
		target_branch: "main",
	});
	const workspaceB = makeWorkspace({
		id: 2,
		branch_name: "B",
		target_branch: "A",
	});
	const workspaceC = makeWorkspace({
		id: 3,
		branch_name: "C",
		target_branch: "A",
	});
	const workspaceD = makeWorkspace({
		id: 4,
		branch_name: "D",
		target_branch: "B",
	});
	const allWorkspaces = [workspaceA, workspaceB, workspaceC, workspaceD];

	describe("addAfter", () => {
		test("calls createStackedWorkspace with workspace branch as parent", async () => {
			mockCreateStackedWorkspace.mockResolvedValue(10);

			const { result } = renderHook(
				() =>
					useWorkspaceHierarchy({
						repoPath: "/test/repo",
						workspaces: allWorkspaces,
					}),
				{ wrapper },
			);

			const newId = await result.current.addAfter(workspaceB);

			expect(newId).toBe(10);
			expect(mockCreateStackedWorkspace).toHaveBeenCalledWith({
				repoPath: "/test/repo",
				parentBranch: "B",
				parentWorkspace: workspaceB,
			});
		});
	});

	describe("addBefore", () => {
		test("creates workspace stacked on original target, then reparents original", async () => {
			const { setWorkspaceTargetBranch, getWorkspaces } = await import(
				"../src/lib/api"
			);

			const newWorkspace = makeWorkspace({
				id: 10,
				branch_name: "new-ws",
				target_branch: "A",
			});
			mockCreateStackedWorkspace.mockResolvedValue(10);
			(getWorkspaces as any).mockResolvedValue([
				...allWorkspaces,
				newWorkspace,
			]);
			(setWorkspaceTargetBranch as any).mockResolvedValue({});

			const { result } = renderHook(
				() =>
					useWorkspaceHierarchy({
						repoPath: "/test/repo",
						workspaces: allWorkspaces,
					}),
				{ wrapper },
			);

			const newId = await result.current.addBefore(workspaceB);

			expect(newId).toBe(10);

			// Should create new workspace stacked on B's target_branch (A)
			expect(mockCreateStackedWorkspace).toHaveBeenCalledWith({
				repoPath: "/test/repo",
				parentBranch: "A",
				parentWorkspace: null,
			});

			// Should reparent B onto the new workspace's branch
			expect(setWorkspaceTargetBranch).toHaveBeenCalledWith(
				"/test/repo",
				expect.any(String), // workspace path
				2, // workspaceB.id
				"new-ws", // new workspace's branch_name
			);
		});

		test('handles root workspace (target_branch is null) by using "main" as parent', async () => {
			const { getWorkspaces } = await import("../src/lib/api");

			const rootWorkspace = makeWorkspace({
				id: 5,
				branch_name: "root-ws",
				target_branch: null,
			});
			const newWorkspace = makeWorkspace({
				id: 10,
				branch_name: "new-ws",
				target_branch: null,
			});
			mockCreateStackedWorkspace.mockResolvedValue(10);
			(getWorkspaces as any).mockResolvedValue([rootWorkspace, newWorkspace]);

			const { result } = renderHook(
				() =>
					useWorkspaceHierarchy({
						repoPath: "/test/repo",
						workspaces: [rootWorkspace],
						defaultBranch: "main",
					}),
				{ wrapper },
			);

			await result.current.addBefore(rootWorkspace);

			// For root workspace with null target, should use defaultBranch as parent
			expect(mockCreateStackedWorkspace).toHaveBeenCalledWith({
				repoPath: "/test/repo",
				parentBranch: "main",
				parentWorkspace: null,
			});
		});
	});

	describe("moveWorkspace", () => {
		test("calls setWorkspaceTargetBranch with new target", async () => {
			const { setWorkspaceTargetBranch } = await import("../src/lib/api");
			(setWorkspaceTargetBranch as any).mockResolvedValue({});

			const { result } = renderHook(
				() =>
					useWorkspaceHierarchy({
						repoPath: "/test/repo",
						workspaces: allWorkspaces,
					}),
				{ wrapper },
			);

			await result.current.moveWorkspace(workspaceC, "B");

			expect(setWorkspaceTargetBranch).toHaveBeenCalledWith(
				"/test/repo",
				expect.any(String),
				3, // workspaceC.id
				"B",
			);
		});

		test("prevents cyclic move (moving A onto its descendant D)", async () => {
			const { setWorkspaceTargetBranch } = await import("../src/lib/api");

			const { result } = renderHook(
				() =>
					useWorkspaceHierarchy({
						repoPath: "/test/repo",
						workspaces: allWorkspaces,
					}),
				{ wrapper },
			);

			await expect(
				result.current.moveWorkspace(workspaceA, "D"),
			).rejects.toThrow(/cycle/i);

			expect(setWorkspaceTargetBranch).not.toHaveBeenCalled();
		});

		test("allows moving to null (detach to root)", async () => {
			const { setWorkspaceTargetBranch } = await import("../src/lib/api");
			(setWorkspaceTargetBranch as any).mockResolvedValue({});

			const { result } = renderHook(
				() =>
					useWorkspaceHierarchy({
						repoPath: "/test/repo",
						workspaces: allWorkspaces,
						defaultBranch: "main",
					}),
				{ wrapper },
			);

			await result.current.moveWorkspace(workspaceB, null);

			expect(setWorkspaceTargetBranch).toHaveBeenCalledWith(
				"/test/repo",
				expect.any(String),
				2,
				"main", // detach uses default branch
			);
		});

		test("prevents self-targeting move", async () => {
			const { setWorkspaceTargetBranch } = await import("../src/lib/api");

			const { result } = renderHook(
				() =>
					useWorkspaceHierarchy({
						repoPath: "/test/repo",
						workspaces: allWorkspaces,
					}),
				{ wrapper },
			);

			await expect(
				result.current.moveWorkspace(workspaceA, "A"),
			).rejects.toThrow();

			expect(setWorkspaceTargetBranch).not.toHaveBeenCalled();
		});
	});
});
