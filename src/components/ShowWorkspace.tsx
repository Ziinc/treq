import { memo, useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
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
  Upload,
  AlertTriangle,
  ArrowRight,
  File,
  Folder,
  Trash2,
  Search,
  Code2,
  GitCompareArrows,
  FolderTree,
} from "lucide-react";
import { TargetBranchSelector } from "./TargetBranchSelector";
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
}

export const ShowWorkspace = memo<ShowWorkspaceProps>(function ShowWorkspace({
  repositoryPath,
  workspace,
  mainRepoBranch,
  initialSelectedFile,
  onDeleteWorkspace,
  onOpenFilePicker,
  onSessionCreated,
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

  // Show overview tab by default for main repo, changes tab for workspaces
  const [activeTab, setActiveTab] = useState("overview");

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

  useEffect(() => {
    if (workingDirectory) {
      jjGetConflictedFiles(workingDirectory)
        .then(setConflictedFiles)
        .catch(() => setConflictedFiles([]));
    }
  }, [workingDirectory]);

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

  // Handle file selection from Cmd+P (or other external sources)
  useEffect(() => {
    if (initialSelectedFile) {
      setInitialSelectedFileForBrowser(initialSelectedFile);
      // Extract parent directory from file path
      const parentDir = initialSelectedFile.substring(0, initialSelectedFile.lastIndexOf('/'));
      setInitialExpandedDir(parentDir);
      setActiveTab("files");
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

        if (result.rebased) {
          if (result.has_conflicts) {
            addToast({
              title: "Workspace rebased with conflicts",
              description: `${result.conflicted_files.length} file(s) have conflicts. Resolve them in the Review tab.`,
              type: "warning",
            });
            // Update local conflicted files state
            setConflictedFiles(result.conflicted_files);
          } else if (!result.success) {
            addToast({
              title: "Rebase failed",
              description: result.message,
              type: "error",
            });
          }
          // Success case: no toast, status indicator shows progress
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
  }, [workspace?.id, workspace?.branch_name, targetBranch, effectiveRepoPath, addToast]);

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
            description: `${result.conflicted_files.length} file(s) have conflicts. Resolve them in the Review tab.`,
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

      if (result.rebased) {
        if (result.has_conflicts) {
          addToast({
            title: "Workspace rebased with conflicts",
            description: `${result.conflicted_files.length} file(s) have conflicts. Resolve them in the Review tab.`,
            type: "warning",
          });
          setConflictedFiles(result.conflicted_files);
        } else if (!result.success) {
          addToast({
            title: "Rebase failed",
            description: result.message,
            type: "error",
          });
        }
        // Success case: no toast, status indicator shows progress

        // Refresh changed files after rebase
        const files = await jjGetChangedFiles(workingDirectory);
        const parsed = parseJjChangedFiles(files);
        const map = new Map<string, ParsedFileChange>();
        for (const file of parsed) {
          const fullPath = `${workingDirectory}/${file.path}`;
          map.set(fullPath, file);
        }
        setChangedFiles(map);
      } else {
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
  }, [workspace, targetBranch, effectiveRepoPath, workingDirectory, addToast]);

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

        addToast({
          title: "Review sent to agent",
          description: "Created new agent session with code review",
          type: "success",
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
            <TabsTrigger value="changes" className="inline-flex items-center">
              <GitCompareArrows className="w-4 h-4 mr-1.5" />
              Review
            </TabsTrigger>
            <TabsTrigger value="files" className="inline-flex items-center">
              <FolderTree className="w-4 h-4 mr-1.5" />
              Files
            </TabsTrigger>
          </TabsList>
        </Tabs>
        {rebasing && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Rebasing...</span>
          </div>
        )}
      </div>
      <div className="flex-1 overflow-auto">
        {activeTab === "overview" ? (
          <div className="p-4 space-y-6">
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
        ) : activeTab === "changes" ? (
          <ChangesDiffViewer
            key={`changes-${workingDirectory}`}
            ref={changesDiffViewerRef}
            workspacePath={workingDirectory}
            initialSelectedFile={initialSelectedFile}
            conflictedFiles={conflictedFiles}
            onCreateAgentWithReview={handleCreateAgentWithReview}
          />
        ) : (
          <FileBrowser
            workspace={workspace}
            repoPath={effectiveRepoPath}
            initialSelectedFile={initialSelectedFileForBrowser}
            initialExpandedDir={initialExpandedDir}
            onCreateAgentWithComment={handleCreateAgentWithComment}
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
