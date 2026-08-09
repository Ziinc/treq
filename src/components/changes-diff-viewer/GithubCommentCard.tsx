import { useRef } from "react";
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Github,
  Quote,
} from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
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

/** Format a GitHub comment timestamp; omit the year when it is the current year. */
export function formatGithubCommentDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleDateString(undefined, {
    ...(sameYear ? {} : { year: "numeric" as const }),
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
        className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-sky-500/10 font-sans"
        onClick={onToggleCollapse}
        data-testid="github-thread-toggle"
      >
        {collapsed ? (
          <ChevronRight className="w-3 h-3 text-muted-foreground flex-shrink-0" />
        ) : (
          <ChevronDown className="w-3 h-3 text-muted-foreground flex-shrink-0" />
        )}
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
  const profileUrl = `https://github.com/${comment.author.login}`;

  const quoteComment = (text: string) =>
    onQuote({
      text,
      author: comment.author.login,
      avatarUrl: comment.author.avatar_url ?? undefined,
      commentUrl: comment.url,
    });

  return (
    <div
      className="group relative bg-background rounded-md p-2.5 pr-9 border border-border/60 font-sans"
      data-testid="github-comment-card"
    >
      <div className="flex items-center gap-2 mb-1.5">
        {comment.author.avatar_url ? (
          <img
            src={comment.author.avatar_url}
            alt={comment.author.login}
            className="w-8 h-8 rounded-full flex-shrink-0"
          />
        ) : (
          <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-medium text-muted-foreground flex-shrink-0">
            {comment.author.login.slice(0, 1).toUpperCase()}
          </div>
        )}
        <a
          href={profileUrl}
          className="text-xs font-medium font-sans hover:underline text-foreground"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            void openUrl(profileUrl);
          }}
        >
          @{comment.author.login}
        </a>
        <span className="text-xs text-muted-foreground font-sans">
          {formatGithubCommentDate(comment.created_at)}
        </span>
        <Github
          className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400 flex-shrink-0"
          aria-label="GitHub"
        />
      </div>
      <div
        ref={bodyRef}
        className="text-sm whitespace-pre-wrap select-text font-sans"
        data-testid="github-comment-body"
      >
        {comment.body}
      </div>
      <button
        className="absolute top-2 right-2 p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity font-sans"
        onClick={() => quoteComment(comment.body)}
        title="Quote this comment"
      >
        <Quote className="w-3.5 h-3.5" />
      </button>
      <SelectionQuoteToolbar containerRef={bodyRef} onQuote={quoteComment} />
    </div>
  );
}
