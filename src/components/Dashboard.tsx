import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { listen } from "@tauri-apps/api/event";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { WorktreeCard } from "./WorktreeCard";
import { CreateWorktreeDialog } from "./CreateWorktreeDialog";
import { RepositorySettings } from "./RepositorySettings";
import { Terminal } from "./Terminal";
import { DiffViewer } from "./DiffViewer";
import { EditorLauncher } from "./EditorLauncher";
import { PlanningTerminal } from "./PlanningTerminal";
import { WorktreeEditSession } from "./WorktreeEditSession";
import { PlanSection } from "../types/planning";
import { sanitizePlanTitleToBranchName } from "../lib/utils";
import { useToast } from "./ui/toast";
import { useKeyboardShortcut } from "../hooks/useKeyboard";
import { useTheme } from "../hooks/useTheme";
import { useTerminalSettings } from "../hooks/useTerminalSettings";
import {
  getWorktrees,
  deleteWorktreeFromDb,
  gitRemoveWorktree,
  getSetting,
  setSetting,
  gitGetCurrentBranch,
  gitGetStatus,
  gitGetBranchInfo,
  calculateDirectorySize,
  Worktree,
  GitStatus,
  BranchInfo,
  selectFolder,
  isGitRepository,
  gitInit,
  detectAvailableEditors,
  gitCreateWorktree,
  addWorktreeToDb,
  getRepoSetting,
  gitExecutePostCreateCommand,
  ptyCreateSession,
  ptyWrite,
} from "../lib/api";
import { formatBytes } from "../lib/utils";
import { Plus, Settings, X, RefreshCw, Search, FolderOpen, Terminal as TerminalIcon, GitBranch, FolderGit2, ArrowUp, ArrowDown, HardDrive } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "./ui/card";

