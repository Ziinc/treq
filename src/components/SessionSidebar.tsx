import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Session, Worktree, GitStatus, BranchInfo, getSessions, getWorktrees, deleteSession, ptyClose, ptySessionExists, gitGetStatus, gitGetBranchInfo, calculateDirectorySize } from "../lib/api";
import { useToast } from "./ui/toast";
import { X, Plus, Pause, MoreVertical, MoreHorizontal, FolderOpen, GitBranch, Trash2, Terminal as TerminalIcon, HardDrive, Settings } from "lucide-react";
import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "./ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "./ui/popover";
import { openPath } from "@tauri-apps/plugin-opener";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./ui/tooltip";
import { formatBytes } from "../lib/utils";

interface SessionSidebarProps {
  activeSessionId: number | null;
  onSessionClick: (session: Session) => void;
  onCreateSession?: (worktreeId: number | null) => void;
  onCloseActiveSession?: () => void;
  repoPath?: string;
  currentBranch?: string | null;
  onDeleteWorktree?: (worktree: Worktree) => void;
  onSessionActivityListenerChange?: (listener: ((sessionId: number) => void) | null) => void;
  openSettings?: (tab?: string) => void;
}

interface WorktreeInfoPopoverProps {
  worktree: Worktree;
  title: string;
  children: React.ReactNode;
}

