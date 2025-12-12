import {
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  Workspace,
  Session,
  PlanMetadata,
  BranchInfo,
  BranchDivergence,
  LineDiffStats,
  savePlanToFile,
  savePlanToRepo,
  gitPush,
  gitPushForce,
  gitMerge,
  getSetting,
  gitGetBranchInfo,
  gitGetBranchDivergence,
  gitGetLineDiffStats,
  preloadWorkspaceGitData,
  gitGetCurrentBranch,
} from "../lib/api";
import { PlanSection } from "../types/planning";
import {
  StagingDiffViewer,
  type StagingDiffViewerHandle,
} from "./StagingDiffViewer";
import { FileBrowser } from "./FileBrowser";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "./ui/tabs";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";
import { PlanHistoryDialog } from "./PlanHistoryDialog";
import {
  Loader2,
  GitBranch,
  MoreVertical,
  GitMerge,
  Upload,
  AlertTriangle,
  ArrowDownToLine,
} from "lucide-react";
import { PlanDisplayModal } from "./PlanDisplayModal";
import { LineDiffStatsDisplay } from "./LineDiffStatsDisplay";
import { cn } from "../lib/utils";
import { useKeyboardShortcut } from "../hooks/useKeyboard";
import { getWorkspaceTitle as getWorkspaceTitleFromUtils } from "../lib/workspace-utils";

interface SessionTerminalProps {
  repositoryPath?: string;
  workspace?: Workspace;
  session?: Session | null;
  sessionId: number | null;
  mainRepoBranch?: string | null;
  onClose: () => void;
  onExecutePlan?: (section: PlanSection) => void;
  onExecutePlanInWorkspace?: (
    section: PlanSection,
    sourceBranch: string,
    currentSessionName?: string
  ) => Promise<void>;
  initialPlanContent?: string;
  initialPlanTitle?: string;
  initialPrompt?: string;
  initialPromptLabel?: string;
  initialSelectedFile?: string;
  onSessionActivity?: (sessionId: number) => void;
  isHidden?: boolean;
}

