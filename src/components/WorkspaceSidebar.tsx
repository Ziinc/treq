import { useQuery } from "@tanstack/react-query";
import { useCallback, memo, useMemo } from "react";
import { Workspace, getWorkspaces, listConflictedWorkspaceIds, listWorkspacesWithChanges } from "../lib/api";
import {
  buildWorkspaceTree,
  flattenWorkspaceTree,
} from "../lib/workspace-tree";
import {
  Settings,
  Home,
  Search,
  GitBranch,
  Trash2,
  AlertTriangle,
  CircleDot,
  Copy,
  FolderOpen,
  CornerLeftUp,
} from "lucide-react";
import { Button } from "./ui/button";
import { GitBranchPlusIcon } from "./ui/icons";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./ui/tooltip";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
  ContextMenuSub,
  ContextMenuSubTrigger,
  ContextMenuSubContent,
  ContextMenuSeparator,
} from "./ui/context-menu";
import { getWorkspaceTitle as getWorkspaceTitleFromUtils } from "../lib/workspace-utils";
import { revealItemInDir, openUrl } from "@tauri-apps/plugin-opener";
import { useEditorApps } from "../hooks/useEditorApps";

interface WorkspaceSidebarProps {
  repoPath?: string;
  currentBranch?: string | null;
  selectedWorkspaceId?: number | null;
  selectedWorkspaceIds?: Set<number>;
  onWorkspaceClick?: (workspace: Workspace) => void;
  onWorkspaceMultiSelect?: (workspace: Workspace | null, event: React.MouseEvent) => void;
  onBulkDelete?: () => void;
  onDeleteWorkspace?: (workspace: Workspace) => void;
  onCreateWorkspace?: () => void;
  openSettings?: (tab?: string) => void;
  navigateToDashboard?: () => void;
  onOpenCommandPalette?: () => void;
  onOpenBranchSwitcher?: () => void;
  currentPage?: "settings" | "session" | null;
}

// Note: StatusPill simplified - git status checking removed
const StatusPill: React.FC<{ path: string }> = memo(() => {
  // Would need JJ status equivalent
  return null;
});

// Shared context menu items for both home repo and workspaces
const PathContextMenuItems: React.FC<{
  relativePath: string;
  fullPath: string;
  additionalItems?: React.ReactNode;
}> = ({ relativePath, fullPath, additionalItems }) => {
  const editorApps = useEditorApps();

  return (
    <>
      <ContextMenuItem
        onClick={() => {
          navigator.clipboard.writeText(relativePath);
        }}
      >
        <Copy className="w-4 h-4 mr-2" />
        Copy relative path
      </ContextMenuItem>
      <ContextMenuItem
        onClick={() => {
          navigator.clipboard.writeText(fullPath);
        }}
      >
        <Copy className="w-4 h-4 mr-2" />
        Copy full path
      </ContextMenuItem>
      <ContextMenuSub>
        <ContextMenuSubTrigger>
          <FolderOpen className="w-4 h-4 mr-2" />
          Open in...
        </ContextMenuSubTrigger>
        <ContextMenuSubContent>
          <ContextMenuItem
            onClick={() => {
              revealItemInDir(fullPath);
            }}
          >
            <FolderOpen className="w-4 h-4 mr-2" />
            Open in Finder
          </ContextMenuItem>

          {editorApps.cursor && (
            <ContextMenuItem
              onClick={async () => {
                try {
                  await openUrl(`cursor://file/${fullPath}`);
                } catch (err) {
                  console.error("Failed to open in Cursor:", err);
                }
              }}
            >
              Open in Cursor
            </ContextMenuItem>
          )}

          {editorApps.vscode && (
            <ContextMenuItem
              onClick={async () => {
                try {
                  await openUrl(`vscode://file/${fullPath}`);
                } catch (err) {
                  console.error("Failed to open in VSCode:", err);
                }
              }}
            >
              Open in VSCode
            </ContextMenuItem>
          )}

          {editorApps.zed && (
            <ContextMenuItem
              onClick={async () => {
                try {
                  await openUrl(`zed://file/${fullPath}`);
                } catch (err) {
                  console.error("Failed to open in Zed:", err);
                }
              }}
            >
              Open in Zed
            </ContextMenuItem>
          )}
        </ContextMenuSubContent>
      </ContextMenuSub>
      {additionalItems}
    </>
  );
};

