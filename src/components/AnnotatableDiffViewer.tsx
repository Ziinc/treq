import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { BranchDiffFileDiff, BranchDiffHunk, DiffLineKind } from "../lib/api";
import type { ReviewComment } from "./MergeReviewPage";
import { cn } from "../lib/utils";
import { Textarea } from "./ui/textarea";
import { Button } from "./ui/button";
import { MessageCircle, Loader2, X } from "lucide-react";

export interface CommentInput {
  filePath: string;
  lineKey: string;
  lineLabel: string;
  kind: DiffLineKind;
  oldLine?: number | null;
  newLine?: number | null;
  lineText: string;
  text: string;
  contextBefore: string[];
  contextAfter: string[];
}

interface AnnotatableDiffViewerProps {
  diff?: BranchDiffFileDiff | null;
  comments: ReviewComment[];
  selectedCommentId?: string | null;
  isLoading?: boolean;
  onAddComment: (comment: CommentInput) => void;
  onSelectComment?: (commentId: string | null) => void;
}

interface DraftState {
  lineKey: string;
  lineLabel: string;
  kind: DiffLineKind;
  oldLine?: number | null;
  newLine?: number | null;
  lineText: string;
  contextBefore: string[];
  contextAfter: string[];
}

const lineKindStyles: Record<DiffLineKind, string> = {
  addition: "bg-green-500/10",
  deletion: "bg-red-500/10",
  context: "bg-transparent",
  meta: "bg-muted/40",
};

const lineKindPrefix: Record<DiffLineKind, string> = {
  addition: "+",
  deletion: "-",
  context: " ",
  meta: " ",
};

const formatLineLabel = (oldLine?: number | null, newLine?: number | null) => {
  if (typeof newLine === "number") {
    return `L${newLine}`;
  }
  if (typeof oldLine === "number") {
    return `L${oldLine}`;
  }
  return "Line";
};

