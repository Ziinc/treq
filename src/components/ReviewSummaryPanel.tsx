import type { ReviewComment } from "./AnnotatableDiffViewer";
import { Textarea } from "./ui/textarea";
import { Button } from "./ui/button";
import { MessageCircle, Trash2 } from "lucide-react";
import { cn } from "../lib/utils";

interface ReviewSummaryPanelProps {
  workspaceBranch: string;
  baseBranch: string;
  comments: ReviewComment[];
  selectedCommentId?: string | null;
  overallComment: string;
  onOverallCommentChange: (value: string) => void;
  onSelectComment: (commentId: string | null) => void;
  onDeleteComment: (commentId: string) => void;
  onRequestChanges: () => void;
  onMerge: () => void;
  isRequestingChanges?: boolean;
  commitCount?: number;
}

export const ReviewSummaryPanel: React.FC<ReviewSummaryPanelProps> = ({
  workspaceBranch,
  baseBranch,
  comments,
  selectedCommentId,
  overallComment,
  onOverallCommentChange,
  onSelectComment,
  onDeleteComment,
  onRequestChanges,
  onMerge,
  isRequestingChanges = false,
  commitCount = 0,
}) => {
  return (
    <div className="h-full flex flex-col border-l bg-card">
      <div className="p-4 border-b space-y-2">
        <div>
          <p className="text-sm text-muted-foreground">Reviewing</p>
          <p className="font-medium text-sm">{workspaceBranch} → {baseBranch}</p>
        </div>
        <div className="text-sm text-muted-foreground">
          {commitCount} commit{commitCount === 1 ? "" : "s"}
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4 space-y-4">
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold">Line Comments</span>
            <span className="text-sm text-muted-foreground">{comments.length}</span>
          </div>
          {comments.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No inline comments yet. Click on a line number to leave feedback.
            </p>
          ) : (
            <div className="space-y-3">
              {comments.map((comment) => (
                <div
                  key={comment.id}
                  className={cn(
                    "border rounded-md p-2 text-sm space-y-1",
                    selectedCommentId === comment.id && "border-primary"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <button
                      type="button"
                      className="flex items-center gap-1 font-medium"
                      onClick={() => onSelectComment(comment.id)}
                    >
                      <MessageCircle className="w-3 h-3" />
                      {comment.filePath}
                    </button>
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                      <span>{comment.lineLabel}</span>
                      <button
                        type="button"
                        onClick={() => onDeleteComment(comment.id)}
                        className="text-destructive"
                        title="Delete comment"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                  <pre className="bg-muted rounded px-2 py-1 whitespace-pre-wrap overflow-auto">
                    {comment.lineText || "(empty line)"}
                  </pre>
                  <p className="font-sans">{comment.text}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <p className="text-sm font-semibold mb-2">Overall Review Comment</p>
          <Textarea
            placeholder="Summarize your review"
            value={overallComment}
            onChange={(event) => onOverallCommentChange(event.target.value)}
            className="text-sm"
          />
        </div>
      </div>

      <div className="border-t p-4 space-y-3">
        <p className="text-sm text-muted-foreground">
          Merge or send feedback to terminal
        </p>
        <div className="flex flex-col gap-2">
          <Button onClick={onMerge}>
            Merge
          </Button>
          <Button
            variant="outline"
            onClick={onRequestChanges}
            disabled={isRequestingChanges || (comments.length === 0 && !overallComment.trim())}
          >
            {isRequestingChanges ? "Formatting review..." : "Request Changes"}
          </Button>
        </div>
      </div>
    </div>
  );
};
