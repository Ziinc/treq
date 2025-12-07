import { useState, useEffect, useRef, useCallback, useMemo, Suspense, lazy } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { MergeDialog } from "./MergeDialog";
import { CreateWorktreeDialog } from "./CreateWorktreeDialog";
import { CreateWorktreeFromRemoteDialog } from "./CreateWorktreeFromRemoteDialog";
import { CommandPalette } from "./CommandPalette";
import { BranchSwitcher } from "./BranchSwitcher";
import { WorktreeEditSession } from "./WorktreeEditSession";
import { SessionSidebar } from "./SessionSidebar";
import { ErrorBoundary } from "./ErrorBoundary";
import { GitChangesSection } from "./GitChangesSection";
import { MoveToWorktreeDialog } from "./MoveToWorktreeDialog";
import { LineDiffStatsDisplay } from "./LineDiffStatsDisplay";

// Lazy imports
const SessionTerminal = lazy(() => import("./SessionTerminal").then(m => ({ default: m.SessionTerminal })));
const SettingsPage = lazy(() => import("./SettingsPage").then(m => ({ default: m.SettingsPage })));
const MergeReviewPage = lazy(() => import("./MergeReviewPage").then(m => ({ default: m.MergeReviewPage })));
const FileBrowser = lazy(() => import("./FileBrowser").then(m => ({ default: m.FileBrowser })));
import { PlanSection } from "../types/planning";
import {
  parseChangedFiles,
  filterStagedFiles,
  filterUnstagedFiles,
  type ParsedFileChange,
} from "../lib/git-utils";
import { applyBranchNamePattern } from "../lib/utils";
import { buildPlanHistoryPayload } from "../lib/planHistory";
import { getWorktreeTitle as getWorktreeTitleFromUtils } from "../lib/worktree-utils";
import { useToast } from "./ui/toast";
import { useKeyboardShortcut } from "../hooks/useKeyboard";
import { useGitCachePreloader } from "../hooks/useGitCachePreloader";
import { useWorktreeGitStatus } from "../hooks/useWorktreeGitStatus";
import {
  getWorktrees,
  rebuildWorktrees,
  deleteWorktreeFromDb,
  toggleWorktreePin,
  gitRemoveWorktree,
  getSetting,
  setSetting,
  selectFolder,
  isGitRepository,
  gitGetCurrentBranch,
  gitGetStatus,
  gitGetBranchInfo,
  gitGetLineDiffStats,
  Worktree,
  GitStatus,
  BranchInfo,
  LineDiffStats,
  saveExecutedPlan,
  gitCreateWorktree,
  addWorktreeToDb,
  getRepoSetting,
  gitExecutePostCreateCommand,
  Session,
  createSession,
  updateSessionAccess,
  getSessions,
  setSessionModel,
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
import { RefreshCw, GitBranch, Loader2, Pin, MoreVertical, FolderOpen } from "lucide-react";

// Loading spinner component for Suspense fallback
const LoadingSpinner = () => (
  <div className="flex items-center justify-center h-full w-full">
    <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
  </div>
);
import {
  Card,
  CardContent,
} from "./ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "./ui/dropdown-menu";

type ViewMode =
  | "dashboard"
  | "session"
  | "worktree-edit"
  | "worktree-session"
  | "merge-review"
  | "file-browser"
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

// Worktree list item component that uses centralized git status hook
const WorktreeListItem: React.FC<{
  worktree: Worktree;
  currentBranch: string | null;
  isSelected: boolean;
  onSelect: (id: number | null) => void;
  onDoubleClick: () => void;
  onPin: (worktreeId: number) => void;
  onUpdateBranch: (worktree: Worktree) => void;
  onMerge: (worktree: Worktree) => void;
  onBrowseFiles: (worktree: Worktree) => void;
  onOpenSession: (worktree: Worktree) => void;
  updateBranchPending: boolean;
  mergePending: boolean;
}> = ({
  worktree,
  currentBranch,
  isSelected,
  onSelect,
  onDoubleClick,
  onPin,
  onUpdateBranch,
  onMerge,
  onBrowseFiles,
  onOpenSession,
  updateBranchPending,
  mergePending,
}) => {
  const { branchInfo, divergence, lineDiffStats } = useWorktreeGitStatus(worktree.worktree_path, {
    refetchInterval: 30000,
    baseBranch: currentBranch,
  });
  const title = getWorktreeTitleFromUtils(worktree);
  const isBehindMain = divergence && divergence.behind > 0;

  return (
    <div
      onClick={() => onSelect(isSelected ? null : worktree.id)}
      onDoubleClick={onDoubleClick}
      className={`group w-full text-left p-3 rounded-lg border transition-colors cursor-pointer ${
        isSelected
          ? "border-primary ring-2 ring-primary/20 bg-sidebar"
          : "border-border bg-sidebar hover:bg-sidebar-accent"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          <span className="text-sm font-medium truncate">
            {title}
          </span>
          {worktree.is_pinned && (
            <Pin className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
          )}
          <div className="ml-auto flex-shrink-0">
            <LineDiffStatsDisplay stats={lineDiffStats} size="xs" />
          </div>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="p-1 rounded hover:bg-muted transition-opacity opacity-0 group-hover:opacity-100"
              onClick={(e) => e.stopPropagation()}
            >
              <MoreVertical className="w-3.5 h-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onSelect={(event) => {
                event.preventDefault();
                onPin(worktree.id);
              }}
            >
              <Pin className="w-4 h-4 mr-2" />
              {worktree.is_pinned ? "Unpin" : "Pin"} Worktree
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
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
              disabled={updateBranchPending}
              onClick={(e) => {
                e.stopPropagation();
                onUpdateBranch(worktree);
              }}
            >
              {updateBranchPending ? (
                <Loader2 className="w-3 h-3 animate-spin mr-1" />
              ) : null}
              Update branch
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            disabled={mergePending}
            onClick={(e) => {
              e.stopPropagation();
              onMerge(worktree);
            }}
          >
            Merge into {currentBranch || "main"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={(e) => {
              e.stopPropagation();
              onBrowseFiles(worktree);
            }}
          >
            Browse files
          </Button>
          <Button
            variant="default"
            size="sm"
            className="h-7 text-xs"
            onClick={(e) => {
              e.stopPropagation();
              onOpenSession(worktree);
            }}
          >
            Open session
          </Button>
        </div>
      )}
    </div>
  );
};

export const Dashboard: React.FC = () => {
  const [repoPath, setRepoPath] = useState("");
  const [repoName, setRepoName] = useState("");
  const { data: currentBranch = null } = useQuery({
    queryKey: ["mainRepoBranch", repoPath],
    queryFn: () => gitGetCurrentBranch(repoPath),
    enabled: !!repoPath,
    staleTime: 0, // Always consider stale to refetch on invalidation
  });
  const [mainRepoStatus, setMainRepoStatus] = useState<GitStatus | null>(null);
  const [mainBranchInfo, setMainBranchInfo] = useState<BranchInfo | null>(null);
  const [mainRepoLineStats, setMainRepoLineStats] = useState<LineDiffStats | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showCreateFromRemoteDialog, setShowCreateFromRemoteDialog] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("dashboard");
  const [selectedWorktree, setSelectedWorktree] = useState<Worktree | null>(null);
  const [fileBrowserWorktree, setFileBrowserWorktree] = useState<Worktree | null>(null);
  const [initialSettingsTab, setInitialSettingsTab] = useState<"application" | "repository">("repository");
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [showBranchSwitcher, setShowBranchSwitcher] = useState(false);
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

  // Plan execution pending state
  const [planExecutionPending, setPlanExecutionPending] = useState<{
    section: PlanSection;
    sourceBranch: string;
    sessionName?: string;
  } | null>(null);

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

  const queryClient = useQueryClient();
  const { addToast } = useToast();
  const sessionActivityListenerRef = useRef<((sessionId: number) => void) | null>(null);

  const mainRepoChangeCount = mainRepoStatus
    ? mainRepoStatus.modified + mainRepoStatus.added + mainRepoStatus.deleted + mainRepoStatus.untracked
    : 0;

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

  // Forward declaration reference - will be defined after handleOpenSession
  const handleMainRepoFileClickRef = useRef<((file: ParsedFileChange) => Promise<void>) | null>(null);

  // File selection handler - VSCode-style click selection
  const handleFileSelect = useCallback((path: string, event: React.MouseEvent) => {
    const fileIndex = mainRepoUnstagedFiles.findIndex(f => f.path === path);
    if (fileIndex === -1) return;

    const isMetaKey = event.metaKey || event.ctrlKey;
    const isShiftKey = event.shiftKey;

    setSelectedUnstagedFiles(prev => {
      const next = new Set(prev);

      if (isShiftKey && lastSelectedFileIndex !== null) {
        // Range selection - clear others and select range
        next.clear();
        const start = Math.min(lastSelectedFileIndex, fileIndex);
        const end = Math.max(lastSelectedFileIndex, fileIndex);
        for (let i = start; i <= end; i++) {
          next.add(mainRepoUnstagedFiles[i].path);
        }
      } else if (isMetaKey) {
        // Cmd/Ctrl+click - toggle individual file
        if (next.has(path)) {
          next.delete(path);
        } else {
          next.add(path);
        }
      } else {
        // Single click - select only this file (unless already sole selection)
        if (next.size === 1 && next.has(path)) {
          // Already sole selection - keep it
          return prev;
        }
        next.clear();
        next.add(path);
      }
      return next;
    });

    setLastSelectedFileIndex(fileIndex);

    // Trigger file click handler only for plain single clicks (no modifiers)
    if (!isMetaKey && !isShiftKey) {
      const file = mainRepoUnstagedFiles.find((f) => f.path === path);
      if (file && handleMainRepoFileClickRef.current) {
        handleMainRepoFileClickRef.current(file);
      }
    }
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

  // Load repo name when repo path changes
  useEffect(() => {
    if (repoPath) {
      // Extract repo name from path
      const name = repoPath.split('/').pop() || repoPath.split('\\').pop() || repoPath;
      setRepoName(name);
    } else {
      setRepoName("");
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

  // Listen for git config initialization errors
  useEffect(() => {
    const unlisten = listen<{ repo_path: string; error: string }>(
      "git-config-init-error",
      (event) => {
        const { repo_path, error } = event.payload;

        // Only show toast if error is for current repo
        if (repoPath && repo_path === repoPath) {
          addToast({
            title: "Git configuration warning",
            description: `Could not configure automatic remote tracking: ${error}`,
            type: "warning",
          });
        }
      }
    );

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [repoPath, addToast]);

  const refreshMainRepoInfo = useCallback(async () => {
    if (!repoPath) {
      setMainRepoStatus(null);
      setMainBranchInfo(null);
      setMainRepoChangedFiles([]);
      return;
    }

    // Immediate: critical API calls that block UI updates
    const [status, branchInfo] = await Promise.all([
      gitGetStatus(repoPath).catch(() => null),
      gitGetBranchInfo(repoPath).catch(() => null),
    ]);

    setMainRepoStatus(status);
    setMainBranchInfo(branchInfo);

    // Deferred: non-critical API calls using requestIdleCallback
    if (typeof requestIdleCallback !== 'undefined') {
      requestIdleCallback(
        async () => {
          const [changedFiles, lineStats] = await Promise.all([
            gitGetChangedFiles(repoPath).catch(() => [] as string[]),
            gitGetLineDiffStats(repoPath, "HEAD").catch(() => null),
          ]);
          setMainRepoChangedFiles(parseChangedFiles(changedFiles));
          setMainRepoLineStats(lineStats);
        },
        { timeout: 5000 } // Fallback after 5s if idle callback never fires
      );
    } else {
      // Fallback for browsers without requestIdleCallback
      setTimeout(async () => {
        const [changedFiles, lineStats] = await Promise.all([
          gitGetChangedFiles(repoPath).catch(() => [] as string[]),
          gitGetLineDiffStats(repoPath, "HEAD").catch(() => null),
        ]);
        setMainRepoChangedFiles(parseChangedFiles(changedFiles));
        setMainRepoLineStats(lineStats);
      }, 0);
    }
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

  // Listen for window focus to refresh git status
  useEffect(() => {
    if (!repoPath) return;

    const handleFocus = async () => {
      try {
        // Invalidate to trigger refetch
        queryClient.invalidateQueries({ queryKey: ["mainRepoBranch", repoPath] });
        // Refresh main repo info
        refreshMainRepoInfo();
      } catch (error) {
        console.error("Failed to refresh git info on window focus:", error);
      }
    };

    const unlistenFocus = getCurrentWindow().onFocusChanged(({ payload: focused }) => {
      if (focused) {
        handleFocus();
      }
    });

    return () => {
      unlistenFocus.then((fn) => fn());
    };
  }, [repoPath, queryClient, refreshMainRepoInfo]);

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

      // Reset session state
      setActiveSessionId(null);
      setMountedSessionIds(new Set());
      setSessionPlanContent(null);
      setSessionPlanTitle(null);
      setSessionInitialPrompt(null);
      setSessionPromptLabel(null);
      setSessionSelectedFile(null);

      // Reset UI state
      setCollapsedSections(new Set());
      setSelectedUnstagedFiles(new Set());
      setLastSelectedFileIndex(null);
      setMoveDialogOpen(false);
      setSelectedWorktreeId(null);

      // Reset merge state
      resetMergeState();

      // Invalidate queries to force immediate refresh
      queryClient.invalidateQueries({ queryKey: ["worktrees"] });
      queryClient.invalidateQueries({ queryKey: ["sessions"] });

      addToast({
        title: "Repository Opened",
        description: `Now viewing ${selected.split("/").pop() || selected}`,
        type: "success",
      });
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [queryClient, addToast, resetMergeState]);

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
    queryKey: ["sessions", repoPath],
    queryFn: () => getSessions(repoPath),
    refetchInterval: 5000,
    enabled: !!repoPath,
  });

  const { data: worktrees = [], refetch } = useQuery({
    queryKey: ["worktrees", repoPath],
    queryFn: () => getWorktrees(repoPath),
    enabled: !!repoPath,
  });

  // Rebuild worktrees from filesystem if database is empty
  useEffect(() => {
    const rebuildIfNeeded = async () => {
      if (repoPath && worktrees.length === 0) {
        try {
          const rebuilt = await rebuildWorktrees(repoPath);
          if (rebuilt.length > 0) {
            queryClient.invalidateQueries({ queryKey: ["worktrees", repoPath] });
          }
        } catch (error) {
          console.error("Failed to rebuild worktrees:", error);
        }
      }
    };
    rebuildIfNeeded();
  }, [repoPath, worktrees.length, queryClient]);

  // Lazy preload: only preload selected worktree, not all worktrees
  useGitCachePreloader(selectedWorktree?.worktree_path ?? null);

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
      } catch {
        // Silently ignore polling failures
      }
    };

    // Poll every 5 seconds
    const interval = setInterval(pollGitChanges, 5000);

    return () => clearInterval(interval);
  }, [viewMode, repoPath, refreshMainRepoInfo]);

  // Refresh git changes when session tab is focused
  useEffect(() => {
    if (viewMode === "session" || viewMode === "worktree-session") {
      if (repoPath && activeSessionId) {
        // Invalidate cache and refresh on session focus change
        invalidateGitCache(repoPath).catch(() => {
          // Silently ignore cache invalidation failures
        });
        refreshMainRepoInfo();
      }
    }
  }, [activeSessionId, viewMode, repoPath, refreshMainRepoInfo]);

  const deleteWorktree = useMutation({
    mutationFn: async (worktree: Worktree) => {
      await gitRemoveWorktree(worktree.repo_path, worktree.worktree_path);
      await deleteWorktreeFromDb(worktree.repo_path, worktree.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["worktrees", repoPath] });
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

  const togglePinMutation = useMutation({
    mutationFn: async ({ worktreeId, repoPath }: { worktreeId: number; repoPath: string }) => {
      return toggleWorktreePin(repoPath, worktreeId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["worktrees", repoPath] });
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
      queryClient.invalidateQueries({ queryKey: ["worktrees", repoPath] });
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
      // Invalidate queries to trigger refetch of worktree git status
      queryClient.invalidateQueries({ queryKey: ["worktree-divergence", worktree.worktree_path] });
      queryClient.invalidateQueries({ queryKey: ["worktree-branch-info", worktree.worktree_path] });
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
      const sessions = await getSessions(repoPath);
      if (!options?.forceNew) {
        const existing = sessions.find((s) => s.worktree_id === worktreeId);
        if (existing) {
          await updateSessionAccess(repoPath, existing.id);
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
      const sessionId = await createSession(repoPath, worktreeId, name, finalPlanTitleForDb);

      // Apply default model from settings (repo-level overrides application-level)
      try {
        const repoDefaultModel = await getRepoSetting(repoPath, "default_model");
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
    [queryClient, worktrees, repoPath]
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

      // Focus terminal after session opens
      setTimeout(() => {
        // Try to find terminal container (ghostty-web or xterm)
        const terminalContainer = document.querySelector('.xterm, [data-terminal]');
        if (terminalContainer) {
          const textarea = terminalContainer.querySelector('textarea');
          if (textarea instanceof HTMLTextAreaElement) {
            textarea.focus();
          }
        }
      }, 300);
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
    await queryClient.refetchQueries({ queryKey: ["worktrees", repoPath] });

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
      is_pinned: false,
    };

    await handleOpenSession(newWorktree, { forceNew: true });
  }, [queryClient, repoPath, handleOpenSession]);

  const handleSessionClick = async (session: Session) => {
    await updateSessionAccess(repoPath, session.id);
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
        is_pinned: false,
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

  const handleExecutePlanInWorktree = useCallback(async (
    section: PlanSection,
    sourceBranch: string,
    currentSessionName?: string
  ) => {
    // Instead of creating immediately, open the modal with context
    setPlanExecutionPending({
      section,
      sourceBranch,
      sessionName: currentSessionName,
    });
    setShowCreateDialog(true);
  }, []);

  const handleWorktreeCreatedWithPlan = useCallback(async (
    worktreeInfo: { id: number; worktreePath: string; branchName: string; metadata: string },
    planSection: PlanSection,
    sessionName?: string
  ) => {
    // Close modal
    setShowCreateDialog(false);

    // Get plan content
    const planContent = planSection.editedContent || planSection.rawMarkdown;

    // Create worktree object
    const newWorktree: Worktree = {
      id: worktreeInfo.id,
      repo_path: repoPath,
      worktree_path: worktreeInfo.worktreePath,
      branch_name: worktreeInfo.branchName,
      created_at: new Date().toISOString(),
      metadata: worktreeInfo.metadata,
      is_pinned: false,
    };

    // Record plan execution
    try {
      const payload = buildPlanHistoryPayload(planSection);
      await saveExecutedPlan(repoPath, worktreeInfo.id, payload);
    } catch (planError) {
      console.error("Failed to record plan execution:", planError);
    }

    // Open session with transferred name
    await handleOpenSession(newWorktree, {
      planTitle: planSection.title,
      planContent,
      forceNew: true,
      sessionName: sessionName, // Transfer session name
    });

    addToast({
      title: "Ready to implement",
      description: "Worktree created; plan sent to Claude",
      type: "success",
    });

    // Clear pending state
    setPlanExecutionPending(null);

    // Refresh worktree list
    refetch();
  }, [repoPath, handleOpenSession, refetch, addToast]);

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

  const handleBrowseFiles = useCallback((worktree: Worktree | null) => {
    setFileBrowserWorktree(worktree);
    setViewMode("file-browser");
  }, []);

  // File click handler for main repo - opens diff viewer session
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

  // Update the ref so handleFileSelect can use it
  useEffect(() => {
    handleMainRepoFileClickRef.current = handleMainRepoFileClick;
  }, [handleMainRepoFileClick]);

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

  // Handle branch change after switching
  const handleBranchChanged = useCallback(() => {
    // Refresh main repo info
    queryClient.invalidateQueries({ queryKey: ["mainRepoBranch", repoPath] });
    queryClient.invalidateQueries({ queryKey: ["mainRepoStatus", repoPath] });
    queryClient.invalidateQueries({ queryKey: ["mainRepoChangedFiles", repoPath] });
    addToast({ title: "Branch switched successfully", type: "success" });
  }, [repoPath, queryClient, addToast]);

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
            <Suspense fallback={<LoadingSpinner />}>
              <SessionTerminal
                repositoryPath={sessionWorktree ? undefined : repoPath}
                worktree={sessionWorktree || undefined}
                session={session}
                sessionId={session.id}
                mainRepoBranch={currentBranch}
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
            </Suspense>
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
    currentBranch,
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

  const mainContentStyle = useMemo(() => ({ width: showSidebar ? "calc(100vw - 240px)" : "100%" }), [showSidebar]);
  const sessionLayerStyle = useMemo<React.CSSProperties>(() => ({
    visibility: isSessionView ? 'visible' : 'hidden',
    zIndex: isSessionView ? 10 : 0,
    pointerEvents: isSessionView ? 'auto' : 'none',
  }), [isSessionView]);

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
          onCreateWorktreeFromRemote={() => setShowCreateFromRemoteDialog(true)}
          onSessionActivityListenerChange={handleSessionActivityListenerChange}
          openSettings={openSettings}
          navigateToDashboard={handleReturnToDashboard}
          onOpenCommandPalette={() => setShowCommandPalette(true)}
          onBrowseFiles={handleBrowseFiles}
          browsingWorktreeId={viewMode === "file-browser" ? (fileBrowserWorktree?.id ?? null) : undefined}
          currentPage={
            viewMode === "dashboard" ? "dashboard" :
            viewMode === "settings" ? "settings" :
            (viewMode === "session" || viewMode === "worktree-session") ? "session" :
            null
          }
        />
      )}

      <div
        className="flex-1 relative"
        style={mainContentStyle}
      >
        {/* Sessions Layer - ALWAYS RENDERED ONCE */}
        <div
          className="absolute inset-0 flex flex-col"
          style={sessionLayerStyle}
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
            <Suspense fallback={<LoadingSpinner />}>
              <SettingsPage
                repoPath={repoPath}
                onRepoPathChange={setRepoPath}
                initialTab={initialSettingsTab}
                onRefresh={refetch}
                onClose={() => setViewMode("dashboard")}
                repoName={repoName}
                currentBranch={currentBranch}
                mainBranchInfo={mainBranchInfo}
              />
            </Suspense>
          )}

          {/* Merge Review View */}
          {viewMode === "merge-review" && selectedWorktree && (
            <ErrorBoundary
              fallbackTitle="Merge review failed"
              resetKeys={[selectedWorktree.id, currentBranch ?? ""]}
              onGoDashboard={handleReturnToDashboard}
            >
              <Suspense fallback={<LoadingSpinner />}>
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
              </Suspense>
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

          {/* File Browser View */}
          {viewMode === "file-browser" && (
            <ErrorBoundary
              fallbackTitle="File browser error"
              resetKeys={[fileBrowserWorktree?.id ?? repoPath]}
              onGoDashboard={handleReturnToDashboard}
            >
              <Suspense fallback={<LoadingSpinner />}>
                <FileBrowser
                  worktree={fileBrowserWorktree ?? undefined}
                  repoPath={fileBrowserWorktree ? undefined : repoPath}
                  branchName={fileBrowserWorktree ? undefined : currentBranch ?? undefined}
                  mainBranch={currentBranch ?? undefined}
                  onClose={() => {
                    setViewMode("dashboard");
                    setFileBrowserWorktree(null);
                  }}
                />
              </Suspense>
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
                            <div className="flex items-center gap-2">
                              <div className="flex items-center gap-1 min-w-0 flex-1">
                                <GitBranch className="w-4 h-4 shrink-0" />
                                <code className="text-xs truncate" title={currentBranch}>{currentBranch}</code>
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

                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="w-6 h-6"
                                      onClick={() => {
                                        setViewMode("file-browser");
                                        setFileBrowserWorktree(null);
                                      }}
                                    >
                                      <FolderOpen className="w-3 h-3" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent side="bottom">
                                    Browse files
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
                          {/* Header with line stats */}
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-muted-foreground uppercase tracking-wide">
                              Changes
                            </span>
                            <LineDiffStatsDisplay stats={mainRepoLineStats} size="xs" />
                          </div>
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
                      {worktrees.map((worktree) => (
                        <WorktreeListItem
                          key={worktree.id}
                          worktree={worktree}
                          currentBranch={currentBranch}
                          isSelected={selectedWorktreeId === worktree.id}
                          onSelect={setSelectedWorktreeId}
                          onDoubleClick={() => handleOpenSession(worktree)}
                          onPin={(worktreeId) => {
                            if (repoPath) {
                              togglePinMutation.mutate({ worktreeId, repoPath });
                            }
                          }}
                          onUpdateBranch={(wt) => updateBranchMutation.mutate(wt)}
                          onMerge={(wt) => openMergeDialogForWorktree(wt)}
                          onBrowseFiles={(wt) => {
                            setFileBrowserWorktree(wt);
                            setViewMode("file-browser");
                          }}
                          onOpenSession={(wt) => handleOpenSession(wt)}
                          updateBranchPending={updateBranchMutation.isPending}
                          mergePending={mergeMutation.isPending}
                        />
                      ))}
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
        onOpenChange={(open) => {
          setShowCreateDialog(open);
          if (!open) {
            setPlanExecutionPending(null); // Clear on close
          }
        }}
        repoPath={repoPath}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ["worktrees", repoPath] });
        }}
        planSection={planExecutionPending?.section}
        sourceBranch={planExecutionPending?.sourceBranch}
        initialSessionName={planExecutionPending?.sessionName}
        onSuccessWithPlan={handleWorktreeCreatedWithPlan}
      />

      <CreateWorktreeFromRemoteDialog
        open={showCreateFromRemoteDialog}
        onOpenChange={setShowCreateFromRemoteDialog}
        repoPath={repoPath}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ["worktrees", repoPath] });
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
      {branchSwitcherElement}
    </div>
  );
};
