import { useQuery } from "@tanstack/react-query";
import { useCallback, useMemo, memo, useRef } from "react";
import { Workspace, getWorkspaces } from "../lib/api";
import { useToast } from "./ui/toast";
import {
  Plus,
  MoreVertical,
  FolderOpen,
  Trash2,
  Settings,
  Home,
  Search,
  GitBranch,
  Cloud,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "./ui/dropdown-menu";
import { openPath } from "@tauri-apps/plugin-opener";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./ui/tooltip";
import { getWorkspaceTitle as getWorkspaceTitleFromUtils } from "../lib/workspace-utils";
import { useWorkspaceGitStatus } from "../hooks/useWorkspaceGitStatus";

interface WorkspaceSidebarProps {
  repoPath?: string;
  currentBranch?: string | null;
  selectedWorkspaceId?: number | null;
  onWorkspaceClick?: (workspace: Workspace) => void;
  onDeleteWorkspace?: (workspace: Workspace) => void;
  onCreateWorkspace?: () => void;
  onCreateWorkspaceFromRemote?: () => void;
  openSettings?: (tab?: string) => void;
  navigateToDashboard?: () => void;
  onOpenCommandPalette?: () => void;
  currentPage?: "settings" | "session" | null;
}

const StatusPill: React.FC<{ path: string }> = memo(({ path }) => {
  const ref = useRef<HTMLSpanElement>(null);

  const { status, branchInfo } = useWorkspaceGitStatus(path, {
    refetchInterval: 30000,
  });

  const totalChanges = status
    ? status.modified + status.added + status.deleted + status.untracked
    : 0;

  if (totalChanges > 0) {
    return (
      <span
        ref={ref}
        className="px-1 py-0.5 text-[9px] font-semibold bg-amber-500/20 text-amber-600 dark:text-amber-400 rounded-full ml-auto shrink-0"
      >
        {totalChanges}
      </span>
    );
  }

  if (branchInfo && branchInfo.ahead > 0) {
    return (
      <span
        ref={ref}
        className="px-1 py-0.5 text-[9px] font-semibold bg-green-500/20 text-green-600 dark:text-green-400 rounded-full ml-auto shrink-0"
      >
        {branchInfo.ahead} ↑
      </span>
    );
  }

  return <span ref={ref} />;
});

export const WorkspaceSidebar: React.FC<WorkspaceSidebarProps> = memo(
  ({
    repoPath,
    currentBranch,
    selectedWorkspaceId,
    onWorkspaceClick,
    onDeleteWorkspace,
    onCreateWorkspace,
    onCreateWorkspaceFromRemote,
    openSettings,
    navigateToDashboard,
    onOpenCommandPalette,
    currentPage,
  }) => {
    const { addToast } = useToast();

    const { data: workspaces = [] } = useQuery({
      queryKey: ["workspaces", repoPath],
      queryFn: () => getWorkspaces(repoPath || ""),
      enabled: !!repoPath,
    });

    const getWorkspaceTitle = useCallback((workspace: Workspace) => {
      return getWorkspaceTitleFromUtils(workspace);
    }, []);

    const fileManagerLabel = useMemo(() => {
      if (typeof navigator !== "undefined") {
        const platform = navigator.userAgent || navigator.platform || "";
        if (/mac/i.test(platform)) {
          return "Finder";
        }
        if (/win/i.test(platform)) {
          return "Explorer";
        }
      }
      return "Explorer";
    }, []);

    const repoName = useMemo(() => {
      if (!repoPath) return "Repository";
      const segments = repoPath.split("/").filter(Boolean);
      return segments[segments.length - 1] || "Repository";
    }, [repoPath]);

    const handleOpenInFileManager = useCallback(
      async (path?: string | null) => {
        if (!path) {
          addToast({
            title: "Path unavailable",
            description: "No directory path is associated with this item.",
            type: "warning",
          });
          return;
        }

        try {
          await openPath(path);
        } catch (error) {
          try {
            if (typeof window !== "undefined") {
              window.open(`file://${encodeURI(path)}`);
              return;
            }
          } catch {
            // Ignore window errors
          }

          addToast({
            title: "Unable to open directory",
            description:
              error instanceof Error ? error.message : "Unknown error",
            type: "error",
          });
        }
      },
      [addToast]
    );

    return (
      <TooltipProvider delayDuration={200} skipDelayDuration={100}>
        <div className="group/sidebar w-[240px] bg-sidebar border-r border-border flex flex-col h-screen">
          {/* Repository selector / Command palette trigger */}
          <button
            onClick={onOpenCommandPalette}
            className="flex items-center gap-2 mx-2 mt-2 px-3 py-1.5 rounded-lg border border-border bg-muted/50 hover:bg-muted text-muted-foreground transition-colors"
          >
            <Search className="w-4 h-4 shrink-0" />
            <span className="flex-1 text-xs text-left truncate">
              {repoName}
            </span>
            <span className="text-[10px] text-muted-foreground/60 shrink-0">
              ⌘K
            </span>
          </button>

          <div className="pl-1 pr-2 py-2 space-y-1 min-h-[120px] flex-1 overflow-y-auto">
            {/* Main repository section */}
            <div
              className={`group/mainrepo relative flex items-center text-[12px] tracking-wide px-2 py-1 rounded-md transition-colors cursor-pointer ${
                selectedWorkspaceId === null ? "bg-muted" : "hover:bg-muted/50"
              }`}
              onClick={() => onWorkspaceClick?.(undefined as any)}
            >
              <GitBranch className="w-3 h-3 mr-1 text-muted-foreground shrink-0" />
              <span
                className="truncate flex items-center text-muted-foreground font-mono"
                title={currentBranch || "Main"}
              >
                {currentBranch || "main"}
              </span>
              {repoPath && <StatusPill path={repoPath} />}
              <div className="absolute right-2 flex items-center gap-1 pl-4 bg-gradient-to-l from-sidebar from-60% opacity-0 group-hover/mainrepo:opacity-100 transition-opacity duration-200">
                {repoPath && (
                  <DropdownMenu>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <DropdownMenuTrigger asChild>
                          <button
                            className="p-1 rounded hover:bg-muted"
                            aria-label={`Open repository in ${fileManagerLabel}`}
                          >
                            <MoreVertical className="w-3 h-3" />
                          </button>
                        </DropdownMenuTrigger>
                      </TooltipTrigger>
                      <TooltipContent side="bottom">
                        More options
                      </TooltipContent>
                    </Tooltip>
                    <DropdownMenuContent align="end" sideOffset={4}>
                      <DropdownMenuItem
                        onSelect={(event) => {
                          event.preventDefault();
                          handleOpenInFileManager(repoPath);
                        }}
                      >
                        <FolderOpen className="w-4 h-4 mr-2" />
                        Open in {fileManagerLabel}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            </div>

            {/* Workspaces section */}
            <div className="space-y-1">
              {workspaces.map((workspace) => (
                <div
                  key={workspace.id}
                  className={`group/workspace relative flex items-center text-[12px] tracking-wide px-2 py-1 rounded-md transition-colors cursor-pointer ${
                    selectedWorkspaceId === workspace.id
                      ? "bg-muted"
                      : "hover:bg-muted/50"
                  }`}
                  onClick={() => onWorkspaceClick?.(workspace)}
                >
                  <GitBranch className="w-3 h-3 mr-1 text-muted-foreground shrink-0" />
                  <span
                    className="truncate flex items-center text-muted-foreground font-mono"
                    title={getWorkspaceTitle(workspace)}
                  >
                    {getWorkspaceTitle(workspace)}
                  </span>
                  <StatusPill path={workspace.workspace_path} />
                  <div className="absolute right-2 flex items-center gap-1 pl-4 bg-gradient-to-l from-sidebar from-60% opacity-0 group-hover/workspace:opacity-100 transition-opacity duration-200">
                    <DropdownMenu>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <DropdownMenuTrigger asChild>
                            <button
                              className="p-1 rounded hover:bg-muted"
                              aria-label="Workspace actions"
                            >
                              <MoreVertical className="w-3 h-3" />
                            </button>
                          </DropdownMenuTrigger>
                        </TooltipTrigger>
                        <TooltipContent side="bottom">
                          More options
                        </TooltipContent>
                      </Tooltip>
                      <DropdownMenuContent align="end" sideOffset={4}>
                        {workspace.workspace_path && (
                          <DropdownMenuItem
                            onSelect={(event) => {
                              event.preventDefault();
                              handleOpenInFileManager(workspace.workspace_path);
                            }}
                          >
                            <FolderOpen className="w-4 h-4 mr-2" />
                            Open in {fileManagerLabel}
                          </DropdownMenuItem>
                        )}
                        {onDeleteWorkspace && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onSelect={() => onDeleteWorkspace(workspace)}
                            >
                              <Trash2 className="w-4 h-4 mr-2" />
                              Delete Workspace
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
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
                        className="flex items-center justify-center gap-1 flex-1 px-2 py-1.5 text-xs text-muted-foreground hover:bg-muted rounded-md transition-colors"
                        aria-label="Create new workspace"
                      >
                        <Plus className="w-3 h-3" />
                        <span className="truncate">New</span>
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
                          className="flex items-center justify-center gap-1 flex-1 px-2 py-1.5 text-xs text-muted-foreground hover:bg-muted rounded-md transition-colors"
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
                      <Home className="w-3.5 h-3.5 text-muted-foreground" />
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
                        className={`w-3.5 h-3.5 ${
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