export const WorkspaceSidebar: React.FC<WorkspaceSidebarProps> = memo(
  ({
    repoPath,
    currentBranch,
    selectedWorkspaceId,
    selectedWorkspaceIds,
    onWorkspaceClick,
    onWorkspaceMultiSelect,
    onBulkDelete,
    onDeleteWorkspace,
    onCreateWorkspace,
    openSettings,
    navigateToDashboard: _navigateToDashboard,
    onOpenCommandPalette,
    onOpenBranchSwitcher,
    currentPage,
  }) => {
    const { data: workspaces = [] } = useQuery({
      queryKey: ["workspaces", repoPath],
      queryFn: () => getWorkspaces(repoPath || ""),
      enabled: !!repoPath,
    });

    const { data: conflictedIds = [] } = useQuery<number[]>({
      queryKey: ["conflicted-workspace-ids", repoPath],
      queryFn: () => listConflictedWorkspaceIds(repoPath || ""),
      enabled: !!repoPath,
    });

    const { data: changedIds = [] } = useQuery<number[]>({
      queryKey: ["workspaces-with-changes", repoPath],
      queryFn: () => listWorkspacesWithChanges(repoPath || ""),
      enabled: !!repoPath,
    });

    // Build hierarchical tree and flatten for rendering
    const flattenedNodes = useMemo(() => {
      const tree = buildWorkspaceTree(workspaces);
      return flattenWorkspaceTree(tree);
    }, [workspaces]);

    const getWorkspaceTitle = useCallback((workspace: Workspace) => {
      return getWorkspaceTitleFromUtils(workspace);
    }, []);

    const handleContainerClick = useCallback(
      (e: React.MouseEvent) => {
        // Clear selection when clicking on the container background (not on workspace items)
        if (e.target === e.currentTarget && selectedWorkspaceIds && selectedWorkspaceIds.size > 0) {
          // Create a fake workspace click event to trigger the clear logic
          // We'll pass null to signal clearing selection
          if (onWorkspaceMultiSelect) {
            onWorkspaceMultiSelect(null as any, e);
          }
        }
      },
      [selectedWorkspaceIds, onWorkspaceMultiSelect]
    );

    const repoName = repoPath
      ? repoPath.split("/").filter(Boolean).pop() || "Repository"
      : "Repository";

    return (
      <TooltipProvider delayDuration={200} skipDelayDuration={100}>
        <div className="group/sidebar w-[240px] bg-sidebar border-r border-border flex flex-col h-screen">
          {/* Repository selector / Command palette trigger */}
          <div className="flex items-center gap-2 mx-2 mt-2">
            <button
              onClick={onOpenCommandPalette}
              className="flex items-center gap-2 flex-1 px-3 py-1.5 rounded-lg border border-border bg-muted/50 hover:bg-muted text-muted-foreground transition-colors"
            >
              <Search className="w-4 h-4 shrink-0" />
              <span className="flex-1 text-left truncate">
                {repoName}
              </span>
              <span className="text-[10px] text-muted-foreground/60 shrink-0">
                ⌘K
              </span>
            </button>
            {openSettings && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => openSettings("application")}
                    className={`h-9 w-9 rounded-lg hover:bg-muted flex items-center justify-center transition-colors border border-border ${
                      currentPage === "settings" ? "bg-primary/20" : "bg-muted/50"
                    }`}
                    aria-label="Settings"
                  >
                    <Settings
                      className={`w-4 h-4 ${
                        currentPage === "settings"
                          ? "text-primary"
                          : "text-muted-foreground"
                      }`}
                    />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Settings</TooltipContent>
              </Tooltip>
            )}
          </div>

          <div
            className="pl-1 pr-2 py-2 space-y-1 min-h-[120px] flex-1 overflow-y-auto select-none"
            onClick={handleContainerClick}
          >
            {/* Main repository section */}
            <ContextMenu>
              <Tooltip>
                <ContextMenuTrigger asChild>
                  <TooltipTrigger asChild>
                    <div
                      className={`relative flex items-center text-sm tracking-wide px-2 py-1 rounded-md transition-colors cursor-pointer ${
                        selectedWorkspaceId === null ? "bg-primary/20" : "hover:bg-muted/50"
                      }`}
                      onClick={() => onWorkspaceClick?.(undefined as any)}
                    >
                      <Home className={`w-3 h-3 mr-1 shrink-0 ${selectedWorkspaceId === null ? "text-primary" : "text-muted-foreground"}`} />
                      <span
                        className={`flex-1 min-w-0 truncate font-mono ${selectedWorkspaceId === null ? "text-primary font-medium" : "text-muted-foreground"}`}
                        title={currentBranch || "Unknown"}
                      >
                        {currentBranch || "unknown"}
                      </span>
                    </div>
                  </TooltipTrigger>
                </ContextMenuTrigger>
                <TooltipContent side="right" className="font-mono">
                  <div className="flex items-center gap-1.5">
                    <GitBranch className="w-3 h-3" />
                    <span>{currentBranch || "Unknown"}</span>
                  </div>
                </TooltipContent>
              </Tooltip>
              <ContextMenuContent>
                {onOpenBranchSwitcher && (
                  <>
                    <ContextMenuItem onClick={onOpenBranchSwitcher}>
                      <GitBranch className="w-4 h-4 mr-2" />
                      Switch Branch...
                    </ContextMenuItem>
                    <ContextMenuSeparator />
                  </>
                )}
                <PathContextMenuItems
                  relativePath="."
                  fullPath={repoPath || ""}
                />
              </ContextMenuContent>
            </ContextMenu>

            {/* Divider */}
            {workspaces.length > 0 && (
              <div className="my-2 border-t border-border" />
            )}

            {/* Workspaces section */}
            <div className="space-y-1">
              {flattenedNodes.map((node) => {
                const workspace = node.workspace;
                const isSelected =
                  selectedWorkspaceIds?.has(workspace.id) ||
                  selectedWorkspaceId === workspace.id;
                const indentStyle = { paddingLeft: `${16 + (node.depth - 1) * 6}px`};

                return (
                  <ContextMenu key={workspace.id}>
                    <Tooltip>
                      <ContextMenuTrigger asChild>
                        <TooltipTrigger asChild>
                          <div
                            style={indentStyle}
                            className={`relative flex items-center text-sm tracking-wide  pr-2 rounded-md transition-colors cursor-pointer ${
                              isSelected ? "bg-primary/20" : "hover:bg-muted/50"
                            } ${node.depth > 0 ? 'pt-0.5' : 'py-1 '}`}
                            onClick={(e) =>
                              onWorkspaceMultiSelect
                                ? onWorkspaceMultiSelect(workspace, e)
                                : onWorkspaceClick?.(workspace)
                            }
                          >
                            {node.depth === 0 ? (
                              <GitBranch
                                className={`w-3 h-3 mr-1 shrink-0 ${
                                  isSelected ? "text-primary" : "text-muted-foreground"
                                }`}
                              />
                            ) : (
                              <CornerLeftUp
                                className={`w-3 h-3 mr-1 shrink-0 ${
                                  isSelected ? "text-primary" : "text-muted-foreground"
                                }`}
                              />
                            )}
                            <span
                              className={`flex-1 min-w-0 truncate font-mono ${
                                isSelected ? "text-primary font-medium" : "text-muted-foreground"
                              }`}
                            >
                              {getWorkspaceTitle(workspace)}
                            </span>
                            {/* Indicators: Conflict takes priority over changes */}
                            {conflictedIds.includes(workspace.id) ? (
                              <AlertTriangle className="w-3 h-3 text-destructive shrink-0" />
                            ) : changedIds.includes(workspace.id) ? (
                              <CircleDot className="w-3 h-3 text-slate-400 fill-slate-400 shrink-0" />
                            ) : null}
                            <StatusPill path={workspace.workspace_path} />
                          </div>
                        </TooltipTrigger>
                      </ContextMenuTrigger>
                      <TooltipContent side="right" className="font-mono">
                        <div className="flex items-center gap-1.5">
                          <GitBranch className="w-3 h-3" />
                          <span>{getWorkspaceTitle(workspace)}</span>
                        </div>
                      </TooltipContent>
                    </Tooltip>
                    <ContextMenuContent>
                      <ContextMenuItem
                        onClick={() => {
                          navigator.clipboard.writeText(getWorkspaceTitle(workspace));
                        }}
                      >
                        <GitBranch className="w-4 h-4 mr-2" />
                        Copy branch name
                      </ContextMenuItem>
                      <ContextMenuSeparator />
                      <PathContextMenuItems
                        relativePath={
                          repoPath && workspace.workspace_path.startsWith(repoPath)
                            ? workspace.workspace_path.slice(repoPath.length + 1)
                            : workspace.workspace_path
                        }
                        fullPath={workspace.workspace_path}
                        additionalItems={
                          <>
                            <ContextMenuSeparator />
                            <ContextMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => onDeleteWorkspace?.(workspace)}
                            >
                              <Trash2 className="w-4 h-4 mr-2" />
                              Delete Workspace
                            </ContextMenuItem>
                          </>
                        }
                      />
                    </ContextMenuContent>
                  </ContextMenu>
                );
              })}

              {/* Show delete button when workspaces are selected, otherwise show create buttons */}
              {selectedWorkspaceIds && selectedWorkspaceIds.size > 0 ? (
                <button
                  type="button"
                  onClick={onBulkDelete}
                  className="flex items-center justify-center gap-1 w-full px-2 py-1.5 text-destructive hover:bg-destructive/10 rounded-md transition-colors"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>
                    Delete {selectedWorkspaceIds.size} workspace
                    {selectedWorkspaceIds.size > 1 ? "s" : ""}
                  </span>
                </button>
              ) : (
                onCreateWorkspace && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        onClick={onCreateWorkspace}
                        variant="ghost"
                        size="sm"
                        className="w-full gap-1 bg-secondary/50 hover:bg-secondary"
                        aria-label="Create new workspace"
                      >
                        <GitBranchPlusIcon className="w-3.5 h-3.5" />
                        <span className="truncate">Workspace</span>
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">
                      Create new workspace
                    </TooltipContent>
                  </Tooltip>
                )
              )}
            </div>
          </div>
        </div>
      </TooltipProvider>
    );
  }
);
