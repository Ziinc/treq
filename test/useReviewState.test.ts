import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useReviewState } from "../src/hooks/useReviewState";

// useDebounce returns value synchronously in tests
vi.mock("../src/hooks/useDebounce", () => ({
	useDebounce: (value: unknown) => value,
}));

describe("useReviewState", () => {
	beforeEach(() => vi.clearAllMocks());

	// ─── initial state ───────────────────────────────────────────────────────

	it("starts with no comments and review UI closed", () => {
		const { result } = renderHook(() => useReviewState());
		expect(result.current.comments).toHaveLength(0);
		expect(result.current.showCommentInput).toBe(false);
		expect(result.current.reviewPopoverOpen).toBe(false);
		expect(result.current.hasUserAddedComments).toBe(false);
		expect(result.current.isInReviewMode).toBe(false);
	});

	// ─── addComment ──────────────────────────────────────────────────────────

	it("addComment with valid text and pending comment creates a new comment", () => {
		const { result } = renderHook(() => useReviewState());

		act(() => {
			result.current.setPendingComment({
				filePath: "src/foo.ts",
				hunkId: "hunk-1",
				displayAtLineIndex: 3,
				startLine: 4,
				endLine: 4,
				lineContent: ["+new line"],
				lineSide: "new",
			});
			result.current.setShowCommentInput(true);
		});

		act(() => {
			result.current.addComment("This is a review comment");
		});

		expect(result.current.comments).toHaveLength(1);
		expect(result.current.comments[0].text).toBe("This is a review comment");
		expect(result.current.comments[0].filePath).toBe("src/foo.ts");
		expect(result.current.hasUserAddedComments).toBe(true);
		expect(result.current.showCommentInput).toBe(false);
		expect(result.current.pendingComment).toBeNull();
	});

	it("addComment with empty text is a no-op", () => {
		const { result } = renderHook(() => useReviewState());
		act(() => result.current.addComment("   "));
		expect(result.current.comments).toHaveLength(0);
	});

	it("addComment with no pending comment is a no-op", () => {
		const { result } = renderHook(() => useReviewState());
		act(() => result.current.addComment("some text"));
		expect(result.current.comments).toHaveLength(0);
	});

	// ─── cancelComment ───────────────────────────────────────────────────────

	it("cancelComment clears showCommentInput and pendingComment", () => {
		const { result } = renderHook(() => useReviewState());
		act(() => {
			result.current.setPendingComment({
				filePath: "f.ts",
				hunkId: "h",
				displayAtLineIndex: 0,
				startLine: 1,
				endLine: 1,
				lineContent: ["+x"],
				lineSide: "new",
			});
			result.current.setShowCommentInput(true);
		});
		act(() => result.current.cancelComment());
		expect(result.current.showCommentInput).toBe(false);
		expect(result.current.pendingComment).toBeNull();
	});

	// ─── deleteComment ───────────────────────────────────────────────────────

	it("deleteComment removes the comment with matching id", () => {
		const { result } = renderHook(() => useReviewState());

		// Add a comment first
		act(() => {
			result.current.setPendingComment({
				filePath: "f.ts",
				hunkId: "h",
				displayAtLineIndex: 0,
				startLine: 1,
				endLine: 1,
				lineContent: ["+x"],
				lineSide: "new",
			});
		});
		act(() => result.current.addComment("comment to delete"));

		const commentId = result.current.comments[0].id;
		act(() => result.current.deleteComment(commentId));
		expect(result.current.comments).toHaveLength(0);
	});

	// ─── edit comment ────────────────────────────────────────────────────────

	it("startEditComment sets editingCommentId", () => {
		const { result } = renderHook(() => useReviewState());
		act(() => result.current.startEditComment("some-id"));
		expect(result.current.editingCommentId).toBe("some-id");
	});

	it("cancelEditComment clears editingCommentId", () => {
		const { result } = renderHook(() => useReviewState());
		act(() => result.current.startEditComment("some-id"));
		act(() => result.current.cancelEditComment());
		expect(result.current.editingCommentId).toBeNull();
	});

	it("saveEditComment updates comment text and clears editingCommentId", () => {
		const { result } = renderHook(() => useReviewState());

		act(() => {
			result.current.setPendingComment({
				filePath: "f.ts",
				hunkId: "h",
				displayAtLineIndex: 0,
				startLine: 1,
				endLine: 1,
				lineContent: ["+x"],
				lineSide: "new",
			});
		});
		act(() => result.current.addComment("original"));

		const id = result.current.comments[0].id;
		act(() => {
			result.current.startEditComment(id);
			result.current.saveEditComment(id, "updated text");
		});

		expect(result.current.comments[0].text).toBe("updated text");
		expect(result.current.editingCommentId).toBeNull();
	});

	it("saveEditComment is no-op when text is empty", () => {
		const { result } = renderHook(() => useReviewState());

		act(() => {
			result.current.setPendingComment({
				filePath: "f.ts",
				hunkId: "h",
				displayAtLineIndex: 0,
				startLine: 1,
				endLine: 1,
				lineContent: ["+x"],
				lineSide: "new",
			});
		});
		act(() => result.current.addComment("original"));

		const id = result.current.comments[0].id;
		act(() => result.current.saveEditComment(id, "  "));
		expect(result.current.comments[0].text).toBe("original");
	});

	// ─── isInReviewMode ──────────────────────────────────────────────────────

	it("isInReviewMode is true when hasUserAddedComments is true", () => {
		const { result } = renderHook(() => useReviewState());
		act(() => {
			result.current.setPendingComment({
				filePath: "f.ts",
				hunkId: "h",
				displayAtLineIndex: 0,
				startLine: 1,
				endLine: 1,
				lineContent: ["+x"],
				lineSide: "new",
			});
		});
		act(() => result.current.addComment("any"));
		expect(result.current.isInReviewMode).toBe(true);
	});

	it("isInReviewMode is true when reviewPopoverOpen is true", () => {
		const { result } = renderHook(() => useReviewState());
		act(() => result.current.setReviewPopoverOpen(true));
		expect(result.current.isInReviewMode).toBe(true);
	});

	it("isInReviewMode is true when finalReviewComment is non-empty", () => {
		const { result } = renderHook(() => useReviewState());
		act(() => result.current.setFinalReviewComment("some comment"));
		expect(result.current.isInReviewMode).toBe(true);
	});
});
