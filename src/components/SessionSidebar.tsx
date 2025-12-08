import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, memo, useState } from "react";
import { Session, Workspace, getSessions, getWorkspaces, deleteSession, ptyClose, ptySessionExists, toggleWorkspacePin } from "../lib/api";
import { useToast } from "./ui/toast";
import { X, Plus, Pause, MoreVertical, MoreHorizontal, FolderOpen, Trash2, Terminal as TerminalIcon, Settings, Home, Search, Pin, GitBranch } from "lucide-react";
import { useWorkspaceGitStatus } from "../hooks/useWorkspaceGitStatus";
import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "./ui/dropdown-menu";
import { openPath } from "@tauri-apps/plugin-opener";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./ui/tooltip";
import { getWorkspaceTitle as getWorkspaceTitleFromUtils } from "../lib/workspace-utils";

interface SessionSidebarProps {
  activeSessionId: number | null;
  onSessionClick: (session: Session) => void;
  onCreateSession?: (workspaceId: number | null) => void;
  onCloseActiveSession?: () => void;
  repoPath?: string;
  currentBranch?: string | null;
  onDeleteWorkspace?: (workspace: Workspace) => void;
  onCreateWorkspace?: () => void;
  onCreateWorkspaceFromRemote?: () => void;
  onSessionActivityListenerChange?: (listener: ((sessionId: number) => void) | null) => void;
  openSettings?: (tab?: string) => void;
  navigateToDashboard?: () => void;
  onOpenCommandPalette?: () => void;
  onBrowseFiles?: (workspace: Workspace | null) => void;
  browsingWorkspaceId?: number | null; // null = browsing main repo, number = browsing that workspace, undefined = not browsing
  currentPage?: 'dashboard' | 'settings' | 'session' | null;
}

const StatusPill: React.FC<{ path: string }> = memo(({ path }) => {
  const { status, branchInfo } = useWorkspaceGitStatus(path, {
    refetchInterval: 30000,
  });

  const totalChanges = status
    ? status.modified + status.added + status.deleted + status.untracked
    : 0;

  if (totalChanges > 0) {
    return (
      <span className="px-1 py-0.5 text-[9px] font-semibold bg-amber-500/20 text-amber-600 dark:text-amber-400 rounded-full ml-auto shrink-0">
        {totalChanges}
      </span>
    );
  }

  if (branchInfo && branchInfo.ahead > 0) {
    return (
      <span className="px-1 py-0.5 text-[9px] font-semibold bg-green-500/20 text-green-600 dark:text-green-400 rounded-full ml-auto shrink-0">
        {branchInfo.ahead} ↑
      </span>
    );
  }

  return null;
});

