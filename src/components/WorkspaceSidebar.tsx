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
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./ui/tooltip";
import { getWorkspaceTitle as getWorkspaceTitleFromUtils } from "../lib/workspace-utils";

interface WorkspaceSidebarProps {
  repoPath?: string;
  currentBranch?: string | null;
  selectedWorkspaceId?: number | null;
  onWorkspaceClick?: (workspace: Workspace) => void;
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
    onWorkspaceClick,
    onCreateWorkspace,
    onCreateWorkspaceFromRemote,
    openSettings,
    navigateToDashboard,
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

    const repoName = repoPath
      ? repoPath.split("/").filter(Boolean).pop() || "Repository"
      : "Repository";

    return (
      <TooltipProvider delayDuration={200} skipDelayDuration={100}>
        <div className="group/sidebar w-[240px] bg-sidebar border-r border-border flex flex-col h-screen">
          {/* Repository selector / Command palette trigger */}
          <button
            onClick={onOpenCommandPalette}
            className="flex items-center gap-2 mx-2 mt-2 px-3 py-1.5 rounded-lg border border-border bg-muted/50 hover:bg-muted text-muted-foreground transition-colors"
          >
            <Search className="w-4 h-4 shrink-0" />
            <span className="flex-1 text-left truncate">
              {repoName}
            </span>
            <span className="text-[10px] text-muted-foreground/60 shrink-0">
              ⌘K
            </span>
          </button>

          <div className="pl-1 pr-2 py-2 space-y-1 min-h-[120px] flex-1 overflow-y-auto">
            {/* Main repository section */}
            <div
              className={`relative flex items-center text-[12px] tracking-wide px-2 py-1 rounded-md transition-colors cursor-pointer ${
                selectedWorkspaceId === null ? "bg-primary/20" : "hover:bg-muted/50"
              }`}
              onClick={() => onWorkspaceClick?.(undefined as any)}
            >
              <GitBranch className={`w-3 h-3 mr-1 shrink-0 ${selectedWorkspaceId === null ? "text-primary" : "text-muted-foreground"}`} />
              <span
                className={`flex-1 min-w-0 truncate font-mono ${selectedWorkspaceId === null ? "text-primary font-medium" : "text-muted-foreground"}`}
                title={currentBranch || "Main"}
              >
                {currentBranch || "main"}
              </span>
              {repoPath && <StatusPill path={repoPath} />}
            </div>

            {/* Workspaces section */}
            <div className="space-y-1">
              {workspaces.map((workspace) => (
                <div
                  key={workspace.id}
                  className={`relative flex items-center text-[12px] tracking-wide px-2 py-1 rounded-md transition-colors cursor-pointer ${
                    selectedWorkspaceId === workspace.id
                      ? "bg-primary/20"
                      : "hover:bg-muted/50"
                  }`}
                  onClick={() => onWorkspaceClick?.(workspace)}
                >
                  <GitBranch className={`w-3 h-3 mr-1 shrink-0 ${selectedWorkspaceId === workspace.id ? "text-primary" : "text-muted-foreground"}`} />
                  <span
                    className={`flex-1 min-w-0 truncate font-mono ${selectedWorkspaceId === workspace.id ? "text-primary font-medium" : "text-muted-foreground"}`}
                    title={getWorkspaceTitle(workspace)}
                  >
                    {getWorkspaceTitle(workspace)}
                  </span>
                  <StatusPill path={workspace.workspace_path} />
                </div>
              ))}

              {/* Add Workspace buttons */}
              {onCreateWorkspace && (
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
              )}
            </div>
          </div>

          {/* Footer with actions */}
          {(openSettings || navigateToDashboard) && (
            <div className="border-t border-border px-2 h-8 min-h-[32px] flex items-center gap-2">
              {navigateToDashboard && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={navigateToDashboard}
                      className="h-6 w-6 rounded-md hover:bg-muted flex items-center justify-center transition-colors"
                      aria-label="Home"
                    >
                      <Home className="w-5 h-5 text-muted-foreground" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top">Home</TooltipContent>
                </Tooltip>
              )}
              {openSettings && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => openSettings("application")}
                      className={`h-6 w-6 rounded-md hover:bg-muted flex items-center justify-center transition-colors ${
                        currentPage === "settings" ? "bg-primary/20" : ""
                      }`}
                      aria-label="Settings"
                    >
                      <Settings
                        className={`w-5 h-5 ${
                          currentPage === "settings"
                            ? "text-primary"
                            : "text-muted-foreground"
                        }`}
                      />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top">Settings</TooltipContent>
                </Tooltip>
              )}
            </div>
          )}
        </div>
      </TooltipProvider>
    );
  }
);
