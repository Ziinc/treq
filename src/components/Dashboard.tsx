import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { MergeDialog } from "./MergeDialog";
import { CreateWorktreeDialog } from "./CreateWorktreeDialog";
import { CommandPalette } from "./CommandPalette";
import { SettingsPage } from "./SettingsPage";
import { SessionTerminal } from "./SessionTerminal";
import { WorktreeEditSession } from "./WorktreeEditSession";
import { MergeReviewPage } from "./MergeReviewPage";
import { SessionSidebar } from "./SessionSidebar";
import { ErrorBoundary } from "./ErrorBoundary";
import { GitChangesSection } from "./GitChangesSection";
import { MoveToWorktreeDialog } from "./MoveToWorktreeDialog";
import { PlanSection } from "../types/planning";
import {
  parseChangedFiles,
  filterStagedFiles,
  filterUnstagedFiles,
  type ParsedFileChange,
} from "../lib/git-utils";
import { applyBranchNamePattern } from "../lib/utils";
import { buildPlanHistoryPayload } from "../lib/planHistory";
import { useToast } from "./ui/toast";
import { useKeyboardShortcut } from "../hooks/useKeyboard";
import { useGitCachePreloader } from "../hooks/useGitCachePreloader";
import {
  getWorktrees,
  deleteWorktreeFromDb,
  gitRemoveWorktree,
  getSetting,
  setSetting,
  selectFolder,
  isGitRepository,
  gitGetCurrentBranch,
  gitGetStatus,
  gitGetBranchInfo,
  gitGetBranchDivergence,
  calculateDirectorySize,
  Worktree,
  GitStatus,
  BranchInfo,
  BranchDivergence,
  saveExecutedPlan,
  gitCreateWorktree,
  addWorktreeToDb,
  getRepoSetting,
  gitExecutePostCreateCommand,
  Session,
  createSession,
  updateSessionAccess,
  getSessions,
  gitGetChangedFiles,
  gitMerge,
  gitDiscardAllChanges,
  gitHasUncommittedChanges,
  gitPull,
  gitPush,
  gitStageFile,
  gitUnstageFile,
  gitAddAll,
  gitCommit,
  invalidateGitCache,
} from "../lib/api";
import type { MergeStrategy } from "../lib/api";
import { RefreshCw, GitBranch, Loader2 } from "lucide-react";
import {
  Card,
  CardContent,
} from "./ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./ui/tooltip";

type ViewMode =
  | "dashboard"
  | "session"
  | "worktree-edit"
  | "worktree-session"
  | "merge-review"
  | "settings";
type MergeConfirmPayload = {
  strategy: MergeStrategy;
  commitMessage: string;
  discardChanges: boolean;
};

type SessionOpenOptions = {
  planTitle?: string;
  planContent?: string;
  initialPrompt?: string;
  promptLabel?: string;
  forceNew?: boolean;
  sessionName?: string;
  selectedFilePath?: string;
};

