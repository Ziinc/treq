import { describe, it, expect } from "vitest";
import {
	getLineTypeClass,
	getLinePrefix,
	hunksEqual,
	filesEqual,
	parseCachedHunks,
	parseHunkHeader,
	computeHunkLineNumbers,
	computeHunksHash,
} from "../src/lib/diff-utils";
import type { JjDiffHunk } from "../src/lib/api";
import type { ParsedFileChange } from "../src/lib/git-utils";

// ─── helpers ────────────────────────────────────────────────────────────────

function makeHunk(overrides: Partial<JjDiffHunk> = {}): JjDiffHunk {
	return {
		id: "hunk-1",
		header: "@@ -1,3 +1,3 @@",
		lines: [" context", "-old line", "+new line"],
		patch: "",
		...overrides,
	};
}

function makeFile(overrides: Partial<ParsedFileChange> = {}): ParsedFileChange {
	return {
		path: "src/foo.ts",
		stagedStatus: undefined,
		workspaceStatus: "M",
		isUntracked: false,
		...overrides,
	};
}

// ─── getLineTypeClass ────────────────────────────────────────────────────────

describe("getLineTypeClass", () => {
	it("returns addition class for + lines", () => {
		expect(getLineTypeClass("+added line")).toBe("bg-emerald-500/20");
	});

	it("returns deletion class for - lines", () => {
		expect(getLineTypeClass("-removed line")).toBe("bg-red-500/20");
	});

	it("returns empty string for context lines", () => {
		expect(getLineTypeClass(" context line")).toBe("");
	});

	it("returns empty string for empty string", () => {
		expect(getLineTypeClass("")).toBe("");
	});
});

// ─── getLinePrefix ───────────────────────────────────────────────────────────

describe("getLinePrefix", () => {
	it("returns + for addition lines", () => {
		expect(getLinePrefix("+new line")).toBe("+");
	});

	it("returns - for deletion lines", () => {
		expect(getLinePrefix("-old line")).toBe("-");
	});

	it("returns space for context lines", () => {
		expect(getLinePrefix(" context")).toBe(" ");
	});

	it("returns space for empty string", () => {
		expect(getLinePrefix("")).toBe(" ");
	});
});

// ─── hunksEqual ─────────────────────────────────────────────────────────────

describe("hunksEqual", () => {
	it("returns true when both are null/undefined", () => {
		expect(hunksEqual(null, null)).toBe(true);
		expect(hunksEqual(undefined, undefined)).toBe(true);
		expect(hunksEqual(null, undefined)).toBe(true);
	});

	it("returns false when one side is null", () => {
		expect(hunksEqual([makeHunk()], null)).toBe(false);
		expect(hunksEqual(null, [makeHunk()])).toBe(false);
	});

	it("returns true for identical hunk arrays", () => {
		const h = makeHunk();
		expect(hunksEqual([h], [h])).toBe(true);
	});

	it("returns false when lengths differ", () => {
		expect(hunksEqual([makeHunk()], [])).toBe(false);
	});

	it("returns false when hunk content differs", () => {
		const a = makeHunk({ lines: ["+line a"] });
		const b = makeHunk({ lines: ["+line b"] });
		expect(hunksEqual([a], [b])).toBe(false);
	});

	it("returns true for two empty arrays", () => {
		expect(hunksEqual([], [])).toBe(true);
	});
});

// ─── filesEqual ─────────────────────────────────────────────────────────────

describe("filesEqual", () => {
	it("returns true for identical file arrays", () => {
		const f = makeFile();
		expect(filesEqual([f], [f])).toBe(true);
	});

	it("returns false when lengths differ", () => {
		expect(filesEqual([makeFile()], [])).toBe(false);
	});

	it("returns false when path differs", () => {
		const a = makeFile({ path: "a.ts" });
		const b = makeFile({ path: "b.ts" });
		expect(filesEqual([a], [b])).toBe(false);
	});

	it("returns false when stagedStatus differs", () => {
		const a = makeFile({ stagedStatus: "A" });
		const b = makeFile({ stagedStatus: "M" });
		expect(filesEqual([a], [b])).toBe(false);
	});

	it("returns false when workspaceStatus differs", () => {
		const a = makeFile({ workspaceStatus: "M" });
		const b = makeFile({ workspaceStatus: "D" });
		expect(filesEqual([a], [b])).toBe(false);
	});

	it("returns false when isUntracked differs", () => {
		const a = makeFile({ isUntracked: true });
		const b = makeFile({ isUntracked: false });
		expect(filesEqual([a], [b])).toBe(false);
	});

	it("returns true for two empty arrays", () => {
		expect(filesEqual([], [])).toBe(true);
	});
});

