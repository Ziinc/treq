import {
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Workspace,
  gitPush,
  gitPushForce,
  gitMerge,
  preloadWorkspaceGitData,
  listDirectory,
  readFile,
  DirectoryEntry,
  jjGetDefaultBranch,
  jjGetConflictedFiles,
} from "../lib/api";
import { getStatusBgColor } from "../lib/git-status-colors";
import { useCachedWorkspaceChanges } from "../hooks/useCachedWorkspaceChanges";
import { useSessionGitInfo } from "../hooks/useSessionGitInfo";
import {
  ChangesDiffViewer,
  type ChangesDiffViewerHandle,
} from "./ChangesDiffViewer";
import { FileBrowser } from "./FileBrowser";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";
import {
  Loader2,
  GitBranch,
  MoreVertical,
  GitMerge,
  Upload,
  AlertTriangle,
  ArrowDownToLine,
  File,
  Folder,
} from "lucide-react";
import { LineDiffStatsDisplay } from "./LineDiffStatsDisplay";
import { TargetBranchSelector } from "./TargetBranchSelector";
import { cn } from "../lib/utils";
import { useKeyboardShortcut } from "../hooks/useKeyboard";

interface ShowWorkspaceProps {
  repositoryPath?: string;
  workspace: Workspace | null;
  sessionId: number | null;
  mainRepoBranch?: string | null;
  onClose: () => void;
  initialSelectedFile: string | null;
  onSessionActivity?: (sessionId: number) => void;
  isHidden?: boolean;
  onActiveTabChange?: (tab: string) => void;
  forceOverviewTab?: number; // Signal to force Overview tab
}

