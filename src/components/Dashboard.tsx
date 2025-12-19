import {
  useState,
  useEffect,
  useCallback,
  useMemo,
  Suspense,
  lazy,
} from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { ask } from "@tauri-apps/plugin-dialog";
import { CreateWorkspaceDialog } from "./CreateWorkspaceDialog";
import { CreateWorkspaceFromRemoteDialog } from "./CreateWorkspaceFromRemoteDialog";
import { CommandPalette } from "./CommandPalette";
import { BranchSwitcher } from "./BranchSwitcher";
import { WorkspaceSidebar } from "./WorkspaceSidebar";
import { ErrorBoundary } from "./ErrorBoundary";
import { WorkspaceTerminalPane } from "./WorkspaceTerminalPane";
import type { ClaudeSessionData } from "./terminal/types";

// Lazy imports
const ShowWorkspace = lazy(() =>
  import("./ShowWorkspace").then((m) => ({ default: m.ShowWorkspace }))
);
const SettingsPage = lazy(() =>
  import("./SettingsPage").then((m) => ({ default: m.SettingsPage }))
);
import { useToast } from "./ui/toast";
import { useKeyboardShortcut } from "../hooks/useKeyboard";
import {
  getWorkspaces,
  rebuildWorkspaces,
  deleteWorkspaceFromDb,
  jjRemoveWorkspace,
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
} from "../lib/api";
import { Loader2 } from "lucide-react";

// Loading spinner component for Suspense fallback
const LoadingSpinner = () => (
  <div className="flex items-center justify-center h-full w-full">
    <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
  </div>
);

type ViewMode = "session" | "workspace-session" | "settings";

type SessionOpenOptions = {
  initialPrompt?: string;
  promptLabel?: string;
  forceNew?: boolean;
  sessionName?: string;
  selectedFilePath?: string;
};

