import { describe, expect, it } from "vitest";
import type { GhReviewThread } from "../../lib/api-types";
import type { FileHunksData } from "./types";
import { placeGithubReviewThreads } from "./placeGithubReviewThreads";

function thread(
	overrides: Partial<GhReviewThread> & Pick<GhReviewThread, "id">,
): GhReviewThread {
	return {
		is_resolved: false,
		is_outdated: false,
		path: "example.ts",
		line: 2,
		diff_side: "RIGHT",
		comments: [
			{
				id: `${overrides.id}-c`,
				body: "comment",
				author: { login: "octocat", avatar_url: null },
				created_at: "2026-07-20T10:00:00Z",
				diff_hunk: "@@ -0,0 +1,3 @@\n+a\n+b\n+c",
				url: "https://github.com/o/r/pull/1#discussion_r1",
			},
		],
		...overrides,
	};
}

function hunksMap(
	path: string,
	hunkId: string,
	header: string,
	lines: string[],
): Map<string, FileHunksData> {
	return new Map([
		[
			path,
			{
				filePath: path,
				isLoading: false,
				hunks: [{ id: hunkId, header, lines }],
			},
		],
	]);
}

describe("placeGithubReviewThreads", () => {
	it("places a thread onto a matching uncommitted hunk line", () => {
		const uncommitted = hunksMap(
			"example.ts",
			"h1",
			"@@ -0,0 +1,3 @@",
			["+a", "+b", "+c"],
		);
		const { threadsByLineKey, unplacedThreadsByFile } =
			placeGithubReviewThreads([thread({ id: "t1", line: 2 })], [uncommitted]);

		expect(unplacedThreadsByFile.size).toBe(0);
		expect(threadsByLineKey.get("example.ts:h1:2:new")?.map((t) => t.id)).toEqual([
			"t1",
		]);
	});

	it("places threads that only exist in committed Review-tab hunks", () => {
		// Regression: Review tab shows PR (committed) diffs via committedFileHunks,
		// while uncommitted allFileHunks is empty. Threads must still place inline
		// instead of being dumped into the outdated group.
		const uncommitted = new Map<string, FileHunksData>();
		const committed = hunksMap(
			"example.ts",
			"committed-h1",
			"@@ -0,0 +1,3 @@",
			["+export const a = 1;", "+export const b = 2;", "+export const c = 3;"],
		);

		const { threadsByLineKey, unplacedThreadsByFile } =
			placeGithubReviewThreads(
				[thread({ id: "t1", line: 2 })],
				[uncommitted, committed],
			);

		expect(unplacedThreadsByFile.size).toBe(0);
		expect(
			threadsByLineKey.get("example.ts:committed-h1:2:new")?.map((t) => t.id),
		).toEqual(["t1"]);
	});

	it("still places a thread GitHub marked outdated when the line is visible", () => {
		const committed = hunksMap(
			"example.ts",
			"h1",
			"@@ -0,0 +1,3 @@",
			["+a", "+b", "+c"],
		);

		const { threadsByLineKey, unplacedThreadsByFile } =
			placeGithubReviewThreads(
				[thread({ id: "t1", line: 2, is_outdated: true })],
				[committed],
			);

		expect(unplacedThreadsByFile.size).toBe(0);
		expect(threadsByLineKey.get("example.ts:h1:2:new")?.map((t) => t.id)).toEqual([
			"t1",
		]);
	});

	it("marks a thread unplaced only when no visible line matches", () => {
		const committed = hunksMap(
			"example.ts",
			"h1",
			"@@ -0,0 +1,3 @@",
			["+a", "+b", "+c"],
		);

		const { threadsByLineKey, unplacedThreadsByFile } =
			placeGithubReviewThreads(
				[
					thread({ id: "missing-line", line: 99 }),
					thread({ id: "null-line", line: null }),
				],
				[committed],
			);

		expect(threadsByLineKey.size).toBe(0);
		expect(unplacedThreadsByFile.get("example.ts")?.map((t) => t.id)).toEqual([
			"missing-line",
			"null-line",
		]);
	});

	it("places LEFT-side comments on deleted lines", () => {
		const committed = hunksMap(
			"example.ts",
			"h1",
			"@@ -1,2 +0,0 @@",
			["-old a", "-old b"],
		);

		const { threadsByLineKey, unplacedThreadsByFile } =
			placeGithubReviewThreads(
				[thread({ id: "t1", line: 2, diff_side: "LEFT" })],
				[committed],
			);

		expect(unplacedThreadsByFile.size).toBe(0);
		expect(threadsByLineKey.get("example.ts:h1:2:old")?.map((t) => t.id)).toEqual([
			"t1",
		]);
	});
});
