import { useCallback, useState } from "react";
import useSWR from "swr";
import { v4 as uuidv4 } from "uuid";
import {
  clearFileBrowserReview,
  loadFileBrowserReview,
  saveFileBrowserReview,
} from "../lib/api-extra";
import {
  formatReviewMarkdown,
  type LineComment,
  type PendingComment,
  toApiLineComment,
  toLocalLineComment,
} from "../lib/review";
import type { useToast } from "../components/ui/toast";
import { useDebounce } from "./useDebounce";

interface UseFileBrowserReviewParams {
  repoPath: string | null;
  workspaceId: number | undefined;
  onCreateAgentWithReview:
    | ((review: string, mode: "plan" | "acceptEdits") => Promise<void>)
    | undefined;
  addToast: ReturnType<typeof useToast>["addToast"];
}

/**
 * Owns the FileBrowser's own review session (comments accumulated while browsing
 * arbitrary files, batched and sent once). Kept independent from the Review/Changes
 * tab's session — see file_browser_reviews in local_db.rs.
 */
export function useFileBrowserReview({
  repoPath,
  workspaceId,
  onCreateAgentWithReview,
  addToast,
}: UseFileBrowserReviewParams) {
  const loadKey =
    repoPath && workspaceId !== undefined
      ? `${repoPath}:${workspaceId}`
      : null;
  const { data: saved } = useSWR(
    loadKey ? ["file-browser-review", repoPath, workspaceId] : null,
    () => loadFileBrowserReview(repoPath!, workspaceId!),
  );
  const loadedComments = saved?.comments.map(toLocalLineComment) ?? [];
  const loadedSummary = saved?.summary_text ?? "";

  const [draft, setDraft] = useState<{
    key: string;
    comments: LineComment[];
    summary: string;
  } | null>(null);

  const comments =
    draft && loadKey && draft.key === loadKey ? draft.comments : loadedComments;
  const finalReviewComment =
    draft && loadKey && draft.key === loadKey ? draft.summary : loadedSummary;

  const setComments = useCallback(
    (next: LineComment[] | ((prev: LineComment[]) => LineComment[])) => {
      if (!loadKey) return;
      setDraft((prev) => {
        const current =
          prev?.key === loadKey ? prev.comments : loadedComments;
        const commentsNext =
          typeof next === "function" ? next(current) : next;
        const summary = prev?.key === loadKey ? prev.summary : loadedSummary;
        return { key: loadKey, comments: commentsNext, summary };
      });
    },
    [loadKey, loadedComments, loadedSummary],
  );

  const setFinalReviewComment = useCallback(
    (summary: string) => {
      if (!loadKey) return;
      setDraft((prev) => ({
        key: loadKey,
        comments: prev?.key === loadKey ? prev.comments : loadedComments,
        summary,
      }));
    },
    [loadKey, loadedComments],
  );

  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [reviewPopoverOpen, setReviewPopoverOpen] = useState(false);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [copiedReview, setCopiedReview] = useState(false);
  const [sendingReview, setSendingReview] = useState(false);

  const debouncedComments = useDebounce(comments, 500);
  const debouncedSummary = useDebounce(finalReviewComment, 500);

  useSWR(
    loadKey &&
      (debouncedComments.length > 0 || Boolean(debouncedSummary.trim()))
      ? [
          "file-browser-review-save",
          repoPath,
          workspaceId,
          JSON.stringify(debouncedComments.map(toApiLineComment)),
          debouncedSummary,
        ]
      : null,
    () =>
      saveFileBrowserReview(
        repoPath!,
        workspaceId!,
        debouncedComments.map(toApiLineComment),
        debouncedSummary.trim() || undefined,
      ),
  );

  const addComment = useCallback(
    (pendingComment: PendingComment, text: string) => {
      if (!text.trim()) return;
      const newComment: LineComment = {
        id: uuidv4(),
        filePath: pendingComment.filePath,
        hunkId: pendingComment.hunkId,
        startLine: pendingComment.startLine,
        endLine: pendingComment.endLine,
        lineContent: pendingComment.lineContent,
        text: text.trim(),
        createdAt: new Date().toISOString(),
      };
      setComments((prev) => [...prev, newComment]);
    },
    [setComments],
  );

  const deleteComment = useCallback(
    (commentId: string) => {
      setComments((prev) => prev.filter((comment) => comment.id !== commentId));
      setEditingCommentId((prev) => (prev === commentId ? null : prev));
    },
    [setComments],
  );

  const startEditComment = useCallback((commentId: string) => {
    setEditingCommentId(commentId);
  }, []);

  const cancelEditComment = useCallback(() => {
    setEditingCommentId(null);
  }, []);

  const saveEditComment = useCallback(
    (commentId: string, newText: string) => {
      if (!newText.trim()) return;
      setComments((prev) =>
        prev.map((comment) =>
          comment.id === commentId
            ? { ...comment, text: newText.trim() }
            : comment,
        ),
      );
      setEditingCommentId(null);
    },
    [setComments],
  );

  const formatMarkdown = useCallback(
    () => formatReviewMarkdown({ comments, finalReviewComment }),
    [comments, finalReviewComment],
  );

  const handleRequestChanges = useCallback(
    async (mode: "plan" | "acceptEdits") => {
      setSendingReview(true);
      try {
        const markdown = formatMarkdown();
        if (onCreateAgentWithReview) {
          await onCreateAgentWithReview(markdown, mode);
        } else {
          addToast({
            title: "No handler provided",
            description: "onCreateAgentWithReview callback not available",
            type: "error",
          });
          return;
        }
        setComments([]);
        setFinalReviewComment("");
        setReviewPopoverOpen(false);
        if (repoPath && workspaceId !== undefined)
          await clearFileBrowserReview(repoPath, workspaceId);
      } catch (error) {
        addToast({
          description: error instanceof Error ? error.message : String(error),
          title: "Failed to send review",
          type: "error",
        });
      } finally {
        setSendingReview(false);
      }
    },
    [
      onCreateAgentWithReview,
      formatMarkdown,
      addToast,
      repoPath,
      workspaceId,
      setComments,
      setFinalReviewComment,
    ],
  );

  const handleCancelReview = useCallback(async () => {
    try {
      setComments([]);
      setFinalReviewComment("");
      setShowCancelDialog(false);
      setReviewPopoverOpen(false);
      if (repoPath && workspaceId !== undefined)
        await clearFileBrowserReview(repoPath, workspaceId);
      addToast({
        title: "Review canceled",
        description: "All comments have been discarded",
        type: "success",
      });
    } catch (error) {
      addToast({
        description: error instanceof Error ? error.message : String(error),
        title: "Failed to cancel review",
        type: "error",
      });
    }
  }, [repoPath, workspaceId, addToast, setComments, setFinalReviewComment]);

  const handleCopyReview = useCallback(async () => {
    try {
      const markdown = formatMarkdown();
      await navigator.clipboard.writeText(markdown);
      setCopiedReview(true);
      setTimeout(() => setCopiedReview(false), 2000);
    } catch (error) {
      addToast({
        description: error instanceof Error ? error.message : String(error),
        title: "Failed to copy",
        type: "error",
      });
    }
  }, [formatMarkdown, addToast]);

  return {
    comments,
    addComment,
    deleteComment,
    editingCommentId,
    startEditComment,
    cancelEditComment,
    saveEditComment,
    finalReviewComment,
    setFinalReviewComment,
    reviewPopoverOpen,
    setReviewPopoverOpen,
    showCancelDialog,
    setShowCancelDialog,
    copiedReview,
    sendingReview,
    handleRequestChanges,
    handleCancelReview,
    handleCopyReview,
  };
}
