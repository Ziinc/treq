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
import { MergeDialog } from "./MergeDialog";
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
const MergeReviewPage = lazy(() =>
  import("./MergeReviewPage").then((m) => ({ default: m.MergeReviewPage }))
);
import { useToast } from "./ui/toast";
import { useKeyboardShortcut } from "../hooks/useKeyboard";
import { useGitCachePreloader } from "../hooks/useGitCachePreloader";
import {
  getWorkspaces,
  rebuildWorkspaces,
  deleteWorkspaceFromDb,
  jjRemoveWorkspace,
  getSetting,
  setSetting,
  selectFolder,
  isGitRepository,
  gitGetCurrentBranch,
  gitGetStatus,
  gitGetBranchInfo,
  getRepoSetting,
  Workspace,
  BranchInfo,
  createSession,
  updateSessionAccess,
  updateSessionName,
  getSessions,
  setSessionModel,
  gitGetChangedFiles,
  gitMerge,
  gitDiscardAllChanges,
  gitHasUncommittedChanges,
  invalidateGitCache,
  startGitWatcher,
  stopGitWatcher,
} from "../lib/api";
import type { MergeStrategy } from "../lib/api";
import { Loader2 } from "lucide-react";

// Loading spinner component for Suspense fallback
const LoadingSpinner = () => (
  <div className="flex items-center justify-center h-full w-full">
    <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
  </div>
);

type ViewMode =
  | "session"
  | "workspace-edit"
  | "workspace-session"
  | "merge-review"
  | "settings";
type MergeConfirmPayload = {
  strategy: MergeStrategy;
  commitMessage: string;
  discardChanges: boolean;
};

type SessionOpenOptions = {
  initialPrompt?: string;
  promptLabel?: string;
  forceNew?: boolean;
  sessionName?: string;
  selectedFilePath?: string;
};

