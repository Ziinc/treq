import React from "react";
import { Pencil, X } from "lucide-react";
import { CommentEditInput } from "../CommentEditInput";
import { CommentInput } from "../CommentInput";
import type { LineComment } from "./types";

interface FileCommentSectionProps {
  comments: LineComment[];
  editingCommentId: string | null;
  showInput: boolean;
  onSubmit: (text: string) => void;
  onCancel: () => void;
  onStartEdit: (commentId: string) => void;
  onCancelEdit: () => void;
  onSaveEdit: (commentId: string, text: string) => void;
  onDelete: (commentId: string) => void;
}

const FileCommentSection: React.FC<FileCommentSectionProps> = ({
  comments,
  editingCommentId,
  showInput,
  onSubmit,
  onCancel,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onDelete,
}) => (
  <div className="border-b border-border bg-muted/20 px-4 py-3 space-y-3">
    {comments.map((comment) => {
      const isEditing = editingCommentId === comment.id;
      return (
        <div key={comment.id}>
          {isEditing ? (
            <div className="bg-background rounded-md p-[12px] border border-border/60">
              <CommentEditInput
                initialText={comment.text}
                onSave={(newText) => onSaveEdit(comment.id, newText)}
                onCancel={onCancelEdit}
                onDiscard={() => onDelete(comment.id)}
              />
            </div>
          ) : (
            <div
              data-testid="file-comment-card"
              className="group bg-background rounded-md p-[12px] border border-border/60 cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => onStartEdit(comment.id)}
            >
              <div className="flex items-start gap-2">
                <Pencil className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 mt-0.5" />
                <p className="font-sans text-sm whitespace-pre-wrap flex-1">
                  {comment.text}
                </p>
                <button
                  onClick={(event) => {
                    event.stopPropagation();
                    onDelete(comment.id);
                  }}
                  className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground flex-shrink-0"
                  title="Delete comment"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            </div>
          )}
        </div>
      );
    })}
    {showInput && <CommentInput onSubmit={onSubmit} onCancel={onCancel} />}
  </div>
);
FileCommentSection.displayName = "FileCommentSection";

export { FileCommentSection };
