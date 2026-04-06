import { useState, useMemo, useCallback } from "react";
import { v4 as uuidv4 } from "uuid";

// Mirror of the LineComment interface in ChangesDiffViewer
export interface LineComment {
	id: string;
	filePath: string;
	hunkId: string;
	startLine: number;
	endLine: number;
	lineContent: string[];
	text: string;
	createdAt: string;
	lineSide?: "old" | "new";
}

export interface PendingComment {
	filePath: string;
	hunkId: string;
	displayAtLineIndex: number;
	startLine: number;
	endLine: number;
	lineContent: string[];
	lineSide: "old" | "new";
}

export interface UseReviewStateResult {
	// Comment list
	comments: LineComment[];
	/** Replace the whole comment list (e.g. when loading a persisted review). */
	setComments: (comments: LineComment[]) => void;

	// Inline comment input
	pendingComment: PendingComment | null;
	setPendingComment: (comment: PendingComment | null) => void;
	showCommentInput: boolean;
	setShowCommentInput: (show: boolean) => void;

	// Comment editing
	editingCommentId: string | null;

	// Review submission UI
	reviewPopoverOpen: boolean;
	setReviewPopoverOpen: (open: boolean) => void;
	finalReviewComment: string;
	setFinalReviewComment: (text: string) => void;
	showCancelDialog: boolean;
	setShowCancelDialog: (show: boolean) => void;
	copiedReview: boolean;
	setCopiedReview: (copied: boolean) => void;
	sendingReview: boolean;
	setSendingReview: (sending: boolean) => void;
	hasUserAddedComments: boolean;
	setHasUserAddedComments: (value: boolean) => void;

	/** True while the user is actively reviewing (has comments, popover open, or has typed a review comment). */
	isInReviewMode: boolean;

	// Comment CRUD handlers
	/** Create a comment from the current pendingComment context. No-op if text is empty or no pending comment is set. */
	addComment: (text: string) => void;
	/** Cancel the inline comment input and clear pending comment. */
	cancelComment: () => void;
	deleteComment: (commentId: string) => void;
	startEditComment: (commentId: string) => void;
	cancelEditComment: () => void;
	saveEditComment: (commentId: string, newText: string) => void;
}

export function useReviewState(): UseReviewStateResult {
	const [comments, setCommentsRaw] = useState<LineComment[]>([]);
	const [pendingComment, setPendingComment] = useState<PendingComment | null>(
		null,
	);
	const [showCommentInput, setShowCommentInput] = useState(false);
	const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
	const [reviewPopoverOpen, setReviewPopoverOpen] = useState(false);
	const [finalReviewComment, setFinalReviewComment] = useState("");
	const [showCancelDialog, setShowCancelDialog] = useState(false);
	const [copiedReview, setCopiedReview] = useState(false);
	const [sendingReview, setSendingReview] = useState(false);
	const [hasUserAddedComments, setHasUserAddedComments] = useState(false);

	const isInReviewMode = useMemo(
		() =>
			hasUserAddedComments ||
			showCommentInput ||
			reviewPopoverOpen ||
			finalReviewComment.trim().length > 0,
		[hasUserAddedComments, showCommentInput, reviewPopoverOpen, finalReviewComment],
	);

	const addComment = useCallback(
		(text: string) => {
			if (!text.trim() || !pendingComment) return;

			const newComment: LineComment = {
				id: uuidv4(),
				filePath: pendingComment.filePath,
				hunkId: pendingComment.hunkId,
				startLine: pendingComment.startLine,
				endLine: pendingComment.endLine,
				lineContent: pendingComment.lineContent,
				text: text.trim(),
				createdAt: new Date().toISOString(),
				lineSide: pendingComment.lineSide,
			};

			setCommentsRaw((prev) => [...prev, newComment]);
			setHasUserAddedComments(true);
			setShowCommentInput(false);
			setPendingComment(null);
		},
		[pendingComment],
	);

	const cancelComment = useCallback(() => {
		setShowCommentInput(false);
		setPendingComment(null);
	}, []);

	const deleteComment = useCallback((commentId: string) => {
		setCommentsRaw((prev) => prev.filter((c) => c.id !== commentId));
	}, []);

	const startEditComment = useCallback((commentId: string) => {
		setEditingCommentId(commentId);
	}, []);

	const cancelEditComment = useCallback(() => {
		setEditingCommentId(null);
	}, []);

	const saveEditComment = useCallback((commentId: string, newText: string) => {
		if (!newText.trim()) return;
		setCommentsRaw((prev) =>
			prev.map((c) =>
				c.id === commentId ? { ...c, text: newText.trim() } : c,
			),
		);
		setEditingCommentId(null);
	}, []);

	return {
		comments,
		setComments: setCommentsRaw,
		pendingComment,
		setPendingComment,
		showCommentInput,
		setShowCommentInput,
		editingCommentId,
		reviewPopoverOpen,
		setReviewPopoverOpen,
		finalReviewComment,
		setFinalReviewComment,
		showCancelDialog,
		setShowCancelDialog,
		copiedReview,
		setCopiedReview,
		sendingReview,
		setSendingReview,
		hasUserAddedComments,
		setHasUserAddedComments,
		isInReviewMode,
		addComment,
		cancelComment,
		deleteComment,
		startEditComment,
		cancelEditComment,
		saveEditComment,
	};
}
