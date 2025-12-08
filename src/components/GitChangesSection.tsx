import { memo } from "react";
import { ArrowRight, ChevronDown, ChevronRight, Plus, Minus, Undo2 } from "lucide-react";
import { GitFileRow } from "./GitFileRow";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "./ui/tooltip";
import type { ParsedFileChange } from "../lib/git-utils";

export interface GitChangesSectionProps {
  title: string;
  files: ParsedFileChange[];
  isStaged: boolean;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  fileActionTarget?: string | null;
  readOnly?: boolean;
  selectedFiles?: Set<string>;
  onFileSelect?: (path: string, event: React.MouseEvent) => void;
  onMoveToWorkspace?: () => void;
  onStage?: (path: string) => void;
  onUnstage?: (path: string) => void;
  onStageAll?: () => void;
  onUnstageAll?: () => void;
  onDiscardAll?: () => void;
}

export const GitChangesSection = memo<GitChangesSectionProps>(({
  title,
  files,
  isStaged,
  isCollapsed,
  onToggleCollapse,
  fileActionTarget,
  readOnly = false,
  selectedFiles,
  onFileSelect,
  onMoveToWorkspace,
  onStage,
  onUnstage,
  onStageAll,
  onUnstageAll,
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
            {!readOnly && hasFiles && !isStaged && (
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
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className="p-1 hover:text-foreground hover:bg-muted rounded transition-colors"
                      onClick={(e) => {
                        e.stopPropagation();
                        onStageAll?.();
                      }}
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">Stage all changes</TooltipContent>
                </Tooltip>
              </>
            )}
            {!readOnly && hasFiles && isStaged && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="p-1 hover:text-foreground hover:bg-muted rounded transition-colors"
                    onClick={(e) => {
                      e.stopPropagation();
                      onUnstageAll?.();
                    }}
                  >
                    <Minus className="w-3 h-3" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Unstage all changes</TooltipContent>
              </Tooltip>
            )}
            <span className="ml-1">{files.length}</span>
          </div>
        </TooltipProvider>
      </div>
      {!isCollapsed && files.length > 0 && (
        <div className="mt-2 overflow-hidden">
          {files.map((file) => (
            <GitFileRow
              key={`${isStaged ? "staged" : "unstaged"}-${file.path}`}
              file={file}
              isStaged={isStaged}
              isSelected={!isStaged && selectedFiles?.has(file.path) || false}
              isBusy={fileActionTarget === file.path}
              readOnly={readOnly}
              onFileClick={onFileSelect}
              onStage={onStage}
              onUnstage={onUnstage}
            />
          ))}
        </div>
      )}
    </div>
  );
});

GitChangesSection.displayName = "GitChangesSection";
