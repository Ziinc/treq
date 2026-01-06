import { memo } from "react";
import { ArrowRight, ChevronDown, ChevronRight, Undo2, Minus } from "lucide-react";
import { GitFileRow } from "./GitFileRow";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "./ui/tooltip";
import type { ParsedFileChange } from "../lib/git-utils";
import type { JjFileChange } from "../lib/api";

export interface ChangesSectionProps {
  title: string;
  files: ParsedFileChange[];
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  fileActionTarget?: string | null;
  readOnly?: boolean;
  activeFilePath?: string | null;
  selectedFiles?: Set<string>;
  lastSelectedPath?: string | null;
  onFileSelect?: (path: string, event: React.MouseEvent) => void;
  onMoveToWorkspace?: () => void;
  onDiscardAll?: () => void;
  discardAllLabel?: string;
  onDiscard?: (path: string) => void;
  onDeselectAll?: () => void;
  onStage?: (path: string) => void;
  onUnstage?: (path: string) => void;
  onUnstageAll?: () => void;
  isStaged?: boolean;
}

export const ChangesSection = memo<ChangesSectionProps>(({
  title,
  files,
  isCollapsed,
  onToggleCollapse,
  readOnly = false,
  activeFilePath,
  selectedFiles,
  lastSelectedPath,
  onFileSelect,
  onMoveToWorkspace,
  onDiscardAll,
  discardAllLabel = "Discard all changes",
  onDiscard,
  onDeselectAll,
  onStage,
  onUnstage,
  onUnstageAll,
  isStaged = false,
}) => {
  const hasFiles = files.length > 0;
  const hasSelectedFiles = selectedFiles && selectedFiles.size > 0;

  return (
    <div
      className="mt-4"
      onClick={(e) => {
        // Deselect files when clicking on the section header or empty area
        if (
          e.target === e.currentTarget ||
          (e.target as HTMLElement)?.closest(".flex.items-center.justify-between")
        ) {
          onDeselectAll?.();
        }
      }}
    >
      <div className="flex items-center justify-between w-full text-sm uppercase tracking-wide text-muted-foreground">
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
                  <TooltipContent side="bottom">{discardAllLabel}</TooltipContent>
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
                {isStaged && hasFiles && onUnstageAll && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        className="p-1 hover:text-foreground hover:bg-muted rounded transition-colors"
                        onClick={(e) => {
                          e.stopPropagation();
                          onUnstageAll();
                        }}
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">Unselect all changes</TooltipContent>
                  </Tooltip>
                )}
              </>
            )}
            <span className="ml-1">{files.length}</span>
          </div>
        </TooltipProvider>
      </div>
      {!isCollapsed && files.length > 0 && (
        <div
          className="mt-2 overflow-hidden select-none font-sans"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              onDeselectAll?.();
            }
          }}
        >
          {files.map((file) => (
            <GitFileRow
              key={file.path}
              file={file as JjFileChange}
              isSelected={selectedFiles?.has(file.path) || false}
              isActive={activeFilePath === file.path}
              isLastSelected={lastSelectedPath === file.path}
              readOnly={readOnly}
              onFileClick={onFileSelect}
              onDiscard={onDiscard}
              onStage={onStage}
              onUnstage={onUnstage}
              isStaged={isStaged}
            />
          ))}
        </div>
      )}
    </div>
  );
});

ChangesSection.displayName = "ChangesSection";
