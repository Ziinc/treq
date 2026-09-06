import { Loader2 } from "lucide-react";
import type { LinearComment } from "../lib/api-linear";
import { MarkdownContent } from "./MarkdownContent";

const HIGHLIGHT_CLASS =
  "bg-yellow-200/70 dark:bg-yellow-500/30 text-inherit rounded-sm px-0.5";

/**
 * Wraps each comment's quoted excerpt (Linear's inline "highlight and
 * comment" anchor) in a <mark> so it lines up with its card in the
 * right-hand comments column, Notion/Linear-style.
 */
function highlightQuotedText(
  content: string,
  comments: LinearComment[],
): string {
  let result = content;
  for (const comment of comments) {
    const quote = comment.quoted_text?.trim();
    if (!quote) continue;
    const index = result.indexOf(quote);
    if (index === -1) continue;
    const before = result.slice(0, index);
    const after = result.slice(index + quote.length);
    const safeId = comment.id.replace(/"/g, "&quot;");
    result = `${before}<mark class="${HIGHLIGHT_CLASS}" data-comment-id="${safeId}">${quote}</mark>${after}`;
  }
  return result;
}

export const LinearCommentedContent: React.FC<{
  content: string;
  comments: LinearComment[];
  isLoadingComments: boolean;
  commentsError?: unknown;
}> = ({ content, comments, isLoadingComments, commentsError }) => {
  const highlighted = highlightQuotedText(content, comments);

  return (
    <div
      className="flex gap-6 items-start"
      data-testid="linear-commented-content"
    >
      <div className="flex-1 min-w-0">
        <MarkdownContent content={highlighted} className="text-sm" />
      </div>

      <div
        className="w-64 shrink-0 flex flex-col gap-4 border-l border-border pl-4"
        data-testid="linear-comments-column"
      >
        <h3 className="text-xs font-medium text-muted-foreground uppercase">
          Comments
        </h3>

        {isLoadingComments && (
          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
        )}

        {commentsError !== undefined && commentsError !== null && (
          <p className="text-sm text-destructive">
            {commentsError instanceof Error
              ? commentsError.message
              : "Failed to load comments"}
          </p>
        )}

        {!isLoadingComments && !commentsError && comments.length === 0 && (
          <p className="text-sm text-muted-foreground">No comments</p>
        )}

        {comments.map((comment) => (
          <div
            key={comment.id}
            data-testid={`linear-comment-${comment.id}`}
            className="flex flex-col gap-1.5"
          >
            {comment.quoted_text && (
              <blockquote className="text-xs text-muted-foreground italic border-l-2 border-yellow-400/70 dark:border-yellow-500/50 pl-2">
                {comment.quoted_text}
              </blockquote>
            )}
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">
                {comment.user?.name ?? "Unknown"}
              </span>
              <span>{formatCommentTimestamp(comment.created_at)}</span>
            </div>
            <MarkdownContent
              content={comment.body}
              className="text-sm prose-p:my-1"
            />
          </div>
        ))}
      </div>
    </div>
  );
};

function formatCommentTimestamp(isoDate: string): string {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return isoDate;
  return date.toLocaleString();
}
