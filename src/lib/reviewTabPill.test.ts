import { describe, expect, it } from "vitest";
import {
	getReviewTabPill,
	reviewTabPillClassName,
} from "./reviewTabPill";

const base = {
	conflictCount: 0,
	uncommittedCount: 0,
	hasUncommittedFromStatus: false,
	committedFileCount: 0,
	commitsAheadCount: 0,
	hasWorkspaceCommits: false,
};

describe("getReviewTabPill", () => {
	it("returns null when the workspace has nothing to review", () => {
		expect(getReviewTabPill(base)).toBeNull();
	});

	it("uses conflict tone (red) when there are conflicts", () => {
		expect(
			getReviewTabPill({
				...base,
				conflictCount: 2,
				uncommittedCount: 3,
				hasUncommittedFromStatus: true,
			}),
		).toEqual({ tone: "conflict", count: 3 });
	});

	it("falls back to conflict count when conflicted but file lists are empty", () => {
		expect(
			getReviewTabPill({
				...base,
				conflictCount: 2,
			}),
		).toEqual({ tone: "conflict", count: 2 });
	});

	it("uses uncommitted tone (yellow) when there are working-copy changes", () => {
		expect(
			getReviewTabPill({
				...base,
				uncommittedCount: 4,
				hasWorkspaceCommits: true,
				commitsAheadCount: 1,
			}),
		).toEqual({ tone: "uncommitted", count: 4 });
	});

	it("uses uncommitted tone from status even before the file list loads, but waits for a count", () => {
		expect(
			getReviewTabPill({
				...base,
				hasUncommittedFromStatus: true,
			}),
		).toBeNull();

		expect(
			getReviewTabPill({
				...base,
				hasUncommittedFromStatus: true,
				uncommittedCount: 1,
			}),
		).toEqual({ tone: "uncommitted", count: 1 });
	});

	it("uses committed tone (grey) when only committed changes exist", () => {
		expect(
			getReviewTabPill({
				...base,
				committedFileCount: 5,
				hasWorkspaceCommits: true,
			}),
		).toEqual({ tone: "committed", count: 5 });
	});

	it("uses commits-ahead count for committed-only when file count is not loaded", () => {
		expect(
			getReviewTabPill({
				...base,
				commitsAheadCount: 2,
				hasWorkspaceCommits: true,
			}),
		).toEqual({ tone: "committed", count: 2 });
	});

	it("prefers committed file count over commits-ahead for the number", () => {
		expect(
			getReviewTabPill({
				...base,
				committedFileCount: 7,
				commitsAheadCount: 2,
				hasWorkspaceCommits: true,
			}),
		).toEqual({ tone: "committed", count: 7 });
	});
});

describe("reviewTabPillClassName", () => {
	it("maps tones to pill color classes", () => {
		expect(reviewTabPillClassName("conflict")).toBe(
			"bg-destructive text-destructive-foreground",
		);
		expect(reviewTabPillClassName("uncommitted")).toBe(
			"bg-yellow-500 text-yellow-950",
		);
		expect(reviewTabPillClassName("committed")).toBe(
			"bg-muted text-muted-foreground",
		);
	});
});