export const Dashboard: React.FC = () => {
  const [repoPath, setRepoPath] = useState("");
  const [currentBranch, setCurrentBranch] = useState<string | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showCreateFromRemoteDialog, setShowCreateFromRemoteDialog] =
    useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("session");
  const [selectedWorkspace, setSelectedWorkspace] = useState<Workspace | null>(
    null
  );
  const [initialSettingsTab, setInitialSettingsTab] = useState<
    "application" | "repository"
  >("repository");
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [showBranchSwitcher, setShowBranchSwitcher] = useState(false);
  const [activeSessionId, setActiveSessionId] = useState<number | null>(null);
  const [sessionSelectedFile, setSessionSelectedFile] = useState<string | null>(
    null
  );

  const queryClient = useQueryClient();
  const { addToast } = useToast();

  const handleReturnToDashboard = useCallback(() => {
    // Navigate to main repo ShowWorkspace > Overview
    setSelectedWorkspace(null);
    setActiveSessionId(null);
    setViewMode("session");
  }, []);

  const openSettings = useCallback((tab?: string) => {
    setInitialSettingsTab(
      (tab as "application" | "repository") || "repository"
    );
    setViewMode("settings");
  }, []);


  // Keyboard shortcuts
  useKeyboardShortcut("n", true, () => {
    if (repoPath && viewMode === "session" && !selectedWorkspace) {
      setShowCreateDialog(true);
    }
  });

  useKeyboardShortcut("k", true, () => {
    setShowCommandPalette(true);
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
      // Navigate to dashboard
      listen("navigate-to-dashboard", () => {
        handleReturnToDashboard();
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
    handleReturnToDashboard,
  ]);

  // Listen for window focus to refresh workspace data
  useEffect(() => {
    if (!repoPath) return;

    const handleFocus = async () => {
      try {
        // Invalidate queries to refresh workspace data
        queryClient.invalidateQueries({
          queryKey: ["workspaces", repoPath],
        });
      } catch (error) {
        console.error("Failed to refresh workspace info on window focus:", error);
      }
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


  const { data: workspaces = [], refetch } = useQuery({
    queryKey: ["workspaces", repoPath],
    queryFn: () => getWorkspaces(repoPath),
    enabled: !!repoPath,
  });

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

  const deleteWorkspace = useMutation({
    mutationFn: async (workspace: Workspace) => {
      await jjRemoveWorkspace(workspace.repo_path, workspace.workspace_path);
      await deleteWorkspaceFromDb(workspace.repo_path, workspace.id);
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
      setViewMode(workspace ? "workspace-session" : "session");
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

  // Note: openSessionWithPrompt removed - was only used by MergeReviewPage which is git-specific

  const handleDelete = async (workspace: Workspace) => {
    const confirmed = await ask(`Delete workspace ${workspace.branch_name}?`, {
      title: "Delete Workspace",
      kind: "warning",
    });
    if (confirmed) {
      deleteWorkspace.mutate(workspace);
    }
  };

  // Note: Merge dialog functionality removed - using JJ now

  // Handle branch change after switching
  const handleBranchChanged = useCallback(() => {
    // Refresh workspace data
    queryClient.invalidateQueries({ queryKey: ["workspaces", repoPath] });
    addToast({ title: "Branch switched successfully", type: "success" });
  }, [repoPath, queryClient, addToast]);

  // Render command palette for all views
  const commandPaletteElement = (
    <CommandPalette
      open={showCommandPalette}
      onOpenChange={setShowCommandPalette}
      workspaces={workspaces}
      sessions={sessions}
      onNavigateToDashboard={handleReturnToDashboard}
      onNavigateToSettings={() => setViewMode("settings")}
      onOpenWorkspaceSession={(workspace) => {
        handleOpenSession(workspace);
      }}
      onOpenSession={(session, workspace) => {
        setActiveSessionId(session.id);
        if (workspace) {
          setSelectedWorkspace(workspace);
          setViewMode("workspace-session");
        } else {
          setViewMode("session");
        }
      }}
      onOpenBranchSwitcher={() => setShowBranchSwitcher(true)}
      repoPath={repoPath}
    />
  );

  // Render branch switcher modal
  const branchSwitcherElement = repoPath ? (
    <BranchSwitcher
      open={showBranchSwitcher}
      onOpenChange={setShowBranchSwitcher}
      repoPath={repoPath}
      onBranchChanged={handleBranchChanged}
    />
  ) : null;

  const isSessionView =
    viewMode === "session" || viewMode === "workspace-session";
  const showSidebar = true;

  // Build Claude sessions data for the terminal pane
  const claudeSessionsForPane = useMemo((): ClaudeSessionData[] => {
    return sessions
      .filter((s) => s.id === activeSessionId)
      .map((session) => {
        const sessionWorkspace = session.workspace_id
          ? workspaces.find((w) => w.id === session.workspace_id)
          : null;
        return {
          sessionId: session.id,
          sessionName: session.name,
          ptySessionId: `session-${session.id}`,
          workspacePath: sessionWorkspace?.workspace_path ?? null,
          repoPath: sessionWorkspace?.repo_path ?? repoPath,
        };
      });
  }, [sessions, activeSessionId, workspaces, repoPath]);

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
          onWorkspaceClick={(workspace) => handleOpenSession(workspace)}
          onCreateWorkspace={() => setShowCreateDialog(true)}
          onCreateWorkspaceFromRemote={() =>
            setShowCreateFromRemoteDialog(true)
          }
          openSettings={openSettings}
          navigateToDashboard={handleReturnToDashboard}
          onOpenCommandPalette={() => setShowCommandPalette(true)}
          currentPage={
            viewMode === "settings"
              ? "settings"
              : viewMode === "session" || viewMode === "workspace-session"
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
                    sessionId={activeSessionId}
                    mainRepoBranch={currentBranch}
                    onClose={handleReturnToDashboard}
                    initialSelectedFile={sessionSelectedFile}
                    onDeleteWorkspace={handleDelete}
                  />
                </Suspense>
              </ErrorBoundary>
            </div>
          )}
          {/* Shared workspace terminal pane - always rendered to preserve state */}
          <WorkspaceTerminalPane
            key={repoPath}
            workingDirectory={selectedWorkspace?.workspace_path || repoPath}
            isHidden={!isSessionView}
            claudeSessions={claudeSessionsForPane}
            activeClaudeSessionId={isSessionView ? activeSessionId : null}
            onActiveSessionChange={(sessionId) => {
              if (sessionId !== null) {
                setActiveSessionId(sessionId);
                // Find the session to determine view mode
                const session = sessions.find((s) => s.id === sessionId);
                if (session) {
                  setViewMode(
                    session.workspace_id ? "workspace-session" : "session"
                  );
                  if (session.workspace_id) {
                    const ws = workspaces.find(
                      (w) => w.id === session.workspace_id
                    );
                    if (ws) setSelectedWorkspace(ws);
                  }
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
            <Suspense fallback={<LoadingSpinner />}>
              <SettingsPage
                repoPath={repoPath}
                onRepoPathChange={setRepoPath}
                initialTab={initialSettingsTab}
                onRefresh={refetch}
                onClose={handleReturnToDashboard}
                repoName={repoName}
                currentBranch={currentBranch}
              />
            </Suspense>
          )}

          {/* Note: Merge Review View removed - git-specific feature */}
        </div>
      </div>

      {/* Global Dialogs */}
      {/* Note: MergeDialog removed - git-specific feature */}

      <CreateWorkspaceDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        repoPath={repoPath}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ["workspaces", repoPath] });
        }}
      />

      <CreateWorkspaceFromRemoteDialog
        open={showCreateFromRemoteDialog}
        onOpenChange={setShowCreateFromRemoteDialog}
        repoPath={repoPath}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ["workspaces", repoPath] });
        }}
      />

      {commandPaletteElement}
      {branchSwitcherElement}
    </div>
  );
};
