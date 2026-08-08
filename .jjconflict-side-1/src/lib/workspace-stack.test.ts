import { describe, expect, it } from "vitest";
import type { JjLogCommit } from "./api-types";
import { sumWorkspaceDiffStats } from "./workspace-stack";

function makeCommit(overrides: Partial<JjLogCommit> = {}): JjLogCommit {
	return {
		commit_id: "abc",
		short_id: "abc",
		change_id: "chg",
		description: "Add feature",
		author_name: "Test User",
		timestamp: "2026-01-01T00:00:00.000Z",
		parent_ids: [],
		is_working_copy: false,
		bookmarks: [],
		is_immutable: false,
		insertions: 0,
		deletions: 0,
		on_target_only: false,
		...overrides,
	};
}

describe("sumWorkspaceDiffStats", () => {
	it("returns zero for an empty commit list", () => {
		expect(sumWorkspaceDiffStats([])).toEqual({ insertions: 0, deletions: 0 });
	});

	it("sums insertions and deletions across own-workspace commits", () => {
		const commits = [
			makeCommit({ insertions: 5, deletions: 2 }),
			makeCommit({ insertions: 3, deletions: 1 }),
		];
		expect(sumWorkspaceDiffStats(commits)).toEqual({
			insertions: 8,
			deletions: 3,
		});
	});

	it("excludes commits that are on_target_only", () => {
		const commits = [
			makeCommit({ insertions: 5, deletions: 2 }),
			makeCommit({ insertions: 100, deletions: 100, on_target_only: true }),
		];
		expect(sumWorkspaceDiffStats(commits)).toEqual({
			insertions: 5,
			deletions: 2,
		});
	});
});