export const AnnotatableDiffViewer: React.FC<AnnotatableDiffViewerProps> = ({
  diff,
  comments,
  selectedCommentId,
  isLoading = false,
  onAddComment,
  onSelectComment,
}) => {
  const [draft, setDraft] = useState<DraftState | null>(null);
  const [draftText, setDraftText] = useState("");
  const hoverTargetRef = useRef<DraftState | null>(null);

  const fileComments = useMemo(() => {
    if (!diff) return [];
    return comments.filter((comment) => comment.filePath === diff.path);
  }, [comments, diff]);

  const commentCountByLine = useMemo(() => {
    const map = new Map<string, number>();
    fileComments.forEach((comment) => {
      map.set(comment.lineKey, (map.get(comment.lineKey) || 0) + 1);
    });
    return map;
  }, [fileComments]);

  const handleStartDraft = useCallback((location: DraftState) => {
    setDraft(location);
    setDraftText("");
  }, []);

  const cancelDraft = useCallback(() => {
    setDraft(null);
    setDraftText("");
  }, []);

  const handleSubmitDraft = useCallback(() => {
    if (!draft || !draftText.trim()) {
      return;
    }

    onAddComment({
      filePath: diff?.path || "",
      lineKey: draft.lineKey,
      kind: draft.kind,
      oldLine: draft.oldLine,
      newLine: draft.newLine,
      lineLabel: draft.lineLabel,
      lineText: draft.lineText,
      text: draftText.trim(),
      contextBefore: draft.contextBefore,
      contextAfter: draft.contextAfter,
    });
    setDraft(null);
    setDraftText("");
  }, [draft, draftText, diff?.path, onAddComment]);

  useEffect(() => {
    const handleKeydown = (event: KeyboardEvent) => {
      // Skip keyboard shortcuts when user is typing in an input field
      const target = event.target as HTMLElement;
      const isEditableElement =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable;

      if (isEditableElement) {
        return;
      }

      if (event.key.toLowerCase() === "c" && !event.metaKey && !event.ctrlKey && !event.altKey) {
        if (!draft && hoverTargetRef.current) {
          event.preventDefault();
          handleStartDraft(hoverTargetRef.current);
        }
      }

      if (event.key === "Escape" && draft) {
        event.preventDefault();
        cancelDraft();
      }
    };

    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  }, [draft, handleStartDraft, cancelDraft]);

  useEffect(() => {
    if (!diff || !selectedCommentId) return;
    const targetComment = fileComments.find((comment) => comment.id === selectedCommentId);
    if (!targetComment) return;
    const element = document.getElementById(`line-${targetComment.lineKey}`);
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "center" });
      element.classList.add("ring", "ring-primary/40", "rounded-md");
      setTimeout(() => element.classList.remove("ring", "ring-primary/40"), 1200);
    }
  }, [diff, selectedCommentId, fileComments]);

  const buildContext = (
    lines: BranchDiffHunk["lines"],
    index: number,
    radius: number
  ) => {
    const before: string[] = [];
    const after: string[] = [];
    for (let offset = radius; offset > 0; offset -= 1) {
      const line = lines[index - offset];
      if (line) {
        before.push(`${lineKindPrefix[line.kind]}${line.content}`);
      }
    }
    for (let offset = 1; offset <= radius; offset += 1) {
      const line = lines[index + offset];
      if (line) {
        after.push(`${lineKindPrefix[line.kind]}${line.content}`);
      }
    }
    return { before, after };
  };

  const renderLineNumbers = (
    lineKey: string,
    oldLine?: number | null,
    newLine?: number | null,
    onClick?: () => void
  ) => (
    <div className="flex flex-col items-center text-[11px] text-muted-foreground">
      <button
        type="button"
        onClick={onClick}
        className="w-full text-left hover:text-foreground"
      >
        {typeof oldLine === "number" ? oldLine : ""}
      </button>
      <button
        type="button"
        onClick={onClick}
        className="w-full text-left hover:text-foreground"
      >
        {typeof newLine === "number" ? newLine : ""}
      </button>
      {commentCountByLine.get(lineKey) && (
        <div className="flex items-center gap-1 text-[10px] text-primary">
          <MessageCircle className="w-3 h-3" />
          {commentCountByLine.get(lineKey)}
        </div>
      )}
    </div>
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!diff) {
    return (
      <div className="p-6 text-center text-sm text-muted-foreground">
        Select a file from the tree to start the review.
      </div>
    );
  }

  if (diff.is_binary) {
    return (
      <div className="p-6 text-sm">
        <p className="font-medium">Binary file</p>
        <p className="text-muted-foreground">{diff.binary_message || "Binary files differ"}</p>
      </div>
    );
  }

  return (
    <div
      className="flex flex-col h-full overflow-hidden"
      onMouseLeave={() => {
        hoverTargetRef.current = null;
      }}
    >
      <div className="border-b px-4 py-3 flex items-center justify-between">
        <div>
          <p className="text-sm font-mono">{diff.path}</p>
          <p className="text-xs text-muted-foreground">Status: {diff.status}</p>
        </div>
        {diff.metadata.length > 0 && (
          <div className="text-[10px] text-muted-foreground text-right max-w-xs truncate">
            {diff.metadata.join(" · ")}
          </div>
        )}
      </div>
      <div className="flex-1 overflow-auto font-mono text-xs">
        {diff.hunks.map((hunk, hunkIndex) => (
          <div key={`${diff.path}-hunk-${hunkIndex}`} className="border-b border-border/60">
            <div className="bg-muted/60 px-4 py-1 text-[11px]">{hunk.header}</div>
            {hunk.lines.map((line, lineIndex) => {
              const lineKey = `${diff.path}:${hunkIndex}:${lineIndex}`;
              const lineLabel = formatLineLabel(line.old_line, line.new_line);
              const { before, after } = buildContext(hunk.lines, lineIndex, 3);
              const location: DraftState = {
                lineKey,
                lineLabel,
                kind: line.kind,
                oldLine: line.old_line,
                newLine: line.new_line,
                lineText: line.content,
                contextBefore: before,
                contextAfter: after,
              };

              return (
                <div
                  key={lineKey}
                  id={`line-${lineKey}`}
                  className={cn(
                    "grid grid-cols-[70px_1fr] gap-3 px-4 py-1 border-b border-border/40",
                    lineKindStyles[line.kind]
                  )}
                  onMouseEnter={() => {
                    hoverTargetRef.current = location;
                  }}
                >
                  {renderLineNumbers(lineKey, line.old_line, line.new_line, () => handleStartDraft(location))}
                  <div className="space-y-1">
                    <div className="flex items-start justify-between gap-2">
                      <pre className="whitespace-pre-wrap leading-relaxed flex-1">
                        <span className="text-muted-foreground">{lineKindPrefix[line.kind]}</span>
                        {line.content || " "}
                      </pre>
                      {draft?.lineKey === lineKey ? (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6"
                          onClick={cancelDraft}
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      ) : null}
                    </div>
                    {draft?.lineKey === lineKey && (
                      <div className="border rounded-md bg-background p-2 space-y-2">
                        <Textarea
                          placeholder="Add a comment"
                          value={draftText}
                          autoFocus
                          className="text-xs"
                          onChange={(event) => setDraftText(event.target.value)}
                          onKeyDown={(event) => {
                            if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                              event.preventDefault();
                              handleSubmitDraft();
                            }
                          }}
                        />
                        <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                          <span>{draft.lineLabel}</span>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="secondary"
                              className="h-7 text-xs"
                              onClick={cancelDraft}
                            >
                              Cancel
                            </Button>
                            <Button
                              size="sm"
                              className="h-7 text-xs"
                              disabled={!draftText.trim()}
                              onClick={handleSubmitDraft}
                            >
                              Comment
                            </Button>
                          </div>
                        </div>
                      </div>
                    )}

                    {fileComments
                      .filter((comment) => comment.lineKey === lineKey)
                      .map((comment) => (
                        <div
                          key={comment.id}
                          className={cn(
                            "border rounded-md bg-muted/60 p-2 text-[11px]",
                            selectedCommentId === comment.id && "ring-2 ring-primary/50"
                          )}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-medium">{comment.lineLabel}</span>
                            <button
                              type="button"
                              className="text-primary text-[10px]"
                              onClick={() => onSelectComment?.(comment.id)}
                            >
                              Jump
                            </button>
                          </div>
                          <p>{comment.text}</p>
                        </div>
                      ))}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
};
