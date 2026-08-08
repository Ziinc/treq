import type { GhReviewThread } from "../../lib/api-types";
import { GithubCommentCard, type GithubQuote } from "./GithubCommentCard";
import { buildQuotedPendingComment } from "./utils";
import type { PendingComment } from "./types";

interface GithubThreadsInlineListProps {
	threads: GhReviewThread[];
	collapsedThreadIds: Set<string>;
	toggleThreadCollapse: (threadId: string) => void;
	filePath: string;
	hunkId: string;
	displayAtLineIndex: number;
	lineNumber: number;
	lineSide: "old" | "new";
	setPendingComment: React.Dispatch<
		React.SetStateAction<PendingComment | null>
	>;
	setShowCommentInput: React.Dispatch<React.SetStateAction<boolean>>;
}

/**
 * Inline block of read-only GitHub review comment threads anchored to one
 * diff line (or, for unplaced/outdated threads, to a file with no matching
 * line). Quoting a thread's comment seeds a new local draft comment via the
 * same `setPendingComment`/`setShowCommentInput` flow the "+" button uses.
 */
export function GithubThreadsInlineList({
	threads,
	collapsedThreadIds,
	toggleThreadCollapse,
	filePath,
	hunkId,
	displayAtLineIndex,
	lineNumber,
	lineSide,
	setPendingComment,
	setShowCommentInput,
}: GithubThreadsInlineListProps) {
	if (threads.length === 0) return null;

	const onQuote = (quote: GithubQuote) => {
		setPendingComment(
			buildQuotedPendingComment(
				{ filePath, hunkId, displayAtLineIndex, lineNumber, lineSide },
				quote,
			),
		);
		setShowCommentInput(true);
	};

	return (
		<div className="border-y border-border/40 px-[16px] py-[8px] space-y-2">
			{threads.map((thread) => (
				<GithubCommentCard
					key={thread.id}
					thread={thread}
					collapsed={collapsedThreadIds.has(thread.id)}
					onToggleCollapse={() => toggleThreadCollapse(thread.id)}
					onQuote={onQuote}
				/>
			))}
		</div>
	);
}
