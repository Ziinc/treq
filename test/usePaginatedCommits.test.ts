import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { createMockCommit } from "./factories/commit.factory";
import type { JjLogCommit } from "../src/lib/api";

vi.mock("../src/lib/api", async () => {
	const actual = await vi.importActual("../src/lib/api");
	return {
		...actual,
		listCommits: vi.fn(),
	};
});

import * as api from "../src/lib/api";
import { usePaginatedCommits } from "../src/hooks/usePaginatedCommits";

// Working copy commit is always index 0; the hook skips it
const wc = createMockCommit({ commit_id: "wc", is_working_copy: true });
const commit1 = createMockCommit({ commit_id: "c1", description: "first commit" });
const commit2 = createMockCommit({ commit_id: "c2", description: "second commit" });
const tbCommit = createMockCommit({ commit_id: "tb1", description: "target branch commit", is_immutable: true });

function setupListCommits(
	commits: JjLogCommit[] = [wc, commit1],
	targetBranchCommits: JjLogCommit[] = [],
	targetBranch = "main",
) {
	vi.mocked(api.listCommits).mockResolvedValue({
		commits,
		target_branch_commits: targetBranchCommits,
		target_branch: targetBranch,
		workspace_branch: "feat/test",
	});
}

describe("usePaginatedCommits", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("starts in loading state", () => {
		setupListCommits();
		const { result } = renderHook(() =>
			usePaginatedCommits("/repo", 1),
		);
		expect(result.current.loading).toBe(true);
	});

	it("fetches commits on mount and skips working copy", async () => {
		setupListCommits([wc, commit1, commit2]);
		const { result } = renderHook(() =>
			usePaginatedCommits("/repo", 1),
		);
		await waitFor(() => expect(result.current.loading).toBe(false));
		// working copy commit is sliced off
		expect(result.current.commits.map((c) => c.commit_id)).toEqual(["c1", "c2"]);
	});

	it("populates targetBranchCommits when workspaceId is set", async () => {
		setupListCommits([wc, commit1], [tbCommit], "main");
		const { result } = renderHook(() =>
			usePaginatedCommits("/repo", 1),
		);
		await waitFor(() => expect(result.current.loading).toBe(false));
		expect(result.current.targetBranchCommits.map((c) => c.commit_id)).toEqual(["tb1"]);
		expect(result.current.targetBranchCommitsBranch).toBe("main");
	});

	it("does not populate targetBranchCommits when isHomeRepo (workspaceId null)", async () => {
		setupListCommits([wc, commit1], [tbCommit]);
		const { result } = renderHook(() =>
			usePaginatedCommits("/repo", null),
		);
		await waitFor(() => expect(result.current.loading).toBe(false));
		expect(result.current.targetBranchCommits).toEqual([]);
		expect(result.current.targetBranchCommitsBranch).toBeNull();
	});

	it("loadMoreHomeRepo increments homeRepoLimit and re-fetches", async () => {
		setupListCommits([wc, commit1]);
		const { result } = renderHook(() =>
			usePaginatedCommits("/repo", null),
		);
		await waitFor(() => expect(result.current.loading).toBe(false));

		// Simulate more commits available on next page
		vi.mocked(api.listCommits).mockResolvedValue({
			commits: [wc, commit1, commit2],
			target_branch_commits: [],
			target_branch: null,
			workspace_branch: "main",
		});

		act(() => {
			result.current.loadMoreHomeRepo();
		});

		await waitFor(() =>
			expect(result.current.commits).toHaveLength(2),
		);
		expect(result.current.commits.map((c) => c.commit_id)).toContain("c2");
	});

	it("canLoadMoreHomeRepo returns true when commit count is at or above the limit", async () => {
		setupListCommits([wc, commit1]);
		const { result } = renderHook(() =>
			usePaginatedCommits("/repo", null),
		);
		await waitFor(() => expect(result.current.loading).toBe(false));
		// initial homeRepoLimit is 15; 1 commit (+ working copy = 2) is well below 15
		expect(result.current.canLoadMoreHomeRepo(14)).toBe(true); // 14+1 >= 15
		expect(result.current.canLoadMoreHomeRepo(5)).toBe(false);
	});

	it("canLoadMoreTargetBranch returns true when target commits are at the limit", async () => {
		setupListCommits([wc, commit1], [tbCommit], "main");
		const { result } = renderHook(() =>
			usePaginatedCommits("/repo", 1),
		);
		await waitFor(() => expect(result.current.loading).toBe(false));
		// initial targetBranchLimit is 10; 1 target commit is below 10
		expect(result.current.canLoadMoreTargetBranch(10)).toBe(true); // 10 >= 10
		expect(result.current.canLoadMoreTargetBranch(9)).toBe(false);
	});
});
