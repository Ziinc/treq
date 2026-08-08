import { useRef } from "react";
import {
	CheckCircle2,
	ChevronDown,
	ChevronRight,
	Github,
	Quote,
} from "lucide-react";
import type { GhReviewThread } from "../../lib/api-types";
import { SelectionQuoteToolbar } from "./SelectionQuoteToolbar";

export interface GithubQuote {
	text: string;
	author: string;
	avatarUrl?: string;
	commentUrl: string;
}

interface GithubCommentCardProps {
	thread: GhReviewThread;
	collapsed: boolean;
	onToggleCollapse: () => void;
	onQuote: (quote: GithubQuote) => void;
}

function formatDate(iso: string): string {
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) return iso;
	return date.toLocaleDateString(undefined, {
		year: "numeric",
		month: "short",
		day: "numeric",
	});
}

/** Read-only GitHub PR review comment thread, rendered inline in the diff. */
export function GithubCommentCard({
	thread,
	collapsed,
	onToggleCollapse,
	onQuote,
}: GithubCommentCardProps) {
	return (
		<div className="rounded-md border border-sky-500/30 bg-sky-500/5 overflow-hidden">
			<button
				className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-sky-500/10"
				onClick={onToggleCollapse}
				data-testid="github-thread-toggle"
			>
				{collapsed ? (
					<ChevronRight className="w-3 h-3 text-muted-foreground flex-shrink-0" />
				) : (
					<ChevronDown className="w-3 h-3 text-muted-foreground flex-shrink-0" />
				)}
				<Github
					className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400 flex-shrink-0"
					aria-label="GitHub"
				/>
				{thread.is_resolved && (
					<span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-muted text-muted-foreground text-[10px] font-medium">
						<CheckCircle2 className="w-3 h-3" />
						Resolved
					</span>
				)}
				<span className="text-xs text-muted-foreground">
					{thread.comments.length} comment
					{thread.comments.length !== 1 ? "s" : ""}
				</span>
			</button>
			{!collapsed && (
				<div className="px-3 pb-3 space-y-2">
					{thread.comments.map((comment) => (
						<GithubCommentBody
							key={comment.id}
							comment={comment}
							onQuote={onQuote}
						/>
					))}
				</div>
			)}
		</div>
	);
}

function GithubCommentBody({
	comment,
	onQuote,
}: {
	comment: GhReviewThread["comments"][number];
	onQuote: (quote: GithubQuote) => void;
}) {
	const bodyRef = useRef<HTMLDivElement>(null);

	const quoteComment = (text: string) =>
		onQuote({
			text,
			author: comment.author.login,
			avatarUrl: comment.author.avatar_url ?? undefined,
			commentUrl: comment.url,
		});

	return (
		<div className="group relative bg-background rounded-md p-2.5 pr-9 border border-border/60">
			<div className="flex items-center gap-2 mb-1.5">
				{comment.author.avatar_url ? (
					<img
						src={comment.author.avatar_url}
						alt=""
						className="w-5 h-5 rounded-full"
					/>
				) : (
					<div className="w-5 h-5 rounded-full bg-muted flex items-center justify-center text-[10px] font-medium text-muted-foreground">
						{comment.author.login.slice(0, 1).toUpperCase()}
					</div>
				)}
				<span className="text-xs font-medium">@{comment.author.login}</span>
				<span className="text-xs text-muted-foreground">
					{formatDate(comment.created_at)}
				</span>
			</div>
			<div
				ref={bodyRef}
				className="text-sm whitespace-pre-wrap select-text"
				data-testid="github-comment-body"
			>
				{comment.body}
			</div>
			<button
				className="absolute top-2 right-2 p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity"
				onClick={() => quoteComment(comment.body)}
				title="Quote this comment"
			>
				<Quote className="w-3.5 h-3.5" />
			</button>
			<SelectionQuoteToolbar containerRef={bodyRef} onQuote={quoteComment} />
		</div>
	);
}