export const SessionSidebar: React.FC<SessionSidebarProps> = memo(({
  activeSessionId,
  onSessionClick,
  onCreateSession,
  onCloseActiveSession,
  repoPath,
  currentBranch,
  onDeleteWorkspace,
  onCreateWorkspace,
  onCreateWorkspaceFromRemote,
  onSessionActivityListenerChange,
  openSettings,
  navigateToDashboard,
  onOpenCommandPalette,
  onBrowseFiles,
  browsingWorkspaceId,
  currentPage,
}) => {
  const { addToast } = useToast();
  const queryClient = useQueryClient();
  const [ptySessionsExist, setPtySessionsExist] = useState<Set<number>>(new Set());
  const [sessionActivity, setSessionActivity] = useState<Map<number, number>>(new Map());
  const ACTIVITY_WINDOW_MS = 2000;

  const markSessionActivity = useCallback((sessionId: number) => {
    setSessionActivity((prev) => {
      const next = new Map(prev);
      next.set(sessionId, Date.now());
      return next;
    });
  }, []);

  useEffect(() => {
    if (!onSessionActivityListenerChange) {
      return;
    }
    onSessionActivityListenerChange(markSessionActivity);
    return () => {
      onSessionActivityListenerChange(null);
    };
  }, [markSessionActivity, onSessionActivityListenerChange]);

  useEffect(() => {
    if (activeSessionId) {
      setPtySessionsExist((prev) => {
        if (prev.has(activeSessionId)) return prev;
        const next = new Set(prev);
        next.add(activeSessionId);
        return next;
      });
    }
  }, [activeSessionId]);

  const { data: sessions = [] } = useQuery({
    queryKey: ["sessions", repoPath],
    queryFn: () => getSessions(repoPath || ""),
    refetchInterval: 5000,
    enabled: !!repoPath,
  });

  const { data: workspaces = [] } = useQuery({
    queryKey: ["workspaces", repoPath],
    queryFn: () => getWorkspaces(repoPath || ""),
    enabled: !!repoPath,
  });

  useEffect(() => {
    const interval = setInterval(() => {
      setSessionActivity((prev) => {
        const now = Date.now();
        let changed = false;
        const next = new Map(prev);
        prev.forEach((timestamp, sessionId) => {
          if (now - timestamp > ACTIVITY_WINDOW_MS) {
            next.delete(sessionId);
            changed = true;
          }
        });
        return changed ? next : prev;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [ACTIVITY_WINDOW_MS]);

  useEffect(() => {
    const activeIds = new Set(sessions.map((session) => session.id));
    setSessionActivity((prev) => {
      let changed = false;
      const next = new Map(prev);
      prev.forEach((_, sessionId) => {
        if (!activeIds.has(sessionId)) {
          next.delete(sessionId);
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [sessions]);

  useEffect(() => {
    const checkPtySessions = async () => {
      const unchecked = sessions.filter((s) => !ptySessionsExist.has(s.id));
      if (unchecked.length === 0) return;

      const results = await Promise.all(
        unchecked.map(async (session) => {
          const exists = await ptySessionExists(`session-${session.id}`);
          return { sessionId: session.id, exists };
        })
      );

      setPtySessionsExist((prev) => {
        const updated = new Set(prev);
        results.forEach(({ sessionId, exists }) => {
          if (exists) {
            updated.add(sessionId);
          }
        });
        return updated;
      });
    };

    if (sessions.length > 0) {
      checkPtySessions();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessions.map((s) => s.id).join(",")]);

  const deleteSessionMutation = useMutation({
    mutationFn: async (session: Session) => {
      await ptyClose(`session-${session.id}`);
      await deleteSession(repoPath || "", session.id);
      return session.id;
    },
    onSuccess: (sessionId) => {
      setPtySessionsExist((prev) => {
        const next = new Set(prev);
        next.delete(sessionId);
        return next;
      });
      queryClient.invalidateQueries({ queryKey: ["sessions"] });
      addToast({
        title: "Session Closed",
        description: "Terminal session has been closed",
        type: "info",
      });
    },
    onError: (error) => {
      addToast({
        title: "Error",
        description: error instanceof Error ? error.message : String(error),
        type: "error",
      });
    },
  });

  const handleDeleteSession = useCallback(
    (event: React.MouseEvent, session: Session) => {
      event.stopPropagation();
      if (session.id === activeSessionId && onCloseActiveSession) {
        onCloseActiveSession();
      }
      deleteSessionMutation.mutate(session);
    },
    [deleteSessionMutation, activeSessionId, onCloseActiveSession]
  );

  const deleteAllWorkspaceSessionsMutation = useMutation({
    mutationFn: async (workspaceId: number) => {
      const sessionsToDelete = sessions.filter(s => s.workspace_id === workspaceId);

      // Close PTY and delete each session
      for (const session of sessionsToDelete) {
        await ptyClose(`session-${session.id}`);
        await deleteSession(repoPath || "", session.id);
      }

      return { workspaceId, deletedCount: sessionsToDelete.length };
    },
    onSuccess: ({ workspaceId, deletedCount }) => {
      // Clear PTY session tracking
      setPtySessionsExist((prev) => {
        const next = new Set(prev);
        sessions
          .filter(s => s.workspace_id === workspaceId)
          .forEach(s => next.delete(s.id));
        return next;
      });

      queryClient.invalidateQueries({ queryKey: ["sessions"] });
      addToast({
        title: "Sessions Deleted",
        description: `${deletedCount} session(s) closed`,
        type: "info",
      });
    },
    onError: (error) => {
      addToast({
        title: "Error",
        description: error instanceof Error ? error.message : String(error),
        type: "error",
      });
    },
  });

  const togglePinMutation = useMutation({
    mutationFn: async ({ workspaceId, repoPath }: { workspaceId: number; repoPath: string }) => {
      return toggleWorkspacePin(repoPath, workspaceId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workspaces", repoPath] });
    },
  });

  const handleDeleteAllWorkspaceSessions = useCallback(
    (workspaceId: number, workspaceName: string) => {
      const sessionsToDelete = sessions.filter(s => s.workspace_id === workspaceId);

      // Early return if no sessions
      if (sessionsToDelete.length === 0) return;

      // Show confirmation dialog
      const confirmed = confirm(
        `Delete all ${sessionsToDelete.length} session(s) for workspace "${workspaceName}"?`
      );

      if (!confirmed) return;

      // Check if active session will be deleted
      const activeSessionBeingDeleted = sessionsToDelete.some(s => s.id === activeSessionId);
      if (activeSessionBeingDeleted && onCloseActiveSession) {
        onCloseActiveSession();
      }

      deleteAllWorkspaceSessionsMutation.mutate(workspaceId);
    },
    [deleteAllWorkspaceSessionsMutation, sessions, activeSessionId, onCloseActiveSession]
  );

  const mainRepoSessions = sessions.filter((s) => s.workspace_id === null);
  const workspaceSessions = sessions.filter((s) => s.workspace_id !== null);

  const workspaceMap = useMemo(() => {
    const map = new Map<number, Workspace>();
    workspaces.forEach((workspace) => map.set(workspace.id, workspace));
    return map;
  }, [workspaces]);

  const sessionsByWorkspace = useMemo(() => {
    const groups = new Map<number, Session[]>();
    workspaceSessions.forEach((session) => {
      if (session.workspace_id === null) return;
      const current = groups.get(session.workspace_id) ?? [];
      current.push(session);
      groups.set(session.workspace_id, current);
    });

    groups.forEach((list, key) => {
      list.sort((a, b) => a.created_at.localeCompare(b.created_at));
      groups.set(key, [...list]);
    });

    return groups;
  }, [workspaceSessions]);


  const getWorkspaceTitle = useCallback(
    (workspaceId: number) => {
      const workspace = workspaceMap.get(workspaceId);
      if (!workspace) return "Workspace";
      return getWorkspaceTitleFromUtils(workspace);
    },
    [workspaceMap]
  );

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
          description: error instanceof Error ? error.message : "Unknown error",
          type: "error",
        });
      }
    },
    [addToast]
  );

  const renderSessionIcon = useCallback((sessionId: number) => {
    const hasPty = ptySessionsExist.has(sessionId);
    const lastActivity = sessionActivity.get(sessionId);
    const isActive = typeof lastActivity === "number" && Date.now() - lastActivity <= ACTIVITY_WINDOW_MS;

    if (isActive) {
      return <MoreHorizontal className="w-3.5 h-3.5 text-muted-foreground" />;
    }
    if (hasPty) {
      return <TerminalIcon className="w-3.5 h-3.5 text-muted-foreground" />;
    }
    return <Pause className="w-3.5 h-3.5 text-muted-foreground" />;
  }, [ptySessionsExist, sessionActivity]);

  const handleCreateSession = useCallback(
    (workspaceId: number | null) => {
      onCreateSession?.(workspaceId);
    },
    [onCreateSession]
  );

  const renderSessionRow = useCallback((session: Session) => (
    <div
      key={session.id}
      onClick={() => onSessionClick(session)}
      className={`group relative flex items-center gap-2 px-2 py-1.5 rounded text-xs cursor-pointer transition-colors ${
        activeSessionId === session.id
          ? "bg-primary/20 text-primary"
          : "hover:bg-muted text-muted-foreground"
      }`}
    >
      {renderSessionIcon(session.id)}
      <span className="flex-1 truncate">{session.name}</span>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={(event) => handleDeleteSession(event, session)}
            className="opacity-0 group-hover:opacity-100 transition-opacity"
            aria-label="Delete session"
          >
            <X className="w-3 h-3" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom">Delete session</TooltipContent>
      </Tooltip>
    </div>
  ), [activeSessionId, onSessionClick, renderSessionIcon, handleDeleteSession]);

  return (
    <TooltipProvider delayDuration={200} skipDelayDuration={100}>
      <div className="group/sidebar w-[240px] bg-sidebar border-r border-border flex flex-col h-screen">
      {/* Repository selector / Command palette trigger */}
      <button
        onClick={onOpenCommandPalette}
        className="flex items-center gap-2 mx-2 mt-2 px-3 py-1.5 rounded-lg border border-border bg-muted/50 hover:bg-muted text-muted-foreground transition-colors"
      >
        <Search className="w-4 h-4 shrink-0" />
        <span className="flex-1 text-xs text-left truncate">{repoName}</span>
        <span className="text-[10px] text-muted-foreground/60 shrink-0">⌘K</span>
      </button>
      <div className="pl-1 pr-2 py-2 space-y-1 min-h-[120px] flex-1 overflow-y-auto">
        <div className="relative flex items-center text-[12px] uppercase tracking-wide px-2 py-1">
          <span className={`truncate flex items-center ${
            browsingWorkspaceId === null ? "text-primary" : "text-muted-foreground"
          }`} title={currentBranch || "Main"}>
            {currentBranch || "main"}
          </span>
          {repoPath && <StatusPill path={repoPath} />}
          <div className="absolute right-2 flex items-center gap-1 pl-4 bg-gradient-to-l from-sidebar from-60% transition-opacity duration-200">
            {onCreateSession && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="p-1 rounded hover:bg-muted"
                    aria-label="New main session"
                    onClick={() => handleCreateSession(null)}
                  >
                    <Plus className="w-3 h-3" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom">New main session</TooltipContent>
              </Tooltip>
            )}
            {repoPath && (
              <DropdownMenu>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <DropdownMenuTrigger asChild>
                      <button className="transition-opacity p-1 rounded hover:bg-muted" aria-label={`Open repository in ${fileManagerLabel}`}>
                        <MoreVertical className="w-3 h-3" />
                      </button>
                    </DropdownMenuTrigger>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">More options</TooltipContent>
                </Tooltip>
                <DropdownMenuContent align="end" sideOffset={4}>
                  {onCreateSession && (
                    <DropdownMenuItem
                      onSelect={(event) => {
                        event.preventDefault();
                        handleCreateSession(null);
                      }}
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      New Session
                    </DropdownMenuItem>
                  )}
                  {onBrowseFiles && (
                    <DropdownMenuItem
                      onSelect={(event) => {
                        event.preventDefault();
                        onBrowseFiles(null);
                      }}
                    >
                      <FolderOpen className="w-4 h-4 mr-2" />
                      Browse files
                    </DropdownMenuItem>
                  )}
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
        {mainRepoSessions.length > 0 ? (
          mainRepoSessions.map(renderSessionRow)
        ) : (
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-center text-xs text-muted-foreground !h-auto py-1.5"
            onClick={() => handleCreateSession(null)}
            disabled={!onCreateSession}
          >
            <TerminalIcon className="w-3 h-3 mr-2" />
            Start session
          </Button>
        )}

        <div className="space-y-2 border-t border-border">
          <div className="flex items-center justify-between text-[12px] text-muted-foreground uppercase tracking-wide px-2 py-1">
            <span>Workspaces</span>
            {onCreateWorkspace && (
              <DropdownMenu>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        className="p-1 rounded hover:bg-muted"
                        aria-label="New workspace"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </DropdownMenuTrigger>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">New workspace</TooltipContent>
                </Tooltip>
                <DropdownMenuContent align="end" sideOffset={4}>
                  <DropdownMenuItem onSelect={onCreateWorkspace}>
                    <Plus className="w-4 h-4 mr-2" />
                    Create new workspace
                  </DropdownMenuItem>
                  {onCreateWorkspaceFromRemote && (
                    <DropdownMenuItem onSelect={onCreateWorkspaceFromRemote}>
                      <GitBranch className="w-4 h-4 mr-2" />
                      Create from remote branch
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
          {workspaces.map((workspace) => {
            const sessionsForWorkspace = sessionsByWorkspace.get(workspace.id) || [];
            const isBrowsingThisWorkspace = browsingWorkspaceId === workspace.id;
            return (
              <div key={workspace.id} className="space-y-1">
                <div className="relative flex items-center text-[12px] uppercase tracking-wide px-2 pt-1">
                  {workspace.is_pinned && (
                    <Pin className="w-3 h-3 mr-1 text-muted-foreground" />
                  )}
                  <span
                    className={`truncate flex items-center cursor-pointer transition-colors ${
                      isBrowsingThisWorkspace ? "text-primary" : "text-muted-foreground hover:text-foreground"
                    }`}
                    title={getWorkspaceTitle(workspace.id)}
                    onClick={() => onBrowseFiles?.(workspace)}
                  >
                    {getWorkspaceTitle(workspace.id)}
                  </span>
                  <StatusPill path={workspace.workspace_path} />
                  <div className="absolute right-2 flex items-center gap-1 pl-4 bg-gradient-to-l from-sidebar from-60% transition-opacity duration-200">
                    {onCreateSession && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            className="p-1 rounded hover:bg-muted"
                            aria-label="New workspace session"
                            onClick={() => handleCreateSession(workspace.id)}
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom">New workspace session</TooltipContent>
                      </Tooltip>
                    )}
                    <DropdownMenu>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <DropdownMenuTrigger asChild>
                            <button className="transition-opacity p-1 rounded hover:bg-muted" aria-label="Workspace actions">
                              <MoreVertical className="w-3 h-3" />
                            </button>
                          </DropdownMenuTrigger>
                        </TooltipTrigger>
                        <TooltipContent side="bottom">More options</TooltipContent>
                      </Tooltip>
                      <DropdownMenuContent align="end" sideOffset={4}>
                        {onCreateSession && (
                          <DropdownMenuItem
                            onSelect={(event) => {
                              event.preventDefault();
                              handleCreateSession(workspace.id);
                            }}
                          >
                            <Plus className="w-4 h-4 mr-2" />
                            New Session
                          </DropdownMenuItem>
                        )}
                        {onBrowseFiles && (
                          <DropdownMenuItem
                            onSelect={(event) => {
                              event.preventDefault();
                              onBrowseFiles(workspace);
                            }}
                          >
                            <FolderOpen className="w-4 h-4 mr-2" />
                            Browse files
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem
                          onSelect={(event) => {
                            event.preventDefault();
                            if (repoPath) {
                              togglePinMutation.mutate({
                                workspaceId: workspace.id,
                                repoPath
                              });
                            }
                          }}
                        >
                          <Pin className="w-4 h-4 mr-2" />
                          {workspace.is_pinned ? "Unpin" : "Pin"} Workspace
                        </DropdownMenuItem>
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
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onSelect={() => handleDeleteAllWorkspaceSessions(workspace.id, getWorkspaceTitle(workspace.id))}
                          disabled={sessionsForWorkspace.length === 0}
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          Delete All Sessions
                        </DropdownMenuItem>
                        {onDeleteWorkspace && (
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onSelect={() => onDeleteWorkspace(workspace)}
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Delete Workspace
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
                {sessionsForWorkspace.length > 0 ? (
                  sessionsForWorkspace.map((session) => (
                    <div key={session.id}>
                      {renderSessionRow(session)}
                    </div>
                  ))
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full justify-center text-xs text-muted-foreground !h-auto py-1.5"
                    onClick={() => handleCreateSession(workspace.id)}
                    disabled={!onCreateSession}
                  >
                    <TerminalIcon className="w-3 h-3 mr-2" />
                    Start session
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      </div>
      {/* Footer with actions */}
      {(openSettings || navigateToDashboard) && (
        <div className="border-t border-border px-2 py-2 flex items-center gap-2">
          {navigateToDashboard && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={navigateToDashboard}
                  className={`h-6 w-6 rounded-md hover:bg-muted flex items-center justify-center transition-colors ${
                    currentPage === 'dashboard' ? 'bg-primary/20' : ''
                  }`}
                  aria-label="Dashboard"
                >
                  <Home className={`w-3.5 h-3.5 ${
                    currentPage === 'dashboard' ? 'text-primary' : 'text-muted-foreground'
                  }`} />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top">Dashboard</TooltipContent>
            </Tooltip>
          )}
          {openSettings && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => openSettings("application")}
                  className={`h-6 w-6 rounded-md hover:bg-muted flex items-center justify-center transition-colors ${
                    currentPage === 'settings' ? 'bg-primary/20' : ''
                  }`}
                  aria-label="Settings"
                >
                  <Settings className={`w-3.5 h-3.5 ${
                    currentPage === 'settings' ? 'text-primary' : 'text-muted-foreground'
                  }`} />
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
});
