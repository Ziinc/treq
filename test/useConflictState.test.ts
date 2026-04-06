import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useConflictState } from "../src/hooks/useConflictState";
import type { ConflictRegion } from "../src/lib/api";

const makeRegion = (id: string, startLine: number, endLine: number): ConflictRegion => ({
	id,
	filePath: "src/foo.ts",
	conflictNumber: 1,
	totalConflicts: 1,
	startLine,
	endLine,
	content: "",
	markerStyle: "jj",
});

describe("useConflictState", () => {
	beforeEach(() => {});

	// ─── initial state ───────────────────────────────────────────────────────

	it("starts with empty conflict state", () => {
		const { result } = renderHook(() => useConflictState());
		expect(result.current.actualConflictedFiles).toHaveLength(0);
		expect(result.current.conflictRegionsByFile.size).toBe(0);
		expect(result.current.conflictComments.size).toBe(0);
		expect(result.current.openConflictComments.size).toBe(0);
		expect(result.current.editingConflictCommentId).toBeNull();
	});

	// ─── conflictLineLookups ────────────────────────────────────────────────

	it("conflictLineLookups maps line numbers to conflict regions", () => {
		const { result } = renderHook(() => useConflictState());
		const region = makeRegion("r1", 5, 8);

		act(() => {
			result.current.setConflictRegionsByFile(new Map([["src/foo.ts", [region]]]));
		});

		const lookup = result.current.conflictLineLookups.get("src/foo.ts");
		expect(lookup).toBeDefined();
		expect(lookup!.get(5)).toBe(region);
		expect(lookup!.get(6)).toBe(region);
		expect(lookup!.get(8)).toBe(region);
		expect(lookup!.get(9)).toBeUndefined();
	});

	it("conflictLineLookups is empty when no regions are set", () => {
		const { result } = renderHook(() => useConflictState());
		expect(result.current.conflictLineLookups.size).toBe(0);
	});

	// ─── firstConflictRegionIdByFile ────────────────────────────────────────

	it("firstConflictRegionIdByFile returns the first region id per file", () => {
		const { result } = renderHook(() => useConflictState());
		const r1 = makeRegion("region-a", 1, 4);
		const r2 = makeRegion("region-b", 10, 12);

		act(() => {
			result.current.setConflictRegionsByFile(
				new Map([["src/bar.ts", [r1, r2]]]),
			);
		});

		expect(result.current.firstConflictRegionIdByFile.get("src/bar.ts")).toBe("region-a");
	});

	// ─── saveConflictComment ─────────────────────────────────────────────────

	it("saveConflictComment creates a comment for the conflict id", () => {
		const { result } = renderHook(() => useConflictState());

		act(() => {
			result.current.saveConflictComment("conflict-1", "src/foo.ts", 1, "My note");
		});

		expect(result.current.conflictComments.size).toBe(1);
		const comment = result.current.conflictComments.get("conflict-1");
		expect(comment).toBeDefined();
		expect(comment!.text).toBe("My note");
		expect(comment!.filePath).toBe("src/foo.ts");
	});

	it("saveConflictComment is a no-op for empty text", () => {
		const { result } = renderHook(() => useConflictState());
		act(() => {
			result.current.saveConflictComment("conflict-1", "src/foo.ts", 1, "  ");
		});
		expect(result.current.conflictComments.size).toBe(0);
	});

	// ─── clearConflictComment ────────────────────────────────────────────────

	it("clearConflictComment removes a conflict comment", () => {
		const { result } = renderHook(() => useConflictState());
		act(() => {
			result.current.saveConflictComment("c1", "f.ts", 1, "note");
		});
		act(() => {
			result.current.clearConflictComment("c1");
		});
		expect(result.current.conflictComments.size).toBe(0);
	});

	// ─── saveEditConflictComment ─────────────────────────────────────────────

	it("saveEditConflictComment updates existing comment text", () => {
		const { result } = renderHook(() => useConflictState());
		act(() => {
			result.current.saveConflictComment("c1", "f.ts", 1, "original");
		});
		act(() => {
			result.current.saveEditConflictComment("c1", "updated");
		});
		expect(result.current.conflictComments.get("c1")!.text).toBe("updated");
		expect(result.current.editingConflictCommentId).toBeNull();
	});

	it("saveEditConflictComment is a no-op for empty text", () => {
		const { result } = renderHook(() => useConflictState());
		act(() => {
			result.current.saveConflictComment("c1", "f.ts", 1, "original");
		});
		act(() => {
			result.current.saveEditConflictComment("c1", "  ");
		});
		expect(result.current.conflictComments.get("c1")!.text).toBe("original");
	});

	// ─── edit comment id ─────────────────────────────────────────────────────

	it("startEditConflictComment sets editingConflictCommentId", () => {
		const { result } = renderHook(() => useConflictState());
		act(() => result.current.startEditConflictComment("c1"));
		expect(result.current.editingConflictCommentId).toBe("c1");
	});

	it("cancelEditConflictComment clears editingConflictCommentId", () => {
		const { result } = renderHook(() => useConflictState());
		act(() => result.current.startEditConflictComment("c1"));
		act(() => result.current.cancelEditConflictComment());
		expect(result.current.editingConflictCommentId).toBeNull();
	});

	// ─── toggleConflictComment ───────────────────────────────────────────────

	it("toggleConflictComment opens a closed conflict", () => {
		const { result } = renderHook(() => useConflictState());
		act(() => result.current.toggleConflictComment("c1"));
		expect(result.current.openConflictComments.has("c1")).toBe(true);
	});

	it("toggleConflictComment closes an open conflict", () => {
		const { result } = renderHook(() => useConflictState());
		act(() => result.current.toggleConflictComment("c1"));
		act(() => result.current.toggleConflictComment("c1"));
		expect(result.current.openConflictComments.has("c1")).toBe(false);
	});
});
