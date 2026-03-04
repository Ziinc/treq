import { memo, useCallback, useState } from "react";
import { type KeyboardEvent as ReactKeyboardEvent } from "react";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";

export interface CommentInputProps {
  onSubmit: (text: string) => void;
  onCancel: () => void;
  filePath?: string;
  startLine?: number;
  endLine?: number;
  /** When provided, shows "Plan" and "Edit" buttons instead of "Add Comment" */
  onSubmitWithMode?: (text: string, mode: "plan" | "acceptEdits") => void;
}

export const CommentInput: React.FC<CommentInputProps> = memo(
  ({ onSubmit, onCancel, filePath, startLine, endLine, onSubmitWithMode }) => {
    const [text, setText] = useState("");

    const handleSubmit = useCallback(() => {
      if (text.trim()) {
        onSubmit(text.trim());
      }
    }, [text, onSubmit]);

    const handleSubmitMode = useCallback(
      (mode: "plan" | "acceptEdits") => {
        if (text.trim() && onSubmitWithMode) {
          onSubmitWithMode(text.trim(), mode);
        }
      },
      [text, onSubmitWithMode]
    );

    const handleKeyDown = useCallback(
      (e: ReactKeyboardEvent<HTMLTextAreaElement>) => {
        // Stop propagation for standard text editing shortcuts
        if (e.metaKey || e.ctrlKey) {
          const key = e.key.toLowerCase();
          if (["a", "c", "x", "v", "z", "y"].includes(key)) {
            e.stopPropagation();
            return; // Let browser handle natively
          }
        }

        if (e.key === "Escape") {
          onCancel();
        } else if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
          if (onSubmitWithMode) {
            handleSubmitMode("acceptEdits");
          } else {
            handleSubmit();
          }
        }
      },
      [onCancel, handleSubmit, handleSubmitMode, onSubmitWithMode]
    );

    const lineLabel =
      startLine && endLine
        ? startLine === endLine
          ? `L${startLine}`
          : `L${startLine}-${endLine}`
        : null;

    return (
      <div className="bg-muted/60 border-y border-border/40 px-4 py-3 font-sans text-base">
        {filePath && lineLabel && (
          <div className="mb-2 text-md text-muted-foreground">
            {filePath}:{lineLabel}
          </div>
        )}
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Add a comment..."
          className="mb-2 font-sans"
          autoFocus
          onKeyDown={handleKeyDown}
        />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          {onSubmitWithMode ? (
            <>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => handleSubmitMode("plan")}
                disabled={!text.trim()}
              >
                Plan
              </Button>
              <Button
                size="sm"
                onClick={() => handleSubmitMode("acceptEdits")}
                disabled={!text.trim()}
              >
                Edit
              </Button>
            </>
          ) : (
            <Button onClick={handleSubmit} disabled={!text.trim()}>
              Add Comment
            </Button>
          )}
        </div>
      </div>
    );
  }
);
CommentInput.displayName = "CommentInput";
