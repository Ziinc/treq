import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { listen } from "@tauri-apps/api/event";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { WorktreeCard } from "./WorktreeCard";
import { MergeDialog } from "./MergeDialog";
import { CreateWorktreeDialog } from "./CreateWorktreeDialog";
import { DiffViewer } from "./DiffViewer";
import { CommandPalette } from "./CommandPalette";
import { SettingsPage } from "./SettingsPage";
import { SessionTerminal } from "./SessionTerminal";
import { WorktreeEditSession } from "./WorktreeEditSession";
import { MergeReviewPage } from "./MergeReviewPage";
import { SessionSidebar } from "./SessionSidebar";
import { ErrorBoundary } from "./ErrorBoundary";
import { GitFileListItem } from "./GitFileListItem";
import { PlanSection } from "../types/planning";
import { applyBranchNamePattern } from "../lib/utils";
import { buildPlanHistoryPayload } from "../lib/planHistory";
import { useToast } from "./ui/toast";
import { useKeyboardShortcut } from "../hooks/useKeyboard";
import {
  getWorktrees,
  deleteWorktreeFromDb,
  gitRemoveWorktree,
  getSetting,
  gitGetCurrentBranch,
  gitGetStatus,
  gitGetBranchInfo,
  calculateDirectorySize,
  Worktree,
  GitStatus,
  BranchInfo,
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
  gitCommit,
} from "../lib/api";
import type { MergeStrategy } from "../lib/api";
import { formatBytes } from "../lib/utils";
import { Plus, Settings, X, RefreshCw, Search, GitBranch, HardDrive, Info, ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "./ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";

type ViewMode =
  | "dashboard"
  | "diff"
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

interface ParsedFileChange {
  path: string;
  stagedStatus?: string | null;
  worktreeStatus?: string | null;
  isUntracked: boolean;
}

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
  const [searchQuery, setSearchQuery] = useState("");
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

  // Main repo git changes state
  const [mainRepoChangedFiles, setMainRepoChangedFiles] = useState<ParsedFileChange[]>([]);
  const [mainRepoCommitMessage, setMainRepoCommitMessage] = useState("");
  const [mainRepoCommitPending, setMainRepoCommitPending] = useState(false);
  const [mainRepoFileActionTarget, setMainRepoFileActionTarget] = useState<string | null>(null);
  const [stagedChangesExpanded, setStagedChangesExpanded] = useState(true);
  const [unstagedChangesExpanded, setUnstagedChangesExpanded] = useState(true);

  const queryClient = useQueryClient();
  const { addToast } = useToast();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const sessionActivityListenerRef = useRef<((sessionId: number) => void) | null>(null);

  const mainRepoChangeCount = mainRepoStatus
    ? mainRepoStatus.modified + mainRepoStatus.added + mainRepoStatus.deleted + mainRepoStatus.untracked
    : 0;

  const mainRepoStagedFiles = useMemo(
    () => mainRepoChangedFiles.filter((file) => file.stagedStatus && file.stagedStatus !== " "),
    [mainRepoChangedFiles]
  );

  const mainRepoUnstagedFiles = useMemo(
    () => mainRepoChangedFiles.filter((file) => (file.worktreeStatus && file.worktreeStatus !== " ") || file.isUntracked),
    [mainRepoChangedFiles]
  );

  const parseChangedFiles = useCallback((changedFiles: string[]): ParsedFileChange[] => {
    return changedFiles.map((file) => {
      if (file.startsWith("?? ")) {
        return {
          path: file.substring(3).trim(),
          stagedStatus: null,
          worktreeStatus: "??",
          isUntracked: true,
        };
      }

      if (file.length < 3) {
        return {
          path: file.trim(),
          stagedStatus: null,
          worktreeStatus: null,
          isUntracked: false,
        };
      }

      const stagedStatus = file[0] !== " " ? file[0] : null;
      const worktreeStatus = file[1] !== " " ? file[1] : null;
      const rawPath = file.substring(3).trim();
      const path = rawPath.includes(" -> ") ? rawPath.split(" -> ").pop() || rawPath : rawPath;

      return {
        path,
        stagedStatus,
        worktreeStatus,
        isUntracked: false,
      };
    });
  }, []);

  const resetMergeState = useCallback(() => {
    setMergeDialogOpen(false);
    setMergeTargetWorktree(null);
    setMergeAheadCount(0);
    setMergeWorktreeHasChanges(false);
    setMergeChangedFiles([]);
    setMergeDetailsLoading(false);
  }, []);

  const openSettings = useCallback((tab: "application" | "repository" = "repository") => {
    setInitialSettingsTab(tab);
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

  useKeyboardShortcut("f", true, () => {
    if (viewMode === "dashboard") {
      searchInputRef.current?.focus();
    }
  });

  useKeyboardShortcut("k", true, () => {
    setShowCommandPalette(true);
  });

  useKeyboardShortcut("Escape", false, () => {
    if (showCreateDialog) setShowCreateDialog(false);
    if (showCommandPalette) setShowCommandPalette(false);
  });

  // Load saved repo path
  useEffect(() => {
    getSetting("repo_path").then((path) => {
      if (path) setRepoPath(path);
    });
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

  const refreshMainRepoInfo = useCallback(() => {
    if (!repoPath) {
      setMainRepoStatus(null);
      setMainBranchInfo(null);
      setMainRepoSize(null);
      setMainRepoChangedFiles([]);
      return;
    }

    gitGetStatus(repoPath)
      .then(setMainRepoStatus)
      .catch(() => setMainRepoStatus(null));

    gitGetBranchInfo(repoPath)
      .then(setMainBranchInfo)
      .catch(() => setMainBranchInfo(null));

    calculateDirectorySize(repoPath)
      .then(setMainRepoSize)
      .catch(() => setMainRepoSize(null));

    gitGetChangedFiles(repoPath)
      .then((files) => setMainRepoChangedFiles(parseChangedFiles(files)))
      .catch(() => setMainRepoChangedFiles([]));
  }, [repoPath, parseChangedFiles]);

  const handleMainRepoSync = useCallback(async () => {
    if (!repoPath) {
      addToast({
        title: "Repository not set",
        description: "Configure a repository path before syncing.",
        type: "error",
      });
      return;
    }

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


  const { data: sessions = [] } = useQuery({
    queryKey: ["sessions"],
    queryFn: getSessions,
    refetchInterval: 5000,
  });

  const { data: worktrees = [], isLoading, refetch } = useQuery({
    queryKey: ["worktrees"],
    queryFn: getWorktrees,
  });

  const activeSession = useMemo(() => {
    if (!activeSessionId) return null;
    return sessions.find((session) => session.id === activeSessionId) ?? null;
  }, [sessions, activeSessionId]);

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

  // Filter worktrees based on search query (including metadata)
  const filteredWorktrees = worktrees.filter((wt) => {
    const query = searchQuery.toLowerCase();
    
    // Check branch name and path
    if (wt.branch_name.toLowerCase().includes(query) ||
        wt.worktree_path.toLowerCase().includes(query)) {
      return true;
    }
    
    // Check metadata fields
    if (wt.metadata) {
      try {
        const metadata = JSON.parse(wt.metadata);
        if (metadata.initial_plan_title?.toLowerCase().includes(query) ||
            metadata.intent?.toLowerCase().includes(query)) {
          return true;
        }
      } catch {
        // Ignore parse errors
      }
    }
    
    return false;
  });

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

  const handleOpenDiff = (worktree: Worktree) => {
    setSelectedWorktree(worktree);
    setViewMode("diff");
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

  const handleOpenMergeReview = async (worktree: Worktree) => {
    if (!repoPath) {
      addToast({
        title: "Repository not set",
        description: "Configure a repository path before starting a review.",
        type: "error",
      });
      return;
    }

    if (!currentBranch) {
      addToast({
        title: "Missing base branch",
        description: "Checkout the main branch in the repo before reviewing",
        type: "error",
      });
      return;
    }

    try {
      const mainDirty = await gitHasUncommittedChanges(repoPath);
      if (mainDirty) {
        addToast({
          title: "Main repository dirty",
          description: "Commit or stash changes on the main tree before reviewing.",
          type: "error",
        });
        return;
      }

      setSelectedWorktree(worktree);
      setSessionPlanContent(null);
      setSessionPlanTitle(null);
      setSessionInitialPrompt(null);
      setSessionPromptLabel(null);
      setSessionSelectedFile(null);
      setActiveSessionId(null);
      setViewMode("merge-review");
    } catch (error) {
      addToast({
        title: "Unable to open review",
        description: error instanceof Error ? error.message : String(error),
        type: "error",
      });
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

  if (viewMode === "session") {
    return (
      <>
        <div className="flex h-screen bg-background">
          <SessionSidebar
            activeSessionId={activeSessionId}
            onSessionClick={handleSessionClick}
            onCreateSession={handleCreateSessionFromSidebar}
            onCloseActiveSession={handleCloseTerminal}
            repoPath={repoPath}
            currentBranch={currentBranch}
            onDeleteWorktree={handleDelete}
            onSessionActivityListenerChange={handleSessionActivityListenerChange}
            openSettings={openSettings}
          />
          <div className="flex-1" style={{ width: "calc(100vw - 240px)" }}>
            <ErrorBoundary
              fallbackTitle="Session terminal error"
              resetKeys={[activeSessionId ?? "main"]}
              onGoDashboard={handleCloseTerminal}
            >
              <SessionTerminal
                repositoryPath={repoPath}
                session={activeSession}
                sessionId={activeSessionId}
                onClose={handleCloseTerminal}
                onExecutePlan={handleExecutePlan}
                initialPlanContent={sessionPlanContent || undefined}
                initialPlanTitle={sessionPlanTitle || undefined}
                initialPrompt={sessionInitialPrompt || undefined}
                initialPromptLabel={sessionPromptLabel || undefined}
                initialSelectedFile={sessionSelectedFile || undefined}
                onSessionActivity={handleSessionActivity}
              />
            </ErrorBoundary>
          </div>
        </div>
        {commandPaletteElement}
      </>
    );
  }

  if (viewMode === "worktree-session" && selectedWorktree) {
    return (
      <>
        <div className="flex h-screen bg-background">
          <SessionSidebar
            activeSessionId={activeSessionId}
            onSessionClick={handleSessionClick}
            onCreateSession={handleCreateSessionFromSidebar}
            onCloseActiveSession={handleCloseTerminal}
            repoPath={repoPath}
            currentBranch={currentBranch}
            onDeleteWorktree={handleDelete}
            onSessionActivityListenerChange={handleSessionActivityListenerChange}
            openSettings={openSettings}
          />
          <div className="flex-1" style={{ width: "calc(100vw - 240px)" }}>
            <ErrorBoundary
              fallbackTitle="Worktree terminal error"
              resetKeys={[activeSessionId ?? "main", selectedWorktree.id]}
              onGoDashboard={handleCloseTerminal}
            >
              <SessionTerminal
                worktree={selectedWorktree}
                session={activeSession}
                sessionId={activeSessionId}
                onClose={handleCloseTerminal}
                onExecutePlan={handleExecutePlan}
                initialPlanContent={sessionPlanContent || undefined}
                initialPlanTitle={sessionPlanTitle || undefined}
                initialPrompt={sessionInitialPrompt || undefined}
                initialPromptLabel={sessionPromptLabel || undefined}
                initialSelectedFile={sessionSelectedFile || undefined}
                onSessionActivity={handleSessionActivity}
              />
            </ErrorBoundary>
          </div>
        </div>
        {commandPaletteElement}
      </>
    );
  }

  if (viewMode === "merge-review" && selectedWorktree) {
    return (
      <>
        <div className="flex flex-col h-screen bg-background">
          <div className="flex-1 overflow-auto">
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
          </div>
        </div>
        {commandPaletteElement}
      </>
    );
  }

  if (viewMode === "worktree-edit" && selectedWorktree) {
    return (
      <>
        <div className="flex flex-col h-screen bg-background">
          <div className="flex-1 overflow-auto">
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
          </div>
        </div>
        {commandPaletteElement}
      </>
    );
  }

  if (viewMode === "diff" && selectedWorktree) {
    return (
      <>
        <div className="h-screen flex flex-col bg-background">
          <div className="flex-1 flex flex-col">
            <div className="border-b p-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">
                Diff Viewer - {selectedWorktree.branch_name}
              </h2>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setViewMode("dashboard")}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
            <div className="flex-1">
              <ErrorBoundary
                fallbackTitle="Diff viewer failed"
                resetKeys={[selectedWorktree.id]}
                onGoDashboard={handleReturnToDashboard}
              >
                <DiffViewer worktreePath={selectedWorktree.worktree_path} />
              </ErrorBoundary>
            </div>
          </div>
        </div>
        {commandPaletteElement}
      </>
    );
  }

  if (viewMode === "settings") {
    return (
      <>
        <div className="flex h-screen bg-background">
          <SessionSidebar
            activeSessionId={activeSessionId}
            onSessionClick={handleSessionClick}
            onCreateSession={handleCreateSessionFromSidebar}
            onCloseActiveSession={handleCloseTerminal}
            repoPath={repoPath}
            currentBranch={currentBranch}
            onDeleteWorktree={handleDelete}
            onSessionActivityListenerChange={handleSessionActivityListenerChange}
            openSettings={openSettings}
          />
          <div className="flex-1" style={{ width: "calc(100vw - 240px)" }}>
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
          </div>
        </div>
        {commandPaletteElement}
      </>
    );
  }

  return (
    <div className="flex h-screen bg-background">
      <SessionSidebar
        activeSessionId={activeSessionId}
        onSessionClick={handleSessionClick}
        onCreateSession={handleCreateSessionFromSidebar}
        onCloseActiveSession={handleCloseTerminal}
        repoPath={repoPath}
        currentBranch={currentBranch}
        onDeleteWorktree={handleDelete}
        onSessionActivityListenerChange={handleSessionActivityListenerChange}
        openSettings={openSettings}
      />
      <div className="flex-1 overflow-auto" style={{ width: "calc(100vw - 240px)" }}>
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
                    <CardContent className="space-y-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 space-y-3 text-sm">
                          {currentBranch && (
                            <div className="flex items-center gap-2 flex-wrap">
                              <div className="flex items-center gap-1">
                                <GitBranch className="w-4 h-4" />
                                <code className="text-xs">{currentBranch}</code>
                              </div>

                              <Button
                                variant="ghost"
                                size="icon"
                                className="w-6 h-6"
                                onClick={handleMainRepoSync}
                                disabled={mainRepoSyncing}
                              >
                                <RefreshCw className={`w-3 h-3 ${mainRepoSyncing ? "animate-spin" : ""}`} />
                              </Button>

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
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 flex-shrink-0">
                              <Info className="w-4 h-4" />
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent align="end" className="w-80">
                            <div className="space-y-3 text-sm">
                              <div>
                                <div className="text-xs text-muted-foreground mb-0.5">Repository</div>
                                <div className="font-medium">{repoName || "Main repository"}</div>
                              </div>
                              <div>
                                <div className="text-xs text-muted-foreground mb-0.5">Path</div>
                                <div className="font-mono text-xs break-all">{repoPath}</div>
                              </div>
                              <div>
                                <div className="text-xs text-muted-foreground mb-0.5">Disk Usage</div>
                                <div className="text-xs flex items-center gap-1 text-muted-foreground">
                                  <HardDrive className="w-3 h-3" />
                                  {mainRepoSize !== null ? formatBytes(mainRepoSize) : "Calculating..."}
                                </div>
                              </div>
                              {currentBranch && (
                                <div className="space-y-1">
                                  <div className="text-xs text-muted-foreground">Current Branch</div>
                                  <div className="flex items-center gap-2 text-xs">
                                    <GitBranch className="w-3 h-3" />
                                    <code>{currentBranch}</code>
                                  </div>
                                  {mainBranchInfo?.upstream && (
                                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                                      {mainBranchInfo.behind > 0 && <span>{mainBranchInfo.behind}↓</span>}
                                      {mainBranchInfo.ahead > 0 && <span>{mainBranchInfo.ahead}↑</span>}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          </PopoverContent>
                        </Popover>
                      </div>

                      {/* Git Changes List */}
                      {mainRepoChangeCount > 0 && (
                        <div className="space-y-3 mt-4 pt-4 border-t border-border">
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
                            <div className="space-y-1">
                              <button
                                className="flex items-center gap-1 text-xs uppercase tracking-wide text-muted-foreground hover:text-foreground w-full"
                                onClick={() => setStagedChangesExpanded(!stagedChangesExpanded)}
                              >
                                {stagedChangesExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                                <span>Staged Changes</span>
                                <span className="ml-auto px-1.5 py-0.5 bg-green-500/10 text-green-600 dark:text-green-400 rounded">
                                  {mainRepoStagedFiles.length}
                                </span>
                              </button>
                              {stagedChangesExpanded && (
                                <div className="border border-border/40 rounded-sm overflow-hidden">
                                  {mainRepoStagedFiles.map((file: ParsedFileChange) => (
                                    <GitFileListItem
                                      key={`staged-${file.path}`}
                                      file={file.path}
                                      status={file.stagedStatus || file.worktreeStatus || "M"}
                                      isStaged={true}
                                      isBusy={mainRepoFileActionTarget === file.path}
                                      onClick={() => handleMainRepoFileClick(file)}
                                      onUnstage={() => handleMainRepoUnstageFile(file.path)}
                                      readOnly={mainRepoCommitPending}
                                    />
                                  ))}
                                </div>
                              )}
                            </div>
                          )}

                          {/* Unstaged Changes */}
                          {mainRepoUnstagedFiles.length > 0 && (
                            <div className="space-y-1">
                              <button
                                className="flex items-center gap-1 text-xs uppercase tracking-wide text-muted-foreground hover:text-foreground w-full"
                                onClick={() => setUnstagedChangesExpanded(!unstagedChangesExpanded)}
                              >
                                {unstagedChangesExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                                <span>Changes</span>
                                <span className="ml-auto px-1.5 py-0.5 bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 rounded">
                                  {mainRepoUnstagedFiles.length}
                                </span>
                              </button>
                              {unstagedChangesExpanded && (
                                <div className="border border-border/40 rounded-sm overflow-hidden">
                                  {mainRepoUnstagedFiles.map((file: ParsedFileChange) => (
                                    <GitFileListItem
                                      key={`unstaged-${file.path}`}
                                      file={file.path}
                                      status={file.worktreeStatus || file.stagedStatus || "M"}
                                      isStaged={false}
                                      isBusy={mainRepoFileActionTarget === file.path}
                                      onClick={() => handleMainRepoFileClick(file)}
                                      onStage={() => handleMainRepoStageFile(file.path)}
                                      readOnly={mainRepoCommitPending}
                                    />
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}

                    </CardContent>
                  </Card>
                </div>

            {/* Worktrees Section */}
                <div>
                  <Card>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <CardTitle>Worktrees</CardTitle>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="icon"
                            onClick={() => {
                              refetch();
                              addToast({
                                title: "Refreshed",
                                description: "Worktree list updated",
                                type: "info",
                              });
                            }}
                          >
                            <RefreshCw className="w-4 h-4" />
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => setShowCreateDialog(true)}
                          >
                            <Plus className="w-4 h-4 mr-2" />
                            New Worktree
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      {/* Search Bar */}
                      {worktrees.length > 0 && (
                        <div className="relative mb-4">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                          <Input
                            ref={searchInputRef}
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Search worktrees... (Ctrl+F)"
                            className="pl-10"
                          />
                        </div>
                      )}

                      {/* Worktrees Grid */}
                      {isLoading ? (
                        <div>Loading worktrees...</div>
                      ) : worktrees.length === 0 ? (
                        <div className="text-center py-12">
                          <p className="text-muted-foreground mb-4">
                            No worktrees yet. Create your first one!
                          </p>
                          <Button onClick={() => setShowCreateDialog(true)}>
                            <Plus className="w-4 h-4 mr-2" />
                            Create Worktree
                          </Button>
                        </div>
                      ) : filteredWorktrees.length === 0 ? (
                        <div className="text-center py-12">
                          <p className="text-muted-foreground mb-4">
                            No worktrees match your search
                          </p>
                          <Button variant="outline" onClick={() => setSearchQuery("")}>
                            Clear Search
                          </Button>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {filteredWorktrees.map((worktree) => (
                            <WorktreeCard
                              key={worktree.id}
                              worktree={worktree}
                              onOpenDiff={handleOpenDiff}
                              onMerge={handleOpenMergeReview}
                            />
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </div>
            )}

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

          </div>
        </ErrorBoundary>
      </div>
      {commandPaletteElement}
    </div>
  );
};
