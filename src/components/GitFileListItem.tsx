import { memo } from "react";
import { cn } from "../lib/utils";
import { Circle, CheckCircle2, Minus, Plus, Loader2 } from "lucide-react";

interface GitFileListItemProps {
  file: string;
  status: string;
  isStaged: boolean;
  isSelected?: boolean;
  isBusy?: boolean;
  onClick?: () => void;
  onStage?: () => void;
  onUnstage?: () => void;
  readOnly?: boolean;
}

const getStatusColor = (status: string) => {
  switch (status) {
    case "M":
      return "text-yellow-600 dark:text-yellow-400";
    case "A":
      return "text-green-600 dark:text-green-400";
    case "D":
      return "text-red-600 dark:text-red-400";
    case "R":
      return "text-blue-600 dark:text-blue-400";
    case "??":
      return "text-purple-600 dark:text-purple-400";
    default:
      return "text-muted-foreground";
  }
};

const getStatusLabel = (status: string) => {
  switch (status) {
    case "M":
      return "M";
    case "A":
      return "A";
    case "D":
      return "D";
    case "R":
      return "R";
    case "??":
      return "U";
    default:
      return status;
  }
};

export const GitFileListItem: React.FC<GitFileListItemProps> = memo(
  ({ file, status, isStaged, isSelected, isBusy, onClick, onStage, onUnstage, readOnly }) => {
    const fileName = file.split("/").pop() || file;
    const filePath = file.substring(0, file.lastIndexOf("/")) || "";

    return (
      <div
        className={cn(
          "group flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-accent/50 cursor-pointer border-b border-border/40 last:border-b-0",
          isSelected && "bg-accent/70"
        )}
        onClick={onClick}
      >
        {isStaged ? (
          <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400 flex-shrink-0" />
        ) : (
          <Circle className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        )}

        <div className="flex-1 min-w-0">
          <div className="font-medium truncate">{fileName}</div>
          {filePath && <div className="text-xs text-muted-foreground truncate">{filePath}</div>}
        </div>

        <span className={cn("text-xs font-mono font-semibold flex-shrink-0", getStatusColor(status))}>
          {getStatusLabel(status)}
        </span>

        {!readOnly && (
          <button
            className="p-1 rounded hover:bg-background/60 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
            onClick={(e) => {
              e.stopPropagation();
              if (isStaged) {
                onUnstage?.();
              } else {
                onStage?.();
              }
            }}
            disabled={isBusy}
            title={isStaged ? "Unstage file" : "Stage file"}
          >
            {isBusy ? (
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            ) : isStaged ? (
              <Minus className="w-4 h-4 text-muted-foreground" />
            ) : (
              <Plus className="w-4 h-4 text-muted-foreground" />
            )}
          </button>
        )}
      </div>
    );
  }
);

GitFileListItem.displayName = "GitFileListItem";
