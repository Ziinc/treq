import { memo } from "react";
import { cn } from "../lib/utils";

export interface JjFileChange {
  path: string;
  status: string;
  previous_path?: string | null;
}

export interface GitFileRowProps {
  file: JjFileChange;
  isSelected?: boolean;
  isActive?: boolean;
  readOnly?: boolean;
  onFileClick?: (path: string, event: React.MouseEvent) => void;
}

function formatFileLabel(filePath: string) {
  const parts = filePath.split("/");
  const name = parts.pop() || filePath;
  const directory = parts.length > 0 ? parts.join("/") : null;
  return { name, directory };
}

export const GitFileRow = memo<GitFileRowProps>(({
  file,
  isSelected = false,
  isActive = false,
  onFileClick,
}) => {
  const label = formatFileLabel(file.path);
  const status = file.status;

  return (
    <div
      className={cn(
        "group/row relative  py-1 text-sm flex items-center gap-1 cursor-pointer",
        isSelected ? "bg-accent/40" : "hover:bg-accent/30"
      )}
      onClick={(e) => {
        onFileClick?.(file.path, e);
      }}
      title={file.path}
    >
      <div className="ml-1 flex-1 flex items-center gap-2 min-w-0 font-mono">
        <span className={cn("font-medium truncate flex-shrink-0", isActive && "text-blue-500")}>{label.name}</span>
        {label.directory && (
          <span className={cn("text-muted-foreground/60 truncate text-xs", isActive && "text-blue-400")}>{label.directory}</span>
        )}
      </div>
      <div className="flex items-center flex-shrink-0">
        <span
          className="text-sm font-mono min-w-[1ch] text-muted-foreground"
        >
          {status ?? ""}
        </span>
      </div>
    </div>
  );
});

GitFileRow.displayName = "GitFileRow";