const WorktreeInfoPopover: React.FC<WorktreeInfoPopoverProps> = ({ worktree, title, children }) => {
  const [status, setStatus] = useState<GitStatus | null>(null);
  const [branchInfo, setBranchInfo] = useState<BranchInfo | null>(null);
  const [size, setSize] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchGitInfo = async () => {
      try {
        const [gitStatus, branchData, dirSize] = await Promise.all([
          gitGetStatus(worktree.worktree_path),
          gitGetBranchInfo(worktree.worktree_path),
          calculateDirectorySize(worktree.worktree_path),
        ]);
        setStatus(gitStatus);
        setBranchInfo(branchData);
        setSize(dirSize);
      } catch (err) {
        console.error("Failed to fetch git info:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchGitInfo();
    const interval = setInterval(fetchGitInfo, 30000);
    return () => clearInterval(interval);
  }, [worktree.worktree_path]);

  const totalChanges = status
    ? status.modified + status.added + status.deleted + status.untracked
    : 0;

  return (
    <Popover>
      <PopoverTrigger asChild>
        {children}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80">
        <div className="space-y-3">
          <div>
            <h4 className="font-semibold text-sm mb-1">{title}</h4>
          </div>
          <div className="space-y-2 text-sm">
            <div>
              <div className="text-xs text-muted-foreground mb-0.5">Branch</div>
              <div className="font-mono text-xs break-all">{worktree.branch_name}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-0.5">Path</div>
              <div className="font-mono text-xs break-all">{worktree.worktree_path}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-0.5">Created</div>
              <div className="text-xs">{new Date(worktree.created_at).toLocaleString()}</div>
            </div>
            {size !== null && (
              <div>
                <div className="text-xs text-muted-foreground mb-0.5">Size</div>
                <div className="text-xs flex items-center gap-1">
                  <HardDrive className="w-3 h-3" />
                  {formatBytes(size)}
                </div>
              </div>
            )}
          </div>

          {/* Git Status */}
          {loading ? (
            <div className="text-xs text-muted-foreground">Loading git info...</div>
          ) : (
            <div className="space-y-2">
              <div className="text-xs text-muted-foreground">Git Status</div>
              {branchInfo && (
                <div className="flex flex-wrap gap-1.5 text-xs">
                  {branchInfo.ahead > 0 && (
                    <div className="px-2 py-0.5 bg-green-500/10 text-green-600 dark:text-green-400 rounded-md">
                      ↑ {branchInfo.ahead} ahead
                    </div>
                  )}
                  {branchInfo.behind > 0 && (
                    <div className="px-2 py-0.5 bg-orange-500/10 text-orange-600 dark:text-orange-400 rounded-md">
                      ↓ {branchInfo.behind} behind
                    </div>
                  )}
                  {branchInfo.ahead === 0 && branchInfo.behind === 0 && (
                    <div className="px-2 py-0.5 bg-muted text-muted-foreground rounded-md">
                      Up to date
                    </div>
                  )}
                </div>
              )}
              {status && (
                <div className="flex flex-wrap gap-1.5 text-xs">
                  {totalChanges > 0 ? (
                    <>
                      {status.modified > 0 && (
                        <div className="px-2 py-0.5 bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 rounded-md">
                          {status.modified} modified
                        </div>
                      )}
                      {(status.added + status.untracked) > 0 && (
                        <div className="px-2 py-0.5 bg-green-500/10 text-green-600 dark:text-green-400 rounded-md">
                          {status.added} added | {status.untracked} untracked
                        </div>
                      )}
                      {status.deleted > 0 && (
                        <div className="px-2 py-0.5 bg-red-500/10 text-red-600 dark:text-red-400 rounded-md">
                          {status.deleted} deleted
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="px-2 py-0.5 bg-muted text-muted-foreground rounded-md">
                      No changes
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};

export const SessionSidebar: React.FC<SessionSidebarProps> = ({
  activeSessionId,
  onSessionClick,
  onCreateSession,
  onCloseActiveSession,
  repoPath,
  currentBranch,
  onDeleteWorktree,
  onSessionActivityListenerChange,
  openSettings,
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
    queryKey: ["sessions"],
    queryFn: getSessions,
    refetchInterval: 5000,
  });

  const { data: worktrees = [] } = useQuery({
    queryKey: ["worktrees"],
    queryFn: getWorktrees,
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
      await deleteSession(session.id);
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

  const mainRepoSessions = sessions.filter((s) => s.worktree_id === null);
  const worktreeSessions = sessions.filter((s) => s.worktree_id !== null);

  const worktreeMap = useMemo(() => {
    const map = new Map<number, Worktree>();
    worktrees.forEach((worktree) => map.set(worktree.id, worktree));
    return map;
  }, [worktrees]);

  const sessionsByWorktree = useMemo(() => {
    const groups = new Map<number, Session[]>();
    worktreeSessions.forEach((session) => {
      if (session.worktree_id === null) return;
      const current = groups.get(session.worktree_id) ?? [];
      current.push(session);
      groups.set(session.worktree_id, current);
    });

    groups.forEach((list, key) => {
      list.sort((a, b) => a.created_at.localeCompare(b.created_at));
      groups.set(key, [...list]);
    });

    return groups;
  }, [worktreeSessions]);

  const orphanSessions = worktreeSessions.filter(
    (session) => session.worktree_id !== null && !worktreeMap.has(session.worktree_id)
  );

  const getWorktreeTitle = useCallback(
    (worktreeId: number) => {
      const worktree = worktreeMap.get(worktreeId);
      if (!worktree) return "Worktree";
      if (worktree.metadata) {
        try {
          const metadata = JSON.parse(worktree.metadata);
          return metadata.initial_plan_title || metadata.intent || worktree.branch_name;
        } catch {
          return worktree.branch_name;
        }
      }
      return worktree.branch_name;
    },
    [worktreeMap]
  );

  const { fileManagerLabel, fileManagerCommand } = useMemo(() => {
    if (typeof navigator !== "undefined") {
      const platform = navigator.userAgent || navigator.platform || "";
      if (/mac/i.test(platform)) {
        return { fileManagerLabel: "Finder", fileManagerCommand: "open" };
      }
      if (/win/i.test(platform)) {
        return { fileManagerLabel: "Explorer", fileManagerCommand: "explorer" };
      }
    }
    return { fileManagerLabel: "Explorer", fileManagerCommand: undefined };
  }, []);

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
        await openPath(path, fileManagerCommand);
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
    [addToast, fileManagerCommand]
  );

  const renderSessionIcon = (sessionId: number) => {
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
  };

  const handleCreateSession = useCallback(
    (worktreeId: number | null) => {
      onCreateSession?.(worktreeId);
    },
    [onCreateSession]
  );

  const renderSessionRow = (session: Session) => (
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
  );

  return (
    <TooltipProvider delayDuration={200} skipDelayDuration={100}>
      <div className="group/sidebar w-[240px] bg-sidebar border-r border-border flex flex-col h-screen">
      <div className="pl-1 pr-2 py-2 space-y-1 min-h-[120px] flex-1 overflow-y-auto">
        <div className="relative flex items-center text-[12px] text-muted-foreground uppercase tracking-wide px-2 py-1">
          <span className="truncate flex items-center" title={currentBranch || "Main"}>
            <GitBranch className="w-4 h-4 mr-1" />
            {currentBranch || "main"}
          </span>
          <div className="absolute right-2 flex items-center gap-1 pl-4 bg-gradient-to-l from-sidebar from-60% opacity-0 group-hover/sidebar:opacity-100 transition-opacity duration-200">
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
            variant="secondary"
            size="sm"
            className="w-full justify-center text-xs text-muted-foreground !h-auto py-1.5"
            onClick={() => handleCreateSession(null)}
            disabled={!onCreateSession}
          >
            <TerminalIcon className="w-3 h-3 mr-2" />
            Start session
          </Button>
        )}

        {(worktrees.length > 0 || orphanSessions.length > 0) && (
        <div className="space-y-2 border-t border-border">
          {worktrees.length > 0 && (
            <div className="text-[12px] text-muted-foreground uppercase tracking-wide px-2 py-1">
              Worktrees
            </div>
          )}
          {worktrees.map((worktree) => {
            const sessionsForWorktree = sessionsByWorktree.get(worktree.id) || [];
            return (
              <div key={worktree.id} className="space-y-1">
                <div className="relative flex items-center text-[12px] text-muted-foreground uppercase tracking-wide px-2 pt-1">
                  <WorktreeInfoPopover worktree={worktree} title={getWorktreeTitle(worktree.id)}>
                    <span className="truncate flex items-center cursor-pointer hover:text-foreground transition-colors" title={getWorktreeTitle(worktree.id)}>
                      <GitBranch className="w-4 h-4 mr-1" />
                      {getWorktreeTitle(worktree.id)}
                    </span>
                  </WorktreeInfoPopover>
                  <div className="absolute right-2 flex items-center gap-1 pl-4 bg-gradient-to-l from-sidebar from-60% opacity-0 group-hover/sidebar:opacity-100 transition-opacity duration-200">
                    {onCreateSession && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            className="p-1 rounded hover:bg-muted"
                            aria-label="New worktree session"
                            onClick={() => handleCreateSession(worktree.id)}
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom">New worktree session</TooltipContent>
                      </Tooltip>
                    )}
                    <DropdownMenu>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <DropdownMenuTrigger asChild>
                            <button className="transition-opacity p-1 rounded hover:bg-muted" aria-label="Worktree actions">
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
                              handleCreateSession(worktree.id);
                            }}
                          >
                            <Plus className="w-4 h-4 mr-2" />
                            New Session
                          </DropdownMenuItem>
                        )}
                        {worktree.worktree_path && (
                          <DropdownMenuItem
                            onSelect={(event) => {
                              event.preventDefault();
                              handleOpenInFileManager(worktree.worktree_path);
                            }}
                          >
                            <FolderOpen className="w-4 h-4 mr-2" />
                            Open in {fileManagerLabel}
                          </DropdownMenuItem>
                        )}
                        {onDeleteWorktree && (
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onSelect={(event) => {
                              event.preventDefault();
                              onDeleteWorktree(worktree);
                            }}
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Delete Worktree
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
                {sessionsForWorktree.length > 0 ? (
                  sessionsForWorktree.map((session) => (
                    <div key={session.id}>
                      {renderSessionRow(session)}
                    </div>
                  ))
                ) : (
                  <Button
                    variant="secondary"
                    size="sm"
                    className="w-full justify-center text-xs text-muted-foreground !h-auto py-1.5"
                    onClick={() => handleCreateSession(worktree.id)}
                    disabled={!onCreateSession}
                  >
                    <TerminalIcon className="w-3 h-3 mr-2" />
                    Start session
                  </Button>
                )}
              </div>
            );
          })}
          {orphanSessions.length > 0 && (
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[12px] text-muted-foreground uppercase tracking-wide px-2 pt-1">
                <span className="truncate">Detached Sessions</span>
              </div>
              {orphanSessions.map((session) => (
                <div key={session.id}>
                  {renderSessionRow(session)}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      </div>
      {/* Footer with settings button */}
      {openSettings && (
        <div className="border-t border-border px-2 py-2 flex justify-start">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => openSettings("application")}
                className="h-6 w-6 rounded-md hover:bg-muted flex items-center justify-center transition-colors"
                aria-label="Settings"
              >
                <Settings className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top">Settings</TooltipContent>
          </Tooltip>
        </div>
      )}
    </div>
    </TooltipProvider>
  );
};