export const SessionTerminal = memo<SessionTerminalProps>(
  function SessionTerminal({
    repositoryPath,
    workspace,
    session,
    sessionId,
    mainRepoBranch,
    onClose: _onClose,
    onExecutePlan,
    onExecutePlanInWorkspace,
    initialPlanContent: _initialPlanContent,
    initialPlanTitle: _initialPlanTitle,
    initialPrompt: _initialPrompt,
    initialPromptLabel,
    initialSelectedFile,
    isHidden = false,
  }) {
    const workingDirectory = workspace?.workspace_path || repositoryPath || "";
    const effectiveRepoPath = workspace?.repo_path || repositoryPath || "";
    // Use a stable session ID - only generate UUID once if sessionId is null
    const stableSessionIdRef = useRef<string | null>(null);
    if (stableSessionIdRef.current === null) {
      stableSessionIdRef.current = sessionId
        ? `session-${sessionId}`
        : `session-${crypto.randomUUID()}`;
    }
    const ptySessionId = sessionId
      ? `session-${sessionId}`
      : stableSessionIdRef.current;

    const { addToast } = useToast();
    const [planSections, setPlanSections] = useState<PlanSection[]>([]);
    const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
    const [planModalOpen, setPlanModalOpen] = useState(false);

    const [refreshSignal, setRefreshSignal] = useState(0);
    const [lastPromptLabel] = useState<string | null>(null);

    const stagingDiffViewerRef = useRef<StagingDiffViewerHandle>(null);
    const [actionPending, setActionPending] = useState<
      "push" | "merge" | "forcePush" | null
    >(null);
    const [showForcePushDialog, setShowForcePushDialog] = useState(false);
    const [isExecutingInWorkspace, setIsExecutingInWorkspace] = useState(false);
    const [mainTreePath, setMainTreePath] = useState<string | null>(null);
    const [remoteBranchInfo, setRemoteBranchInfo] = useState<BranchInfo | null>(
      null
    );
    const [maintreeBranchName, setMaintreeBranchName] = useState<string | null>(
      null
    );
    const [maintreeDivergence, setMaintreeDivergence] =
      useState<BranchDivergence | null>(null);
    const [lineStats, setLineStats] = useState<LineDiffStats | null>(null);
    const [activeTab, setActiveTab] = useState("changes");

    useEffect(() => {
      setPlanSections([]);
    }, [ptySessionId]);

    useEffect(() => {
      // Skip git preload when hidden to avoid unnecessary work
      if (isHidden) {
        return;
      }

      const normalized = workingDirectory.trim();
      if (!normalized) {
        return;
      }

      preloadWorkspaceGitData(normalized).catch(() => {
        // Silently ignore preload failures
      });
    }, [workingDirectory, isHidden]);

    // Cmd+/: Focus commit message
    useKeyboardShortcut(
      "/",
      true,
      () => {
        stagingDiffViewerRef.current?.focusCommitInput();
      },
      []
    );

    const handlePlanEdit = useCallback(
      async (planId: string, newContent: string) => {
        if (!effectiveRepoPath) return;
        try {
          const updatedSection = planSections.find(
            (section) => section.id === planId
          );
          setPlanSections((prev) =>
            prev.map((section) =>
              section.id === planId
                ? {
                    ...section,
                    editedContent: newContent,
                    isEdited: true,
                    editedAt: new Date(),
                  }
                : section
            )
          );

          const metadata: PlanMetadata = {
            id: planId,
            title: updatedSection?.title || "Untitled Plan",
            plan_type: updatedSection?.type || "implementation_plan",
            workspace_id: workspace?.id,
            workspace_path: workspace?.workspace_path,
            branch_name: workspace?.branch_name,
            timestamp: new Date().toISOString(),
          };

          await savePlanToFile(effectiveRepoPath, planId, newContent, metadata);
          await savePlanToRepo(
            effectiveRepoPath,
            planId,
            newContent,
            ptySessionId
          );
        } catch (error) {
          console.error("Failed to save plan:", error);
          addToast({
            title: "Save Failed",
            description: error instanceof Error ? error.message : String(error),
            type: "error",
          });
        }
      },
      [effectiveRepoPath, workspace, planSections, ptySessionId, addToast]
    );

    const handleExecuteSection = useCallback(
      (section: PlanSection) => {
        onExecutePlan?.(section);
      },
      [onExecutePlan]
    );

    const handleExecuteInWorkspace = useCallback(
      async (section: PlanSection) => {
        if (!onExecutePlanInWorkspace) return;

        // Close modal immediately when user clicks execute
        setPlanModalOpen(false);

        setIsExecutingInWorkspace(true);
        try {
          // Determine source branch
          let sourceBranch: string;
          if (workspace) {
            sourceBranch = workspace.branch_name;
          } else if (effectiveRepoPath) {
            sourceBranch = await gitGetCurrentBranch(effectiveRepoPath);
          } else {
            throw new Error("No repository context available");
          }

          // This will create workspace and navigate to it
          await onExecutePlanInWorkspace(section, sourceBranch, session?.name);
        } catch (error) {
          addToast({
            title: "Failed to execute in workspace",
            description: error instanceof Error ? error.message : String(error),
            type: "error",
          });
        } finally {
          setIsExecutingInWorkspace(false);
        }
      },
      [workspace, effectiveRepoPath, onExecutePlanInWorkspace, addToast]
    );

    const handleStagedFilesChange = useCallback((_files: string[]) => {
      // No-op: staged files tracking not currently used
    }, []);

    const triggerSidebarRefresh = useCallback(() => {
      setRefreshSignal((prev) => prev + 1);
    }, []);

    // Load main tree path from settings
    useEffect(() => {
      const loadMainTreePath = async () => {
        try {
          const repoPath = await getSetting("repo_path");
          setMainTreePath(repoPath || null);
        } catch {
          setMainTreePath(null);
        }
      };
      loadMainTreePath();
    }, []);

    useEffect(() => {
      // Skip expensive git operations when hidden
      if (isHidden) {
        return;
      }

      let isCancelled = false;

      const loadBranchComparisons = async () => {
        if (!workspace?.workspace_path) {
          if (!isCancelled) {
            setRemoteBranchInfo(null);
            setMaintreeBranchName(null);
            setMaintreeDivergence(null);
          }
          return;
        }

        try {
          const info = await gitGetBranchInfo(workspace.workspace_path);
          if (!isCancelled) {
            setRemoteBranchInfo(info);
          }
        } catch {
          if (!isCancelled) {
            setRemoteBranchInfo(null);
          }
        }

        if (!mainTreePath) {
          if (!isCancelled) {
            setMaintreeBranchName(null);
            setMaintreeDivergence(null);
          }
          return;
        }

        let baseBranchName = "";
        try {
          const baseInfo = await gitGetBranchInfo(mainTreePath);
          if (isCancelled) {
            return;
          }
          baseBranchName = baseInfo.name.trim();
          setMaintreeBranchName(baseInfo.name);
        } catch {
          if (!isCancelled) {
            setMaintreeBranchName(null);
            setMaintreeDivergence(null);
          }
          return;
        }

        if (!baseBranchName) {
          if (!isCancelled) {
            setMaintreeDivergence(null);
          }
          return;
        }

        try {
          const divergence = await gitGetBranchDivergence(
            workspace.workspace_path,
            baseBranchName
          );
          if (!isCancelled) {
            setMaintreeDivergence(divergence);
          }
        } catch {
          if (!isCancelled) {
            setMaintreeDivergence(null);
          }
        }

        try {
          const stats = await gitGetLineDiffStats(
            workspace.workspace_path,
            baseBranchName
          );
          if (!isCancelled) {
            setLineStats(stats);
          }
        } catch {
          if (!isCancelled) {
            setLineStats(null);
          }
        }
      };

      loadBranchComparisons();

      return () => {
        isCancelled = true;
      };
    }, [
      workspace?.workspace_path,
      mainTreePath,
      refreshSignal,
      isHidden,
      mainRepoBranch,
    ]);

    const handleMergeIntoMaintree = useCallback(async () => {
      if (!mainTreePath || !workspace?.branch_name) {
        addToast({
          title: "Cannot merge",
          description: "Main tree path or current branch not available",
          type: "error",
        });
        return;
      }

      setActionPending("merge");
      try {
        await gitMerge(mainTreePath, workspace.branch_name, "regular");
        addToast({
          title: "Merged",
          description: `Branch ${workspace.branch_name} merged into main tree`,
          type: "success",
        });
        triggerSidebarRefresh();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        addToast({
          title: "Merge failed",
          description: message,
          type: "error",
        });
      } finally {
        setActionPending(null);
      }
    }, [mainTreePath, workspace?.branch_name, addToast, triggerSidebarRefresh]);

    const handleUpdateFromMaintree = useCallback(async () => {
      if (!workingDirectory || !maintreeBranchName) {
        addToast({
          title: "Cannot update",
          description: "Working directory or maintree branch not available",
          type: "error",
        });
        return;
      }

      setActionPending("merge");
      try {
        await gitMerge(workingDirectory, maintreeBranchName, "regular");
        addToast({
          title: "Updated",
          description: `Branch updated with changes from ${maintreeBranchName}`,
          type: "success",
        });
        triggerSidebarRefresh();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        addToast({
          title: "Update failed",
          description: message,
          type: "error",
        });
      } finally {
        setActionPending(null);
      }
    }, [workingDirectory, maintreeBranchName, addToast, triggerSidebarRefresh]);

    const handlePushToRemote = useCallback(async () => {
      if (!workingDirectory) return;

      setActionPending("push");
      try {
        await gitPush(workingDirectory);
        addToast({
          title: "Pushed",
          description: "Changes pushed to remote",
          type: "success",
        });
        triggerSidebarRefresh();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        addToast({
          title: "Push failed",
          description: message,
          type: "error",
        });
      } finally {
        setActionPending(null);
      }
    }, [workingDirectory, addToast, triggerSidebarRefresh]);

    const handleForcePush = useCallback(async () => {
      if (!workingDirectory) return;

      setShowForcePushDialog(false);
      setActionPending("forcePush");
      try {
        await gitPushForce(workingDirectory);
        addToast({
          title: "Force pushed",
          description: "Changes force pushed to remote",
          type: "success",
        });
        triggerSidebarRefresh();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        addToast({
          title: "Force push failed",
          description: message,
          type: "error",
        });
      } finally {
        setActionPending(null);
      }
    }, [workingDirectory, addToast, triggerSidebarRefresh]);

    const executionPanel = workingDirectory ? (
      <div className="flex flex-col h-full">
        <div className="flex-shrink-0 border-b bg-background">
          <Tabs
            value={activeTab}
            onValueChange={setActiveTab}
          >
            <TabsList className="px-4 py-2">
              <TabsTrigger value="changes">Changes</TabsTrigger>
              <TabsTrigger value="files">Files</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        <div className="flex-1 overflow-auto">
          {activeTab === "changes" ? (
            <StagingDiffViewer
              ref={stagingDiffViewerRef}
              workspacePath={workingDirectory}
              disableInteractions={false}
              onStagedFilesChange={handleStagedFilesChange}
              refreshSignal={refreshSignal}
              initialSelectedFile={initialSelectedFile}
              terminalSessionId={ptySessionId}
            />
          ) : (
            <FileBrowser
              workspace={workspace}
              repoPath={effectiveRepoPath}
              branchName={workspace?.branch_name}
              mainBranch={maintreeBranchName || mainRepoBranch || undefined}
            />
          )}
        </div>
      </div>
    ) : (
      <div className="h-full flex items-center justify-center text-center p-6 text-sm text-muted-foreground">
        Configure a workspace or repository path to manage commits.
      </div>
    );

    const getWorkspaceTitle = (): string => {
      if (!workspace) return "Main";
      return getWorkspaceTitleFromUtils(workspace);
    };

    const sessionTitle =
      session?.name && session.name.trim().length > 0
        ? session.name.trim()
        : "Session Terminal";

    return (
      <div className="h-full w-full flex flex-col bg-background">
        <div className="border-b p-2 flex flex-col gap-1 flex-shrink-0">
          {/* Row 1: Session name */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold">{sessionTitle}</h2>
            </div>
            <div className="flex items-center gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
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
                      handleUpdateFromMaintree();
                    }}
                    disabled={!maintreeBranchName || !workingDirectory}
                  >
                    <ArrowDownToLine className="w-4 h-4 mr-2" />
                    Update from maintree
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={(e) => {
                      e.preventDefault();
                      handleMergeIntoMaintree();
                    }}
                    disabled={!mainTreePath || !workspace?.branch_name}
                  >
                    <GitMerge className="w-4 h-4 mr-2" />
                    Merge into maintree
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onSelect={(e) => {
                      e.preventDefault();
                      handlePushToRemote();
                    }}
                  >
                    <Upload className="w-4 h-4 mr-2" />
                    Push to remote
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={(e) => {
                      e.preventDefault();
                      setShowForcePushDialog(true);
                    }}
                    className="text-destructive focus:text-destructive"
                  >
                    <AlertTriangle className="w-4 h-4 mr-2" />
                    Push to remote (force)
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* Row 2: Workspace info */}
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex flex-col gap-1 items-start">
              {workspace && (
                <span className="text-xs text-muted-foreground font-mono">
                  {getWorkspaceTitle()}
                </span>
              )}
              {(initialPromptLabel || lastPromptLabel) && (
                <span className="text-[10px] inline-flex items-center gap-1 text-primary">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                  {initialPromptLabel || lastPromptLabel}
                </span>
              )}
            </div>

            {workspace && (
              <div className="flex items-start gap-3 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1 font-mono text-foreground">
                  <GitBranch className="w-3 h-3" />
                  <span
                    className="font-semibold block max-w-[160px] truncate"
                    title={workspace.branch_name}
                  >
                    {workspace.branch_name}
                  </span>
                </span>

                {maintreeBranchName && (
                  <div className="flex flex-col items-center gap-1">
                    <span
                      className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[11px] font-mono"
                      title={`Compared to ${maintreeBranchName}`}
                    >
                      <span>{maintreeDivergence?.ahead ?? 0}↑</span>
                      <span>{maintreeDivergence?.behind ?? 0}↓</span>
                    </span>
                    <span className="text-[10px] uppercase tracking-wide">
                      maintree
                    </span>
                  </div>
                )}

                {maintreeBranchName &&
                  lineStats &&
                  (lineStats.lines_added > 0 ||
                    lineStats.lines_deleted > 0) && (
                    <div className="flex flex-col items-center gap-1">
                      <LineDiffStatsDisplay
                        stats={lineStats}
                        size="xs"
                        className="rounded-full border border-border px-2 py-0.5"
                      />
                      <span className="text-[10px] uppercase tracking-wide">
                        lines
                      </span>
                    </div>
                  )}

                <div className="flex flex-col items-center gap-1">
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[11px] font-mono",
                      !remoteBranchInfo?.upstream && "opacity-50"
                    )}
                    title={
                      remoteBranchInfo?.upstream
                        ? `Tracking ${remoteBranchInfo.upstream}`
                        : "No upstream configured"
                    }
                  >
                    <span>{remoteBranchInfo?.ahead ?? 0}↑</span>
                    <span>{remoteBranchInfo?.behind ?? 0}↓</span>
                  </span>
                  <span className="text-[10px] uppercase tracking-wide">
                    remote
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex-1 flex overflow-hidden min-h-0">
          <div className="w-full flex flex-col overflow-hidden">
            {executionPanel}
          </div>
        </div>

        <PlanHistoryDialog
          open={historyDialogOpen}
          onOpenChange={setHistoryDialogOpen}
          workspace={workspace || null}
        />

        <PlanDisplayModal
          open={planModalOpen}
          onOpenChange={setPlanModalOpen}
          planSections={planSections}
          onPlanEdit={handlePlanEdit}
          onExecutePlan={handleExecuteSection}
          onExecuteInWorkspace={handleExecuteInWorkspace}
          isExecutingInWorkspace={isExecutingInWorkspace}
          sessionId={ptySessionId}
          repoPath={effectiveRepoPath}
          workspaceId={workspace?.id}
        />

        {/* Force Push Confirmation Dialog */}
        <Dialog
          open={showForcePushDialog}
          onOpenChange={setShowForcePushDialog}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-destructive" />
                Force Push Warning
              </DialogTitle>
              <DialogDescription className="pt-2">
                Force pushing will overwrite the remote branch history. This
                action cannot be undone and may cause issues for other
                collaborators who have pulled from this branch.
              </DialogDescription>
            </DialogHeader>
            <div className="flex justify-end gap-2 mt-4">
              <Button
                variant="outline"
                onClick={() => setShowForcePushDialog(false)}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleForcePush}
                disabled={!!actionPending}
              >
                {actionPending === "forcePush" ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : null}
                Force Push
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    );
  }
);