// ─── parseCachedHunks ────────────────────────────────────────────────────────

describe("parseCachedHunks", () => {
	it("parses a valid JSON array of hunks", () => {
		const hunk = makeHunk();
		const result = parseCachedHunks(JSON.stringify([hunk]));
		expect(result).toEqual([hunk]);
	});

	it("returns null for invalid JSON", () => {
		expect(parseCachedHunks("not-json")).toBeNull();
	});

	it("returns null for JSON that is not an array", () => {
		expect(parseCachedHunks(JSON.stringify({ id: "x" }))).toBeNull();
	});

	it("returns null for empty string", () => {
		expect(parseCachedHunks("")).toBeNull();
	});

	it("returns empty array for JSON empty array", () => {
		expect(parseCachedHunks("[]")).toEqual([]);
	});
});

// ─── parseHunkHeader ─────────────────────────────────────────────────────────

describe("parseHunkHeader", () => {
	it("parses a standard unified diff header", () => {
		expect(parseHunkHeader("@@ -1,3 +1,3 @@")).toEqual({
			oldStart: 1,
			oldCount: 3,
			newStart: 1,
			newCount: 3,
		});
	});

	it("parses a header where counts are omitted (single line)", () => {
		// @@ -5 +5 @@ means count defaults to 1
		expect(parseHunkHeader("@@ -5 +7 @@")).toEqual({
			oldStart: 5,
			oldCount: 1,
			newStart: 7,
			newCount: 1,
		});
	});

	it("parses a header with context function label", () => {
		expect(parseHunkHeader("@@ -10,5 +10,7 @@ function foo()")).toEqual({
			oldStart: 10,
			oldCount: 5,
			newStart: 10,
			newCount: 7,
		});
	});

	it("returns default {1,1,1,1} for an unrecognised header", () => {
		expect(parseHunkHeader("not a header")).toEqual({
			oldStart: 1,
			oldCount: 1,
			newStart: 1,
			newCount: 1,
		});
	});
});

// ─── computeHunkLineNumbers ───────────────────────────────────────────────────

describe("computeHunkLineNumbers", () => {
	it("assigns new-only line numbers to addition lines", () => {
		const hunk = makeHunk({
			header: "@@ -1,0 +1,1 @@",
			lines: ["+added"],
		});
		const nums = computeHunkLineNumbers(hunk);
		expect(nums).toEqual([{ new: 1 }]);
	});

	it("assigns old-only line numbers to deletion lines", () => {
		const hunk = makeHunk({
			header: "@@ -3,1 +3,0 @@",
			lines: ["-removed"],
		});
		const nums = computeHunkLineNumbers(hunk);
		expect(nums).toEqual([{ old: 3 }]);
	});

	it("assigns both line numbers to context lines and increments correctly", () => {
		const hunk = makeHunk({
			header: "@@ -2,3 +2,3 @@",
			lines: [" ctx", "-old", "+new", " ctx2"],
		});
		const nums = computeHunkLineNumbers(hunk);
		expect(nums).toEqual([
			{ old: 2, new: 2 },
			{ old: 3 },
			{ new: 3 },
			{ old: 4, new: 4 },
		]);
	});
});

// ─── computeHunksHash ────────────────────────────────────────────────────────

describe("computeHunksHash", () => {
	it("returns a non-empty string", () => {
		const hash = computeHunksHash([makeHunk()]);
		expect(typeof hash).toBe("string");
		expect(hash.length).toBeGreaterThan(0);
	});

	it("returns the same hash for the same content", () => {
		const h = makeHunk();
		expect(computeHunksHash([h])).toBe(computeHunksHash([h]));
	});

	it("returns different hashes for different content", () => {
		const a = makeHunk({ lines: ["+line a"] });
		const b = makeHunk({ lines: ["+line b"] });
		expect(computeHunksHash([a])).not.toBe(computeHunksHash([b]));
	});

	it("returns a hash for an empty array", () => {
		const hash = computeHunksHash([]);
		expect(typeof hash).toBe("string");
	});
});