export const Dashboard: React.FC = () => {
  const [repoPath, setRepoPath] = useState("");
  const [repoName, setRepoName] = useState("");
  const [currentBranch, setCurrentBranch] = useState<string | null>(null);
  const [mainRepoStatus, setMainRepoStatus] = useState<GitStatus | null>(null);
  const [mainBranchInfo, setMainBranchInfo] = useState<BranchInfo | null>(null);
  const [mainRepoSize, setMainRepoSize] = useState<number | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("dashboard");
  const [selectedWorktree, setSelectedWorktree] = useState<Worktree | null>(null);
  const [initialSettingsTab, setInitialSettingsTab] = useState<"application" | "repository">("repository");
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [activeSessionId, setActiveSessionId] = useState<number | null>(null);
  const [sessionPlanContent, setSessionPlanContent] = useState<string | null>(null);
  const [sessionPlanTitle, setSessionPlanTitle] = useState<string | null>(null);
  const [sessionInitialPrompt, setSessionInitialPrompt] = useState<string | null>(null);
  const [sessionPromptLabel, setSessionPromptLabel] = useState<string | null>(null);
  const [sessionSelectedFile, setSessionSelectedFile] = useState<string | null>(null);
  const [mainRepoSyncing, setMainRepoSyncing] = useState(false);
  const [mergeDialogOpen, setMergeDialogOpen] = useState(false);
  const [mergeTargetWorktree, setMergeTargetWorktree] = useState<Worktree | null>(null);
  const [mergeAheadCount, setMergeAheadCount] = useState(0);
  const [mergeWorktreeHasChanges, setMergeWorktreeHasChanges] = useState(false);
  const [mergeChangedFiles, setMergeChangedFiles] = useState<string[]>([]);
  const [mergeDetailsLoading, setMergeDetailsLoading] = useState(false);
  const [selectedWorktreeId, setSelectedWorktreeId] = useState<number | null>(null);

  // Main repo git changes state
  const [mainRepoChangedFiles, setMainRepoChangedFiles] = useState<ParsedFileChange[]>([]);
  const [mainRepoCommitMessage, setMainRepoCommitMessage] = useState("");
  const [mainRepoCommitPending, setMainRepoCommitPending] = useState(false);
  const [mainRepoFileActionTarget, setMainRepoFileActionTarget] = useState<string | null>(null);
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  const [mountedSessionIds, setMountedSessionIds] = useState<Set<number>>(new Set());

  // File selection state for moving to worktree
  const [selectedUnstagedFiles, setSelectedUnstagedFiles] = useState<Set<string>>(new Set());
  const [lastSelectedFileIndex, setLastSelectedFileIndex] = useState<number | null>(null);
  const [moveDialogOpen, setMoveDialogOpen] = useState(false);

  // Worktree git info state
  const [worktreeBranchInfo, setWorktreeBranchInfo] = useState<Record<number, BranchInfo>>({});
  const [worktreeDivergence, setWorktreeDivergence] = useState<Record<number, BranchDivergence>>({});

  const queryClient = useQueryClient();
  const { addToast } = useToast();
  const sessionActivityListenerRef = useRef<((sessionId: number) => void) | null>(null);

  const mainRepoChangeCount = mainRepoStatus
    ? mainRepoStatus.modified + mainRepoStatus.added + mainRepoStatus.deleted + mainRepoStatus.untracked
    : 0;

  // Helper to get worktree display title from metadata
  const getWorktreeTitle = useCallback((worktree: Worktree): string => {
    if (worktree.metadata) {
      try {
        const metadata = JSON.parse(worktree.metadata);
        return metadata.initial_plan_title || metadata.intent || worktree.branch_name;
      } catch {
        return worktree.branch_name;
      }
    }
    return worktree.branch_name;
  }, []);

  const mainRepoStagedFiles = useMemo(() => filterStagedFiles(mainRepoChangedFiles), [mainRepoChangedFiles]);
  const mainRepoUnstagedFiles = useMemo(() => filterUnstagedFiles(mainRepoChangedFiles), [mainRepoChangedFiles]);

  const toggleSectionCollapse = useCallback((sectionId: string) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(sectionId)) {
        next.delete(sectionId);
      } else {
        next.add(sectionId);
      }
      return next;
    });
  }, []);

  // File selection handler for move to worktree feature
  const handleFileSelect = useCallback((path: string, shiftKey: boolean) => {
    const fileIndex = mainRepoUnstagedFiles.findIndex(f => f.path === path);

    setSelectedUnstagedFiles(prev => {
      const next = new Set(prev);

      if (shiftKey && lastSelectedFileIndex !== null) {
        // Range selection
        const start = Math.min(lastSelectedFileIndex, fileIndex);
        const end = Math.max(lastSelectedFileIndex, fileIndex);
        for (let i = start; i <= end; i++) {
          next.add(mainRepoUnstagedFiles[i].path);
        }
      } else {
        // Toggle single file
        if (next.has(path)) {
          next.delete(path);
        } else {
          next.add(path);
        }
      }
      return next;
    });

    setLastSelectedFileIndex(fileIndex);
  }, [lastSelectedFileIndex, mainRepoUnstagedFiles]);

  const resetMergeState = useCallback(() => {
    setMergeDialogOpen(false);
    setMergeTargetWorktree(null);
    setMergeAheadCount(0);
    setMergeWorktreeHasChanges(false);
    setMergeChangedFiles([]);
    setMergeDetailsLoading(false);
  }, []);

  const openSettings = useCallback((tab?: string) => {
    setInitialSettingsTab((tab as "application" | "repository") || "repository");
    setViewMode("settings");
  }, []);

  const handleSessionActivityListenerChange = useCallback((listener: ((sessionId: number) => void) | null) => {
    sessionActivityListenerRef.current = listener;
  }, []);

  const handleSessionActivity = useCallback((sessionId: number) => {
    sessionActivityListenerRef.current?.(sessionId);
  }, []);

  // Keyboard shortcuts
  useKeyboardShortcut("n", true, () => {
    if (repoPath && viewMode === "dashboard") {
      setShowCreateDialog(true);
    }
  });

  useKeyboardShortcut("r", true, () => {
    if (viewMode === "dashboard") {
      refetch();
      addToast({
        title: "Refreshed",
        description: "Worktree list updated",
        type: "info",
      });
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

  // Load repo name and current branch when repo path changes
  useEffect(() => {
    if (repoPath) {
      // Extract repo name from path
      const name = repoPath.split('/').pop() || repoPath.split('\\').pop() || repoPath;
      setRepoName(name);

      // Fetch current branch
      gitGetCurrentBranch(repoPath)
        .then(setCurrentBranch)
        .catch(() => setCurrentBranch(null));
    } else {
      setRepoName("");
      setCurrentBranch(null);
    }
  }, [repoPath]);

  // Update window title when repo changes
  useEffect(() => {
    if (repoName) {
      getCurrentWindow().setTitle(`Treq - ${repoName}`);
    } else {
      getCurrentWindow().setTitle("Treq - Git Worktree Manager");
    }
  }, [repoName]);

  const refreshMainRepoInfo = useCallback(async () => {
    if (!repoPath) {
      setMainRepoStatus(null);
      setMainBranchInfo(null);
      setMainRepoSize(null);
      setMainRepoChangedFiles([]);
      return;
    }

    // Run all fetches in parallel
    const [status, branchInfo, size, changedFiles] = await Promise.all([
      gitGetStatus(repoPath).catch(() => null),
      gitGetBranchInfo(repoPath).catch(() => null),
      calculateDirectorySize(repoPath).catch(() => null),
      gitGetChangedFiles(repoPath).catch(() => [] as string[]),
    ]);

    setMainRepoStatus(status);
    setMainBranchInfo(branchInfo);
    setMainRepoSize(size);
    setMainRepoChangedFiles(parseChangedFiles(changedFiles));
  }, [repoPath]);

  const handleMainRepoSync = useCallback(async () => {
    if (!repoPath) {
      addToast({
        title: "Repository not set",
        description: "Configure a repository path before syncing.",
        type: "error",
      });
      return;
    }

    addToast({
      title: "Syncing repository",
      description: "Pulling latest changes and pushing local commits...",
      type: "info",
    });

    setMainRepoSyncing(true);
    try {
      try {
        const pullResult = await gitPull(repoPath);
        addToast({
          title: "Pulled latest",
          description: pullResult.trim() || "Repository is up to date.",
          type: "success",
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        addToast({ title: "Pull failed", description: message, type: "error" });
        return;
      }

      try {
        const pushResult = await gitPush(repoPath);
        addToast({
          title: "Push complete",
          description: pushResult.trim() || "Local changes pushed.",
          type: "success",
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        addToast({ title: "Push failed", description: message, type: "error" });
        return;
      }

      refreshMainRepoInfo();
    } finally {
      setMainRepoSyncing(false);
    }
  }, [repoPath, addToast, refreshMainRepoInfo]);

  // Fetch main repository git status and branch info
  useEffect(() => {
    refreshMainRepoInfo();
  }, [refreshMainRepoInfo]);

  // Listen for menu navigation events
  useEffect(() => {
    const unlisten = listen("navigate-to-dashboard", () => {
      setViewMode("dashboard");
      setSelectedWorktree(null);
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  useEffect(() => {
    const unlisten = listen("navigate-to-settings", () => {
      setViewMode("settings");
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  // Listen for "Open..." menu action
  useEffect(() => {
    const unlisten = listen("menu-open-repository", async () => {
      const selected = await selectFolder();
      if (!selected) return;

      const isRepo = await isGitRepository(selected);
      if (!isRepo) {
        addToast({
          title: "Not a Git Repository",
          description: "Please select a folder that contains a git repository.",
          type: "error",
        });
        return;
      }

      await setSetting("repo_path", selected);
      setRepoPath(selected);
      setViewMode("dashboard");
      setSelectedWorktree(null);
      queryClient.invalidateQueries({ queryKey: ["worktrees"] });
      addToast({
        title: "Repository Opened",
        description: `Now viewing ${selected.split("/").pop() || selected}`,
        type: "success",
      });
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [queryClient, addToast]);

  // Listen for "Open in New Window..." menu action
  useEffect(() => {
    const unlisten = listen("menu-open-in-new-window", async () => {
      const selected = await selectFolder();
      if (!selected) return;

      const isRepo = await isGitRepository(selected);
      if (!isRepo) {
        addToast({
          title: "Not a Git Repository",
          description: "Please select a folder that contains a git repository.",
          type: "error",
        });
        return;
      }

      const windowLabel = `treq-${Date.now()}`;
      const repoName = selected.split("/").pop() || selected.split("\\").pop() || selected;

      const webview = new WebviewWindow(windowLabel, {
        url: `index.html?repo=${encodeURIComponent(selected)}`,
        title: `Treq - ${repoName}`,
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
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [addToast]);

  const { data: sessions = [] } = useQuery({
    queryKey: ["sessions"],
    queryFn: getSessions,
    refetchInterval: 5000,
  });

  const { data: worktrees = [], refetch } = useQuery({
    queryKey: ["worktrees"],
    queryFn: getWorktrees,
  });

  useGitCachePreloader(worktrees, repoPath || null);

  // Fetch git info for each worktree (remote branch info + divergence from main)
  useEffect(() => {
    if (!currentBranch || worktrees.length === 0) return;

    const fetchWorktreeGitInfo = async () => {
      const branchInfoResults: Record<number, BranchInfo> = {};
      const divergenceResults: Record<number, BranchDivergence> = {};

      await Promise.all(
        worktrees.map(async (worktree) => {
          try {
            // Fetch remote branch info (ahead/behind upstream)
            const branchInfo = await gitGetBranchInfo(worktree.worktree_path);
            branchInfoResults[worktree.id] = branchInfo;
          } catch {
            // Ignore errors for individual worktrees
          }

          try {
            // Fetch divergence from main branch
            const divergence = await gitGetBranchDivergence(worktree.worktree_path, currentBranch);
            divergenceResults[worktree.id] = divergence;
          } catch {
            // Ignore errors for individual worktrees
          }
        })
      );

      setWorktreeBranchInfo(branchInfoResults);
      setWorktreeDivergence(divergenceResults);
    };

    fetchWorktreeGitInfo();

    // Refresh every 30 seconds
    const interval = setInterval(fetchWorktreeGitInfo, 30000);
    return () => clearInterval(interval);
  }, [worktrees, currentBranch]);

  // Track mounted session IDs to preserve terminal state
  useEffect(() => {
    if (activeSessionId !== null) {
      setMountedSessionIds(prev => {
        if (prev.has(activeSessionId)) return prev;
        const next = new Set(prev);
        next.add(activeSessionId);
        return next;
      });
    }
  }, [activeSessionId]);

  // Poll for git changes when dashboard view is active
  useEffect(() => {
    if (viewMode !== "dashboard" || !repoPath) {
      return;
    }

    const pollGitChanges = async () => {
      try {
        await invalidateGitCache(repoPath);
        refreshMainRepoInfo();
      } catch (error) {
        console.debug("Git polling failed", error);
      }
    };

    // Poll every 5 seconds
    const interval = setInterval(pollGitChanges, 5000);

    return () => clearInterval(interval);
  }, [viewMode, repoPath, refreshMainRepoInfo]);

  const deleteWorktree = useMutation({
    mutationFn: async (worktree: Worktree) => {
      await gitRemoveWorktree(worktree.repo_path, worktree.worktree_path);
      await deleteWorktreeFromDb(worktree.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["worktrees"] });
      addToast({
        title: "Worktree Deleted",
        description: "Worktree has been removed successfully",
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

      if (!mergeTargetWorktree) {
        throw new Error("No worktree selected for merge");
      }

      const mainRepoDirty = await gitHasUncommittedChanges(repoPath);
      if (mainRepoDirty) {
        throw new Error("Main repository has uncommitted changes. Please commit or stash them before merging.");
      }

      const worktreeDirtyNow = await gitHasUncommittedChanges(mergeTargetWorktree.worktree_path);
      if (worktreeDirtyNow) {
        if (payload.discardChanges) {
          await gitDiscardAllChanges(mergeTargetWorktree.worktree_path);
        } else {
          throw new Error("Worktree has uncommitted changes. Discard them before merging.");
        }
      }

      return gitMerge(
        repoPath,
        mergeTargetWorktree.branch_name,
        payload.strategy,
        payload.commitMessage
      );
    },
    onSuccess: () => {
      const branchName = mergeTargetWorktree?.branch_name || "worktree";
      addToast({
        title: "Merge complete",
        description: `Merged ${branchName} into ${currentBranch || "main"}`,
        type: "success",
      });
      queryClient.invalidateQueries({ queryKey: ["worktrees"] });
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

  const updateBranchMutation = useMutation({
    mutationFn: async (worktree: Worktree) => {
      if (!currentBranch) {
        throw new Error("Current branch is not set");
      }

      const worktreeDirty = await gitHasUncommittedChanges(worktree.worktree_path);
      if (worktreeDirty) {
        throw new Error("Worktree has uncommitted changes. Please commit or stash them before updating.");
      }

      return gitMerge(
        worktree.worktree_path,
        currentBranch,
        "regular",
        undefined
      );
    },
    onSuccess: (_result, worktree) => {
      addToast({
        title: "Branch updated",
        description: `Merged ${currentBranch} into ${worktree.branch_name}`,
        type: "success",
      });
      // Refresh divergence info
      queryClient.invalidateQueries({ queryKey: ["worktrees"] });
      // Re-fetch git info for worktrees
      if (currentBranch) {
        gitGetBranchDivergence(worktree.worktree_path, currentBranch)
          .then((divergence) => {
            setWorktreeDivergence((prev) => ({ ...prev, [worktree.id]: divergence }));
          })
          .catch(() => {});
      }
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : String(error);
      const description = message.includes("CONFLICT")
        ? "Merge conflict detected. Resolve conflicts in the worktree and try again."
        : message;
      addToast({
        title: "Update failed",
        description,
        type: "error",
      });
    },
  });

  // Helper to create or get session
  const getOrCreateSession = useCallback(
    async (
      worktreeId: number | null,
      options?: {
        planTitle?: string;
        worktreeBranchName?: string;
        forceNew?: boolean;
        name?: string;
      }
    ): Promise<number> => {
      const sessions = await getSessions();
      if (!options?.forceNew) {
        const existing = sessions.find((s) => s.worktree_id === worktreeId);
        if (existing) {
          await updateSessionAccess(existing.id);
          return existing.id;
        }
      }

      let finalPlanTitle = options?.planTitle;
      if (worktreeId !== null && !finalPlanTitle) {
        const worktree = worktrees.find((w) => w.id === worktreeId);
        if (worktree?.metadata) {
          try {
            const metadata = JSON.parse(worktree.metadata);
            finalPlanTitle = metadata.initial_plan_title;
          } catch {
            // Ignore parse errors
          }
        }
      }

      const scopedSessions = sessions.filter((s) => s.worktree_id === worktreeId);
      const index = scopedSessions.length + 1;
      let name = options?.name;
      if (!name) {
        name = `Session ${index}`;
      }

      const finalPlanTitleForDb = worktreeId !== null ? finalPlanTitle : undefined;
      const sessionId = await createSession(worktreeId, name, finalPlanTitleForDb);
      queryClient.invalidateQueries({ queryKey: ["sessions"] });
      return sessionId;
    },
    [queryClient, worktrees]
  );

  const handleOpenSession = useCallback(
    async (worktree: Worktree | null, options?: SessionOpenOptions) => {
      const sessionId = await getOrCreateSession(worktree?.id ?? null, {
        planTitle: options?.planTitle,
        worktreeBranchName: worktree?.branch_name,
        forceNew: options?.forceNew,
        name: options?.sessionName,
      });
      setSelectedWorktree(worktree);
      setSessionPlanContent(options?.planContent ?? null);
      setSessionPlanTitle(options?.planTitle ?? null);
      setSessionInitialPrompt(options?.initialPrompt ?? null);
      setSessionPromptLabel(options?.promptLabel ?? null);
      setSessionSelectedFile(options?.selectedFilePath ?? null);
      setActiveSessionId(sessionId);
      setViewMode(worktree ? "worktree-session" : "session");
    },
    [getOrCreateSession]
  );

  const handleCreateSessionFromSidebar = useCallback(
    async (worktreeId: number | null) => {
      const worktree = worktreeId ? worktrees.find((w) => w.id === worktreeId) ?? null : null;
      await handleOpenSession(worktree, { forceNew: true });
    },
    [handleOpenSession, worktrees]
  );

  const openSessionWithPrompt = useCallback(
    async (worktree: Worktree, prompt: string, label = "Review response") => {
      await handleOpenSession(worktree, { initialPrompt: prompt, promptLabel: label });
    },
    [handleOpenSession]
  );

  // Handler for when files are successfully moved to worktree
  const handleMoveToWorktreeSuccess = useCallback(async (worktreeInfo: {
    id: number;
    worktreePath: string;
    branchName: string;
    metadata: string;
  }) => {
    setMoveDialogOpen(false);
    setSelectedUnstagedFiles(new Set());
    setLastSelectedFileIndex(null);
    queryClient.invalidateQueries({ queryKey: ["worktrees"] });

    // Refresh the changed files list
    if (repoPath) {
      try {
        const files = await gitGetChangedFiles(repoPath);
        setMainRepoChangedFiles(parseChangedFiles(files));
      } catch {
        setMainRepoChangedFiles([]);
      }
    }

    // Construct worktree object and navigate to session
    const newWorktree: Worktree = {
      id: worktreeInfo.id,
      repo_path: repoPath,
      worktree_path: worktreeInfo.worktreePath,
      branch_name: worktreeInfo.branchName,
      created_at: new Date().toISOString(),
      metadata: worktreeInfo.metadata,
    };

    await handleOpenSession(newWorktree, { forceNew: true });
  }, [queryClient, repoPath, handleOpenSession]);

  const handleSessionClick = async (session: Session) => {
    await updateSessionAccess(session.id);
    setActiveSessionId(session.id);
    setSessionPlanContent(null);
    setSessionPlanTitle(null);
    setSessionInitialPrompt(null);
    setSessionPromptLabel(null);
    setSessionSelectedFile(null);

    if (session.worktree_id) {
      const worktree = worktrees.find((w) => w.id === session.worktree_id);
      if (worktree) {
        setSelectedWorktree(worktree);
        setViewMode("worktree-session");
      }
    } else {
      setSelectedWorktree(null);
      setViewMode("session");
    }
  };

  const handleDelete = (worktree: Worktree) => {
    if (confirm(`Delete worktree ${worktree.branch_name}?`)) {
      deleteWorktree.mutate(worktree);
    }
  };

  const openMergeDialogForWorktree = async (worktree: Worktree) => {
    if (!repoPath) {
      addToast({
        title: "Repository not set",
        description: "Configure a repository path in settings before merging.",
        type: "error",
      });
      return;
    }

    setMergeTargetWorktree(worktree);
    setMergeAheadCount(0);
    setMergeChangedFiles([]);
    setMergeWorktreeHasChanges(false);
    setMergeDetailsLoading(true);

    try {
      const mainRepoDirty = await gitHasUncommittedChanges(repoPath);
      if (mainRepoDirty) {
        addToast({
          title: "Main repository has uncommitted changes",
          description: "Please clean up or commit changes in the main repository before merging.",
          type: "error",
        });
        setMergeTargetWorktree(null);
        return;
      }

      setMergeDialogOpen(true);

      const branchInfo = await gitGetBranchInfo(worktree.worktree_path);
      setMergeAheadCount(branchInfo.ahead);

      const worktreeDirty = await gitHasUncommittedChanges(worktree.worktree_path);
      setMergeWorktreeHasChanges(worktreeDirty);

      if (worktreeDirty) {
        try {
          const files = await gitGetChangedFiles(worktree.worktree_path);
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

  const handleExecutePlan = async (section: PlanSection) => {
    try {
      // Get branch name pattern from settings
      const branchPattern = await getRepoSetting(repoPath, "branch_name_pattern") || "treq/{name}";
      
      // Generate branch name from plan title using pattern
      const branchName = applyBranchNamePattern(branchPattern, section.title);
      
      addToast({
        title: "Creating worktree...",
        description: `Creating worktree for ${branchName}`,
        type: "info",
      });

      // Create the worktree
      const worktreePath = await gitCreateWorktree(repoPath, branchName, true);

      // Prepare metadata with plan title
      const metadata = JSON.stringify({
        initial_plan_title: section.title
      });

      // Add to database with metadata
      const worktreeId = await addWorktreeToDb(repoPath, worktreePath, branchName, metadata);

      // Execute post-create command if configured
      const postCreateCmd = await getRepoSetting(repoPath, "post_create_command");
      if (postCreateCmd && postCreateCmd.trim()) {
        try {
          await gitExecutePostCreateCommand(worktreePath, postCreateCmd);
        } catch (cmdError) {
          console.error("Post-create command failed:", cmdError);
        }
      }

      // Get plan content (use edited version if available)
      const planContent = section.editedContent || section.rawMarkdown;

      // Create worktree object and navigate to edit session
      const newWorktree: Worktree = {
        id: worktreeId,
        repo_path: repoPath,
        worktree_path: worktreePath,
        branch_name: branchName,
        created_at: new Date().toISOString(),
        metadata,
      };

      try {
        const payload = buildPlanHistoryPayload(section);
        await saveExecutedPlan(repoPath, worktreeId, payload);
      } catch (planError) {
        console.error("Failed to record plan execution:", planError);
      }

      // Create execution session with plan title
      await handleOpenSession(newWorktree, {
        planTitle: section.title,
        planContent,
        forceNew: true,
      });
      
      addToast({
        title: "Ready to implement",
        description: "Worktree created; opening session terminal",
        type: "success",
      });

      // Refresh worktree list
      refetch();
    } catch (error) {
      addToast({
        title: "Execution Failed",
        description: error instanceof Error ? error.message : String(error),
        type: "error",
      });
    }
  };

  const handleExecutePlanInWorktree = useCallback(async (section: PlanSection, sourceBranch: string) => {
    try {
      // Get branch name pattern from settings
      const branchPattern = await getRepoSetting(repoPath, "branch_name_pattern") || "treq/{name}";

      // Generate branch name from plan title using pattern
      const branchName = applyBranchNamePattern(branchPattern, section.title);

      addToast({
        title: "Creating worktree...",
        description: `Branch: ${branchName} (from ${sourceBranch})`,
        type: "info",
      });

      // Create the worktree with source branch
      const worktreePath = await gitCreateWorktree(repoPath, branchName, true, sourceBranch);

      // Prepare metadata with plan title and source branch
      const metadata = JSON.stringify({
        initial_plan_title: section.title,
        source_branch: sourceBranch,
      });

      // Add to database with metadata
      const worktreeId = await addWorktreeToDb(repoPath, worktreePath, branchName, metadata);

      // Execute post-create command if configured
      const postCreateCmd = await getRepoSetting(repoPath, "post_create_command");
      if (postCreateCmd && postCreateCmd.trim()) {
        try {
          await gitExecutePostCreateCommand(worktreePath, postCreateCmd);
        } catch (cmdError) {
          console.error("Post-create command failed:", cmdError);
          addToast({
            title: "Post-create warning",
            description: "Post-create command failed but worktree was created",
            type: "warning",
          });
        }
      }

      // Get plan content (use edited version if available)
      const planContent = section.editedContent || section.rawMarkdown;

      // Create worktree object
      const newWorktree: Worktree = {
        id: worktreeId,
        repo_path: repoPath,
        worktree_path: worktreePath,
        branch_name: branchName,
        created_at: new Date().toISOString(),
        metadata,
      };

      // Record plan execution
      try {
        const payload = buildPlanHistoryPayload(section);
        await saveExecutedPlan(repoPath, worktreeId, payload);
      } catch (planError) {
        console.error("Failed to record plan execution:", planError);
      }

      // Navigate to new worktree and open session with plan content
      await handleOpenSession(newWorktree, {
        planTitle: section.title,
        planContent,
        forceNew: true,
      });

      addToast({
        title: "Ready to implement",
        description: "Worktree created; plan sent to Claude",
        type: "success",
      });

      // Refresh worktree list
      refetch();
    } catch (error) {
      addToast({
        title: "Failed to create worktree",
        description: error instanceof Error ? error.message : String(error),
        type: "error",
      });
    }
  }, [repoPath, addToast, handleOpenSession, refetch]);

  const handleCloseTerminal = () => {
    setViewMode("dashboard");
    setSelectedWorktree(null);
    setActiveSessionId(null);
    setSessionPlanContent(null);
    setSessionPlanTitle(null);
    setSessionInitialPrompt(null);
    setSessionPromptLabel(null);
    setSessionSelectedFile(null);
  };

  const handleReturnToDashboard = useCallback(() => {
    setViewMode("dashboard");
    setSelectedWorktree(null);
  }, []);

  const handleMainRepoStageFile = useCallback(
    async (filePath: string) => {
      if (!repoPath) return;
      setMainRepoFileActionTarget(filePath);
      try {
        await gitStageFile(repoPath, filePath);
        addToast({ title: "Staged", description: `${filePath} staged`, type: "success" });
        refreshMainRepoInfo();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        addToast({ title: "Stage Failed", description: message, type: "error" });
      } finally {
        setMainRepoFileActionTarget(null);
      }
    },
    [repoPath, addToast, refreshMainRepoInfo]
  );

  const handleMainRepoUnstageFile = useCallback(
    async (filePath: string) => {
      if (!repoPath) return;
      setMainRepoFileActionTarget(filePath);
      try {
        await gitUnstageFile(repoPath, filePath);
        addToast({ title: "Unstaged", description: `${filePath} unstaged`, type: "success" });
        refreshMainRepoInfo();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        addToast({ title: "Unstage Failed", description: message, type: "error" });
      } finally {
        setMainRepoFileActionTarget(null);
      }
    },
    [repoPath, addToast, refreshMainRepoInfo]
  );

  const handleMainRepoStageAll = useCallback(async () => {
    if (!repoPath) return;
    try {
      await gitAddAll(repoPath);
      addToast({ title: "Staged", description: "All changes staged", type: "success" });
      refreshMainRepoInfo();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      addToast({ title: "Stage All Failed", description: message, type: "error" });
    }
  }, [repoPath, addToast, refreshMainRepoInfo]);

  const handleMainRepoCommit = useCallback(async () => {
    if (!repoPath) {
      addToast({ title: "Repository not set", description: "Configure a repository path before committing.", type: "error" });
      return;
    }

    const trimmed = mainRepoCommitMessage.trim();
    if (!trimmed) {
      addToast({ title: "Commit message", description: "Enter a commit message.", type: "error" });
      return;
    }

    if (trimmed.length > 500) {
      addToast({ title: "Commit message", description: "Please keep the message under 500 characters.", type: "error" });
      return;
    }

    if (mainRepoStagedFiles.length === 0) {
      addToast({ title: "No staged files", description: "Stage changes before committing.", type: "error" });
      return;
    }

    setMainRepoCommitPending(true);
    try {
      const result = await gitCommit(repoPath, trimmed);
      const hashMatch = result.match(/\[.+? ([0-9a-f]{7,})\]/i);
      const hash = hashMatch ? hashMatch[1] : null;
      addToast({
        title: "Commit created",
        description: hash ? `Created ${hash}` : result.trim() || "Commit successful",
        type: "success",
      });
      setMainRepoCommitMessage("");
      refreshMainRepoInfo();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      addToast({ title: "Commit failed", description: message, type: "error" });
    } finally {
      setMainRepoCommitPending(false);
    }
  }, [repoPath, mainRepoCommitMessage, mainRepoStagedFiles, addToast, refreshMainRepoInfo]);

  const handleMainRepoFileClick = useCallback(
    async (file: ParsedFileChange) => {
      await handleOpenSession(null, {
        forceNew: false,
        initialPrompt: "/edits on",
        promptLabel: "Opening diff viewer",
        selectedFilePath: file.path,
      });
    },
    [handleOpenSession]
  );

  // Render command palette for all views
  const commandPaletteElement = (
    <CommandPalette
      open={showCommandPalette}
      onOpenChange={setShowCommandPalette}
      worktrees={worktrees}
      sessions={sessions}
      onNavigateToDashboard={() => setViewMode("dashboard")}
      onNavigateToSettings={() => setViewMode("settings")}
      onOpenWorktreeSession={(worktree) => {
        handleOpenSession(worktree);
      }}
      onOpenSession={(session, worktree) => {
        setActiveSessionId(session.id);
        if (worktree) {
          setSelectedWorktree(worktree);
          setViewMode("worktree-session");
        } else {
          setViewMode("session");
        }
      }}
    />
  );

  // Memoized session terminals - keep them mounted but hidden for state preservation
  const memoizedSessionTerminals = useMemo(() => {
    // Get unique sessions that have been visited (have an activeSessionId match or are currently active)
    const sessionsToRender = sessions.filter(s => s.id === activeSessionId || mountedSessionIds.has(s.id));

    return sessionsToRender.map(session => {
      const isActive = session.id === activeSessionId && (viewMode === "session" || viewMode === "worktree-session");
      const sessionWorktree = session.worktree_id ? worktrees.find(w => w.id === session.worktree_id) : null;

      return (
        <div
          key={session.id}
          style={{ display: isActive ? 'flex' : 'none' }}
          className="flex-1 h-full w-full"
        >
          <ErrorBoundary
            fallbackTitle={sessionWorktree ? "Worktree terminal error" : "Session terminal error"}
            resetKeys={[session.id]}
            onGoDashboard={handleCloseTerminal}
          >
            <SessionTerminal
              repositoryPath={sessionWorktree ? undefined : repoPath}
              worktree={sessionWorktree || undefined}
              session={session}
              sessionId={session.id}
              onClose={handleCloseTerminal}
              onExecutePlan={handleExecutePlan}
              onExecutePlanInWorktree={handleExecutePlanInWorktree}
              initialPlanContent={session.id === activeSessionId ? (sessionPlanContent || undefined) : undefined}
              initialPlanTitle={session.id === activeSessionId ? (sessionPlanTitle || undefined) : undefined}
              initialPrompt={session.id === activeSessionId ? (sessionInitialPrompt || undefined) : undefined}
              initialPromptLabel={session.id === activeSessionId ? (sessionPromptLabel || undefined) : undefined}
              initialSelectedFile={session.id === activeSessionId ? (sessionSelectedFile || undefined) : undefined}
              onSessionActivity={handleSessionActivity}
              isHidden={!isActive}
            />
          </ErrorBoundary>
        </div>
      );
    });
  }, [
    sessions,
    activeSessionId,
    mountedSessionIds,
    viewMode,
    worktrees,
    repoPath,
    sessionPlanContent,
    sessionPlanTitle,
    sessionInitialPrompt,
    sessionPromptLabel,
    sessionSelectedFile,
    handleCloseTerminal,
    handleExecutePlan,
    handleExecutePlanInWorktree,
    handleSessionActivity,
  ]);

  const isSessionView = viewMode === "session" || viewMode === "worktree-session";
  const showSidebar = viewMode !== "merge-review" && viewMode !== "worktree-edit";
  const highlightedSessionId = isSessionView ? activeSessionId : null;

  return (
    <div className="flex h-screen bg-background">
      {/* SessionSidebar - shown in session, settings, dashboard views */}
      {showSidebar && (
        <SessionSidebar
          activeSessionId={highlightedSessionId}
          onSessionClick={handleSessionClick}
          onCreateSession={handleCreateSessionFromSidebar}
          onCloseActiveSession={handleCloseTerminal}
          repoPath={repoPath}
          currentBranch={currentBranch}
          onDeleteWorktree={handleDelete}
          onCreateWorktree={() => setShowCreateDialog(true)}
          onSessionActivityListenerChange={handleSessionActivityListenerChange}
          openSettings={openSettings}
          navigateToDashboard={handleReturnToDashboard}
          onOpenCommandPalette={() => setShowCommandPalette(true)}
        />
      )}

      <div
        className="flex-1 relative"
        style={{ width: showSidebar ? "calc(100vw - 240px)" : "100%" }}
      >
        {/* Sessions Layer - ALWAYS RENDERED ONCE */}
        <div
          className="absolute inset-0 flex flex-col"
          style={{
            visibility: isSessionView ? 'visible' : 'hidden',
            zIndex: isSessionView ? 10 : 0,
            pointerEvents: isSessionView ? 'auto' : 'none',
          }}
        >
          {memoizedSessionTerminals}
        </div>

        {/* Content Layer - Dashboard, Settings, Merge-Review, Worktree-Edit */}
        <div
          className="absolute inset-0 overflow-auto"
          style={{
            visibility: !isSessionView ? 'visible' : 'hidden',
            zIndex: !isSessionView ? 10 : 0,
            pointerEvents: !isSessionView ? 'auto' : 'none',
          }}
        >
          {/* Settings View */}
          {viewMode === "settings" && (
            <SettingsPage
              repoPath={repoPath}
              onRepoPathChange={setRepoPath}
              initialTab={initialSettingsTab}
              onRefresh={refetch}
              onClose={() => setViewMode("dashboard")}
              repoName={repoName}
              mainRepoSize={mainRepoSize}
              currentBranch={currentBranch}
              mainBranchInfo={mainBranchInfo}
            />
          )}

          {/* Merge Review View */}
          {viewMode === "merge-review" && selectedWorktree && (
            <ErrorBoundary
              fallbackTitle="Merge review failed"
              resetKeys={[selectedWorktree.id, currentBranch ?? ""]}
              onGoDashboard={handleReturnToDashboard}
            >
              <MergeReviewPage
                repoPath={repoPath}
                baseBranch={currentBranch}
                worktree={selectedWorktree}
                onClose={() => {
                  setViewMode("dashboard");
                  setSelectedWorktree(null);
                }}
                onStartMerge={openMergeDialogForWorktree}
                onRequestChanges={(prompt) => openSessionWithPrompt(selectedWorktree, prompt, "Review response")}
              />
            </ErrorBoundary>
          )}

          {/* Worktree Edit View */}
          {viewMode === "worktree-edit" && selectedWorktree && (
            <ErrorBoundary
              fallbackTitle="Worktree edit failed"
              resetKeys={[selectedWorktree.id]}
              onGoDashboard={handleReturnToDashboard}
            >
              <WorktreeEditSession
                worktree={selectedWorktree}
                onClose={() => {
                  setViewMode("dashboard");
                  setSelectedWorktree(null);
                }}
              />
            </ErrorBoundary>
          )}

          {/* Dashboard View */}
          {viewMode === "dashboard" && (
            <ErrorBoundary
          fallbackTitle="Dashboard content error"
          resetKeys={[repoPath, worktrees.length]}
          onGoDashboard={handleReturnToDashboard}
        >
            <div className="container mx-auto p-8">
            {/* Initial Setup Message */}
            {!repoPath && (
              <div className="mb-6 p-4 border rounded-lg bg-muted">
                <p className="text-sm text-muted-foreground mb-2">
                  Please set your repository path to get started
                </p>
                <Button variant="outline" onClick={() => openSettings("application")}>
                  Configure Repository
                </Button>
              </div>
            )}

            {/* Split Layout: Main Tree | Worktrees */}
            {repoPath && (
              <div className="grid grid-cols-1 lg:grid-cols-[400px_1fr] gap-6">
                {/* Main Tree Section */}
                <div className="lg:sticky lg:top-6 lg:self-start">
                  <Card className="bg-sidebar">
                    <CardContent className="p-4 space-y-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 space-y-3 text-sm">
                          {currentBranch && (
                            <div className="flex items-center gap-2 flex-wrap">
                              <div className="flex items-center gap-1">
                                <GitBranch className="w-4 h-4" />
                                <code className="text-xs">{currentBranch}</code>
                              </div>

                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="w-6 h-6"
                                      onClick={handleMainRepoSync}
                                      disabled={mainRepoSyncing}
                                    >
                                      <RefreshCw className={`w-3 h-3 ${mainRepoSyncing ? "animate-spin" : ""}`} />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent side="bottom">
                                    {mainRepoSyncing ? "Syncing..." : "Sync with remote"}
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>

                              {mainBranchInfo?.upstream && (
                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                  {mainBranchInfo.behind > 0 && (
                                    <span>{mainBranchInfo.behind}↓</span>
                                  )}
                                  {mainBranchInfo.ahead > 0 && (
                                    <span>{mainBranchInfo.ahead}↑</span>
                                  )}
                                </div>
                              )}
                            </div>
                          )}

                        </div>
                      </div>

                      {/* Git Changes List */}
                      {mainRepoChangeCount > 0 && (
                        <div className="space-y-3 mt-4 pt-4 border-t border-border -mx-4 px-4">
                          {/* Commit Message Input */}
                          <div className="space-y-2">
                            <Input
                              placeholder="Commit message (⌘ ↵ to commit)"
                              value={mainRepoCommitMessage}
                              onChange={(e) => setMainRepoCommitMessage(e.target.value)}
                              onKeyDown={(e) => {
                                if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && mainRepoStagedFiles.length > 0 && mainRepoCommitMessage.trim()) {
                                  e.preventDefault();
                                  handleMainRepoCommit();
                                }
                              }}
                              disabled={mainRepoCommitPending}
                              className="text-sm"
                            />
                            <Button
                              className="w-full h-8 text-xs"
                              size="sm"
                              disabled={mainRepoStagedFiles.length === 0 || !mainRepoCommitMessage.trim() || mainRepoCommitPending}
                              onClick={handleMainRepoCommit}
                            >
                              {mainRepoCommitPending ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                <>Commit ({mainRepoStagedFiles.length})</>
                              )}
                            </Button>
                          </div>

                          {/* Staged Changes */}
                          {mainRepoStagedFiles.length > 0 && (
                            <GitChangesSection
                              title="Staged Changes"
                              files={mainRepoStagedFiles}
                              isStaged={true}
                              isCollapsed={collapsedSections.has("staged")}
                              onToggleCollapse={() => toggleSectionCollapse("staged")}
                              fileActionTarget={mainRepoFileActionTarget}
                              readOnly={mainRepoCommitPending}
                              onFileClick={(path) => {
                                const file = mainRepoStagedFiles.find((f) => f.path === path);
                                if (file) handleMainRepoFileClick(file);
                              }}
                              onUnstage={handleMainRepoUnstageFile}
                            />
                          )}

                          {/* Unstaged Changes */}
                          {mainRepoUnstagedFiles.length > 0 && (
                            <GitChangesSection
                              title="Changes"
                              files={mainRepoUnstagedFiles}
                              isStaged={false}
                              isCollapsed={collapsedSections.has("unstaged")}
                              onToggleCollapse={() => toggleSectionCollapse("unstaged")}
                              fileActionTarget={mainRepoFileActionTarget}
                              readOnly={mainRepoCommitPending}
                              selectedFiles={selectedUnstagedFiles}
                              onFileSelect={handleFileSelect}
                              onMoveToWorktree={() => setMoveDialogOpen(true)}
                              onFileClick={(path) => {
                                const file = mainRepoUnstagedFiles.find((f) => f.path === path);
                                if (file) handleMainRepoFileClick(file);
                              }}
                              onStage={handleMainRepoStageFile}
                              onStageAll={handleMainRepoStageAll}
                            />
                          )}
                        </div>
                      )}

                    </CardContent>
                  </Card>
                </div>

                {/* Worktrees Section */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h2 className="text-sm font-medium text-muted-foreground">
                      Worktrees {worktrees.length > 0 && <span className="text-xs">({worktrees.length})</span>}
                    </h2>
                  </div>

                  {worktrees.length === 0 ? (
                    <div className="text-sm text-muted-foreground py-4 text-center">
                      No worktrees yet
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {worktrees.map((worktree) => {
                        const branchInfo = worktreeBranchInfo[worktree.id];
                        const divergence = worktreeDivergence[worktree.id];
                        const title = getWorktreeTitle(worktree);
                        const isSelected = selectedWorktreeId === worktree.id;
                        const isBehindMain = divergence && divergence.behind > 0;

                        return (
                          <div
                            key={worktree.id}
                            onClick={() => setSelectedWorktreeId(isSelected ? null : worktree.id)}
                            onDoubleClick={() => handleOpenSession(worktree)}
                            className={`w-full text-left p-3 rounded-lg border transition-colors cursor-pointer ${
                              isSelected
                                ? "border-primary ring-2 ring-primary/20 bg-sidebar"
                                : "border-border bg-sidebar hover:bg-sidebar-accent"
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <span className="text-sm font-medium truncate flex-1">
                                {title}
                              </span>
                            </div>

                            {/* Git indicators */}
                            <div className="flex flex-wrap gap-2 mt-2 text-xs">
                              {/* Remote ahead/behind */}
                              {branchInfo?.upstream && (branchInfo.ahead > 0 || branchInfo.behind > 0) && (
                                <div className="flex items-center gap-1.5 text-muted-foreground">
                                  <span className="opacity-60">remote:</span>
                                  {branchInfo.behind > 0 && (
                                    <span className="text-orange-600 dark:text-orange-400">
                                      {branchInfo.behind}↓
                                    </span>
                                  )}
                                  {branchInfo.ahead > 0 && (
                                    <span className="text-green-600 dark:text-green-400">
                                      {branchInfo.ahead}↑
                                    </span>
                                  )}
                                </div>
                              )}

                              {/* Divergence from main */}
                              {divergence && (divergence.ahead > 0 || divergence.behind > 0) && (
                                <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
                                  {divergence.ahead > 0 && (
                                    <span className="text-green-600 dark:text-green-400">{divergence.ahead} ahead</span>
                                  )}
                                  {divergence.ahead > 0 && divergence.behind > 0 && <span>,</span>}
                                  {divergence.behind > 0 && (
                                    <span className="text-orange-600 dark:text-orange-400">{divergence.behind} behind</span>
                                  )}
                                  <span className="font-mono bg-muted px-1.5 py-0.5 rounded">{currentBranch}</span>
                                </div>
                              )}

                              {/* Show "up to date" if no divergence at all */}
                              {(!branchInfo?.upstream || (branchInfo.ahead === 0 && branchInfo.behind === 0)) &&
                               (!divergence || (divergence.ahead === 0 && divergence.behind === 0)) && (
                                <span className="text-muted-foreground opacity-60">up to date</span>
                              )}
                            </div>

                            {/* Action buttons when selected */}
                            {isSelected && (
                              <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-border">
                                {isBehindMain && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-7 text-xs"
                                    disabled={updateBranchMutation.isPending}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      updateBranchMutation.mutate(worktree);
                                    }}
                                  >
                                    {updateBranchMutation.isPending ? (
                                      <Loader2 className="w-3 h-3 animate-spin mr-1" />
                                    ) : null}
                                    Update branch
                                  </Button>
                                )}
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-7 text-xs"
                                  disabled={mergeMutation.isPending}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openMergeDialogForWorktree(worktree);
                                  }}
                                >
                                  Merge into {currentBranch || "main"}
                                </Button>
                                <Button
                                  variant="default"
                                  size="sm"
                                  className="h-7 text-xs"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleOpenSession(worktree);
                                  }}
                                >
                                  Open session
                                </Button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

              </div>
            )}

          </div>
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
        worktree={mergeTargetWorktree}
        mainBranch={currentBranch}
        aheadCount={mergeAheadCount}
        hasWorktreeChanges={mergeWorktreeHasChanges}
        changedFiles={mergeChangedFiles}
        isLoadingDetails={mergeDetailsLoading}
        isSubmitting={mergeMutation.isPending}
        onConfirm={(options) => mergeMutation.mutate(options)}
      />

      <CreateWorktreeDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        repoPath={repoPath}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ["worktrees"] });
        }}
      />

      <MoveToWorktreeDialog
        open={moveDialogOpen}
        onOpenChange={setMoveDialogOpen}
        repoPath={repoPath}
        selectedFiles={Array.from(selectedUnstagedFiles)}
        onSuccess={handleMoveToWorktreeSuccess}
      />

      {commandPaletteElement}
    </div>
  );
};
