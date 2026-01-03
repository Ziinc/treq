import {
  useState,
  useEffect,
  useCallback,
  useMemo,
  Suspense,
  lazy,
  useRef,
} from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { ask } from "@tauri-apps/plugin-dialog";
import { CreateWorkspaceDialog } from "./CreateWorkspaceDialog";
import { CommandPalette } from "./CommandPalette";
import { WorkspaceSidebar } from "./WorkspaceSidebar";
import { ErrorBoundary } from "./ErrorBoundary";
import { WorkspaceTerminalPane, type WorkspaceTerminalPaneHandle } from "./WorkspaceTerminalPane";
import type { ClaudeSessionData } from "./terminal/types";
import type { SessionCreationInfo } from "../types/sessions";

// Lazy imports
const ShowWorkspace = lazy(() =>
  import("./ShowWorkspace").then((m) => ({ default: m.ShowWorkspace }))
);
import { SettingsPage } from "./SettingsPage";
import { MergePreviewPage } from "./MergePreviewPage";
import { useToast } from "./ui/toast";
import { useKeyboardShortcut } from "../hooks/useKeyboard";
import {
  getWorkspaces,
  rebuildWorkspaces,
  deleteWorkspace,
  cleanupStaleWorkspaces,
  getSetting,
  setSetting,
  selectFolder,
  getRepoSetting,
  Workspace,
  createSession,
  updateSessionAccess,
  updateSessionName,
  getSessions,
  setSessionModel,
  jjIsWorkspace,
  jjGitFetch,
  checkAndRebaseWorkspaces,
  startFileWatcher,
  stopFileWatcher,
} from "../lib/api";
import { Loader2 } from "lucide-react";

// Loading spinner component for Suspense fallback
const LoadingSpinner = () => (
  <div className="flex items-center justify-center h-full w-full">
    <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
  </div>
);

type ViewMode = "session" | "show-workspace" | "settings" | "merge-preview";

type SessionOpenOptions = {
  initialPrompt?: string;
  promptLabel?: string;
  forceNew?: boolean;
  sessionName?: string;
  selectedFilePath?: string;
};

