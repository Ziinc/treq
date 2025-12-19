import { memo, useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Workspace,
  listDirectory,
  readFile,
  DirectoryEntry,
  jjGetDefaultBranch,
  jjGetConflictedFiles,
  setWorkspaceTargetBranch,
  jjGetChangedFiles,
} from "../lib/api";
import { getStatusBgColor } from "../lib/git-status-colors";
import { parseJjChangedFiles, type ParsedFileChange } from "../lib/git-utils";

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
  ArrowRight,
  File,
  Folder,
  Trash2,
} from "lucide-react";
import { TargetBranchSelector } from "./TargetBranchSelector";
import { cn } from "../lib/utils";
import { useTerminalSettings } from "../hooks/useTerminalSettings";

interface ShowWorkspaceProps {
  repositoryPath?: string;
  workspace: Workspace | null;
  sessionId: number | null;
  mainRepoBranch?: string | null;
  onClose: () => void;
  initialSelectedFile: string | null;
  onSessionActivity?: (sessionId: number) => void;
  isHidden?: boolean;
  onDeleteWorkspace?: (workspace: Workspace) => void;
}

export const ShowWorkspace = memo<ShowWorkspaceProps>(function ShowWorkspace({
  repositoryPath,
  workspace,
  sessionId: _sessionId,
  mainRepoBranch,
  onClose: _onClose,
  initialSelectedFile,
  isHidden: _isHidden = false,
  onDeleteWorkspace,
}) {
  const workingDirectory = workspace?.workspace_path || repositoryPath || "";
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
    "push" | "merge" | "forcePush" | null
  >(null);
  const [showForcePushDialog, setShowForcePushDialog] = useState(false);

  // Target branch and conflicts state
  const [targetBranch, setTargetBranch] = useState<string | null>(null);
  const [defaultBranch, setDefaultBranch] = useState<string>("main");
  const [conflictedFiles, setConflictedFiles] = useState<string[]>([]);

  // Branch selection state
  const [availableBranches, setAvailableBranches] = useState<BranchListItem[]>(
    []
  );
  const [branchesLoading, setBranchesLoading] = useState(false);
  const [rebasing, setRebasing] = useState(false);

  // Stub git info values - these would need JJ equivalents
  const mainTreePath = null;
  const maintreeBranchName = null;

  // Show overview tab by default for main repo, changes tab for workspaces
  const [activeTab, setActiveTab] = useState("overview");

  useEffect(() => {
    // Fetch root directory listing
    listDirectory(workingDirectory)
      .then(setRootEntries)
      .catch(() => setRootEntries([]));

    // Fetch README.md
    readFile(`${workingDirectory}/README.md`)
      .then(setReadmeContent)
      .catch(() => setReadmeContent(null));

    jjGetDefaultBranch(effectiveRepoPath)
      .then(setDefaultBranch)
      .catch(() => setDefaultBranch("main"));

    // Note: Branch listing would need JJ equivalent
    if (workspace && effectiveRepoPath) {
      setBranchesLoading(false);
      setAvailableBranches([]);
    }
  }, [workspace, effectiveRepoPath]);

  // Load target branch from workspace
  useEffect(() => {
    const value = workspace?.target_branch || defaultBranch;
    if (value !== targetBranch) {
      setTargetBranch(value);
    }
  }, [workspace?.target_branch, defaultBranch]);

  useEffect(() => {
    if (activeTab === "changes") {
      jjGetConflictedFiles(workingDirectory)
        .then(setConflictedFiles)
        .catch(() => setConflictedFiles([]));
    }
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === "overview" && workingDirectory) {
      jjGetChangedFiles(workingDirectory)
        .then((jjFiles) => {
          const parsed = parseJjChangedFiles(jjFiles);
          const map = new Map<string, ParsedFileChange>();
          for (const file of parsed) {
            const fullPath = `${workingDirectory}/${file.path}`;
            map.set(fullPath, file);
          }
          setChangedFiles(map);
        })
        .catch(() => setChangedFiles(new Map()));
    }
  }, [activeTab, workingDirectory]);

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

        if (result.has_conflicts) {
          addToast({
            title: "Rebase completed with conflicts",
            description: `${result.conflicted_files.length} file(s) have conflicts. Resolve them in the Changes tab.`,
            type: "warning",
          });
        } else if (result.success) {
          addToast({
            title: "Rebased successfully",
            description: `Workspace rebased onto ${branch}`,
            type: "success",
          });
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
    [targetBranch, workspace, effectiveRepoPath, workingDirectory, addToast]
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
      setActiveTab("files");
    },
    [workingDirectory]
  );

  // Note: Git merge/push operations removed - these would need JJ equivalents
  const handleMergeIntoMaintree = useCallback(async () => {
    addToast({
      title: "Not Implemented",
      description: "Merge operations need JJ equivalents",
      type: "error",
    });
  }, [addToast]);

  const handleUpdateFromMaintree = useCallback(async () => {
    addToast({
      title: "Not Implemented",
      description: "Update operations need JJ equivalents",
      type: "error",
    });
  }, [addToast]);

  const handlePushToRemote = useCallback(async () => {
    addToast({
      title: "Not Implemented",
      description: "Push operations need JJ equivalents",
      type: "error",
    });
  }, [addToast]);

  const handleForcePush = useCallback(async () => {
    addToast({
      title: "Not Implemented",
      description: "Force push operations need JJ equivalents",
      type: "error",
    });
  }, [addToast]);

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
      <div className="flex-shrink-0 bg-background px-4 py-2 border-b border-border">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="changes">Changes</TabsTrigger>
            <TabsTrigger value="files">Files</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      <div className="flex-1 overflow-auto">
        {activeTab === "overview" ? (
          <div className="p-4 space-y-6">
            {/* File Listing */}
            <div className="border rounded-lg divide-y divide-border">
              {rootEntries.map((entry) => (
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
                <div className="prose dark:prose-invert max-w-none prose-headings:font-semibold prose-h1:text-3xl prose-h2:text-2xl prose-h3:text-xl prose-a:text-blue-500 prose-a:no-underline hover:prose-a:underline prose-strong:font-semibold prose-code:bg-muted prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-sm prose-code:before:content-[''] prose-code:after:content-[''] prose-pre:bg-muted prose-pre:border prose-pre:border-border">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
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
            initialSelectedFile={initialSelectedFile}
            conflictedFiles={conflictedFiles}
          />
        ) : (
          <FileBrowser
            workspace={workspace}
            repoPath={effectiveRepoPath}
            initialSelectedFile={initialSelectedFileForBrowser}
            initialExpandedDir={initialExpandedDir}
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
            <span className="text-sm font-semibold font-mono">
              {branchTitle}
            </span>
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
              </>
            )}
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
      </div>

      <div className="flex-1 flex overflow-hidden min-h-0">
        <div className="w-full flex flex-col overflow-hidden">
          {executionPanel}
        </div>
      </div>

      {/* Force Push Confirmation Dialog */}
      <Dialog open={showForcePushDialog} onOpenChange={setShowForcePushDialog}>
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
});
