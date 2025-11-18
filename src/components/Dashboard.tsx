import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { listen } from "@tauri-apps/api/event";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { WorktreeCard } from "./WorktreeCard";
import { MergeDialog } from "./MergeDialog";
import { CreateWorktreeDialog } from "./CreateWorktreeDialog";
import { UnifiedSettings } from "./UnifiedSettings";
import { DiffViewer } from "./DiffViewer";
import { PlanningTerminal } from "./PlanningTerminal";
import { WorktreeEditSession } from "./WorktreeEditSession";
import { ExecutionTerminal } from "./ExecutionTerminal";
import { SessionSidebar } from "./SessionSidebar";
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
} from "../lib/api";
import type { MergeStrategy } from "../lib/api";
import { formatBytes } from "../lib/utils";
import { Plus, Settings, X, RefreshCw, Search, Terminal as TerminalIcon, GitBranch, FolderGit2, HardDrive } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "./ui/card";

type ViewMode = "dashboard" | "terminal" | "diff" | "planning" | "worktree-edit" | "worktree-planning" | "execution" | "worktree-execution";
type SessionViewMode = "planning" | "execution";
type MergeConfirmPayload = {
  strategy: MergeStrategy;
  commitMessage: string;
  discardChanges: boolean;
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
  const [showUnifiedSettings, setShowUnifiedSettings] = useState(false);
  const [initialSettingsTab, setInitialSettingsTab] = useState<"application" | "repository">("application");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeSessionId, setActiveSessionId] = useState<number | null>(null);
  const [selectedWorktreePlanContent, setSelectedWorktreePlanContent] = useState<string | null>(null);
  const [selectedWorktreePlanTitle, setSelectedWorktreePlanTitle] = useState<string | null>(null);
  const [mergeDialogOpen, setMergeDialogOpen] = useState(false);
  const [mergeTargetWorktree, setMergeTargetWorktree] = useState<Worktree | null>(null);
  const [mergeAheadCount, setMergeAheadCount] = useState(0);
  const [mergeWorktreeHasChanges, setMergeWorktreeHasChanges] = useState(false);
  const [mergeChangedFiles, setMergeChangedFiles] = useState<string[]>([]);
  const [mergeDetailsLoading, setMergeDetailsLoading] = useState(false);
  
  const queryClient = useQueryClient();
  const { addToast } = useToast();
  const searchInputRef = useRef<HTMLInputElement>(null);

  const resetMergeState = useCallback(() => {
    setMergeDialogOpen(false);
    setMergeTargetWorktree(null);
    setMergeAheadCount(0);
    setMergeWorktreeHasChanges(false);
    setMergeChangedFiles([]);
    setMergeDetailsLoading(false);
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

  useKeyboardShortcut("Escape", false, () => {
    if (showCreateDialog) setShowCreateDialog(false);
    if (showUnifiedSettings) setShowUnifiedSettings(false);
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
  }, [repoPath]);

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


  const { data: worktrees = [], isLoading, refetch } = useQuery({
    queryKey: ["worktrees"],
    queryFn: getWorktrees,
  });

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
      sessionType: SessionViewMode,
      autoName?: string
    ): Promise<number> => {
      const sessions = await getSessions();
      const existing = sessions.find(
        (s) => s.worktree_id === worktreeId && s.session_type === sessionType
      );
      
      if (existing) {
        await updateSessionAccess(existing.id);
        return existing.id;
      }

      // Generate name if not provided
      const name = autoName || (() => {
        const typeCount = sessions.filter(
          (s) => s.worktree_id === worktreeId && s.session_type === sessionType
        ).length;
        const typeLabel = sessionType === "planning" ? "Planning" : "Execution";
        return `${typeLabel} ${typeCount + 1}`;
      })();

      const sessionId = await createSession(worktreeId, sessionType, name);
      queryClient.invalidateQueries({ queryKey: ["sessions"] });
      return sessionId;
    },
    [queryClient]
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

  const handleOpenPlanningTerminal = async (worktree: Worktree) => {
    const sessionId = await getOrCreateSession(worktree.id, "planning");
    setSelectedWorktree(worktree);
    setActiveSessionId(sessionId);
    setViewMode("worktree-planning");
  };

  const handleOpenExecutionTerminal = async (worktree: Worktree) => {
    const sessionId = await getOrCreateSession(worktree.id, "execution");
    setSelectedWorktree(worktree);
    setSelectedWorktreePlanContent(null);
    setSelectedWorktreePlanTitle(null);
    setActiveSessionId(sessionId);
    setViewMode("worktree-execution");
  };

  const handleOpenMainExecutionTerminal = async () => {
    const sessionId = await getOrCreateSession(null, "execution");
    setSelectedWorktreePlanContent(null);
    setSelectedWorktreePlanTitle(null);
    setActiveSessionId(sessionId);
    setViewMode("execution");
  };

  const handleOpenMainPlanningTerminal = async () => {
    const sessionId = await getOrCreateSession(null, "planning");
    setActiveSessionId(sessionId);
    setViewMode("planning");
  };

  const handleSessionClick = async (session: Session) => {
    await updateSessionAccess(session.id);
    setActiveSessionId(session.id);
    
    if (session.worktree_id) {
      const worktree = worktrees.find((w) => w.id === session.worktree_id);
      if (worktree) {
        setSelectedWorktree(worktree);
        setViewMode(session.session_type === "planning" ? "worktree-planning" : "worktree-execution");
      }
    } else {
      setSelectedWorktree(null);
      setViewMode(session.session_type === "planning" ? "planning" : "execution");
    }
    queryClient.invalidateQueries({ queryKey: ["sessions"] });
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

  const handleMergeRequest = async (worktree: Worktree) => {
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
      };

      try {
        const payload = buildPlanHistoryPayload(section);
        await saveExecutedPlan(repoPath, worktreeId, payload);
      } catch (planError) {
        console.error("Failed to record plan execution:", planError);
      }

      setSelectedWorktreePlanContent(planContent);
      setSelectedWorktreePlanTitle(section.title);
      setSelectedWorktree(newWorktree);
      setViewMode("worktree-execution");
      
      addToast({
        title: "Ready to implement",
        description: "Worktree created; opening execution terminal",
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
    setSelectedWorktreePlanContent(null);
    setSelectedWorktreePlanTitle(null);
  };

  if (viewMode === "planning") {
    return (
      <div className="flex h-screen">
        <SessionSidebar
          activeSessionId={activeSessionId}
          onSessionClick={handleSessionClick}
          onCreatePlanningSession={handleOpenMainPlanningTerminal}
          onCreateExecutionSession={handleOpenMainExecutionTerminal}
          repoPath={repoPath}
        />
        <div className="flex-1" style={{ width: "calc(100vw - 200px)" }}>
          <PlanningTerminal
            repositoryPath={repoPath}
            sessionId={activeSessionId}
            onClose={handleCloseTerminal}
            onExecutePlan={handleExecutePlan}
          />
        </div>
      </div>
    );
  }

  if (viewMode === "worktree-planning" && selectedWorktree) {
    return (
      <div className="flex h-screen">
        <SessionSidebar
          activeSessionId={activeSessionId}
          onSessionClick={handleSessionClick}
          onCreatePlanningSession={handleOpenMainPlanningTerminal}
          onCreateExecutionSession={handleOpenMainExecutionTerminal}
          repoPath={repoPath}
        />
        <div className="flex-1" style={{ width: "calc(100vw - 200px)" }}>
          <PlanningTerminal
            worktree={selectedWorktree}
            sessionId={activeSessionId}
            onClose={handleCloseTerminal}
            onExecutePlan={handleExecutePlan}
          />
        </div>
      </div>
    );
  }

  if (viewMode === "execution") {
    return (
      <div className="flex h-screen">
        <SessionSidebar
          activeSessionId={activeSessionId}
          onSessionClick={handleSessionClick}
          onCreatePlanningSession={handleOpenMainPlanningTerminal}
          onCreateExecutionSession={handleOpenMainExecutionTerminal}
          repoPath={repoPath}
        />
        <div className="flex-1" style={{ width: "calc(100vw - 200px)" }}>
          <ExecutionTerminal
            repositoryPath={repoPath}
            sessionId={activeSessionId}
            onClose={handleCloseTerminal}
          />
        </div>
      </div>
    );
  }

  if (viewMode === "worktree-execution" && selectedWorktree) {
    return (
      <div className="flex h-screen">
        <SessionSidebar
          activeSessionId={activeSessionId}
          onSessionClick={handleSessionClick}
          onCreatePlanningSession={handleOpenMainPlanningTerminal}
          onCreateExecutionSession={handleOpenMainExecutionTerminal}
          repoPath={repoPath}
        />
        <div className="flex-1" style={{ width: "calc(100vw - 200px)" }}>
          <ExecutionTerminal
            worktree={selectedWorktree}
            sessionId={activeSessionId}
            initialPlanContent={selectedWorktreePlanContent || undefined}
            initialPlanTitle={selectedWorktreePlanTitle || undefined}
            onClose={handleCloseTerminal}
          />
        </div>
      </div>
    );
  }

  if (viewMode === "worktree-edit" && selectedWorktree) {
    return (
      <WorktreeEditSession
        worktree={selectedWorktree}
        onClose={() => {
          setViewMode("dashboard");
          setSelectedWorktree(null);
        }}
      />
    );
  }

  if (viewMode === "diff" && selectedWorktree) {
    return (
      <div className="h-screen flex flex-col">
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
          <DiffViewer worktreePath={selectedWorktree.worktree_path} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-background">
      <SessionSidebar
        activeSessionId={activeSessionId}
        onSessionClick={handleSessionClick}
        repoPath={repoPath}
      />
      <div className="flex-1 overflow-auto" style={{ width: "calc(100vw - 200px)" }}>
        <div className="container mx-auto p-8">
        {/* Simplified Header */}
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold">Git Worktree Manager</h1>
          <Button
            variant="outline"
            size="icon"
            onClick={() => {
              setInitialSettingsTab("application");
              setShowUnifiedSettings(true);
            }}
          >
            <Settings className="w-4 h-4" />
          </Button>
        </div>

        {/* Initial Setup Message */}
        {!repoPath && (
          <div className="mb-6 p-4 border rounded-lg bg-muted">
            <p className="text-sm text-muted-foreground mb-2">
              Please set your repository path to get started
            </p>
            <Button variant="outline" onClick={() => {
              setInitialSettingsTab("application");
              setShowUnifiedSettings(true);
            }}>
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
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FolderGit2 className="w-5 h-5" />
                    Main Tree
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Repository Info */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-lg font-semibold">
                      {repoName}
                    </div>
                  </div>

                  {/* VSCode-style Status Bar */}
                  <div className="flex items-center gap-2 text-sm flex-wrap">
                    {currentBranch && (
                      <>
                        <div className="flex items-center gap-1">
                          <GitBranch className="w-4 h-4" />
                          <code className="text-xs">{currentBranch}</code>
                        </div>
                        
                        {mainRepoStatus && (
                          <>
                            {(mainRepoStatus.modified > 0 || mainRepoStatus.deleted > 0) && (
                              <span className="text-orange-500 font-bold">*</span>
                            )}
                            {mainRepoStatus.untracked > 0 && (
                              <span className="text-green-500 font-bold">+</span>
                            )}
                          </>
                        )}
                        
                        <Button
                          variant="ghost"
                          size="icon"
                          className="w-6 h-6"
                          onClick={() => {
                            // Refresh git status
                            if (repoPath) {
                              gitGetStatus(repoPath)
                                .then(setMainRepoStatus)
                                .catch(() => setMainRepoStatus(null));
                              gitGetBranchInfo(repoPath)
                                .then(setMainBranchInfo)
                                .catch(() => setMainBranchInfo(null));
                              calculateDirectorySize(repoPath)
                                .then(setMainRepoSize)
                                .catch(() => setMainRepoSize(null));
                            }
                          }}
                        >
                          <RefreshCw className="w-3 h-3" />
                        </Button>
                        
                        {mainBranchInfo?.upstream && (
                          <>
                            {mainBranchInfo.behind > 0 && (
                              <span className="text-xs text-muted-foreground">
                                {mainBranchInfo.behind}↓
                              </span>
                            )}
                            {mainBranchInfo.ahead > 0 && (
                              <span className="text-xs text-muted-foreground">
                                {mainBranchInfo.ahead}↑
                              </span>
                            )}
                          </>
                        )}
                      </>
                    )}
                  </div>

                  {/* Disk Usage */}
                  {mainRepoSize !== null && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <HardDrive className="w-4 h-4" />
                      <span className="text-xs">Disk Usage: {formatBytes(mainRepoSize)}</span>
                    </div>
                  )}

                  {/* Action Buttons */}
                  <div className="space-y-2 pt-2">
                    <Button
                      variant="outline"
                      className="w-full justify-start"
                      onClick={handleOpenMainPlanningTerminal}
                    >
                      <TerminalIcon className="w-4 h-4 mr-2" />
                      Planning Terminal
                    </Button>
                    <Button
                      variant="outline"
                      className="w-full justify-start"
                      onClick={handleOpenMainExecutionTerminal}
                    >
                      <TerminalIcon className="w-4 h-4 mr-2" />
                      Execution Terminal
                    </Button>
                  </div>
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
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
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
                          onOpenPlanningTerminal={handleOpenPlanningTerminal}
                          onOpenExecutionTerminal={handleOpenExecutionTerminal}
                          onOpenDiff={handleOpenDiff}
                          onDelete={handleDelete}
                          onMerge={handleMergeRequest}
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

        <UnifiedSettings
          open={showUnifiedSettings}
          onOpenChange={setShowUnifiedSettings}
          repoPath={repoPath}
          onRepoPathChange={setRepoPath}
          initialTab={initialSettingsTab}
          onRefresh={refetch}
        />
      </div>
      </div>
    </div>
  );
};