interface DashboardProps {
  initialViewMode?: ViewMode;
}
export const Dashboard: React.FC<DashboardProps> = ({ initialViewMode = "show-workspace" }) => {
  const [repoPath, setRepoPath] = useState("");
  const [currentBranch, setCurrentBranch] = useState<string | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>(initialViewMode);
  const [selectedWorkspace, setSelectedWorkspace] = useState<Workspace | null>(
    null
  );
  const [mergeWorkspace, setMergeWorkspace] = useState<Workspace | null>(null);
  const [_initialSettingsTab, _setInitialSettingsTab] = useState<
    "application" | "repository"
  >("repository");
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [showBranchSwitcher, setShowBranchSwitcher] = useState(false);
  const [showFilePicker, setShowFilePicker] = useState(false);
  const [showWorkspaceDeletion, setShowWorkspaceDeletion] = useState(false);
  const [activeSessionId, setActiveSessionId] = useState<number | null>(null);
  const [sessionSelectedFile, setSessionSelectedFile] = useState<string | null>(
    null
  );
  const [selectedWorkspaceIds, setSelectedWorkspaceIds] = useState<Set<number>>(
    new Set()
  );
  const [lastSelectedWorkspaceIndex, setLastSelectedWorkspaceIndex] = useState<
    number | null
  >(null);
  const [pendingClaudeSession, setPendingClaudeSession] = useState<
    SessionCreationInfo | null
  >(null);

  const terminalPaneRef = useRef<WorkspaceTerminalPaneHandle>(null);

  const queryClient = useQueryClient();
  const { addToast } = useToast();

  const handleReturnToDashboard = useCallback(() => {
    // Navigate to main repo ShowWorkspace > Code
    setSelectedWorkspace(null);
    setActiveSessionId(null);
    setPendingClaudeSession(null);
    setViewMode("session");
  }, []);

  const openSettings = useCallback((tab?: string) => {
    _setInitialSettingsTab(
      (tab as "application" | "repository") || "repository"
    );
    setViewMode("settings");
  }, []);

  const handleOpenMergePreview = useCallback(() => {
    if (selectedWorkspace) {
      setMergeWorkspace(selectedWorkspace);
      setViewMode("merge-preview");
    }
  }, [selectedWorkspace]);

  // Keyboard shortcuts
  useKeyboardShortcut("n", true, () => {
    if (repoPath && viewMode === "session" && !selectedWorkspace) {
      setShowCreateDialog(true);
    }
  });

  useKeyboardShortcut("k", true, () => {
    setShowCommandPalette(true);
  });

  useKeyboardShortcut("p", true, () => {
    if (repoPath) {
      setShowFilePicker(true);
    }
  });

  useKeyboardShortcut("Escape", false, () => {
    if (showCreateDialog) setShowCreateDialog(false);
    if (showCommandPalette) setShowCommandPalette(false);
  });

  // Load repo path from URL params (for new windows) or saved settings
  useEffect(() => {
    const loadInitialRepo = async () => {
      // Check URL params first (for new windows opened via "Open in New Window...")
      const urlParams = new URLSearchParams(window.location.search);
      const urlRepoPath = urlParams.get("repo");

      if (urlRepoPath) {
        // Check if it's a jj workspace
        const isValid = await jjIsWorkspace(urlRepoPath);
        if (isValid) {
          setRepoPath(urlRepoPath);
          return;
        }
      }

      // Fall back to saved setting (for main window)
      const savedPath = await getSetting("repo_path");
      if (savedPath) {
        setRepoPath(savedPath);
      }
    };

    const loadAppFontSize = async () => {
      // Load and apply font size to html element (sets base for rem units)
      const savedSize = await getSetting("terminal_font_size");
      if (savedSize) {
        const parsed = parseInt(savedSize, 10);
        if (!isNaN(parsed) && parsed >= 8 && parsed <= 32) {
          document.documentElement.style.fontSize = `${parsed}px`;
        }
      } else {
        // Default to 12px if no setting exists
        document.documentElement.style.fontSize = "12px";
      }
    };

    loadInitialRepo();
    loadAppFontSize();
  }, []);

  // Derive repo name from repo path
  const repoName = useMemo(
    () =>
      repoPath
        ? repoPath.split("/").pop() || repoPath.split("\\").pop() || repoPath
        : "",
    [repoPath]
  );

  // Update window title when repo changes
  useEffect(() => {
    if (repoName) {
      getCurrentWindow().setTitle(`Treq - ${repoName}`);
    } else {
      getCurrentWindow().setTitle("Treq - Git Workspace Manager");
    }
  }, [repoName]);

  // Fetch main repository branch info
  useEffect(() => {
    if (!repoPath) {
      setCurrentBranch(null);
      return;
    }

    // Load current branch for jj
    // For now, we'll just set it to null since we don't have a jj equivalent yet
    setCurrentBranch(null);
  }, [repoPath]);

  // Manage file watcher lifecycle for selected workspace
  useEffect(() => {
    if (!selectedWorkspace) return;

    const workspaceId = selectedWorkspace.id;
    const workspacePath = selectedWorkspace.workspace_path;

    startFileWatcher(workspaceId, workspacePath).catch((err) => {
      console.error("Failed to start file watcher:", err);
    });

    // Stop watching when workspace changes or component unmounts
    return () => {
      stopFileWatcher(workspaceId, workspacePath).catch((err) => {
        console.error("Failed to stop file watcher:", err);
      });
    };
  }, [selectedWorkspace?.id, selectedWorkspace?.workspace_path]);

  // Listen for window focus to refresh workspace data
  useEffect(() => {
    if (!repoPath) return;

    const handleFocus = async () => {
      try {
        // Trigger background rebase check for all workspaces
        const result = await checkAndRebaseWorkspaces(repoPath);
        if (result.rebased && result.has_conflicts) {
          addToast({
            title: "Some workspaces have conflicts",
            description: "Check workspace details for more information",
            type: "warning",
          });
        }
      } catch (error) {
        console.error("Auto-rebase failed:", error);
      }

      // Invalidate queries to refresh workspace data
      queryClient.invalidateQueries({
        queryKey: ["workspaces", repoPath],
      });
    };

    const unlistenFocus = getCurrentWindow().onFocusChanged(
      ({ payload: focused }) => {
        if (focused) {
          handleFocus();
        }
      }
    );

    return () => {
      unlistenFocus.then((fn) => fn());
    };
  }, [repoPath, queryClient]);

  const { data: sessions = [] } = useQuery({
    queryKey: ["sessions", repoPath],
    queryFn: () => getSessions(repoPath),
    refetchInterval: 30000,
    enabled: !!repoPath,
  });


  const { data: workspaces = [], refetch: _refetch } = useQuery({
    queryKey: ["workspaces", repoPath],
    queryFn: () => getWorkspaces(repoPath),
    enabled: !!repoPath,
  });

  // Clean up stale workspace directories on startup
  useEffect(() => {
    const cleanup = async () => {
      if (repoPath) {
        try {
          await cleanupStaleWorkspaces(repoPath);
        } catch (error) {
          console.error("Failed to cleanup stale workspaces:", error);
        }
      }
    };
    cleanup();
  }, [repoPath]);

  // Fetch remote branches on app startup when repo is loaded
  useEffect(() => {
    const fetchRemotes = async () => {
      if (repoPath) {
        try {
          await jjGitFetch(repoPath);
          console.log("[Dashboard] Fetched remote branches on startup");
        } catch (error) {
          console.error("[Dashboard] Failed to fetch remote branches:", error);
          // Don't show error to user - fetch failure shouldn't block app
        }
      }
    };
    fetchRemotes();
  }, [repoPath]);

  // Rebuild workspaces from filesystem if database is empty
  useEffect(() => {
    const rebuildIfNeeded = async () => {
      if (repoPath && workspaces.length === 0) {
        try {
          const rebuilt = await rebuildWorkspaces(repoPath);
          if (rebuilt.length > 0) {
            queryClient.invalidateQueries({
              queryKey: ["workspaces", repoPath],
            });
          }
        } catch (error) {
          console.error("Failed to rebuild workspaces:", error);
        }
      }
    };
    rebuildIfNeeded();
  }, [repoPath, workspaces.length, queryClient]);

  // Note: Git cache preloader removed since we're using JJ now

  const deleteWorkspaceMutation = useMutation({
    mutationFn: async (workspace: Workspace) => {
      await deleteWorkspace(workspace.repo_path, workspace.workspace_path, workspace.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workspaces", repoPath] });
      handleReturnToDashboard(); // Navigate to dashboard & clear selected workspace
      addToast({
        title: "Workspace Deleted",
        description: "Workspace has been removed successfully",
        type: "success",
      });
    },
    onError: (error) => {
      addToast({
        title: "Delete Failed",
        description: error instanceof Error ? error.message : String(error),
        type: "error",
      });
    },
  });

  // Consolidate all Tauri event listeners
  useEffect(() => {
    const listeners = [
      // Git config init error handler
      listen<{ repo_path: string; error: string }>(
        "git-config-init-error",
        (event) => {
          const { repo_path, error } = event.payload;
          if (repoPath && repo_path === repoPath) {
            addToast({
              title: "Git configuration warning",
              description: `Could not configure automatic remote tracking: ${error}`,
              type: "warning",
            });
          }
        }
      ),
      // Navigate to settings
      listen("navigate-to-settings", () => {
        setViewMode("settings");
      }),
      // Menu open repository
      listen("menu-open-repository", async () => {
        const selected = await selectFolder();
        if (!selected) return;

        const isRepo = await jjIsWorkspace(selected);
        if (!isRepo) {
          addToast({
            title: "Not a JJ Repository",
            description:
              "Please select a folder that contains a jj repository.",
            type: "error",
          });
          return;
        }

        await setSetting("repo_path", selected);
        setRepoPath(selected);
        setViewMode("session");
        setSelectedWorkspace(null);

        // Reset session state
        setActiveSessionId(null);
        setSessionSelectedFile(null);

        // Invalidate queries to force immediate refresh
        queryClient.invalidateQueries({ queryKey: ["workspaces"] });
        queryClient.invalidateQueries({ queryKey: ["sessions"] });

        addToast({
          title: "Repository Opened",
          description: `Now viewing ${selected.split("/").pop() || selected}`,
          type: "success",
        });
      }),
      // Menu open in new window
      listen("menu-open-in-new-window", async () => {
        const selected = await selectFolder();
        if (!selected) return;

        const isRepo = await jjIsWorkspace(selected);
        if (!isRepo) {
          addToast({
            title: "Not a JJ Repository",
            description:
              "Please select a folder that contains a jj repository.",
            type: "error",
          });
          return;
        }

        const windowLabel = `treq-${Date.now()}`;
        const newRepoName =
          selected.split("/").pop() || selected.split("\\").pop() || selected;

        const webview = new WebviewWindow(windowLabel, {
          url: `index.html?repo=${encodeURIComponent(selected)}`,
          title: `Treq - ${newRepoName}`,
          width: 1400,
          height: 900,
        });

        webview.once("tauri://error", (e) => {
          console.error("Failed to create window:", e);
          addToast({
            title: "Failed to open window",
            description: "Could not create new window",
            type: "error",
          });
        });
      }),
    ];

    return () => {
      Promise.all(listeners).then((unlistenFns) => {
        unlistenFns.forEach((fn) => fn());
      });
    };
  }, [
    repoPath,
    addToast,
    queryClient,
    selectedWorkspace,
    deleteWorkspaceMutation,
  ]);

  // Note: Git merge functionality removed - using JJ now

  // Helper to create or get session
  const getOrCreateSession = useCallback(
    async (
      workspaceId: number | null,
      options?: {
        workspaceBranchName?: string;
        forceNew?: boolean;
        name?: string;
      }
    ): Promise<number> => {
      const sessions = await getSessions(repoPath);
      if (!options?.forceNew) {
        const existing = sessions.find((s) => s.workspace_id === workspaceId);
        if (existing) {
          await updateSessionAccess(repoPath, existing.id);
          return existing.id;
        }
      }

      const scopedSessions = sessions.filter(
        (s) => s.workspace_id === workspaceId
      );
      const index = scopedSessions.length + 1;
      let name = options?.name;
      if (!name) {
        name = `Claude Session ${index}`;
      }

      const sessionId = await createSession(repoPath, workspaceId, name);

      // Apply default model from settings (repo-level overrides application-level)
      try {
        const repoDefaultModel = await getRepoSetting(
          repoPath,
          "default_model"
        );
        const appDefaultModel = await getSetting("default_model");
        const defaultModel = repoDefaultModel || appDefaultModel;

        if (defaultModel) {
          await setSessionModel(repoPath, sessionId, defaultModel);
        }
      } catch (error) {
        console.warn("Failed to set default model for session:", error);
      }

      queryClient.invalidateQueries({ queryKey: ["sessions"] });
      return sessionId;
    },
    [queryClient, workspaces, repoPath]
  );

  const handleOpenSession = useCallback(
    async (workspace: Workspace | null, options?: SessionOpenOptions) => {
      const sessionId = await getOrCreateSession(workspace?.id ?? null, {
        workspaceBranchName: workspace?.branch_name,
        forceNew: options?.forceNew,
        name: options?.sessionName,
      });
      setSelectedWorkspace(workspace);
      setSessionSelectedFile(options?.selectedFilePath ?? null);
      setActiveSessionId(sessionId);
      setViewMode(workspace ? "show-workspace" : "session");
    },
    [getOrCreateSession]
  );

  const handleCreateSessionFromSidebar = useCallback(
    async (workspaceId: number | null) => {
      const workspace = workspaceId
        ? workspaces.find((w) => w.id === workspaceId) ?? null
        : null;
      await handleOpenSession(workspace, { forceNew: true });
    },
    [handleOpenSession, workspaces]
  );

  const handleWorkspaceMultiSelect = useCallback(
    (workspace: Workspace | null, event: React.MouseEvent) => {
      // Handle clicking away to clear selection
      if (workspace === null) {
        setSelectedWorkspaceIds(new Set());
        setLastSelectedWorkspaceIndex(null);
        return;
      }

      const workspaceIndex = workspaces.findIndex((w) => w.id === workspace.id);
      if (workspaceIndex === -1) return;

      const isMetaKey = event.metaKey || event.ctrlKey;
      const isShiftKey = event.shiftKey;

      if (isShiftKey && lastSelectedWorkspaceIndex !== null) {
        // Range selection
        const start = Math.min(lastSelectedWorkspaceIndex, workspaceIndex);
        const end = Math.max(lastSelectedWorkspaceIndex, workspaceIndex);
        const newSelection = new Set<number>();
        for (let i = start; i <= end; i++) {
          newSelection.add(workspaces[i].id);
        }
        setSelectedWorkspaceIds(newSelection);
      } else if (isMetaKey) {
        // Toggle selection
        setSelectedWorkspaceIds((prev) => {
          const next = new Set(prev);
          if (next.has(workspace.id)) {
            next.delete(workspace.id);
          } else {
            next.add(workspace.id);
          }
          return next;
        });
        setLastSelectedWorkspaceIndex(workspaceIndex);
      } else {
        // Regular click - clear multi-select, open workspace
        setSelectedWorkspaceIds(new Set());
        setLastSelectedWorkspaceIndex(workspaceIndex);
        handleOpenSession(workspace);
      }
    },
    [workspaces, lastSelectedWorkspaceIndex, handleOpenSession]
  );

  const handleBulkDelete = async () => {
    const count = selectedWorkspaceIds.size;
    const confirmed = await ask(
      `Delete ${count} workspace${count > 1 ? "s" : ""}?`,
      { title: "Delete Workspaces", kind: "warning" }
    );
    if (confirmed) {
      const workspacesToDelete = workspaces.filter((w) =>
        selectedWorkspaceIds.has(w.id)
      );
      try {
        // Delete all workspaces without triggering individual onSuccess callbacks
        for (const workspace of workspacesToDelete) {
          await deleteWorkspace(workspace.repo_path, workspace.workspace_path, workspace.id);
        }
        // Show single toast and refresh after all deletions
        queryClient.invalidateQueries({ queryKey: ["workspaces", repoPath] });
        handleReturnToDashboard();
        addToast({
          title: `${count} Workspace${count > 1 ? "s" : ""} Deleted`,
          description: `Successfully removed ${count} workspace${count > 1 ? "s" : ""}`,
          type: "success",
        });
      } catch (error) {
        addToast({
          title: "Delete Failed",
          description: error instanceof Error ? error.message : String(error),
          type: "error",
        });
      }
      setSelectedWorkspaceIds(new Set());
    }
  };

  // Note: openSessionWithPrompt removed - was only used by MergeReviewPage which is git-specific

  const handleDelete = async (workspace: Workspace) => {
    const confirmed = await ask(`Delete workspace ${workspace.branch_name}?`, {
      title: "Delete Workspace",
      kind: "warning",
    });
    if (confirmed) {
      deleteWorkspaceMutation.mutate(workspace);
    }
  };

  // Note: Merge dialog functionality removed - using JJ now

  // Handle branch change after switching
  const handleBranchChanged = useCallback(() => {
    // Refresh workspace data
    queryClient.invalidateQueries({ queryKey: ["workspaces", repoPath] });
    addToast({ title: "Branch switched successfully", type: "success" });
  }, [repoPath, queryClient, addToast]);


  const isSessionView =
    viewMode === "session" || viewMode === "show-workspace";
  const showSidebar = true;

  // Build Claude sessions data for the terminal pane
  const claudeSessionsForPane = useMemo((): ClaudeSessionData[] => {
    const workspaceMap = new Map(workspaces.map((ws) => [ws.id, ws]));

    const paneSessions: ClaudeSessionData[] = sessions.map((session) => {
      const sessionWorkspace = session.workspace_id
        ? workspaceMap.get(session.workspace_id) ?? null
        : null;
      return {
        sessionId: session.id,
        sessionName: session.name,
        ptySessionId: `session-${session.id}`,
        workspacePath: sessionWorkspace?.workspace_path ?? null,
        repoPath: sessionWorkspace?.repo_path ?? repoPath,
      };
    });

    if (
      pendingClaudeSession &&
      !paneSessions.some(
        (session) => session.sessionId === pendingClaudeSession.sessionId
      )
    ) {
      paneSessions.push({
        sessionId: pendingClaudeSession.sessionId,
        sessionName: pendingClaudeSession.sessionName,
        ptySessionId: `session-${pendingClaudeSession.sessionId}`,
        workspacePath: pendingClaudeSession.workspacePath,
        repoPath: pendingClaudeSession.repoPath,
        pendingPrompt: pendingClaudeSession.pendingPrompt,
        permissionMode: pendingClaudeSession.permissionMode,
      });
    }

    return paneSessions;
  }, [sessions, workspaces, repoPath, pendingClaudeSession]);

  useEffect(() => {
    if (!pendingClaudeSession) return;
    const sessionExists = sessions.some(
      (session) => session.id === pendingClaudeSession.sessionId
    );
    if (sessionExists) {
      setPendingClaudeSession(null);
    }
  }, [sessions, pendingClaudeSession]);

  useEffect(() => {
    if (
      pendingClaudeSession &&
      activeSessionId !== pendingClaudeSession.sessionId
    ) {
      setPendingClaudeSession(null);
    }
  }, [activeSessionId, pendingClaudeSession]);

  const mainContentStyle = useMemo(
    () => ({ width: showSidebar ? "calc(100vw - 240px)" : "100%" }),
    [showSidebar]
  );
  const sessionLayerStyle = useMemo<React.CSSProperties>(
    () => ({
      visibility: isSessionView ? "visible" : "hidden",
      zIndex: isSessionView ? 10 : 0,
      pointerEvents: isSessionView ? "auto" : "none",
    }),
    [isSessionView]
  );

  return (
    <div className="flex h-screen bg-background">
      {/* WorkspaceSidebar - shown in session and settings views */}
      {showSidebar && (
        <WorkspaceSidebar
          repoPath={repoPath}
          currentBranch={currentBranch}
          selectedWorkspaceId={selectedWorkspace?.id ?? null}
          selectedWorkspaceIds={selectedWorkspaceIds}
          onWorkspaceClick={(workspace) => handleOpenSession(workspace)}
          onWorkspaceMultiSelect={handleWorkspaceMultiSelect}
          onBulkDelete={handleBulkDelete}
          onDeleteWorkspace={handleDelete}
          onCreateWorkspace={() => setShowCreateDialog(true)}
          openSettings={openSettings}
          navigateToDashboard={handleReturnToDashboard}
          onOpenCommandPalette={() => setShowCommandPalette(true)}
          currentPage={
            viewMode === "settings"
              ? "settings"
              : viewMode === "session" || viewMode === "show-workspace"
              ? "session"
              : null
          }
        />
      )}

      <div className="flex-1 relative" style={mainContentStyle}>
        {/* Sessions Layer - ALWAYS RENDERED ONCE */}
        <div
          className="absolute inset-0 flex flex-col workspace-terminal-container overflow-hidden"
          style={sessionLayerStyle}
        >
          {/* Show workspace views take up remaining space */}
          {repoPath && (
            <div className="flex-1 min-h-0 overflow-hidden relative">
              <ErrorBoundary
                fallbackTitle="Workspace error"
                resetKeys={[selectedWorkspace?.id]}
                onReset={handleReturnToDashboard}
              >
                <Suspense fallback={<LoadingSpinner />}>
                  <ShowWorkspace
                    repositoryPath={repoPath}
                    workspace={selectedWorkspace}
                    mainRepoBranch={currentBranch}
                    initialSelectedFile={sessionSelectedFile}
                    onDeleteWorkspace={handleDelete}
                    onOpenFilePicker={() => setShowFilePicker(true)}
                    onOpenMergePreview={handleOpenMergePreview}
                    onSessionCreated={(sessionData) => {
                      queryClient.invalidateQueries({
                        queryKey: ["sessions"],
                      });
                      setActiveSessionId(sessionData.sessionId);
                      setPendingClaudeSession(sessionData);
                    }}
                  />
                </Suspense>
              </ErrorBoundary>
            </div>
          )}
          {/* Shared workspace terminal pane - always rendered to preserve state */}
          <WorkspaceTerminalPane
            ref={terminalPaneRef}
            key={repoPath}
            workingDirectory={selectedWorkspace?.workspace_path || repoPath}
            isHidden={false}
            claudeSessions={claudeSessionsForPane}
            activeClaudeSessionId={isSessionView ? activeSessionId : null}
            onClaudeTerminalOutput={() => {
              // No-op: Just ensure callback chain is connected so ClaudeTerminalPanel
              // can detect when Claude is ready and send pending prompts
            }}
            onActiveSessionChange={(sessionId) => {
              if (sessionId === null) {
                setActiveSessionId(null);
                return;
              }
              setActiveSessionId(sessionId);
              // Find the session to determine view mode
              const session = sessions.find((s) => s.id === sessionId);
              if (session) {
                setViewMode(
                  session.workspace_id ? "show-workspace" : "session"
                );
                if (session.workspace_id) {
                  const ws = workspaces.find(
                    (w) => w.id === session.workspace_id
                  );
                  if (ws) setSelectedWorkspace(ws);
                }
              }
            }}
            onCreateNewSession={() => {
              handleCreateSessionFromSidebar(selectedWorkspace?.id ?? null);
            }}
            onRenameSession={async (sessionId, newName) => {
              try {
                await updateSessionName(repoPath, sessionId, newName);
                queryClient.invalidateQueries({
                  queryKey: ["sessions", repoPath],
                });
              } catch (error) {
                addToast({
                  title: "Failed to rename session",
                  description:
                    error instanceof Error ? error.message : String(error),
                  type: "error",
                });
              }
            }}
          />
        </div>

        {/* Content Layer - Dashboard, Settings, Merge-Review, Workspace-Edit */}
        <div
          className="absolute inset-0 overflow-auto"
          style={{
            visibility: !isSessionView ? "visible" : "hidden",
            zIndex: !isSessionView ? 10 : 0,
            pointerEvents: !isSessionView ? "auto" : "none",
          }}
        >
          {/* Settings View */}
          {viewMode === "settings" && (
            <SettingsPage
              repoPath={repoPath}
              onClose={handleReturnToDashboard}
              currentBranch={currentBranch}
            />
          )}

          {/* Merge Preview View */}
          {viewMode === "merge-preview" && mergeWorkspace && (
            <MergePreviewPage
              workspace={mergeWorkspace}
              repoPath={repoPath}
              onCancel={() => {
                setMergeWorkspace(null);
                setViewMode("show-workspace");
              }}
              onMergeComplete={async () => {
                // Delete workspace after successful merge
                try {
                  await deleteWorkspace(
                    mergeWorkspace.repo_path,
                    mergeWorkspace.workspace_path,
                    mergeWorkspace.id
                  );
                  // Invalidate workspace queries
                  queryClient.invalidateQueries({ queryKey: ["workspaces"] });
                } catch (error) {
                  addToast({
                    title: "Merge succeeded but workspace deletion failed",
                    description: "Please manually delete the workspace from the sidebar",
                    type: "warning",
                  });
                } finally {
                  setMergeWorkspace(null);
                  handleReturnToDashboard();
                }
              }}
            />
          )}
        </div>
      </div>

      {/* Global Dialogs */}
      {/* Note: MergeDialog removed - git-specific feature */}

      <CreateWorkspaceDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        repoPath={repoPath}
        onSuccess={async (workspaceId) => {
          // Invalidate and refetch workspaces
          await queryClient.invalidateQueries({ queryKey: ["workspaces", repoPath] });
          // Force refetch to get the latest data
          const updatedWorkspaces = await queryClient.fetchQuery({
            queryKey: ["workspaces", repoPath],
            queryFn: () => getWorkspaces(repoPath),
          });
          // Find the newly created workspace and navigate to it
          const newWorkspace = updatedWorkspaces.find((w) => w.id === workspaceId);
          if (newWorkspace) {
            handleOpenSession(newWorkspace);
          }
        }}
      />

      <CommandPalette
        showCommandPalette={showCommandPalette}
        onCommandPaletteChange={setShowCommandPalette}
        workspaces={workspaces}
        sessions={sessions}
        onNavigateToDashboard={handleReturnToDashboard}
        onNavigateToSettings={() => setViewMode("settings")}
        onOpenWorkspaceSession={handleOpenSession}
        onOpenSession={(session, workspace) => {
          setActiveSessionId(session.id);
          if (workspace) {
            setSelectedWorkspace(workspace);
            setViewMode("show-workspace");
          } else {
            setViewMode("session");
          }
        }}
        onOpenBranchSwitcher={() => setShowBranchSwitcher(true)}
        onOpenFilePicker={() => setShowFilePicker(true)}
        onOpenWorkspaceDeletion={() => setShowWorkspaceDeletion(true)}
        onCreateWorkspace={() => setShowCreateDialog(true)}
        onToggleTerminal={() => terminalPaneRef.current?.toggleCollapse()}
        onMaximizeTerminal={() => terminalPaneRef.current?.toggleMaximize()}
        onCreateAgentTerminal={() => terminalPaneRef.current?.createAgentSession()}
        onCreateShellTerminal={() => terminalPaneRef.current?.createShellSession()}
        hasSelectedWorkspace={!!selectedWorkspace}
        showBranchSwitcher={showBranchSwitcher}
        onBranchSwitcherChange={setShowBranchSwitcher}
        onBranchChanged={handleBranchChanged}
        showWorkspaceDeletion={showWorkspaceDeletion}
        onWorkspaceDeletionChange={setShowWorkspaceDeletion}
        currentWorkspace={selectedWorkspace}
        onDeleteWorkspace={handleDelete}
        showFilePicker={showFilePicker}
        onFilePickerChange={setShowFilePicker}
        onFileSelected={(filePath) => setSessionSelectedFile(filePath)}
        selectedWorkspaceId={selectedWorkspace?.id ?? null}
        repoPath={repoPath}
        workspaceChangeCounts={undefined}
      />
    </div>
  );
};
