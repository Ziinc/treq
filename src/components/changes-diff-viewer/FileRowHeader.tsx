import React from "react";
import {
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  MessageSquarePlus,
  MoreVertical,
  Square,
} from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { FileContextMenu } from "../FileContextMenu";
import type { useToast } from "../ui/toast";
import { cn, copyTextToClipboard } from "../../lib/utils";
import { isBinaryFile, type ParsedFileChange } from "../../lib/git-utils";
import { useEditorApps } from "../../hooks/useEditorApps";

interface FileRowHeaderProps {
  file: ParsedFileChange;
  filePath: string;
  isCollapsed: boolean;
  isRename: boolean;
  isViewed: boolean;
  additions: number;
  deletions: number;
  readOnly: boolean;
  fileActionTarget: string | null;
  selectedUnstagedFiles: Set<string>;
  workspacePath: string;
  toggleFileCollapse: (filePath: string) => void;
  handleMarkFileViewed: (filePath: string) => void;
  handleUnmarkFileViewed: (filePath: string) => void;
  handleDiscardFiles: (filePath: string) => void;
  addToast: ReturnType<typeof useToast>["addToast"];
  onAddFileComment: () => void;
}

const FileRowHeader: React.FC<FileRowHeaderProps> = ({
  file,
  filePath,
  isCollapsed,
  isRename,
  isViewed,
  additions,
  deletions,
  readOnly,
  fileActionTarget,
  selectedUnstagedFiles,
  workspacePath,
  toggleFileCollapse,
  handleMarkFileViewed,
  handleUnmarkFileViewed,
  handleDiscardFiles,
  addToast,
  onAddFileComment,
}) => {
  const editorApps = useEditorApps();

  return (
    <FileContextMenu filePath={filePath} workspacePath={workspacePath}>
      <div className="sticky top-0 z-10 flex items-center justify-between px-[16px] py-[8px] bg-muted border-b border-border">
        <div className="flex items-center gap-[8px] flex-1 min-w-0">
          {isRename ? (
            <span className="w-3 h-3 flex-shrink-0" />
          ) : (
            <button
              role="button"
              aria-label={
                isCollapsed ? "Expand file diff" : "Collapse file diff"
              }
              className="p-0 border-0 bg-transparent cursor-pointer"
              onClick={(event) => {
                event.stopPropagation();
                toggleFileCollapse(filePath);
              }}
            >
              {isCollapsed ? (
                <ChevronRight className="w-3 h-3 flex-shrink-0" />
              ) : (
                <ChevronDown className="w-3 h-3 flex-shrink-0" />
              )}
            </button>
          )}
          <div className="min-w-0 flex-1 flex items-center gap-[6px]">
            <span className="text-sm text-muted-foreground truncate font-mono">
              {isRename
                ? `${file.oldPath} => ${filePath.replace(/\/+$/, "")}`
                : filePath.replace(/\/+$/, "")}
            </span>
            <button
              type="button"
              aria-label="Copy file path"
              title="Copy file path"
              className="text-muted-foreground hover:text-foreground flex-shrink-0"
              onClick={async (event) => {
                event.stopPropagation();
                try {
                  await copyTextToClipboard(filePath);
                  addToast({
                    description: "File path copied to clipboard",
                    title: "Copied",
                    type: "success",
                  });
                } catch (error) {
                  addToast({
                    description:
                      error instanceof Error ? error.message : String(error),
                    title: "Copy Failed",
                    type: "error",
                  });
                }
              }}
            >
              <Copy className="w-4 h-4" />
            </button>
          </div>
        </div>
        <div className="flex items-center gap-[8px]">
          {!readOnly && (
            <button
              onClick={(event) => {
                event.stopPropagation();
                onAddFileComment();
              }}
              className="p-[4px] rounded hover:bg-accent text-muted-foreground hover:text-foreground"
              title="Add file comment"
              data-testid="add-file-comment-button"
            >
              <MessageSquarePlus className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            role="checkbox"
            aria-checked={isViewed}
            aria-label="Viewed"
            onClick={(event) => {
              event.stopPropagation();
              if (isViewed) {
                handleUnmarkFileViewed(filePath);
              } else {
                handleMarkFileViewed(filePath);
              }
            }}
            className={cn(
              "flex items-center gap-[4px] px-[8px] py-[2px] rounded text-sm transition-colors",
              isViewed
                ? "bg-emerald-500/25 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/35"
                : "bg-muted hover:bg-accent text-muted-foreground hover:text-foreground",
            )}
            title={isViewed ? "Mark as not viewed" : "Mark as viewed"}
          >
            {isViewed ? (
              <Check className="w-3 h-3" />
            ) : (
              <Square className="w-3 h-3" />
            )}
            <span>Viewed</span>
          </button>
          {isRename && (
            <span className="text-sm px-[8px] py-[2px] rounded bg-blue-500/25 text-blue-700 dark:text-blue-300">
              Renamed
            </span>
          )}
          {isBinaryFile(filePath) && (
            <span className="text-sm px-[8px] py-[2px] rounded bg-zinc-500/25 text-zinc-700 dark:text-zinc-300">
              Binary
            </span>
          )}
          {(additions > 0 || deletions > 0) && (
            <span className="text-sm font-mono flex items-center gap-[4px]">
              <span className="text-emerald-700 dark:text-emerald-300">
                +{additions}
              </span>
              <span className="text-red-700 dark:text-red-300">
                -{deletions}
              </span>
            </span>
          )}
          {!readOnly && (
            <DropdownMenu>
              <DropdownMenuTrigger
                asChild
                onClick={(event) => event.stopPropagation()}
              >
                <button className="p-[4px] rounded hover:bg-accent">
                  <MoreVertical className="w-3 h-3" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" sideOffset={4}>
                {(file.workspaceStatus || file.stagedStatus) && (
                  <>
                    <DropdownMenuItem
                      onSelect={(event) => {
                        event.preventDefault();
                        handleDiscardFiles(filePath);
                      }}
                      disabled={fileActionTarget === filePath}
                      className="text-red-700 dark:text-red-300 focus:text-red-700 dark:focus:text-red-300"
                    >
                      {selectedUnstagedFiles.has(filePath) &&
                      selectedUnstagedFiles.size > 1
                        ? `Discard ${selectedUnstagedFiles.size} files`
                        : "Discard file"}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                  </>
                )}

                {editorApps.cursor && (
                  <DropdownMenuItem
                    onSelect={async (event) => {
                      event.preventDefault();
                      try {
                        await openUrl(
                          `cursor://file/${workspacePath}/${filePath}`,
                        );
                      } catch (err) {
                        const msg =
                          err instanceof Error ? err.message : String(err);
                        addToast({
                          description: msg,
                          title: "Open Failed",
                          type: "error",
                        });
                      }
                    }}
                  >
                    Open in Cursor
                  </DropdownMenuItem>
                )}

                {editorApps.vscode && (
                  <DropdownMenuItem
                    onSelect={async (event) => {
                      event.preventDefault();
                      try {
                        await openUrl(
                          `vscode://file/${workspacePath}/${filePath}`,
                        );
                      } catch (err) {
                        const msg =
                          err instanceof Error ? err.message : String(err);
                        addToast({
                          description: msg,
                          title: "Open Failed",
                          type: "error",
                        });
                      }
                    }}
                  >
                    Open in VSCode
                  </DropdownMenuItem>
                )}

                {editorApps.zed && (
                  <DropdownMenuItem
                    onSelect={async (event) => {
                      event.preventDefault();
                      try {
                        await openUrl(
                          `zed://file/${workspacePath}/${filePath}`,
                        );
                      } catch (err) {
                        const msg =
                          err instanceof Error ? err.message : String(err);
                        addToast({
                          description: msg,
                          title: "Open Failed",
                          type: "error",
                        });
                      }
                    }}
                  >
                    Open in Zed
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
    </FileContextMenu>
  );
};
FileRowHeader.displayName = "FileRowHeader";

export { FileRowHeader };
