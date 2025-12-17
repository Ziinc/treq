import { memo } from "react";
import { ArrowRight, ChevronDown, ChevronRight, Undo2 } from "lucide-react";
import { GitFileRow } from "./GitFileRow";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "./ui/tooltip";
import type { ParsedFileChange } from "../lib/git-utils";

export interface ChangesSectionProps {
  title: string;
  files: ParsedFileChange[];
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  fileActionTarget?: string | null;
  readOnly?: boolean;
  activeFilePath?: string | null;
  selectedFiles?: Set<string>;
  onFileSelect?: (path: string, event: React.MouseEvent) => void;
  onMoveToWorkspace?: () => void;
  onDiscardAll?: () => void;
}

export const ChangesSection = memo<ChangesSectionProps>(({
  title,
  files,
  isCollapsed,
  onToggleCollapse,
  fileActionTarget,
  readOnly = false,
  activeFilePath,
  selectedFiles,
  onFileSelect,
  onMoveToWorkspace,
  onDiscardAll,
}) => {
  const hasFiles = files.length > 0;
  const hasSelectedFiles = selectedFiles && selectedFiles.size > 0;

  return (
    <div className="mt-4">
      <div className="flex items-center justify-between w-full text-xs uppercase tracking-wide text-muted-foreground">
        <button
          type="button"
          className="flex items-center gap-1 hover:text-foreground transition-colors"
          onClick={onToggleCollapse}
        >
          {isCollapsed ? (
            <ChevronRight className="w-3 h-3" />
          ) : (
            <ChevronDown className="w-3 h-3" />
          )}
          <span>{title}</span>
        </button>
        <TooltipProvider>
          <div className="flex items-center gap-1">
            {!readOnly && hasFiles && (
              <>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className="p-1 hover:text-foreground hover:bg-muted rounded transition-colors"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDiscardAll?.();
                      }}
                    >
                      <Undo2 className="w-3 h-3" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">Discard all changes</TooltipContent>
                </Tooltip>
                {hasSelectedFiles && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        className="p-1 hover:text-foreground hover:bg-primary/20 bg-primary/10 rounded transition-colors text-primary"
                        onClick={(e) => {
                          e.stopPropagation();
                          onMoveToWorkspace?.();
                        }}
                      >
                        <ArrowRight className="w-3 h-3" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">
                      Move {selectedFiles?.size} file(s) to new workspace
                    </TooltipContent>
                  </Tooltip>
                )}
              </>
            )}
            <span className="ml-1">{files.length}</span>
          </div>
        </TooltipProvider>
      </div>
      {!isCollapsed && files.length > 0 && (
        <div className="mt-2 overflow-hidden">
          {files.map((file) => (
            <GitFileRow
              key={file.path}
              file={file}
              isStaged={false}
              isSelected={selectedFiles?.has(file.path) || false}
              isActive={activeFilePath === file.path}
              isBusy={fileActionTarget === file.path}
              readOnly={readOnly}
              onFileClick={onFileSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
});

ChangesSection.displayName = "ChangesSection";