export const ShowWorkspace = memo<ShowWorkspaceProps>(
  function ShowWorkspace({
    repositoryPath,
    workspace,
    sessionId: _sessionId,
    mainRepoBranch,
    onClose: _onClose,
    initialSelectedFile,
    isHidden = false,
    onActiveTabChange,
    forceOverviewTab,
  }) {
    const workingDirectory = workspace?.workspace_path || repositoryPath || "";
    const effectiveRepoPath = workspace?.repo_path || repositoryPath || "";

    const { addToast } = useToast();

    const [refreshSignal, setRefreshSignal] = useState(0);
    const [readmeContent, setReadmeContent] = useState<string | null>(null);
    const [rootEntries, setRootEntries] = useState<DirectoryEntry[]>([]);
    const { filesMap: changedFiles } = useCachedWorkspaceChanges(workingDirectory, {
      enabled: !isHidden,
      repoPath: effectiveRepoPath,
      workspaceId: workspace?.id ?? null,
    });
    const [initialSelectedFileForBrowser, setInitialSelectedFileForBrowser] = useState<string | null>(null);
    const [initialExpandedDir, setInitialExpandedDir] = useState<string | null>(null);

    const changesDiffViewerRef = useRef<ChangesDiffViewerHandle>(null);
    const [actionPending, setActionPending] = useState<
      "push" | "merge" | "forcePush" | null
    >(null);
    const [showForcePushDialog, setShowForcePushDialog] = useState(false);

    // Target branch and conflicts state
    const [targetBranch, setTargetBranch] = useState<string | null>(null);
    const [defaultBranch, setDefaultBranch] = useState<string>("main");
    const [conflictedFiles, setConflictedFiles] = useState<string[]>([]);

    // Load git info for the workspace
    const {
      mainTreePath,
      remoteBranchInfo,
      maintreeBranchName,
      maintreeDivergence,
      lineStats,
    } = useSessionGitInfo(workspace, refreshSignal, isHidden, mainRepoBranch ?? null);

    // Show overview tab by default for main repo, changes tab for workspaces
    const [activeTab, setActiveTab] = useState(workspace ? "changes" : "overview");

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

    // Force Overview tab when requested (for home navigation)
    useEffect(() => {
      if (forceOverviewTab && !workspace) {
        setActiveTab("overview");
      }
    }, [forceOverviewTab, workspace]);

    // Report active tab changes to parent (only when visible)
    useEffect(() => {
      if (!isHidden && onActiveTabChange) {
        onActiveTabChange(activeTab);
      }
    }, [activeTab, isHidden, onActiveTabChange]);

    // Fetch README and directory listing for Overview tab
    useEffect(() => {
      if (!workingDirectory) return;

      // Fetch root directory listing
      listDirectory(workingDirectory)
        .then(setRootEntries)
        .catch(() => setRootEntries([]));

      // Fetch README.md
      readFile(`${workingDirectory}/README.md`)
        .then(setReadmeContent)
        .catch(() => setReadmeContent(null));
    }, [workingDirectory]);

    // Clear initial file/dir state when navigating away from files tab
    useEffect(() => {
      if (activeTab !== "files") {
        setInitialSelectedFileForBrowser(null);
        setInitialExpandedDir(null);
      }
    }, [activeTab]);

    // Load default branch on mount
    useEffect(() => {
      if (effectiveRepoPath) {
        jjGetDefaultBranch(effectiveRepoPath)
          .then(setDefaultBranch)
          .catch(() => setDefaultBranch("main"));
      }
    }, [effectiveRepoPath]);

    // Load target branch from workspace metadata
    useEffect(() => {
      if (workspace?.metadata) {
        try {
          const meta = JSON.parse(workspace.metadata);
          setTargetBranch(meta.target_branch || defaultBranch);
        } catch {
          setTargetBranch(defaultBranch);
        }
      } else {
        setTargetBranch(defaultBranch);
      }
    }, [workspace?.metadata, defaultBranch]);

    // Check for conflicts on load and after refresh
    useEffect(() => {
      if (workingDirectory) {
        jjGetConflictedFiles(workingDirectory)
          .then(setConflictedFiles)
          .catch(() => setConflictedFiles([]));
      }
    }, [workingDirectory, refreshSignal]);

    // Cmd+/: Focus commit message
    useKeyboardShortcut(
      "/",
      true,
      () => {
        changesDiffViewerRef.current?.focusCommitInput();
      },
      []
    );

    const handleStagedFilesChange = useCallback((_files: string[]) => {
      // No-op: staged files tracking not currently used
    }, []);

    const triggerSidebarRefresh = useCallback(() => {
      setRefreshSignal((prev) => prev + 1);
    }, []);

    // Helper to get status for a directory entry
    const getEntryStatus = useCallback((entry: DirectoryEntry): string | undefined => {
      const fullPath = `${workingDirectory}/${entry.name}`;
      if (!entry.is_directory) {
        const file = changedFiles.get(fullPath);
        if (!file) return undefined;
        // Prefer workspaceStatus (unstaged) over stagedStatus
        return file.workspaceStatus || file.stagedStatus || undefined;
      }
      // For directories, check if any child has changes
      for (const [path] of changedFiles) {
        if (path.startsWith(fullPath + '/')) {
          return 'M'; // Show modified indicator if any child changed
        }
      }
      return undefined;
    }, [workingDirectory, changedFiles]);

    // Handler for clicking on Overview entries
    const handleOverviewEntryClick = useCallback((entry: DirectoryEntry) => {
      const fullPath = `${workingDirectory}/${entry.name}`;
      if (entry.is_directory) {
        setInitialExpandedDir(fullPath);
        setInitialSelectedFileForBrowser(null); // Will select README in browser
      } else {
        setInitialSelectedFileForBrowser(fullPath);
        setInitialExpandedDir(null);
      }
      setActiveTab("files");
    }, [workingDirectory]);

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

    // Status pip component for file/directory indicators
    const StatusPip = ({ status }: { status?: string }) =>
      status ? (
        <span
          className={cn("w-2 h-2 rounded-full flex-shrink-0", getStatusBgColor(status))}
        />
      ) : null;

    const executionPanel = workingDirectory ? (
      <div className="flex flex-col h-full">
        <div className="flex-shrink-0 border-b bg-background">
          <Tabs
            value={activeTab}
            onValueChange={setActiveTab}
          >
            <TabsList className="px-4 py-2">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="changes">Changes</TabsTrigger>
              <TabsTrigger value="files">Files</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        <div className="flex-1 overflow-auto">
          {activeTab === "overview" ? (
            <div className="p-4 space-y-6">
              {/* Target Branch Selector for workspaces */}
              {workspace && workspace.branch_name !== defaultBranch && (
                <TargetBranchSelector
                  repoPath={effectiveRepoPath}
                  workspacePath={workingDirectory}
                  workspaceId={workspace.id}
                  currentBranch={workspace.branch_name}
                  targetBranch={targetBranch}
                  onTargetChange={(branch) => {
                    setTargetBranch(branch);
                    triggerSidebarRefresh();
                  }}
                />
              )}
              {/* File Listing */}
              <div className="border rounded-lg divide-y divide-border">
                {rootEntries.map((entry) => (
                  <button
                    key={entry.path}
                    type="button"
                    onClick={() => handleOverviewEntryClick(entry)}
                    className="flex items-center gap-3 px-4 py-2 text-sm w-full hover:bg-muted/60 transition text-left"
                  >
                    {entry.is_directory ? (
                      <Folder className="w-4 h-4 text-blue-500" />
                    ) : (
                      <File className="w-4 h-4 text-muted-foreground" />
                    )}
                    <span className="flex-1">{entry.name}</span>
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
                  <div className="prose dark:prose-invert max-w-none prose-headings:font-semibold prose-h1:text-3xl prose-h2:text-2xl prose-h3:text-xl prose-a:text-blue-500 prose-a:no-underline hover:prose-a:underline prose-strong:font-semibold prose-code:bg-muted prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-sm prose-code:before:content-[''] prose-code:after:content-[''] prose-pre:bg-muted prose-pre:border prose-pre:border-border">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        h1: ({node: _node, ...props}) => <h1 className="text-3xl font-semibold mb-4 mt-0" {...props} />,
                        h2: ({node: _node, ...props}) => <h2 className="text-2xl font-semibold mb-3 mt-6" {...props} />,
                        h3: ({node: _node, ...props}) => <h3 className="text-xl font-semibold mb-2 mt-4" {...props} />,
                        p: ({node: _node, ...props}) => <p className="mb-4" {...props} />,
                        strong: ({node: _node, ...props}) => <strong className="font-semibold" {...props} />,
                        a: ({node: _node, ...props}) => <a className="text-blue-500 hover:underline" {...props} />,
                        ul: ({node: _node, ...props}) => <ul className="list-disc pl-6 mb-4 space-y-2" {...props} />,
                        ol: ({node: _node, ...props}) => <ol className="list-decimal pl-6 mb-4 space-y-2" {...props} />,
                        li: ({node: _node, ...props}) => <li className="mb-1" {...props} />,
                        code: ({node: _node, className, children, ...props}: { node?: unknown; className?: string; children?: React.ReactNode } & React.HTMLAttributes<HTMLElement>) => {
                          const isInline = !className?.includes('language-');
                          return isInline ?
                            <code className="bg-muted px-1.5 py-0.5 rounded text-sm font-mono" {...props}>{children}</code> :
                            <code className="block bg-muted p-4 rounded border border-border overflow-x-auto font-mono text-sm" {...props}>{children}</code>;
                        },
                        pre: ({node: _node, ...props}) => <pre className="mb-4" {...props} />,
                        blockquote: ({node: _node, ...props}) => <blockquote className="border-l-4 border-border pl-4 italic text-muted-foreground my-4" {...props} />,
                      }}
                    >
                      {readmeContent}
                    </ReactMarkdown>
                  </div>
                ) : (
                  <div className="text-muted-foreground text-sm text-center py-4">
                    No README.md found
                  </div>
                )}
              </div>
            </div>
          ) : activeTab === "changes" ? (
            <ChangesDiffViewer
              ref={changesDiffViewerRef}
              workspacePath={workingDirectory}
              disableInteractions={false}
              onStagedFilesChange={handleStagedFilesChange}
              refreshSignal={refreshSignal}
              initialSelectedFile={initialSelectedFile}
              conflictedFiles={conflictedFiles}
            />
          ) : (
            <FileBrowser
              workspace={workspace}
              repoPath={effectiveRepoPath}
              mainBranch={maintreeBranchName || mainRepoBranch || undefined}
              initialSelectedFile={initialSelectedFileForBrowser || undefined}
              initialExpandedDir={initialExpandedDir || undefined}
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

    return (
      <div className="h-full w-full flex flex-col bg-background">
        <div className="border-b p-2 flex flex-col gap-1 flex-shrink-0">
          {/* Row 1: Branch name */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <GitBranch className="w-4 h-4 text-muted-foreground" />
              <h2 className="text-lg font-semibold font-mono">{branchTitle}</h2>
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

          {/* Row 2: Git status info (workspaces only) */}
          {workspace && (
            <div className="flex flex-wrap items-start justify-end gap-4">
              <div className="flex items-start gap-3 text-xs text-muted-foreground">
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
            </div>
          )}
        </div>

        <div className="flex-1 flex overflow-hidden min-h-0">
          <div className="w-full flex flex-col overflow-hidden">
            {executionPanel}
          </div>
        </div>

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
