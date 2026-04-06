import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useDiffViewerState } from "../src/hooks/useDiffViewerState";

// useDebounce is a simple timeout hook — stub it to return the value synchronously
vi.mock("../src/hooks/useDebounce", () => ({
	useDebounce: (value: unknown) => value,
}));

describe("useDiffViewerState", () => {
	beforeEach(() => vi.clearAllMocks());

	// ─── collapsedFiles ──────────────────────────────────────────────────────

	it("starts with no collapsed files", () => {
		const { result } = renderHook(() => useDiffViewerState());
		expect(result.current.collapsedFiles.size).toBe(0);
	});

	it("collapseFile adds a file to collapsedFiles", () => {
		const { result } = renderHook(() => useDiffViewerState());
		act(() => result.current.collapseFile("src/foo.ts"));
		expect(result.current.collapsedFiles.has("src/foo.ts")).toBe(true);
	});

	it("expandFile removes a file from collapsedFiles", () => {
		const { result } = renderHook(() => useDiffViewerState());
		act(() => result.current.collapseFile("src/foo.ts"));
		act(() => result.current.expandFile("src/foo.ts"));
		expect(result.current.collapsedFiles.has("src/foo.ts")).toBe(false);
	});

	it("toggleFileCollapse toggles a file in/out of collapsedFiles", () => {
		const { result } = renderHook(() => useDiffViewerState());
		act(() => result.current.toggleFileCollapse("src/foo.ts"));
		expect(result.current.collapsedFiles.has("src/foo.ts")).toBe(true);
		act(() => result.current.toggleFileCollapse("src/foo.ts"));
		expect(result.current.collapsedFiles.has("src/foo.ts")).toBe(false);
	});

	// ─── expandedLargeDiffs ──────────────────────────────────────────────────

	it("starts with no expanded large diffs", () => {
		const { result } = renderHook(() => useDiffViewerState());
		expect(result.current.expandedLargeDiffs.size).toBe(0);
	});

	it("toggleLargeDiff expands a file", () => {
		const { result } = renderHook(() => useDiffViewerState());
		act(() => result.current.toggleLargeDiff("src/big.ts"));
		expect(result.current.expandedLargeDiffs.has("src/big.ts")).toBe(true);
	});

	it("toggleLargeDiff collapses an already-expanded file", () => {
		const { result } = renderHook(() => useDiffViewerState());
		act(() => result.current.toggleLargeDiff("src/big.ts"));
		act(() => result.current.toggleLargeDiff("src/big.ts"));
		expect(result.current.expandedLargeDiffs.has("src/big.ts")).toBe(false);
	});

	// ─── collapsedSections ───────────────────────────────────────────────────

	it("starts with no collapsed sections", () => {
		const { result } = renderHook(() => useDiffViewerState());
		expect(result.current.collapsedSections.size).toBe(0);
	});

	it("toggleSection adds a section to collapsedSections", () => {
		const { result } = renderHook(() => useDiffViewerState());
		act(() => result.current.toggleSection("staged"));
		expect(result.current.collapsedSections.has("staged")).toBe(true);
	});

	it("toggleSection removes a collapsed section", () => {
		const { result } = renderHook(() => useDiffViewerState());
		act(() => result.current.toggleSection("staged"));
		act(() => result.current.toggleSection("staged"));
		expect(result.current.collapsedSections.has("staged")).toBe(false);
	});

	// ─── search state ────────────────────────────────────────────────────────

	it("starts with search closed and empty query", () => {
		const { result } = renderHook(() => useDiffViewerState());
		expect(result.current.isSearchOpen).toBe(false);
		expect(result.current.searchQuery).toBe("");
		expect(result.current.currentMatchIndex).toBe(0);
	});

	it("openSearch sets isSearchOpen to true", () => {
		const { result } = renderHook(() => useDiffViewerState());
		act(() => result.current.openSearch());
		expect(result.current.isSearchOpen).toBe(true);
	});

	it("closeSearch resets isSearchOpen, searchQuery, and currentMatchIndex", () => {
		const { result } = renderHook(() => useDiffViewerState());
		act(() => {
			result.current.openSearch();
			result.current.setSearchQuery("hello");
		});
		act(() => result.current.closeSearch());
		expect(result.current.isSearchOpen).toBe(false);
		expect(result.current.searchQuery).toBe("");
		expect(result.current.currentMatchIndex).toBe(0);
	});

	it("setSearchQuery updates searchQuery and resets match index", () => {
		const { result } = renderHook(() => useDiffViewerState());
		act(() => result.current.setSearchQuery("foo"));
		expect(result.current.searchQuery).toBe("foo");
		expect(result.current.currentMatchIndex).toBe(0);
	});

	it("goToNextMatch increments currentMatchIndex", () => {
		const { result } = renderHook(() => useDiffViewerState());
		act(() => result.current.goToNextMatch(3));
		expect(result.current.currentMatchIndex).toBe(1);
	});

	it("goToNextMatch wraps around to 0 when at the end", () => {
		const { result } = renderHook(() => useDiffViewerState());
		act(() => result.current.goToNextMatch(3));
		act(() => result.current.goToNextMatch(3));
		act(() => result.current.goToNextMatch(3));
		// 0 → 1 → 2 → 0 (wrapped)
		expect(result.current.currentMatchIndex).toBe(0);
	});

	it("goToPrevMatch decrements currentMatchIndex", () => {
		const { result } = renderHook(() => useDiffViewerState());
		act(() => result.current.goToNextMatch(3));
		act(() => result.current.goToPrevMatch(3));
		expect(result.current.currentMatchIndex).toBe(0);
	});

	it("goToPrevMatch wraps to last index when at 0", () => {
		const { result } = renderHook(() => useDiffViewerState());
		act(() => result.current.goToPrevMatch(3));
		expect(result.current.currentMatchIndex).toBe(2);
	});
});