export const Dashboard: React.FC = () => {
  const [repoPath, setRepoPath] = useState("");
  const { data: currentBranch = null } = useQuery({
    queryKey: ["mainRepoBranch", repoPath],
    queryFn: () => gitGetCurrentBranch(repoPath),
    enabled: !!repoPath,
    staleTime: 0, // Always consider stale to refetch on invalidation
  });
  const [mainBranchInfo, setMainBranchInfo] = useState<BranchInfo | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showCreateFromRemoteDialog, setShowCreateFromRemoteDialog] =
    useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("session");
  const [selectedWorkspace, setSelectedWorkspace] = useState<Workspace | null>(
    null
  );
  const [changesTabActive, setChangesTabActive] = useState(false);
  const [initialSettingsTab, setInitialSettingsTab] = useState<
    "application" | "repository"
  >("repository");
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [showBranchSwitcher, setShowBranchSwitcher] = useState(false);
  const [activeSessionId, setActiveSessionId] = useState<number | null>(null);
  const [sessionSelectedFile, setSessionSelectedFile] = useState<string | null>(
    null
  );
  const [mergeDialogOpen, setMergeDialogOpen] = useState(false);
  const [mergeTargetWorkspace, setMergeTargetWorkspace] =
    useState<Workspace | null>(null);
  const [mergeAheadCount, setMergeAheadCount] = useState(0);
  const [mergeWorkspaceHasChanges, setMergeWorkspaceHasChanges] =
    useState(false);
  const [mergeChangedFiles, setMergeChangedFiles] = useState<string[]>([]);
  const [mergeDetailsLoading, setMergeDetailsLoading] = useState(false);
  const [forceMainRepoOverview, setForceMainRepoOverview] = useState(0);

  const queryClient = useQueryClient();
  const { addToast } = useToast();

  const handleReturnToDashboard = useCallback(() => {
    // Navigate to main repo ShowWorkspace > Overview
    setSelectedWorkspace(null);
    setActiveSessionId(null);
    setViewMode("session");
    // Signal ShowWorkspace to switch to Overview tab
    setForceMainRepoOverview((prev) => prev + 1);
  }, []);

  const resetMergeState = useCallback(() => {
    setMergeDialogOpen(false);
    setMergeTargetWorkspace(null);
    setMergeAheadCount(0);
    setMergeWorkspaceHasChanges(false);
    setMergeChangedFiles([]);
    setMergeDetailsLoading(false);
  }, []);

  const openSettings = useCallback((tab?: string) => {
    setInitialSettingsTab(
      (tab as "application" | "repository") || "repository"
    );
    setViewMode("settings");
  }, []);

  const handleActiveTabChange = useCallback((tab: string) => {
    setChangesTabActive(tab === "changes");
  }, []);

  const handleCloseTerminal = useCallback(() => {
    // Keep showing current workspace, just close the active terminal session
    setActiveSessionId(null);
    setSessionSelectedFile(null);
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
        const isValid = await isGitRepository(urlRepoPath);
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

    loadInitialRepo();
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

  // Start git watcher when repo opens and Changes tab is active
  useEffect(() => {
    if (repoPath && changesTabActive) {
      startGitWatcher(repoPath).catch((err) => {
        console.error("Failed to start git watcher:", err);
      });

      return () => {
        stopGitWatcher(repoPath).catch((err) => {
          console.error("Failed to stop git watcher:", err);
        });
      };
    }
  }, [repoPath, changesTabActive]);

  const refreshMainRepoInfo = useCallback(async () => {
    if (!repoPath) {
      setMainBranchInfo(null);
      return;
    }

    const [_status, branchInfo] = await Promise.all([
      gitGetStatus(repoPath).catch(() => null),
      gitGetBranchInfo(repoPath).catch(() => null),
    ]);

    setMainBranchInfo(branchInfo);
  }, [repoPath]);

  // Fetch main repository git status and branch info
  useEffect(() => {
    refreshMainRepoInfo();
  }, [refreshMainRepoInfo]);

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

        const isRepo = await isGitRepository(selected);
        if (!isRepo) {
          addToast({
            title: "Not a Git Repository",
            description:
              "Please select a folder that contains a git repository.",
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

        // Reset merge state
        resetMergeState();

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

        const isRepo = await isGitRepository(selected);
        if (!isRepo) {
          addToast({
            title: "Not a Git Repository",
            description:
              "Please select a folder that contains a git repository.",
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
    resetMergeState,
    handleReturnToDashboard,
  ]);

  // Listen for window focus to refresh git status
  useEffect(() => {
    if (!repoPath) return;

    const handleFocus = async () => {
      try {
        // Invalidate to trigger refetch
        queryClient.invalidateQueries({
          queryKey: ["mainRepoBranch", repoPath],
        });
        // Refresh main repo info
        refreshMainRepoInfo();
      } catch (error) {
        console.error("Failed to refresh git info on window focus:", error);
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
  }, [repoPath, queryClient, refreshMainRepoInfo]);

  const { data: sessions = [] } = useQuery({
    queryKey: ["sessions", repoPath],
    queryFn: () => getSessions(repoPath),
    refetchInterval: 30000,
    enabled: !!repoPath,
  });

  // Compute the active workspace ID from the active session
  const activeWorkspaceId = useMemo(() => {
    if (activeSessionId === null) return null;
    const session = sessions.find((s) => s.id === activeSessionId);
    return session?.workspace_id ?? null;
  }, [activeSessionId, sessions]);

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

  // Lazy preload: only preload selected workspace, not all workspaces
  useGitCachePreloader(selectedWorkspace?.workspace_path ?? null);

  const deleteWorkspace = useMutation({
    mutationFn: async (workspace: Workspace) => {
      await jjRemoveWorkspace(workspace.repo_path, workspace.workspace_path);
      await deleteWorkspaceFromDb(workspace.repo_path, workspace.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workspaces", repoPath] });
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

  const mergeMutation = useMutation({
    mutationFn: async (payload: MergeConfirmPayload) => {
      if (!repoPath) {
        throw new Error("Repository path is not set");
      }

      if (!mergeTargetWorkspace) {
        throw new Error("No workspace selected for merge");
      }

      const mainRepoDirty = await gitHasUncommittedChanges(repoPath);
      if (mainRepoDirty) {
        throw new Error(
          "Main repository has uncommitted changes. Please commit or stash them before merging."
        );
      }

      const workspaceDirtyNow = await gitHasUncommittedChanges(
        mergeTargetWorkspace.workspace_path
      );
      if (workspaceDirtyNow) {
        if (payload.discardChanges) {
          await gitDiscardAllChanges(mergeTargetWorkspace.workspace_path);
        } else {
          throw new Error(
            "Workspace has uncommitted changes. Discard them before merging."
          );
        }
      }

      return gitMerge(
        repoPath,
        mergeTargetWorkspace.branch_name,
        payload.strategy,
        payload.commitMessage
      );
    },
    onSuccess: () => {
      const branchName = mergeTargetWorkspace?.branch_name || "workspace";
      addToast({
        title: "Merge complete",
        description: `Merged ${branchName} into ${currentBranch || "main"}`,
        type: "success",
      });
      queryClient.invalidateQueries({ queryKey: ["workspaces", repoPath] });
      refreshMainRepoInfo();
      resetMergeState();
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : String(error);
      const description = message.includes("CONFLICT")
        ? "Merge conflict detected. Resolve conflicts in the main repository and try again."
        : message;
      addToast({
        title: "Merge failed",
        description,
        type: "error",
      });
    },
  });

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
        name = `Session ${index}`;
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

  const openSessionWithPrompt = useCallback(
    async (workspace: Workspace, prompt: string, label = "Review response") => {
      await handleOpenSession(workspace, {
        initialPrompt: prompt,
        promptLabel: label,
      });

      // Focus terminal after session opens
      setTimeout(() => {
        // Try to find terminal container (ghostty-web or xterm)
        const terminalContainer = document.querySelector(
          ".xterm, [data-terminal]"
        );
        if (terminalContainer) {
          const textarea = terminalContainer.querySelector("textarea");
          if (textarea instanceof HTMLTextAreaElement) {
            textarea.focus();
          }
        }
      }, 300);
    },
    [handleOpenSession]
  );

  const handleDelete = (workspace: Workspace) => {
    if (confirm(`Delete workspace ${workspace.branch_name}?`)) {
      deleteWorkspace.mutate(workspace);
    }
  };

  const openMergeDialogForWorkspace = async (workspace: Workspace) => {
    if (!repoPath) {
      addToast({
        title: "Repository not set",
        description: "Configure a repository path in settings before merging.",
        type: "error",
      });
      return;
    }

    setMergeTargetWorkspace(workspace);
    setMergeAheadCount(0);
    setMergeChangedFiles([]);
    setMergeWorkspaceHasChanges(false);
    setMergeDetailsLoading(true);

    try {
      const mainRepoDirty = await gitHasUncommittedChanges(repoPath);
      if (mainRepoDirty) {
        addToast({
          title: "Main repository has uncommitted changes",
          description:
            "Please clean up or commit changes in the main repository before merging.",
          type: "error",
        });
        setMergeTargetWorkspace(null);
        return;
      }

      setMergeDialogOpen(true);

      const branchInfo = await gitGetBranchInfo(workspace.workspace_path);
      setMergeAheadCount(branchInfo.ahead);

      const workspaceDirty = await gitHasUncommittedChanges(
        workspace.workspace_path
      );
      setMergeWorkspaceHasChanges(workspaceDirty);

      if (workspaceDirty) {
        try {
          const files = await gitGetChangedFiles(workspace.workspace_path);
          setMergeChangedFiles(files);
        } catch (fileError) {
          console.error("Failed to load changed files:", fileError);
          setMergeChangedFiles([]);
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      addToast({
        title: "Unable to start merge",
        description: message,
        type: "error",
      });
      resetMergeState();
    } finally {
      setMergeDetailsLoading(false);
    }
  };

  // Handle branch change after switching
  const handleBranchChanged = useCallback(() => {
    // Refresh main repo info
    queryClient.invalidateQueries({ queryKey: ["mainRepoBranch", repoPath] });
    queryClient.invalidateQueries({ queryKey: ["mainRepoStatus", repoPath] });
    queryClient.invalidateQueries({
      queryKey: ["mainRepoChangedFiles", repoPath],
    });
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
  const showSidebar =
    viewMode !== "merge-review" && viewMode !== "workspace-edit";

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
          onDeleteWorkspace={handleDelete}
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
                mainBranchInfo={mainBranchInfo}
              />
            </Suspense>
          )}

          {/* Merge Review View */}
          {viewMode === "merge-review" && selectedWorkspace && (
            <ErrorBoundary
              fallbackTitle="Merge review failed"
              resetKeys={[selectedWorkspace.id, currentBranch ?? ""]}
              onReset={handleReturnToDashboard}
            >
              <Suspense fallback={<LoadingSpinner />}>
                <MergeReviewPage
                  repoPath={repoPath}
                  baseBranch={currentBranch}
                  workspace={selectedWorkspace}
                  onClose={handleReturnToDashboard}
                  onStartMerge={openMergeDialogForWorkspace}
                  onRequestChanges={(prompt) =>
                    openSessionWithPrompt(
                      selectedWorkspace,
                      prompt,
                      "Review response"
                    )
                  }
                />
              </Suspense>
            </ErrorBoundary>
          )}
        </div>
      </div>

      {/* Global Dialogs */}
      <MergeDialog
        open={mergeDialogOpen}
        onOpenChange={(open) => {
          if (!open && !mergeMutation.isPending) {
            resetMergeState();
          }
        }}
        workspace={mergeTargetWorkspace}
        mainBranch={currentBranch}
        aheadCount={mergeAheadCount}
        hasWorkspaceChanges={mergeWorkspaceHasChanges}
        changedFiles={mergeChangedFiles}
        isLoadingDetails={mergeDetailsLoading}
        isSubmitting={mergeMutation.isPending}
        onConfirm={(options) => mergeMutation.mutate(options)}
      />

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
