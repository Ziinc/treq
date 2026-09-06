import { Loader2 } from "lucide-react";
import type { LinearComment } from "../lib/api-linear";
import { MarkdownContent } from "./MarkdownContent";

export const LinearComments: React.FC<{
  comments: LinearComment[];
  isLoading: boolean;
  error?: unknown;
  emptyLabel?: string;
}> = ({ comments, isLoading, error, emptyLabel = "No comments" }) => {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <p className="text-sm text-destructive">
        {error instanceof Error ? error.message : "Failed to load comments"}
      </p>
    );
  }

  if (comments.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyLabel}</p>;
  }

  return (
    <div className="flex flex-col gap-4" data-testid="linear-comments-list">
      {comments.map((comment) => (
        <div key={comment.id} className="flex flex-col gap-1">
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
  );
};

function formatCommentTimestamp(isoDate: string): string {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return isoDate;
  return date.toLocaleString();
}