type ViewMode = "dashboard" | "terminal" | "diff" | "planning" | "worktree-edit";

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
  const [showSettings, setShowSettings] = useState(false);
  const [showRepoSettings, setShowRepoSettings] = useState(false);
  const [showEditorLauncher, setShowEditorLauncher] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showGitInitDialog, setShowGitInitDialog] = useState(false);
  const [pendingRepoPath, setPendingRepoPath] = useState("");
  const [availableEditors, setAvailableEditors] = useState<string[]>([]);
  const [preferredEditor, setPreferredEditor] = useState<string>("");
  
  const queryClient = useQueryClient();
  const { addToast } = useToast();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const { theme, setTheme } = useTheme();
  const { fontSize, setFontSize } = useTerminalSettings();

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

  useKeyboardShortcut(",", true, () => {
    if (viewMode === "dashboard") {
      setShowSettings(true);
    }
  });

  useKeyboardShortcut("Escape", false, () => {
    if (showCreateDialog) setShowCreateDialog(false);
    if (showSettings) setShowSettings(false);
    if (showEditorLauncher) setShowEditorLauncher(false);
  });

  // Load saved repo path, detect editors, and load preferred editor
  useEffect(() => {
    getSetting("repo_path").then((path) => {
      if (path) setRepoPath(path);
    });

    // Detect available editors
    detectAvailableEditors().then((editors) => {
      setAvailableEditors(editors);
    }).catch((error) => {
      console.error("Failed to detect editors:", error);
    });

    // Load preferred editor
    getSetting("preferred_editor").then((editor) => {
      if (editor) setPreferredEditor(editor);
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

  // Filter worktrees based on search query
  const filteredWorktrees = worktrees.filter((wt) =>
    wt.branch_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    wt.worktree_path.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleSaveRepoPath = async () => {
    await setSetting("repo_path", repoPath);
    if (preferredEditor) {
      await setSetting("preferred_editor", preferredEditor);
    }
    refetch();
    setShowSettings(false);
    addToast({
      title: "Settings Saved",
      description: "Settings updated successfully",
      type: "success",
    });
  };

  const handleBrowseRepoPath = async () => {
    try {
      const selected = await selectFolder();
      if (!selected) return;

      const isRepo = await isGitRepository(selected);
      if (isRepo) {
        setRepoPath(selected);
        await setSetting("repo_path", selected);
        refetch();
        addToast({
          title: "Repository Selected",
          description: "Git repository configured successfully",
          type: "success",
        });
      } else {
        setPendingRepoPath(selected);
        setShowGitInitDialog(true);
      }
    } catch (error) {
      addToast({
        title: "Error",
        description: error as string,
        type: "error",
      });
    }
  };

  const handleGitInit = async () => {
    try {
      await gitInit(pendingRepoPath);
      setRepoPath(pendingRepoPath);
      await setSetting("repo_path", pendingRepoPath);
      setShowGitInitDialog(false);
      refetch();
      addToast({
        title: "Repository Initialized",
        description: "Git repository created and configured successfully",
        type: "success",
      });
    } catch (error) {
      addToast({
        title: "Initialization Failed",
        description: error as string,
        type: "error",
      });
    }
  };

  const handleOpenTerminal = (worktree: Worktree) => {
    setSelectedWorktree(worktree);
    setViewMode("terminal");
  };

  const handleOpenDiff = (worktree: Worktree) => {
    setSelectedWorktree(worktree);
    setViewMode("diff");
  };

  const handleOpenEditor = (worktree: Worktree) => {
    setSelectedWorktree(worktree);
    setShowEditorLauncher(true);
  };

  const handleDelete = (worktree: Worktree) => {
    if (confirm(`Delete worktree ${worktree.branch_name}?`)) {
      deleteWorktree.mutate(worktree);
    }
  };

  const handleExecutePlan = async (section: PlanSection) => {
    try {
      // Generate branch name from plan title
      const branchName = sanitizePlanTitleToBranchName(section.title);
      
      addToast({
        title: "Creating worktree...",
        description: `Creating worktree for ${branchName}`,
        type: "info",
      });

      // Create the worktree
      const worktreePath = await gitCreateWorktree(repoPath, branchName, true);

      // Add to database
      const worktreeId = await addWorktreeToDb(repoPath, worktreePath, branchName);

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
      const initialCommand = `claude --permission-mode code`;
      
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

  if (viewMode === "terminal" && selectedWorktree) {
    return (
      <div className="h-screen flex flex-col">
        <div className="border-b p-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">
            Terminal - {selectedWorktree.branch_name}
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
          <Terminal
            sessionId={`worktree-${selectedWorktree.id}`}
            workingDir={selectedWorktree.worktree_path}
          />
        </div>
      </div>
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
            onClick={() => setShowSettings(true)}
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
            <Button variant="outline" onClick={() => setShowSettings(true)}>
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
                    {currentBranch && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <GitBranch className="w-4 h-4" />
                        <code className="bg-secondary px-2 py-1 rounded">{currentBranch}</code>
                      </div>
                    )}
                    <div className="text-xs text-muted-foreground truncate" title={repoPath}>
                      {repoPath}
                    </div>
                  </div>

                  {/* Git Status */}
                  {mainBranchInfo && (
                    <div className="flex flex-wrap gap-2 text-xs">
                      {mainBranchInfo.upstream && (
                        <>
                          {mainBranchInfo.ahead > 0 && (
                            <div className="flex items-center gap-1 px-2 py-1 bg-blue-500/10 text-blue-500 rounded">
                              <ArrowUp className="w-3 h-3" />
                              {mainBranchInfo.ahead}
                            </div>
                          )}
                          {mainBranchInfo.behind > 0 && (
                            <div className="flex items-center gap-1 px-2 py-1 bg-orange-500/10 text-orange-500 rounded">
                              <ArrowDown className="w-3 h-3" />
                              {mainBranchInfo.behind}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}

                  {mainRepoStatus && (
                    <div className="flex flex-wrap gap-2 text-xs">
                      {mainRepoStatus.modified > 0 && (
                        <div className="px-2 py-1 bg-yellow-500/10 text-yellow-500 rounded">
                          {mainRepoStatus.modified} modified
                        </div>
                      )}
                      {mainRepoStatus.added > 0 && (
                        <div className="px-2 py-1 bg-green-500/10 text-green-500 rounded">
                          {mainRepoStatus.added} added
                        </div>
                      )}
                      {mainRepoStatus.deleted > 0 && (
                        <div className="px-2 py-1 bg-red-500/10 text-red-500 rounded">
                          {mainRepoStatus.deleted} deleted
                        </div>
                      )}
                      {mainRepoStatus.untracked > 0 && (
                        <div className="px-2 py-1 bg-gray-500/10 text-gray-500 rounded">
                          {mainRepoStatus.untracked} untracked
                        </div>
                      )}
                    </div>
                  )}

                  {/* Repository Size */}
                  {mainRepoSize !== null && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <HardDrive className="w-4 h-4" />
                      <span>{formatBytes(mainRepoSize)}</span>
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
                      onClick={() => setShowRepoSettings(true)}
                    >
                      <Settings className="w-4 h-4 mr-2" />
                      Repository Settings
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
                          onOpenTerminal={handleOpenTerminal}
                          onOpenDiff={handleOpenDiff}
                          onOpenEditor={handleOpenEditor}
                          onDelete={handleDelete}
                          availableEditors={availableEditors}
                          preferredEditor={preferredEditor}
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

      <Dialog open={showSettings} onOpenChange={setShowSettings}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Settings</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Repository Path</label>
              <div className="flex gap-2 mt-2">
                <Input
                  value={repoPath}
                  onChange={(e) => setRepoPath(e.target.value)}
                  placeholder="/path/to/your/repo"
                  className="flex-1"
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleBrowseRepoPath}
                >
                  <FolderOpen className="w-4 h-4" />
                </Button>
              </div>
            </div>
            <div>
              <label className="text-sm font-medium">Theme</label>
              <select
                value={theme}
                onChange={(e) => setTheme(e.target.value as "system" | "light" | "dark")}
                className="mt-2 w-full px-3 py-2 border rounded-md bg-background text-foreground"
              >
                <option value="system">System</option>
                <option value="light">Light</option>
                <option value="dark">Dark</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-medium">Terminal Font Size</label>
              <Input
                type="number"
                min={8}
                max={32}
                value={fontSize}
                onChange={(e) => {
                  const value = parseInt(e.target.value, 10);
                  if (!isNaN(value) && value >= 8 && value <= 32) {
                    setFontSize(value).catch((error) => {
                      addToast({
                        title: "Error",
                        description: error.message,
                        type: "error",
                      });
                    });
                  }
                }}
                placeholder="14"
                className="mt-2"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Font size for terminal (8-32)
              </p>
            </div>
            <div>
              <label className="text-sm font-medium">Preferred Editor</label>
              <select
                value={preferredEditor}
                onChange={(e) => setPreferredEditor(e.target.value)}
                className="mt-2 w-full px-3 py-2 border rounded-md bg-background text-foreground"
                disabled={availableEditors.length === 0}
              >
                <option value="">Select an editor</option>
                {availableEditors.map((editor) => (
                  <option key={editor} value={editor}>
                    {editor === "cursor" ? "Cursor" : editor === "code" ? "VS Code" : editor === "code-insiders" ? "VS Code Insiders" : editor}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground mt-1">
                {availableEditors.length === 0 
                  ? "No editors detected. Install Cursor, VS Code, or VS Code Insiders."
                  : "Default editor to launch from worktree cards"}
              </p>
            </div>
            <Button onClick={handleSaveRepoPath}>Save</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showGitInitDialog} onOpenChange={setShowGitInitDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Initialize Git Repository</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              This directory is not a git repository. Would you like to initialize it?
            </p>
            <p className="text-sm font-mono bg-muted p-2 rounded">
              {pendingRepoPath}
            </p>
            <div className="flex gap-2 justify-end">
              <Button
                variant="outline"
                onClick={() => setShowGitInitDialog(false)}
              >
                Cancel
              </Button>
              <Button onClick={handleGitInit}>
                Initialize Git Repository
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {selectedWorktree && (
        <EditorLauncher
          open={showEditorLauncher}
          onOpenChange={setShowEditorLauncher}
          worktree={selectedWorktree}
        />
      )}

      {repoPath && (
        <RepositorySettings
          open={showRepoSettings}
          onOpenChange={setShowRepoSettings}
          repoPath={repoPath}
        />
      )}
    </div>
  );
};

