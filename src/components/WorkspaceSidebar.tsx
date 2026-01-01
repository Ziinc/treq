import { useQuery } from "@tanstack/react-query";
import { useCallback, memo } from "react";
import { Workspace, getWorkspaces } from "../lib/api";
import {
  Plus,
  Settings,
  Home,
  Search,
  GitBranch,
  Cloud,
  Trash2,
  AlertTriangle,
} from "lucide-react";
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
} from "./ui/context-menu";
import { getWorkspaceTitle as getWorkspaceTitleFromUtils } from "../lib/workspace-utils";

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
  onCreateWorkspaceFromRemote?: () => void;
  openSettings?: (tab?: string) => void;
  navigateToDashboard?: () => void;
  onOpenCommandPalette?: () => void;
  currentPage?: "settings" | "session" | null;
}

// Note: StatusPill simplified - git status checking removed
const StatusPill: React.FC<{ path: string }> = memo(() => {
  // Would need JJ status equivalent
  return null;
});

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
    onCreateWorkspaceFromRemote,
    openSettings,
    navigateToDashboard: _navigateToDashboard,
    onOpenCommandPalette,
    currentPage,
  }) => {
    const { data: workspaces = [] } = useQuery({
      queryKey: ["workspaces", repoPath],
      queryFn: () => getWorkspaces(repoPath || ""),
      enabled: !!repoPath,
    });

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
            <div
              className={`relative flex items-center text-sm tracking-wide px-2 py-1 rounded-md transition-colors cursor-pointer ${
                selectedWorkspaceId === null ? "bg-primary/20" : "hover:bg-muted/50"
              }`}
              onClick={() => onWorkspaceClick?.(undefined as any)}
            >
              <Home className={`w-3 h-3 mr-1 shrink-0 ${selectedWorkspaceId === null ? "text-primary" : "text-muted-foreground"}`} />
              <span
                className={`flex-1 min-w-0 truncate font-mono ${selectedWorkspaceId === null ? "text-primary font-medium" : "text-muted-foreground"}`}
                title={currentBranch || "Main"}
              >
                {currentBranch || "main"}
              </span>
              {repoPath && <StatusPill path={repoPath} />}
            </div>

            {/* Divider */}
            {workspaces.length > 0 && (
              <div className="my-2 border-t border-border" />
            )}

            {/* Workspaces section */}
            <div className="space-y-1">
              {workspaces.map((workspace) => (
                <ContextMenu key={workspace.id}>
                  <Tooltip>
                    <ContextMenuTrigger asChild>
                      <TooltipTrigger asChild>
                        <div
                          className={`relative flex items-center text-sm tracking-wide px-2 py-1 rounded-md transition-colors cursor-pointer ${
                            selectedWorkspaceIds?.has(workspace.id)
                              ? "bg-primary/20"
                              : selectedWorkspaceId === workspace.id
                                ? "bg-primary/20"
                                : "hover:bg-muted/50"
                          }`}
                          onClick={(e) =>
                            onWorkspaceMultiSelect
                              ? onWorkspaceMultiSelect(workspace, e)
                              : onWorkspaceClick?.(workspace)
                          }
                        >
                          <GitBranch
                            className={`w-3 h-3 mr-1 shrink-0 ${
                              selectedWorkspaceIds?.has(workspace.id) ||
                              selectedWorkspaceId === workspace.id
                                ? "text-primary"
                                : "text-muted-foreground"
                            }`}
                          />
                          <span
                            className={`flex-1 min-w-0 truncate font-mono ${
                              selectedWorkspaceIds?.has(workspace.id) ||
                              selectedWorkspaceId === workspace.id
                                ? "text-primary font-medium"
                                : "text-muted-foreground"
                            }`}
                          >
                            {getWorkspaceTitle(workspace)}
                          </span>
                          {workspace.has_conflicts && (
                            <AlertTriangle className="w-3 h-3 text-destructive shrink-0" />
                          )}
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
                      className="text-destructive focus:text-destructive"
                      onClick={() => onDeleteWorkspace?.(workspace)}
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Delete Workspace
                    </ContextMenuItem>
                  </ContextMenuContent>
                </ContextMenu>
              ))}

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
                  <div className="flex gap-1 w-full">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          onClick={onCreateWorkspace}
                          className="flex items-center justify-center gap-1 flex-1 px-2 py-1.5 text-muted-foreground hover:bg-muted rounded-md transition-colors"
                          aria-label="Create new workspace"
                        >
                          <Plus className="w-3 h-3" />
                          <span className="truncate">Workspace</span>
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom">
                        Create new workspace
                      </TooltipContent>
                    </Tooltip>
                    {onCreateWorkspaceFromRemote && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            onClick={onCreateWorkspaceFromRemote}
                            className="flex items-center justify-center gap-1 flex-1 px-2 py-1.5 text-muted-foreground hover:bg-muted rounded-md transition-colors"
                            aria-label="Create from remote branch"
                          >
                            <Cloud className="w-3 h-3" />
                            <span className="truncate">Remote</span>
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom">
                          Create from remote branch
                        </TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                )
              )}
            </div>
          </div>
        </div>
      </TooltipProvider>
    );
  }
);
