/** Gate disk writes so a stale debounce cannot resurrect a cleared review. */
export function shouldWritePendingReview(args: {
  liveCommentCount: number;
  liveSummary: string;
  debouncedCommentCount: number;
  debouncedSummary: string;
}): boolean {
  if (args.liveCommentCount === 0 && !args.liveSummary.trim()) {
    return false;
  }
  if (args.debouncedCommentCount === 0 && !args.debouncedSummary.trim()) {
    return false;
  }
  return true;
}
