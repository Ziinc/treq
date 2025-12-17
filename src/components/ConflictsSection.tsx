import { memo } from "react";
import { AlertTriangle, ChevronDown, ChevronRight, FileWarning } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "./ui/tooltip";

export interface ConflictsSectionProps {
  files: string[];
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onFileSelect?: (path: string) => void;
  activeFilePath?: string | null;
}

export const ConflictsSection = memo<ConflictsSectionProps>(({
  files,
  isCollapsed,
  onToggleCollapse,
  onFileSelect,
  activeFilePath,
}) => {
  if (files.length === 0) {
    return null;
  }

  return (
    <div className="mb-4 border border-destructive/30 rounded-md bg-destructive/5">
      <div className="flex items-center justify-between w-full px-4 py-3">
        <button
          type="button"
          className="flex items-center gap-2 text-sm font-medium text-destructive hover:text-destructive/80 transition-colors"
          onClick={onToggleCollapse}
        >
          {isCollapsed ? (
            <ChevronRight className="w-4 h-4" />
          ) : (
            <ChevronDown className="w-4 h-4" />
          )}
          <AlertTriangle className="w-4 h-4" />
          <span>Conflicts</span>
        </button>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-destructive font-medium">{files.length}</span>
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {files.length} file(s) with conflicts
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
      {!isCollapsed && (
        <div className="px-4 pb-3 space-y-1">
          {files.map((file) => (
            <button
              key={file}
              type="button"
              className={`
                w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded
                transition-colors text-left font-mono
                ${
                  activeFilePath === file
                    ? "bg-destructive/20 text-foreground"
                    : "text-muted-foreground hover:bg-destructive/10 hover:text-foreground"
                }
              `}
              onClick={() => onFileSelect?.(file)}
            >
              <FileWarning className="w-4 h-4 text-destructive flex-shrink-0" />
              <span className="truncate">{file}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
});

ConflictsSection.displayName = "ConflictsSection";
