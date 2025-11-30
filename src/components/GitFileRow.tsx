import { memo } from "react";
import { Loader2, Minus, Plus } from "lucide-react";
import { cn } from "../lib/utils";
import { formatFileLabel, type ParsedFileChange } from "../lib/git-utils";

export interface GitFileRowProps {
  file: ParsedFileChange;
  isStaged: boolean;
  isSelected?: boolean;
  isBusy?: boolean;
  readOnly?: boolean;
  onFileClick?: (path: string, event: React.MouseEvent) => void;
  onStage?: (path: string) => void;
  onUnstage?: (path: string) => void;
}

export const GitFileRow = memo<GitFileRowProps>(({
  file,
  isStaged,
  isSelected = false,
  isBusy = false,
  readOnly = false,
  onFileClick,
  onStage,
  onUnstage,
}) => {
  const label = formatFileLabel(file.path);
  const showActionButton = !readOnly && (isStaged ? onUnstage : onStage);
  const status = isStaged
    ? file.stagedStatus ?? file.worktreeStatus
    : file.worktreeStatus ?? file.stagedStatus;

  return (
    <div
      className={cn(
        "group/row relative pl-1 pr-3 py-1.5 text-xs flex items-center gap-1",
        isSelected ? "bg-accent/40" : "hover:bg-accent/30"
      )}
    >
      <div className="w-4 flex-shrink-0" />
      <button
        type="button"
        className="flex-1 text-left flex items-center gap-2 min-w-0"
        onClick={(e) => onFileClick?.(file.path, e)}
        title={file.path}
      >
        <span className="font-medium truncate flex-shrink-0">{label.name}</span>
        {label.directory && (
          <span className="text-muted-foreground truncate">{label.directory}</span>
        )}
      </button>
      <div className="flex items-center gap-1.5 flex-shrink-0">
        {showActionButton && (
          <button
            type="button"
            className={cn(
              "p-0.5 rounded hover:bg-accent",
              "invisible group-hover/row:visible",
              isBusy && "visible"
            )}
            onClick={() =>
              isStaged ? onUnstage?.(file.path) : onStage?.(file.path)
            }
            disabled={isBusy}
            title={isStaged ? "Unstage file" : "Stage file"}
          >
            {isBusy ? (
              <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
            ) : isStaged ? (
              <Minus className="w-3 h-3 text-muted-foreground" />
            ) : (
              <Plus className="w-3 h-3 text-muted-foreground" />
            )}
          </button>
        )}
        <span
          className={cn(
            "text-[10px] font-mono min-w-[1ch]",
            isStaged ? "text-emerald-400" : "text-muted-foreground"
          )}
        >
          {status ?? ""}
        </span>
      </div>
    </div>
  );
});

GitFileRow.displayName = "GitFileRow";
