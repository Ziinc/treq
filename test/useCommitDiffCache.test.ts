import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import type { JjRevisionDiff } from "../src/lib/api";
import { useCommitDiffCache } from "../src/hooks/useCommitDiffCache";

const emptyDiff: JjRevisionDiff = { files: [], hunks_by_file: [] };

const filledDiff: JjRevisionDiff = {
	files: [{ path: "src/foo.ts", status: "M", previous_path: null }],
	hunks_by_file: [],
};

describe("useCommitDiffCache", () => {
	let mockLoad: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		vi.clearAllMocks();
		mockLoad = vi.fn().mockResolvedValue(filledDiff);
	});

	it("starts with no expanded commits and no cached diffs", () => {
		const { result } = renderHook(() => useCommitDiffCache(mockLoad));
		expect(result.current.expandedCommits.size).toBe(0);
		expect(result.current.commitDiffs.size).toBe(0);
	});

	it("toggleCommit expands a commit and fetches its diff", async () => {
		const { result } = renderHook(() => useCommitDiffCache(mockLoad));

		act(() => {
			result.current.toggleCommit("c1");
		});

		expect(result.current.expandedCommits.has("c1")).toBe(true);

		await waitFor(() => {
			const entry = result.current.commitDiffs.get("c1");
			return entry && !entry.loading;
		});

		const entry = result.current.commitDiffs.get("c1");
		expect(entry?.loading).toBe(false);
		expect(entry?.diff).toEqual(filledDiff);
		expect(mockLoad).toHaveBeenCalledWith("c1");
	});

	it("toggleCommit collapses an already-expanded commit", async () => {
		const { result } = renderHook(() => useCommitDiffCache(mockLoad));

		act(() => {
			result.current.toggleCommit("c1");
		});
		await waitFor(() => !result.current.commitDiffs.get("c1")?.loading);

		act(() => {
			result.current.toggleCommit("c1");
		});

		expect(result.current.expandedCommits.has("c1")).toBe(false);
	});

	it("does not re-fetch diff when toggling an already-cached commit", async () => {
		const { result } = renderHook(() => useCommitDiffCache(mockLoad));

		act(() => result.current.toggleCommit("c1"));
		await waitFor(() => !result.current.commitDiffs.get("c1")?.loading);

		// Collapse then re-expand
		act(() => result.current.toggleCommit("c1"));
		act(() => result.current.toggleCommit("c1"));

		// loadCommitDiff should only have been called once
		expect(mockLoad).toHaveBeenCalledTimes(1);
	});

	it("stores error in cache entry when diff fetch fails", async () => {
		mockLoad.mockRejectedValue(new Error("network error"));
		const { result } = renderHook(() => useCommitDiffCache(mockLoad));

		act(() => {
			result.current.toggleCommit("c1");
		});

		await waitFor(() => {
			const entry = result.current.commitDiffs.get("c1");
			return entry && !entry.loading;
		});

		const entry = result.current.commitDiffs.get("c1");
		expect(entry?.loading).toBe(false);
		expect(entry?.error).toContain("network error");
	});

	it("fetchAndExpand expands a commit and fetches its diff", async () => {
		const { result } = renderHook(() => useCommitDiffCache(mockLoad));

		act(() => {
			result.current.fetchAndExpand("c2");
		});

		expect(result.current.expandedCommits.has("c2")).toBe(true);

		await waitFor(() => !result.current.commitDiffs.get("c2")?.loading);
		expect(result.current.commitDiffs.get("c2")?.diff).toEqual(filledDiff);
	});

	it("fetchAndExpand is a no-op if commit is already expanded", async () => {
		const { result } = renderHook(() => useCommitDiffCache(mockLoad));

		act(() => result.current.fetchAndExpand("c1"));
		await waitFor(() => !result.current.commitDiffs.get("c1")?.loading);

		act(() => result.current.fetchAndExpand("c1"));
		expect(mockLoad).toHaveBeenCalledTimes(1);
	});

	it("sets loading:true in cache entry immediately when expanding", () => {
		// Don't resolve the promise so we can observe the intermediate state
		mockLoad.mockReturnValue(new Promise(() => {}));
		const { result } = renderHook(() => useCommitDiffCache(mockLoad));

		act(() => {
			result.current.toggleCommit("c1");
		});

		const entry = result.current.commitDiffs.get("c1");
		expect(entry?.loading).toBe(true);
	});
});
