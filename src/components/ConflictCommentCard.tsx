import { memo, useState, useCallback } from "react";
import { Textarea } from "./ui/textarea";
import { Button } from "./ui/button";
import { Save, X } from "lucide-react";

interface ConflictComment {
  id: string;
  conflictId: string;
  filePath: string;
  conflictNumber: number;
  text: string;
  createdAt: string;
}

interface ConflictCommentCardProps {
  conflictId: string;
  filePath: string;
  conflictNumber: number;
  comment?: ConflictComment;
  onSave: (text: string) => void;
  onClear: () => void;
}

export const ConflictCommentCard = memo<ConflictCommentCardProps>(({
  comment,
  onSave,
  onClear,
}) => {
  const [text, setText] = useState(comment?.text || "");

  const handleSave = useCallback(() => {
    onSave(text);
  }, [text, onSave]);

  const handleClear = useCallback(() => {
    setText("");
    onClear();
  }, [onClear]);

  return (
    <div className="border-t border-border bg-muted/30 p-3">
      <div className="mb-2 text-xs text-muted-foreground">
        Describe how to resolve this conflict:
      </div>
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="e.g., 'Keep the changes from side 2, they have the correct implementation'"
        className="min-h-[80px] text-sm mb-2"
      />
      <div className="flex gap-2 justify-end">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleClear}
          disabled={!text.trim()}
        >
          <X className="w-4 h-4 mr-1" />
          Clear
        </Button>
        <Button
          variant="default"
          size="sm"
          onClick={handleSave}
          disabled={!text.trim()}
        >
          <Save className="w-4 h-4 mr-1" />
          Save
        </Button>
      </div>
    </div>
  );
});

ConflictCommentCard.displayName = "ConflictCommentCard";
