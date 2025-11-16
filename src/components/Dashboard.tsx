import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { listen } from "@tauri-apps/api/event";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { WorktreeCard } from "./WorktreeCard";
import { CreateWorktreeDialog } from "./CreateWorktreeDialog";
import { UnifiedSettings } from "./UnifiedSettings";
import { DiffViewer } from "./DiffViewer";
import { PlanningTerminal } from "./PlanningTerminal";
import { WorktreeEditSession } from "./WorktreeEditSession";
import { PlanHistoryDialog } from "./PlanHistoryDialog";
import { ExecutionTerminal } from "./ExecutionTerminal";
import { PlanSection } from "../types/planning";
import { PlanHistoryEntry } from "../types/planHistory";
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
  getWorktreePlans,
  gitCreateWorktree,
  addWorktreeToDb,
  getRepoSetting,
  gitExecutePostCreateCommand,
  ptyCreateSession,
  ptyWrite,
} from "../lib/api";
import { formatBytes } from "../lib/utils";
import { Plus, Settings, X, RefreshCw, Search, Terminal as TerminalIcon, GitBranch, FolderGit2, HardDrive } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "./ui/card";

type ViewMode = "dashboard" | "terminal" | "diff" | "planning" | "worktree-edit" | "worktree-planning" | "execution" | "worktree-execution";

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
  const [planHistoryMap, setPlanHistoryMap] = useState<Record<number, PlanHistoryEntry[]>>({});
  const [planHistoryLoading, setPlanHistoryLoading] = useState<Record<number, boolean>>({});
  const [planHistoryDialogOpen, setPlanHistoryDialogOpen] = useState(false);
  const [planHistoryDialogWorktree, setPlanHistoryDialogWorktree] = useState<Worktree | null>(null);
  
  const queryClient = useQueryClient();
  const { addToast } = useToast();
  const searchInputRef = useRef<HTMLInputElement>(null);

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

  // Fetch main repository git status and branch info
  useEffect(() => {
    if (repoPath) {
      // Fetch git status
      gitGetStatus(repoPath)
        .then(setMainRepoStatus)
        .catch(() => setMainRepoStatus(null));

      // Fetch branch info
      gitGetBranchInfo(repoPath)
        .then(setMainBranchInfo)
        .catch(() => setMainBranchInfo(null));

      // Fetch directory size
      calculateDirectorySize(repoPath)
        .then(setMainRepoSize)
        .catch(() => setMainRepoSize(null));
    } else {
      setMainRepoStatus(null);
      setMainBranchInfo(null);
      setMainRepoSize(null);
    }
  }, [repoPath]);

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

  const refreshPlanHistoryForWorktree = useCallback(
    async (target: Worktree, options?: { shouldCancel?: () => boolean }) => {
      if (options?.shouldCancel?.()) return;
      setPlanHistoryLoading((prev) => ({ ...prev, [target.id]: true }));
      try {
        const plans = await getWorktreePlans(target.repo_path, target.id, 3);
        if (options?.shouldCancel?.()) return;
        setPlanHistoryMap((prev) => ({ ...prev, [target.id]: plans }));
      } catch (error) {
        console.error(`Failed to refresh plan history for worktree ${target.id}:`, error);
      } finally {
        if (options?.shouldCancel?.()) return;
        setPlanHistoryLoading((prev) => ({ ...prev, [target.id]: false }));
      }
    },
    []
  );

  // Load recent plan history for each worktree
  useEffect(() => {
    if (worktrees.length === 0) {
      setPlanHistoryMap({});
      setPlanHistoryLoading({});
      return;
    }

    let cancelled = false;
    const activeIds = new Set(worktrees.map((wt) => wt.id));

    setPlanHistoryMap((prev) => {
      const next: Record<number, PlanHistoryEntry[]> = {};
      Object.entries(prev).forEach(([id, value]) => {
        const numericId = Number(id);
        if (activeIds.has(numericId)) {
          next[numericId] = value;
        }
      });
      return next;
    });

    setPlanHistoryLoading((prev) => {
      const next: Record<number, boolean> = {};
      Object.entries(prev).forEach(([id, value]) => {
        const numericId = Number(id);
        if (activeIds.has(numericId)) {
          next[numericId] = value;
        }
      });
      return next;
    });

    worktrees.forEach((wt) => {
      refreshPlanHistoryForWorktree(wt, {
        shouldCancel: () => cancelled,
      });
    });

    return () => {
      cancelled = true;
    };
  }, [worktrees, refreshPlanHistoryForWorktree]);

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

  const handleOpenPlanningTerminal = (worktree: Worktree) => {
    setSelectedWorktree(worktree);
    setViewMode("worktree-planning");
  };

  const handleOpenExecutionTerminal = (worktree: Worktree) => {
    setSelectedWorktree(worktree);
    setViewMode("worktree-execution");
  };

  const handleOpenMainExecutionTerminal = () => {
    setViewMode("execution");
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

  const handleViewPlanHistory = (worktree: Worktree) => {
    setPlanHistoryDialogWorktree(worktree);
    setPlanHistoryDialogOpen(true);
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
      
      // Create Claude code session
      const sessionId = `worktree-edit-${worktreeId}`;
      const initialCommand = `claude --permission-mode plan`;
      
      addToast({
        title: "Starting Claude session...",
        description: "Initializing AI editor with implementation plan",
        type: "info",
      });

      // Create PTY session with initial command
      await ptyCreateSession(sessionId, worktreePath, undefined, initialCommand);
      
      // Wait for Claude to start, then paste the plan content
      setTimeout(async () => {
        try {
          // Send the plan content as if the user pasted it
          await ptyWrite(sessionId, planContent);
          await ptyWrite(sessionId, "\n");
        } catch (error) {
          console.error("Failed to send plan to Claude:", error);
        }
      }, 3000); // Wait 3 seconds for Claude to be ready

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
        await refreshPlanHistoryForWorktree(newWorktree);
      } catch (planError) {
        console.error("Failed to record plan execution:", planError);
      }

      setSelectedWorktree(newWorktree);
      setViewMode("worktree-edit");
      
      addToast({
        title: "Ready to implement",
        description: "Worktree created and Claude session started",
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

  if (viewMode === "planning") {
    return (
      <PlanningTerminal
        repositoryPath={repoPath}
        onClose={() => setViewMode("dashboard")}
        onExecutePlan={handleExecutePlan}
      />
    );
  }

  if (viewMode === "worktree-planning" && selectedWorktree) {
    return (
      <PlanningTerminal
        worktree={selectedWorktree}
        onClose={() => {
          setViewMode("dashboard");
          setSelectedWorktree(null);
        }}
        onExecutePlan={handleExecutePlan}
      />
    );
  }

  if (viewMode === "execution") {
    return (
      <ExecutionTerminal
        repositoryPath={repoPath}
        onClose={() => setViewMode("dashboard")}
      />
    );
  }

  if (viewMode === "worktree-execution" && selectedWorktree) {
    return (
      <ExecutionTerminal
        worktree={selectedWorktree}
        onClose={() => {
          setViewMode("dashboard");
          setSelectedWorktree(null);
        }}
      />
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
    <div className="min-h-screen bg-background">
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
                      onClick={() => setViewMode("planning")}
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
                          planHistory={planHistoryMap[worktree.id]}
                          isPlanHistoryLoading={planHistoryLoading[worktree.id]}
                          onViewPlanHistory={handleViewPlanHistory}
                          onOpenPlanningTerminal={handleOpenPlanningTerminal}
                          onOpenExecutionTerminal={handleOpenExecutionTerminal}
                          onOpenDiff={handleOpenDiff}
                          onDelete={handleDelete}
                        />
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </div>

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

      <PlanHistoryDialog
        open={planHistoryDialogOpen}
        onOpenChange={(open) => {
          setPlanHistoryDialogOpen(open);
          if (!open) {
            setPlanHistoryDialogWorktree(null);
          }
        }}
        worktree={planHistoryDialogWorktree}
      />
    </div>
  );
};
