import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockCommit } from "./factories/commit.factory";

vi.mock("../src/lib/api", async () => {
	const actual = await vi.importActual("../src/lib/api");
	return {
		...actual,
		abandonCommit: vi.fn(),
		getCommitDiff: vi.fn(),
	};
});

import * as api from "../src/lib/api";
import {
	performAbandonCommit,
	loadCommitDiff,
} from "../src/lib/commit-operations";
import type { JjRevisionDiff } from "../src/lib/api";

const commit = createMockCommit({
	commit_id: "c1",
	change_id: "chg1",
	short_id: "abc1234",
	description: "my commit",
});

const emptyDiff: JjRevisionDiff = { files: [], hunks_by_file: [] };
const filledDiff: JjRevisionDiff = {
	files: [{ path: "src/foo.ts", status: "M", previous_path: null }],
	hunks_by_file: [],
};

describe("performAbandonCommit", () => {
	beforeEach(() => vi.clearAllMocks());

	it("calls abandonCommit with correct args and returns success", async () => {
		vi.mocked(api.abandonCommit).mockResolvedValue(undefined as never);
		const result = await performAbandonCommit("/repo", 1, commit.change_id);
		expect(api.abandonCommit).toHaveBeenCalledWith("/repo", 1, commit.change_id);
		expect(result).toEqual({ success: true });
	});

	it("returns success:false with error message on failure", async () => {
		vi.mocked(api.abandonCommit).mockRejectedValue(new Error("jj error"));
		const result = await performAbandonCommit("/repo", 1, commit.change_id);
		expect(result.success).toBe(false);
		expect(result.error).toContain("jj error");
	});
});

describe("loadCommitDiff", () => {
	beforeEach(() => vi.clearAllMocks());

	it("returns the diff when first revision succeeds with content", async () => {
		vi.mocked(api.getCommitDiff).mockResolvedValue(filledDiff);
		const result = await loadCommitDiff("/repo", 1, "c1", "chg1");
		expect(result).toEqual(filledDiff);
		expect(api.getCommitDiff).toHaveBeenCalledTimes(1);
	});

	it("falls back to change_id when commit_id returns empty diff", async () => {
		vi.mocked(api.getCommitDiff)
			.mockResolvedValueOnce(emptyDiff) // commit_id → empty
			.mockResolvedValueOnce(filledDiff); // change_id → filled
		const result = await loadCommitDiff("/repo", 1, "c1", "chg1");
		expect(result).toEqual(filledDiff);
		expect(api.getCommitDiff).toHaveBeenCalledTimes(2);
	});

	it("returns empty diff when all revisions return empty", async () => {
		vi.mocked(api.getCommitDiff).mockResolvedValue(emptyDiff);
		const result = await loadCommitDiff("/repo", 1, "c1", "chg1");
		expect(result).toEqual(emptyDiff);
	});

	it("throws when all revisions fail", async () => {
		vi.mocked(api.getCommitDiff).mockRejectedValue(new Error("network fail"));
		await expect(loadCommitDiff("/repo", 1, "c1", "chg1")).rejects.toThrow(
			"network fail",
		);
	});

	it("deduplicates revisions when commitId and changeId are the same", async () => {
		vi.mocked(api.getCommitDiff).mockResolvedValue(filledDiff);
		await loadCommitDiff("/repo", 1, "same-id", "same-id");
		expect(api.getCommitDiff).toHaveBeenCalledTimes(1);
	});
});
