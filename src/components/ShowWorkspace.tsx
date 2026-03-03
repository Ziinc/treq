import { memo, useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { QueryClient, useQueryClient } from "@tanstack/react-query";
import { listen } from "@tauri-apps/api/event";
import {
  Workspace,
  listDirectory,
  readFile,
  DirectoryEntry,
  jjGetDefaultBranch,
  jjGetConflictedFiles,
  jjGetBranches,
  setWorkspaceTargetBranch,
  jjGetChangedFiles,
  createSession,
  checkAndRebaseWorkspaces,
  jjPush,
  jjGetSyncStatus,
  jjGitFetch,
  jjGitFetchBackground,
  pushWorkspaceToRemote,
  listCommits,
  resolveBookmarkConflict,
  type SingleRebaseResult,
  type WorkspaceBookmarkConflict,
} from "../lib/api";
import { getStatusBgColor } from "../lib/git-status-colors";
import { parseJjChangedFiles, type ParsedFileChange } from "../lib/git-utils";
import { getFullWorkspacePath } from "../lib/utils";

// Define BranchListItem locally since git API was removed
export interface BranchListItem {
  name: string;
  full_name: string;
  is_current: boolean;
}

import {
  ChangesDiffViewer,
  type ChangesDiffViewerHandle,
} from "./ChangesDiffViewer";
import { FileBrowser } from "./FileBrowser";
import { LinearCommitHistory } from "./LinearCommitHistory";
import { CommitDiffViewer } from "./CommitDiffViewer";
import { WorkspaceBookmarkConflictModal } from "./WorkspaceBookmarkConflictModal";
import { Tabs, TabsList, TabsTrigger } from "./ui/tabs";
import { Button } from "./ui/button";
import { useToast } from "./ui/toast";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "./ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./ui/tooltip";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "./ui/popover";
import {
  Loader2,
  GitBranch,
  GitCompareArrows,
  MoreVertical,
  Upload,
  AlertTriangle,
  ArrowRight,
  File,
  Folder,
  Trash2,
  Search,
  Code2,
  ChevronLeft,
  Eye,
  EyeOff,
  Layers,
  FileDiff,
  GitCommitHorizontal,
  RefreshCw,
  Split,
} from "lucide-react";
import { TargetBranchSelector } from "./TargetBranchSelector";
import { TaskInput } from "./TaskInput";
import { cn } from "../lib/utils";
import { useTerminalSettings } from "../hooks/useTerminalSettings";
import type { SessionCreationInfo } from "../types/sessions";

interface ShowWorkspaceProps {
  repositoryPath?: string;
  workspace: Workspace | null;
  mainRepoBranch?: string | null;
  initialSelectedFile: string | null;
  onDeleteWorkspace?: (workspace: Workspace) => void;
  onOpenFilePicker?: () => void;
  onSessionCreated?: (session: SessionCreationInfo) => void;
  onOpenMergePreview?: () => void;
  onOpenBranchSwitcher?: () => void;
  onCreateStackedWorkspace?: () => void;
  stackCreating?: boolean;
  onSplitWorkspace?: () => void;
  queryClient?: QueryClient;
}

export const ShowWorkspace = memo<ShowWorkspaceProps>(function ShowWorkspace({
  repositoryPath,
  workspace,
  mainRepoBranch,
  initialSelectedFile,
  onDeleteWorkspace,
  onOpenFilePicker,
  onSessionCreated,
  onOpenMergePreview,
  onOpenBranchSwitcher,
  onCreateStackedWorkspace,
  stackCreating,
  onSplitWorkspace,
}) {
  const workingDirectory = workspace ? getFullWorkspacePath(workspace) : (repositoryPath || "");
  const effectiveRepoPath = workspace?.repo_path || repositoryPath || "";

  const { addToast } = useToast();
  const { fontSize } = useTerminalSettings();

  const [readmeContent, setReadmeContent] = useState<string | null>(null);
  const [rootEntries, setRootEntries] = useState<DirectoryEntry[]>([]);
  const [changedFiles, setChangedFiles] = useState<
    Map<string, ParsedFileChange>
  >(new Map());
  const [initialSelectedFileForBrowser, setInitialSelectedFileForBrowser] =
    useState<string | null>(null);
  const [initialExpandedDir, setInitialExpandedDir] = useState<string | null>(
    null
  );

  const changesDiffViewerRef = useRef<ChangesDiffViewerHandle>(null);
  const [actionPending, _setActionPending] = useState<
    "push" | "merge" | "sync" | null
  >(null);

  // Sync status state (ahead/behind counts)
  const [syncStatus, setSyncStatus] = useState<{ ahead: number; behind: number } | null>(null);

  // Aggregate diff stats (insertions/deletions across all commits)
  const [diffStats, setDiffStats] = useState<{ insertions: number; deletions: number } | null>(null);

  // Target branch and conflicts state
  const [targetBranch, setTargetBranch] = useState<string | null>(null);
  const [defaultBranch, setDefaultBranch] = useState<string>("main");
  const [conflictedFiles] = useState<string[]>([]);

  // Committed changes toggle state
  const [showCommittedChanges, setShowCommittedChanges] = useState(true);

  // Branch selection state
  const [availableBranches, setAvailableBranches] = useState<BranchListItem[]>(
    []
  );
  const [branchesLoading, setBranchesLoading] = useState(false);
  const [rebasing, setRebasing] = useState(false);
  const [bookmarkConflict, setBookmarkConflict] = useState<WorkspaceBookmarkConflict | null>(null);
  const [conflictModalOpen, setConflictModalOpen] = useState(false);
  const [resolvingBookmarkConflict, setResolvingBookmarkConflict] = useState(false);
  const [refreshingFiles, setRefreshingFiles] = useState(false);

  // Show overview tab by default for main repo, changes tab for workspaces
  const [activeTab, setActiveTab] = useState("overview");
  const [scrollToCommitId, setScrollToCommitId] = useState<string | null>(null);
  const [showFileBrowserInCode, setShowFileBrowserInCode] = useState(false);

  const handleChangedFilesUpdate = useCallback(
    (parsedFiles: ParsedFileChange[]) => {
      const map = new Map<string, ParsedFileChange>();
      for (const file of parsedFiles) {
        const fullPath = `${workingDirectory}/${file.path}`;
        map.set(fullPath, file);
      }
      setChangedFiles(map);
    },
    [workingDirectory]
  );

  // Reset to Code tab when switching workspaces
  useEffect(() => {
    setActiveTab("overview");
  }, [workspace?.id]);

  useEffect(() => {
    setBookmarkConflict(null);
    setConflictModalOpen(false);
  }, [workspace?.id]);

  const handleBookmarkConflictsFromResult = useCallback(
    (result?: SingleRebaseResult | null) => {
      if (!workspace) {
        setBookmarkConflict(null);
        setConflictModalOpen(false);
        return false;
      }

      const conflicts = result?.bookmark_conflicts ?? [];
      const conflictForWorkspace = conflicts.find(
        (conflict) => conflict.workspace_id === workspace.id
      );

      if (conflictForWorkspace) {
        setBookmarkConflict(conflictForWorkspace);
        setConflictModalOpen(true);
        return true;
      }

      if (bookmarkConflict) {
        setBookmarkConflict(null);
        setConflictModalOpen(false);
      }

      return false;
    },
    [workspace, bookmarkConflict]
  );

  // Files list expansion state

  useEffect(() => {
    // Fetch root directory listing
    listDirectory(workingDirectory)
      .then((entries) => {
        // Filter to only show root-level entries (not nested files)
        const rootOnly = entries.filter((entry) => {
          const relativePath = entry.path.replace(workingDirectory, "").replace(/^\//, "");
          return !relativePath.includes("/");
        });
        setRootEntries(rootOnly);
      })
      .catch(() => {
        setRootEntries([]);
      });

    // Fetch README.md
    readFile(`${workingDirectory}/README.md`)
      .then(setReadmeContent)
      .catch(() => setReadmeContent(null));

    jjGetDefaultBranch(effectiveRepoPath)
      .then(setDefaultBranch)
      .catch(() => setDefaultBranch("main"));

    // Load available branches
    if (workspace && effectiveRepoPath) {
      setBranchesLoading(true);
      jjGetBranches(effectiveRepoPath)
        .then((branches) => {
          setAvailableBranches(
            branches.map((b) => ({
              name: b.name,
              full_name: b.name,
              is_current: b.is_current,
            }))
          );
        })
        .catch(() => setAvailableBranches([]))
        .finally(() => setBranchesLoading(false));
    }
  }, [workspace, effectiveRepoPath]);

  // Load target branch from workspace
  useEffect(() => {
    const value = workspace?.target_branch || defaultBranch;
    if (value !== targetBranch) {
      setTargetBranch(value);
    }
  }, [workspace?.target_branch, defaultBranch]);

  // Fetch sync status
  const fetchSyncStatus = useCallback(async () => {
    // For workspace: use full workspace path and branch
    // For home repo: use working directory and default branch
    const path = workspace ? getFullWorkspacePath(workspace) : workingDirectory;
    const branch = workspace?.branch_name || defaultBranch;

    if (!path || !branch) return;

    try {
      const notOnRemote = workspace?.not_on_remote ?? false;
      const result = await jjGetSyncStatus(path, branch, notOnRemote);
      if (Array.isArray(result) && result.length >= 2) {
        const [ahead, behind] = result as [number, number];
        setSyncStatus({ ahead, behind });
      } else {
        setSyncStatus(null);
      }
    } catch (error) {
      console.error("Failed to fetch sync status:", error);
      setSyncStatus(null);
    }
  }, [workspace, workingDirectory, defaultBranch]);

  // Fetch sync status on mount and when workspace changes
  useEffect(() => {
    fetchSyncStatus();
  }, [fetchSyncStatus]);

  // Fetch aggregate diff stats from commit log
  useEffect(() => {
    if (!effectiveRepoPath) {
      setDiffStats(null);
      return;
    }
    let cancelled = false;
    listCommits(effectiveRepoPath, workspace?.id ?? null)
      .then((logResult) => {
        if (cancelled || !logResult) return;
        const commits = logResult.commits ?? [];
        const totals = commits.reduce(
          (acc, c) => ({ insertions: acc.insertions + c.insertions, deletions: acc.deletions + c.deletions }),
          { insertions: 0, deletions: 0 }
        );
        setDiffStats(totals.insertions > 0 || totals.deletions > 0 ? totals : null);
      })
      .catch(() => {
        if (!cancelled) setDiffStats(null);
      });
    return () => { cancelled = true; };
  }, [effectiveRepoPath, workspace?.id]);


  // Auto-fetch remote updates periodically and on window focus
  useEffect(() => {
    const repoPath = repositoryPath || workingDirectory;
    if (!repoPath) return;

    let lastFocusFetch = 0;
    const FOCUS_DEBOUNCE_MS = 2000; // Debounce rapid focus events

    const performBackgroundFetch = async () => {
      try {
        await jjGitFetch(repoPath);
        fetchSyncStatus();
      } catch (error) {
        // Silent failure for background operations
        console.debug("Background fetch failed:", error);
      }
    };

    // Fetch every 5 minutes
    const intervalId = setInterval(performBackgroundFetch, 5 * 60 * 1000);

    // Fetch on window focus - fire-and-forget with debouncing
    const handleFocus = () => {
      const now = Date.now();
      if (now - lastFocusFetch < FOCUS_DEBOUNCE_MS) return;
      lastFocusFetch = now;

      // Fire background fetch (returns immediately, work happens in separate thread)
      jjGitFetchBackground(repoPath).catch((error) =>
        console.debug("Background fetch failed:", error)
      );

      // Fire sync status update independently after a small delay
      // to let the background fetch get started
      setTimeout(() => {
        fetchSyncStatus();
      }, 500);
    };
    window.addEventListener("focus", handleFocus);

    return () => {
      clearInterval(intervalId);
      window.removeEventListener("focus", handleFocus);
    };
  }, [repositoryPath, workingDirectory, fetchSyncStatus]);

  // Periodic conflict check when workspace is active
  const lastConflictErrorRef = useRef<string | null>(null);

  useEffect(() => {
    if (!workspace || !workingDirectory) return;

    let isMounted = true;
    let timeoutId: ReturnType<typeof setTimeout>;

    const checkConflicts = async () => {
      if (!isMounted) return;
      try {
        await jjGetConflictedFiles(workingDirectory);
        lastConflictErrorRef.current = null;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        if (lastConflictErrorRef.current !== errorMessage) {
          lastConflictErrorRef.current = errorMessage;
          console.error("Failed to check conflicts:", error);
        }
      }
      if (isMounted) {
        timeoutId = setTimeout(checkConflicts, 2000);
      }
    };

    timeoutId = setTimeout(checkConflicts, 2000);

    return () => {
      isMounted = false;
      clearTimeout(timeoutId);
    };
  }, [workspace, workingDirectory]);

  // Invalidate sidebar query when conflicts change
  const queryClient = useQueryClient();
  useEffect(() => {
    if (workspace) {
      // Invalidate conflicted workspace IDs query so sidebar updates
      queryClient.invalidateQueries({
        queryKey: ["conflicted-workspace-ids", effectiveRepoPath],
      });
    }
  }, [conflictedFiles, workspace, effectiveRepoPath, queryClient]);

  useEffect(() => {
    if (workingDirectory) {
      let isMounted = true;

      // Refresh changed files whenever workspace changes (for badge count)
      jjGetChangedFiles(workingDirectory)
        .then((jjFiles) => {
          if (!isMounted) return;
          const parsed = parseJjChangedFiles(jjFiles);
          handleChangedFilesUpdate(parsed);
        })
        .catch(() => {
          if (isMounted) {
            setChangedFiles(new Map());
          }
        });

      return () => {
        isMounted = false;
      };
    }
  }, [workingDirectory, handleChangedFilesUpdate]);

  // Handle file selection from Cmd+P (or other external sources)
  useEffect(() => {
    if (initialSelectedFile) {
      setInitialSelectedFileForBrowser(initialSelectedFile);
      // Extract parent directory from file path
      const parentDir = initialSelectedFile.substring(0, initialSelectedFile.lastIndexOf('/'));
      setInitialExpandedDir(parentDir);
      setShowFileBrowserInCode(true);
    }
  }, [initialSelectedFile]);

  // Auto-rebase on mount if workspace might be in detached HEAD state
  useEffect(() => {
    // Only run for workspaces with computed targetBranch
    if (!workspace || !targetBranch || !effectiveRepoPath) {
      return;
    }

    // Skip if workspace branch equals target branch
    if (workspace.branch_name === targetBranch) {
      return;
    }

    let mounted = true;

    const checkAndRebase = async () => {
      const startTime = Date.now();
      try {
        setRebasing(true);
        const result = await checkAndRebaseWorkspaces(
          effectiveRepoPath,
          workspace.id,
          targetBranch,
          true // Always force rebase to keep changes fresh
        );

        if (!mounted) return;

        if (!result) {
          return;
        }

        const conflictDetected = handleBookmarkConflictsFromResult(result);

        if (result.rebased && !result.success && !conflictDetected) {
          addToast({
            title: "Rebase failed",
            description: result.message,
            type: "error",
          });
        }
      } catch (error) {
        if (!mounted) return;
        console.error("Auto-rebase check failed:", error);
        // Don't show toast for silent failures - user can manually trigger rebase
      } finally {
        if (mounted) {
          // Ensure indicator is visible for at least 500ms
          const elapsed = Date.now() - startTime;
          const remainingTime = Math.max(0, 500 - elapsed);
          setTimeout(() => {
            if (mounted) {
              setRebasing(false);
            }
          }, remainingTime);
        }
      }
    };

    checkAndRebase();

    return () => {
      mounted = false;
    };
  }, [workspace?.id, workspace?.branch_name, targetBranch, effectiveRepoPath, addToast, handleBookmarkConflictsFromResult]);

  const handleTargetBranchSelect = useCallback(
    async (branch: string) => {
      if (branch === targetBranch || !workspace) return;

      setRebasing(true);
      try {
        const result = await setWorkspaceTargetBranch(
          effectiveRepoPath,
          workingDirectory,
          workspace.id,
          branch
        );

        if (result.success) {
          addToast({
            title: "Rebased successfully",
            description: `Workspace rebased onto ${branch}`,
            type: "success",
          });

          // Invalidate sidebar queries so hierarchy updates
          queryClient.invalidateQueries({ queryKey: ["workspaces", effectiveRepoPath] });
          queryClient.invalidateQueries({ queryKey: ["workspace-statuses", effectiveRepoPath] });
        } else {
          addToast({
            title: "Rebase failed",
            description: result.message,
            type: "error",
          });
          return;
        }

        setTargetBranch(branch);
      } catch (error) {
        addToast({
          title: "Rebase failed",
          description: error instanceof Error ? error.message : String(error),
          type: "error",
        });
      } finally {
        setRebasing(false);
      }
    },
    [targetBranch, workspace, effectiveRepoPath, workingDirectory, addToast, queryClient]
  );

  // Helper to get status for a directory entry
  const getEntryStatus = useCallback(
    (entry: DirectoryEntry): string | undefined => {
      const fullPath = `${workingDirectory}/${entry.name}`;
      if (!entry.is_directory) {
        const file = changedFiles.get(fullPath);
        if (!file) return undefined;
        // Prefer workspaceStatus (unstaged) over stagedStatus
        return file.workspaceStatus || file.stagedStatus || undefined;
      }
      // For directories, check if any child has changes
      for (const [path] of changedFiles) {
        if (path.startsWith(fullPath + "/")) {
          return "M"; // Show modified indicator if any child changed
        }
      }
      return undefined;
    },
    [workingDirectory, changedFiles]
  );

  // Handler for clicking on Overview entries
  const handleOverviewEntryClick = useCallback(
    (entry: DirectoryEntry) => {
      const fullPath = `${workingDirectory}/${entry.name}`;
      if (entry.is_directory) {
        setInitialExpandedDir(fullPath);
        setInitialSelectedFileForBrowser(null); // Will select README in browser
      } else {
        setInitialSelectedFileForBrowser(fullPath);
        setInitialExpandedDir(null);
      }
      setShowFileBrowserInCode(true);
    },
    [workingDirectory]
  );

  const handlePushToRemote = useCallback(async () => {
    if (!effectiveRepoPath) return;

    console.log("Push to remote started");
    _setActionPending("push");

    try {
      const result = await pushWorkspaceToRemote(
        effectiveRepoPath,
        workspace?.id ?? null
      );
      console.log("Push succeeded:", result);

      addToast({
        title: "Pushed to remote",
        description: "Changes pushed successfully",
        type: "success",
      });
      // Refresh sync status after push
      fetchSyncStatus();
    } catch (error) {
      console.error("Push failed:", error);
      addToast({
        title: "Push failed",
        description: String(error),
        type: "error",
      });
    } finally {
      _setActionPending(null);
    }
  }, [workspace, effectiveRepoPath, addToast, fetchSyncStatus]);

const handleSync = useCallback(async () => {
    const syncPath = workspace ? getFullWorkspacePath(workspace) : workingDirectory;
    const syncRepoPath = repositoryPath || workingDirectory;
    if (!syncPath || !syncRepoPath) return;

    _setActionPending("sync");
    try {
      // First, fetch from remote to update remote refs
      await jjGitFetch(syncRepoPath);

      // Then push local commits
      await jjPush(syncPath);

      addToast({
        title: "Synced with remote",
        description: "Fetched and pushed changes",
        type: "success",
      });

      // Refresh sync status after operations
      fetchSyncStatus();

      // Refresh UI state
      queryClient?.invalidateQueries();
    } catch (error) {
      console.error("Sync failed:", error);
      addToast({
        title: "Sync failed",
        description: String(error),
        type: "error",
      });
    } finally {
      _setActionPending(null);
    }
  }, [workspace, workingDirectory, repositoryPath, addToast, fetchSyncStatus, queryClient]);

  const handleForceRebase = useCallback(async () => {
    if (!workspace || !targetBranch || !effectiveRepoPath) {
      return;
    }

    const startTime = Date.now();
    setRebasing(true);
    try {
      const result = await checkAndRebaseWorkspaces(
        effectiveRepoPath,
        workspace.id,
        targetBranch,
        true // force = true
      );

      if (!result) {
        return;
      }

      const conflictDetected = handleBookmarkConflictsFromResult(result);

      if (result.rebased) {
        if (!result.success && !conflictDetected) {
          addToast({
            title: "Rebase failed",
            description: result.message,
            type: "error",
          });
        }

        // Refresh changed files after rebase
        const files = await jjGetChangedFiles(workingDirectory);
        const parsed = parseJjChangedFiles(files);
        const map = new Map<string, ParsedFileChange>();
        for (const file of parsed) {
          const fullPath = `${workingDirectory}/${file.path}`;
          map.set(fullPath, file);
        }
        setChangedFiles(map);
      } else if (!conflictDetected) {
        addToast({
          title: "No rebase needed",
          description: "Workspace is already up to date",
          type: "info",
        });
      }
    } catch (error) {
      addToast({
        title: "Force rebase failed",
        description: error instanceof Error ? error.message : String(error),
        type: "error",
      });
    } finally {
      // Ensure indicator is visible for at least 500ms
      const elapsed = Date.now() - startTime;
      const remainingTime = Math.max(0, 500 - elapsed);
      setTimeout(() => {
        setRebasing(false);
      }, remainingTime);
    }
  }, [workspace, targetBranch, effectiveRepoPath, workingDirectory, addToast, handleBookmarkConflictsFromResult]);

  const handleResolveBookmarkConflict = useCallback(
    async (revisionId: string) => {
      if (!workspace || !effectiveRepoPath || !bookmarkConflict || !targetBranch) {
        return;
      }

      setResolvingBookmarkConflict(true);
      try {
        await resolveBookmarkConflict(
          effectiveRepoPath,
          workspace.id,
          workingDirectory,
          bookmarkConflict.branch_name,
          revisionId
        );

        addToast({
          title: "Bookmark updated",
          description: `Set ${bookmarkConflict.branch_name} to ${revisionId}`,
          type: "success",
        });

        setBookmarkConflict(null);
        setConflictModalOpen(false);

        const result = await checkAndRebaseWorkspaces(
          effectiveRepoPath,
          workspace.id,
          targetBranch,
          true
        );
        if (result) {
          handleBookmarkConflictsFromResult(result);
        }
      } catch (error) {
        addToast({
          title: "Failed to resolve conflict",
          description: error instanceof Error ? error.message : String(error),
          type: "error",
        });
      } finally {
        setResolvingBookmarkConflict(false);
      }
    },
    [
      workspace,
      effectiveRepoPath,
      bookmarkConflict,
      workingDirectory,
      addToast,
      targetBranch,
      handleBookmarkConflictsFromResult,
    ]
  );

  // Listen for Developer menu > Force Rebase Workspace command
  useEffect(() => {
    const unlisten = listen("menu-force-rebase-workspace", () => {
      // Only trigger if we're viewing a workspace
      if (workspace && targetBranch && effectiveRepoPath) {
        handleForceRebase();
      }
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [workspace, targetBranch, effectiveRepoPath, handleForceRebase]);

  const handleCreateAgentWithComment = useCallback(
    async (
      filePath: string,
      startLine: number,
      endLine: number,
      lineContent: string[],
      commentText: string
    ) => {
      try {
        // Format comment as markdown
        const relativePath = filePath.startsWith(workingDirectory + "/")
          ? filePath.slice(workingDirectory.length + 1)
          : filePath;

        const lineRef = `${relativePath}:${startLine}${startLine !== endLine ? `-${endLine}` : ''}`;
        const formattedComment = `${lineRef}\n\`\`\`\n${lineContent.join('\n')}\n\`\`\`\n> ${commentText}\n`;
        const sessionName = "Code Comment";

        // Create new database session
        const dbSessionId = await createSession(
          effectiveRepoPath,
          workspace?.id ?? null,
          sessionName
        );
        const sessionRepoPath = effectiveRepoPath || workingDirectory;

        // Notify parent with pending prompt to be sent after Claude initializes
        // (ConsolidatedTerminal will create the PTY session when it mounts)
        onSessionCreated?.({
          sessionId: dbSessionId,
          sessionName,
          workspaceId: workspace?.id ?? null,
          workspacePath: workspace?.workspace_path ?? null,
          repoPath: sessionRepoPath,
          pendingPrompt: formattedComment,
        });

        addToast({
          title: "Comment sent to agent",
          description: `Created new agent session and sent comment`,
          type: "success",
        });
      } catch (error) {
        addToast({
          title: "Failed to create agent",
          description: error instanceof Error ? error.message : String(error),
          type: "error",
        });
      }
    },
    [workingDirectory, effectiveRepoPath, workspace, addToast, onSessionCreated]
  );

  const handleCreateAgentWithReview = useCallback(
    async (reviewMarkdown: string, mode: 'plan' | 'acceptEdits') => {
      try {
        const sessionName = "Code Review";

        // Create new database session
        const dbSessionId = await createSession(
          effectiveRepoPath,
          workspace?.id ?? null,
          sessionName
        );
        const sessionRepoPath = effectiveRepoPath || workingDirectory;

        // Notify parent with pending prompt to be sent after Claude initializes
        // (ConsolidatedTerminal will create the PTY session when it mounts)
        onSessionCreated?.({
          sessionId: dbSessionId,
          sessionName,
          workspaceId: workspace?.id ?? null,
          workspacePath: workspace?.workspace_path ?? null,
          repoPath: sessionRepoPath,
          pendingPrompt: reviewMarkdown,
          permissionMode: mode,
        });

      } catch (error) {
        addToast({
          title: "Failed to create agent",
          description: error instanceof Error ? error.message : String(error),
          type: "error",
        });
        throw error;
      }
    },
    [workingDirectory, effectiveRepoPath, workspace, addToast, onSessionCreated]
  );

  // Display all files in the list
  const displayedEntries = rootEntries;

  // Status pip component for file/directory indicators
  const StatusPip = ({ status }: { status?: string }) =>
    status ? (
      <span
        className={cn(
          "w-2 h-2 rounded-full flex-shrink-0",
          getStatusBgColor(status)
        )}
      />
    ) : null;

  const executionPanel = workingDirectory ? (
    <div className="flex flex-col h-full">
      <div className="flex-shrink-0 bg-background px-4 py-2 border-b border-border flex items-center justify-between">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="overview" className="inline-flex items-center">
              <Code2 className="w-4 h-4 mr-1.5" />
              Code
            </TabsTrigger>
            <TabsTrigger value="commits" className="inline-flex items-center gap-1.5">
              <GitCommitHorizontal className="w-4 h-4" />
              <span>Commits</span>
            </TabsTrigger>
            <TabsTrigger value="changes" className="inline-flex items-center gap-1.5">
              <FileDiff className="w-4 h-4" />
              <span>Review</span>
              {changedFiles.size > 0 && (
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-xs font-medium transition-colors",
                    conflictedFiles.length > 0
                      ? "bg-destructive text-destructive-foreground"
                      : "bg-muted text-muted-foreground"
                  )}
                >
                  {changedFiles.size}
                </span>
              )}
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex items-center gap-3">
          {(rebasing || refreshingFiles) && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>{rebasing ? "Rebasing..." : "Refreshing..."}</span>
            </div>
          )}
          {diffStats && (
            <div className="flex items-center gap-1.5 text-xs font-mono">
              <span className="text-green-600 dark:text-green-400">+{diffStats.insertions}</span>
              <span className="text-red-600 dark:text-red-400">-{diffStats.deletions}</span>
              <div className="flex items-center gap-0.5">
                {Array.from({ length: 5 }, (_, i) => {
                  const ratio = diffStats.insertions / (diffStats.insertions + diffStats.deletions);
                  const isGreen = i < Math.round(ratio * 5);
                  return <div key={i} className={cn("w-2 h-2 rounded-sm", isGreen ? "bg-green-600" : "bg-red-600")} />;
                })}
              </div>
            </div>
          )}
        </div>
      </div>
      {activeTab === "changes" && workspace && (
        <div className="px-4 py-2 border-b border-border flex">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={showCommittedChanges ? "default" : "outline"}
                  size="sm"
                  onClick={() => setShowCommittedChanges(!showCommittedChanges)}
                  className={showCommittedChanges ? "bg-blue-500/20 hover:bg-blue-500/30 text-blue-700 dark:text-blue-300" : ""}
                >
                  {showCommittedChanges ? (
                    <Eye className="w-3.5 h-3.5 mr-1.5" />
                  ) : (
                    <EyeOff className="w-3.5 h-3.5 mr-1.5" />
                  )}
                  Committed
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>{showCommittedChanges ? "Hide" : "Show"} committed changes</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      )}
      <div className="flex-1 overflow-auto">
        {activeTab === "overview" ? (
          showFileBrowserInCode ? (
            <div className="flex flex-col h-full">
              <div className="px-4 pt-3 pb-2 border-b border-border">
                <button
                  type="button"
                  onClick={() => setShowFileBrowserInCode(false)}
                  className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                  Back
                </button>
              </div>
              <div className="flex-1 overflow-hidden">
                <FileBrowser
                  workspace={workspace}
                  repoPath={effectiveRepoPath}
                  initialSelectedFile={initialSelectedFileForBrowser}
                  initialExpandedDir={initialExpandedDir}
                  onCreateAgentWithComment={handleCreateAgentWithComment}
                />
              </div>
            </div>
          ) : (
            <div className="flex h-full">
              {/* LEFT: Files + README */}
              <div className="flex-1 overflow-auto border-r border-border">
                <div className="p-4 space-y-4">
                  {/* Conflicts Alert */}
                  {conflictedFiles.length > 0 && (
                    <div
                      role="alert"
                      className="border border-destructive/30 rounded-md bg-destructive/5 p-4"
                    >
                      <div className="flex items-start gap-3">
                        <AlertTriangle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
                        <div className="flex-1">
                          <h3 className="font-medium text-destructive">
                            {conflictedFiles.length} {conflictedFiles.length === 1 ? 'conflict' : 'conflicts'} detected
                          </h3>
                          <p className="text-sm text-muted-foreground mt-1">
                            Some files have conflicts that need to be resolved
                          </p>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setActiveTab("changes")}
                          className="border-destructive/30 text-destructive hover:bg-destructive/10"
                        >
                          View conflicts
                        </Button>
                      </div>
                    </div>
                  )}
                  {/* Task Input */}
                  <TaskInput
                    repoPath={effectiveRepoPath}
                    workspaceId={workspace?.id ?? null}
                    workspacePath={workspace?.workspace_path ?? null}
                    workingDirectory={workingDirectory}
                    onSessionCreated={onSessionCreated}
                  />
                  {/* File Search Input */}
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={onOpenFilePicker}
                      className="flex items-center gap-3 px-4 py-2 border border-border rounded-lg bg-background hover:bg-muted/30 transition-colors text-left w-full max-w-xs"
                    >
                      <Search className="w-4 h-4 text-muted-foreground" />
                      <span className="flex-1 text-sm text-muted-foreground">
                        Go to file
                      </span>
                      <kbd className="px-2 py-1 bg-muted text-muted-foreground rounded text-xs font-mono">
                        ⌘P
                      </kbd>
                    </button>
                  </div>
                  
                  {/* File Listing */}
                  <div className="border rounded-lg divide-y divide-border">
                    {displayedEntries.map((entry) => (
                      <button
                        key={entry.path}
                        type="button"
                        onClick={() => handleOverviewEntryClick(entry)}
                        className="flex items-center gap-3 px-4 py-1 text-sm w-full hover:bg-muted/60 transition text-left"
                      >
                        {entry.is_directory ? (
                          <Folder className="w-4 h-4 text-blue-500" />
                        ) : (
                          <File className="w-4 h-4 text-muted-foreground" />
                        )}
                        <span
                          className="flex-1 font-mono"
                          style={{ fontSize: `${fontSize}px` }}
                        >
                          {entry.name}
                        </span>
                        <StatusPip status={getEntryStatus(entry)} />
                      </button>
                    ))}
                    {rootEntries.length === 0 && (
                      <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                        No files found
                      </div>
                    )}
                  </div>

                  {/* README Section */}
                  <div className="border rounded-lg p-6">
                    {readmeContent ? (
                      <>
                        <h2 className="text-lg font-semibold mb-4">README.md</h2>
                        <div className="prose dark:prose-invert max-w-none prose-headings:font-semibold prose-h1:text-3xl prose-h2:text-2xl prose-h3:text-xl prose-a:text-blue-500 prose-a:no-underline hover:prose-a:underline prose-strong:font-semibold prose-code:bg-muted prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-sm prose-code:before:content-[''] prose-code:after:content-[''] prose-pre:bg-muted prose-pre:border prose-pre:border-border">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {readmeContent}
                          </ReactMarkdown>
                        </div>
                      </>
                    ) : (
                      <div className="text-muted-foreground text-sm text-center py-4">
                        No README.md found
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* RIGHT: Commit History (fixed width matching sidebar) */}
              <div className="w-[240px] shrink-0 bg-muted/20">
                <LinearCommitHistory
                  repoPath={effectiveRepoPath}
                  workspaceId={workspace?.id ?? null}
                  onCommitClick={(changeId) => {
                    setScrollToCommitId(changeId);
                    setActiveTab("commits");
                  }}
                />
              </div>
            </div>
          )
        ) : activeTab === "commits" ? (
          <CommitDiffViewer
            workspacePath={workspace ? getFullWorkspacePath(workspace) : workingDirectory}
            repoPath={effectiveRepoPath}
            workspaceId={workspace?.id ?? null}
            targetBranch={targetBranch}
            isHomeRepo={!workspace}
            scrollToCommitId={scrollToCommitId}
            onScrollComplete={() => setScrollToCommitId(null)}
            onCommitMoved={() => {}}
            onCommitAbandoned={() => {}}
          />
        ) : (
          <ChangesDiffViewer
            key={`changes-${workingDirectory}`}
            ref={changesDiffViewerRef}
            workspacePath={workingDirectory}
            workspaceId={workspace?.id}
            repoPath={effectiveRepoPath}
            onChangedFilesChange={handleChangedFilesUpdate}
            onRefreshingChange={setRefreshingFiles}
            initialSelectedFile={initialSelectedFile}
            conflictedFiles={conflictedFiles}
            onCreateAgentWithReview={handleCreateAgentWithReview}
            showCommittedChanges={workspace ? showCommittedChanges : false}
            targetBranch={targetBranch}
          />
        )}
      </div>
    </div>
  ) : (
    <div className="h-full flex items-center justify-center text-center p-6 text-sm text-muted-foreground">
      Configure a workspace or repository path to manage commits.
    </div>
  );

  // Display branch name as title: workspace branch if available, otherwise main repo branch
  const branchTitle = workspace?.branch_name || mainRepoBranch || "main";

  // Extract intent from workspace metadata
  const workspaceIntent = workspace?.metadata
    ? (() => {
        try {
          const metadata = JSON.parse(workspace.metadata);
          return metadata.intent || null;
        } catch {
          return null;
        }
      })()
    : null;

  // Truncate intent at 100 characters
  const truncatedIntent = workspaceIntent && workspaceIntent.length > 100
    ? workspaceIntent.substring(0, 100) + "..."
    : workspaceIntent;

  const isTruncated = workspaceIntent && workspaceIntent.length > 100;

  return (
    <>
      <div className="h-full w-full flex flex-col bg-background">
      <div className="border-b p-2 flex flex-col gap-1 flex-shrink-0">
        {/* Row 1: Branch name */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <GitBranch className="w-4 h-4 text-muted-foreground" />
            {!workspace ? (
              <>
                <button
                  onClick={onOpenBranchSwitcher}
                  className="text-sm font-semibold font-mono hover:underline cursor-pointer"
                >
                  {branchTitle}
                </button>
                {/* Stack button for home repo */}
                {onCreateStackedWorkspace && (
                  <TooltipProvider delayDuration={200}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="default"
                          size="sm"
                          onClick={onCreateStackedWorkspace}
                          disabled={stackCreating}
                          className="gap-1"
                        >
                          {stackCreating ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Layers className="w-3.5 h-3.5" />
                          )}
                          Stack
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        {stackCreating
                          ? "Creating stacked workspace..."
                          : `Create stacked workspace from ${branchTitle}`}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </>
            ) : (
              <span className="text-sm font-semibold font-mono">
                {branchTitle}
              </span>
            )}
            {workspace && workspace.branch_name !== defaultBranch && (
              <>
                <ArrowRight className="w-4 h-4 text-muted-foreground" />
                <TargetBranchSelector
                  branches={availableBranches}
                  loading={branchesLoading}
                  targetBranch={targetBranch}
                  onSelect={handleTargetBranchSelect}
                  disabled={rebasing}
                />
                {/* Stack button for workspace */}
                {onCreateStackedWorkspace && (
                  <TooltipProvider delayDuration={200}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="default"
                          size="sm"
                          onClick={onCreateStackedWorkspace}
                          disabled={stackCreating || rebasing || conflictedFiles.length > 0}
                          className="gap-1"
                        >
                          {stackCreating ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Layers className="w-3.5 h-3.5" />
                          )}
                          Stack
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        {stackCreating
                          ? "Creating stacked workspace..."
                          : rebasing
                          ? "Rebasing in progress..."
                          : conflictedFiles.length > 0
                          ? `Cannot stack: ${conflictedFiles.length} conflict${conflictedFiles.length === 1 ? '' : 's'} detected`
                          : `Create stacked workspace from ${branchTitle}`}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
                {/* Split button for workspace */}
                {workspace && onSplitWorkspace && (
                  <TooltipProvider delayDuration={200}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="default"
                          size="sm"
                          onClick={onSplitWorkspace}
                          disabled={rebasing || conflictedFiles.length > 0}
                          className="gap-1"
                        >
                          <Split className="w-3.5 h-3.5" />
                          Split
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        {rebasing
                          ? "Rebasing in progress..."
                          : conflictedFiles.length > 0
                          ? `Cannot split: ${conflictedFiles.length} conflict${conflictedFiles.length === 1 ? '' : 's'} detected`
                          : `Split changes from ${branchTitle} into a new workspace`}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
                <div className="flex-1" />
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            {/* Push to remote button - shown when branch not on remote */}
            {workspace && workspace.not_on_remote && (
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="default"
                      size="sm"
                      onClick={handlePushToRemote}
                      disabled={!!actionPending}
                      className="gap-1 bg-blue-600 hover:bg-blue-700"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      Push to remote
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    This branch doesn't exist on remote yet. Push to create it.
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}

            {/* Sync status indicator - shown when branch is on remote */}
            {workspace && !workspace.not_on_remote && syncStatus && (syncStatus.ahead > 0 || syncStatus.behind > 0) && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                {syncStatus.behind > 0 && (
                  <span className="flex items-center">
                    ↓{syncStatus.behind}
                  </span>
                )}
                {syncStatus.ahead > 0 && (
                  <span className="flex items-center">
                    ↑{syncStatus.ahead}
                  </span>
                )}
              </div>
            )}

            {/* Sync button - show when there are changes to sync */}
            {workspace && !workspace.not_on_remote && syncStatus && (syncStatus.ahead > 0 || syncStatus.behind > 0) && (
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0"
                      onClick={handleSync}
                      disabled={!!actionPending}
                    >
                      <RefreshCw className={cn(
                        "w-3.5 h-3.5",
                        actionPending === "sync" && "animate-spin"
                      )} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    Sync with remote (fetch and push)
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
            {/* Merge button moved here */}
            {workspace && workspace.branch_name !== defaultBranch && (
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="inline-flex">
                      <Button
                        variant="default"
                        size="sm"
                        onClick={onOpenMergePreview}
                        disabled={rebasing || conflictedFiles.length > 0}
                        className="gap-1 bg-green-600 hover:bg-green-700"
                      >
                        <GitCompareArrows className="w-3.5 h-3.5" />
                        Merge...
                      </Button>
                    </div>
                  </TooltipTrigger>
                  {(rebasing || conflictedFiles.length > 0) && (
                    <TooltipContent>
                      {rebasing
                        ? "Rebasing in progress..."
                        : `Cannot merge: ${conflictedFiles.length} conflict${conflictedFiles.length === 1 ? '' : 's'} detected`}
                    </TooltipContent>
                  )}
                </Tooltip>
              </TooltipProvider>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="px-2"
                  disabled={!!actionPending}
                >
                  <MoreVertical className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" sideOffset={4}>
                <DropdownMenuItem
                  onSelect={(e) => {
                    e.preventDefault();
                    handlePushToRemote();
                  }}
                >
                  <Upload className="w-4 h-4 mr-2" />
                  Push to remote
                </DropdownMenuItem>
                {workspace && onDeleteWorkspace && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onSelect={() => onDeleteWorkspace(workspace)}
                      className="text-destructive focus:text-destructive"
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
        {/* Row 2: Intent (if workspace and intent exists) */}
        {workspace && workspaceIntent && (
          <div className="flex items-center px-1">
            {isTruncated ? (
              <Popover>
                <PopoverTrigger asChild>
                  <span className="text-xs text-muted-foreground cursor-pointer hover:text-foreground transition-colors">
                    {truncatedIntent}
                  </span>
                </PopoverTrigger>
                <PopoverContent className="w-96">
                  <p className="text-sm">{workspaceIntent}</p>
                </PopoverContent>
              </Popover>
            ) : (
              <span className="text-xs text-muted-foreground">
                {truncatedIntent}
              </span>
            )}
          </div>
        )}
      </div>

      <div className="flex-1 flex overflow-hidden min-h-0">
        <div className="w-full flex flex-col overflow-hidden">
          {executionPanel}
        </div>
      </div>
      </div>
      <WorkspaceBookmarkConflictModal
        conflict={bookmarkConflict}
        open={conflictModalOpen && !!bookmarkConflict}
        onClose={() => setConflictModalOpen(false)}
        onResolve={handleResolveBookmarkConflict}
        resolving={resolvingBookmarkConflict}
      />
    </>
  );
});
