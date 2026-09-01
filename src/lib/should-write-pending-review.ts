/** Gate disk writes so a stale debounce cannot resurrect a cleared review. */
export function shouldWritePendingReview(args: {
  liveCommentCount: number;
  liveSummary: string;
  debouncedCommentCount: number;
  debouncedSummary: string;
  liveConflictCommentCount?: number;
  debouncedConflictCommentCount?: number;
}): boolean {
  const liveConflictCommentCount = args.liveConflictCommentCount ?? 0;
  const debouncedConflictCommentCount = args.debouncedConflictCommentCount ?? 0;
  if (
    args.liveCommentCount === 0 &&
    !args.liveSummary.trim() &&
    liveConflictCommentCount === 0
  ) {
    return false;
  }
  if (
    args.debouncedCommentCount === 0 &&
    !args.debouncedSummary.trim() &&
    debouncedConflictCommentCount === 0
  ) {
    return false;
  }
  return true;
}
