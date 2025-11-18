import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { Session, getSessions, getWorktrees, deleteSession, ptyClose, Worktree } from "../lib/api";
import { useToast } from "./ui/toast";
import { X, Plus } from "lucide-react";
import { Button } from "./ui/button";

interface SessionSidebarProps {
  activeSessionId: number | null;
  onSessionClick: (session: Session) => void;
  onCreatePlanningSession?: () => void;
  onCreateExecutionSession?: () => void;
  repoPath: string | null;
}

export const SessionSidebar: React.FC<SessionSidebarProps> = ({
  activeSessionId,
  onSessionClick,
  onCreatePlanningSession,
  onCreateExecutionSession,
  repoPath,
}) => {
  const { addToast } = useToast();
  const queryClient = useQueryClient();

  const { data: sessions = [] } = useQuery({
    queryKey: ["sessions"],
    queryFn: getSessions,
    refetchInterval: 5000,
  });

  const { data: worktrees = [] } = useQuery({
    queryKey: ["worktrees"],
    queryFn: getWorktrees,
  });

  const deleteSessionMutation = useMutation({
    mutationFn: async (session: Session) => {
      // Close PTY session first
      await ptyClose(`session-${session.id}`);
      // Then delete from database
      await deleteSession(session.id);
    },
    onSuccess: () => {
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
    (e: React.MouseEvent, session: Session) => {
      e.stopPropagation();
      deleteSessionMutation.mutate(session);
    },
    [deleteSessionMutation]
  );

  // Group sessions by worktree
  const mainRepoSessions = sessions.filter((s) => s.worktree_id === null);
  const worktreeSessionsMap = new Map<number, Session[]>();
  
  sessions.forEach((session) => {
    if (session.worktree_id !== null) {
      const existing = worktreeSessionsMap.get(session.worktree_id) || [];
      existing.push(session);
      worktreeSessionsMap.set(session.worktree_id, existing);
    }
  });

  const getWorktreeName = (worktreeId: number): string => {
    const worktree = worktrees.find((w) => w.id === worktreeId);
    return worktree?.branch_name || `Worktree ${worktreeId}`;
  };

  const getSessionIcon = (sessionType: string): string => {
    return sessionType === "planning" ? "📄" : "✏️";
  };

  return (
    <div className="w-[200px] bg-sidebar border-r border-border flex flex-col h-screen overflow-y-auto">
      {/* Main Repo Sessions - Always visible */}
      <div className="p-2 space-y-1">
        <div className="text-[8px] text-muted-foreground uppercase tracking-wide px-2 py-1">
          Main
        </div>
        {mainRepoSessions.length > 0 ? (
          mainRepoSessions.map((session) => (
            <div
              key={session.id}
              onClick={() => onSessionClick(session)}
              className={`group relative flex items-center gap-1 px-2 py-1.5 rounded text-[8px] cursor-pointer transition-colors ${
                activeSessionId === session.id
                  ? "bg-primary/20 text-primary"
                  : "hover:bg-muted text-muted-foreground"
              }`}
            >
              <span className="text-[10px]">{getSessionIcon(session.session_type)}</span>
              <span className="flex-1 truncate">{session.name}</span>
              <button
                onClick={(e) => handleDeleteSession(e, session)}
                className="opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))
        ) : (
          <div className="flex flex-col items-center gap-2 py-4 px-2">
            <Button
              variant="outline"
              size="sm"
              className="w-full text-[10px] h-7"
              onClick={onCreatePlanningSession}
              disabled={!onCreatePlanningSession}
            >
              <Plus className="w-3 h-3 mr-1" />
              Planning
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="w-full text-[10px] h-7"
              onClick={onCreateExecutionSession}
              disabled={!onCreateExecutionSession}
            >
              <Plus className="w-3 h-3 mr-1" />
              Execution
            </Button>
          </div>
        )}
      </div>

      {/* Worktree Sessions */}
      {worktreeSessionsMap.size > 0 && (
        <div className="p-2 space-y-2 border-t border-border pt-2">
          <div className="text-[8px] text-muted-foreground uppercase tracking-wide px-2 py-1">
            Worktrees
          </div>
          {Array.from(worktreeSessionsMap.entries()).map(([worktreeId, sessions]) => (
            <div key={worktreeId} className="space-y-1">
              <div className="text-[7px] text-muted-foreground px-2 truncate">
                {getWorktreeName(worktreeId)}
              </div>
              {sessions.map((session) => (
                <div
                  key={session.id}
                  onClick={() => onSessionClick(session)}
                  className={`group relative flex items-center gap-1 px-2 py-1.5 rounded text-[8px] cursor-pointer transition-colors ${
                    activeSessionId === session.id
                      ? "bg-primary/20 text-primary"
                      : "hover:bg-muted text-muted-foreground"
                  }`}
                >
                  <span className="text-[10px]">{getSessionIcon(session.session_type)}</span>
                  <span className="flex-1 truncate">{session.name}</span>
                  <button
                    onClick={(e) => handleDeleteSession(e, session)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

    </div>
  );
};

