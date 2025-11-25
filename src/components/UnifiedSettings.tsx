import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "./ui/tabs";
import { RepositorySettingsContent } from "./RepositorySettingsContent";
import { useTheme } from "../hooks/useTheme";
import { useTerminalSettings } from "../hooks/useTerminalSettings";
import { useDiffSettings } from "../hooks/useDiffSettings";
import { useToast } from "./ui/toast";
import { getSetting, setSetting, selectFolder, isGitRepository, gitInit, BranchInfo } from "../lib/api";
import { Settings, FolderGit2, FolderOpen, GitBranch, HardDrive } from "lucide-react";
import { formatBytes } from "../lib/utils";

type TabValue = "application" | "repository";

interface UnifiedSettingsProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  repoPath: string;
  onRepoPathChange: (path: string) => void;
  initialTab?: TabValue;
  onRefresh?: () => void;
  repoName?: string;
  mainRepoSize?: number | null;
  currentBranch?: string | null;
  mainBranchInfo?: BranchInfo | null;
}

export const UnifiedSettings: React.FC<UnifiedSettingsProps> = ({
  open,
  onOpenChange,
  repoPath,
  onRepoPathChange,
  initialTab = "application",
  onRefresh,
  repoName,
  mainRepoSize,
  currentBranch,
  mainBranchInfo,
}) => {
  const [currentTab, setCurrentTab] = useState<TabValue>(initialTab);
  const [localRepoPath, setLocalRepoPath] = useState(repoPath);
  const [defaultEditor, setDefaultEditor] = useState<string>("cursor");
  const [showGitInitDialog, setShowGitInitDialog] = useState(false);
  const [pendingRepoPath, setPendingRepoPath] = useState("");
  
  const { theme, setTheme } = useTheme();
  const { fontSize, setFontSize } = useTerminalSettings();
  const { fontSize: diffFontSize, setFontSize: setDiffFontSize } = useDiffSettings();
  const { addToast } = useToast();

  // Load settings when dialog opens
  useEffect(() => {
    if (open) {
      setCurrentTab(initialTab);
      setLocalRepoPath(repoPath);
      
      getSetting("default_editor").then((editor) => {
        if (editor) setDefaultEditor(editor);
      });
    }
  }, [open, repoPath, initialTab]);

  const handleSaveApplicationSettings = async () => {
    try {
      await setSetting("repo_path", localRepoPath);
      await setSetting("default_editor", defaultEditor);
      
      onRepoPathChange(localRepoPath);
      onRefresh?.();
      
      addToast({
        title: "Settings Saved",
        description: "Application settings updated successfully",
        type: "success",
      });
      
      onOpenChange(false);
    } catch (error) {
      addToast({
        title: "Error",
        description: error instanceof Error ? error.message : String(error),
        type: "error",
      });
    }
  };

  const handleBrowseRepoPath = async () => {
    try {
      const selected = await selectFolder();
      if (!selected) return;

      const isRepo = await isGitRepository(selected);
      if (isRepo) {
        setLocalRepoPath(selected);
        await setSetting("repo_path", selected);
        onRepoPathChange(selected);
        onRefresh?.();
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
      setLocalRepoPath(pendingRepoPath);
      await setSetting("repo_path", pendingRepoPath);
      onRepoPathChange(pendingRepoPath);
      setShowGitInitDialog(false);
      onRefresh?.();
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

  return (
    <>
      <Dialog open={open && !showGitInitDialog} onOpenChange={onOpenChange}>
        <DialogContent className="w-[800px] max-w-[800px] max-h-[80vh] overflow-hidden p-0">
          <DialogHeader className="px-6 pt-6">
            <DialogTitle>Settings</DialogTitle>
          </DialogHeader>
          
          <Tabs
            value={currentTab}
            onValueChange={(value) => setCurrentTab(value as TabValue)}
            orientation="vertical"
            className="flex gap-6 px-6 pb-6"
          >
            {/* Left sidebar with vertical tabs */}
            <TabsList className="w-48 flex-shrink-0">
              <TabsTrigger value="application">
                <Settings className="w-4 h-4" />
                Application
              </TabsTrigger>
              <TabsTrigger value="repository">
                <FolderGit2 className="w-4 h-4" />
                Repository
              </TabsTrigger>
            </TabsList>

            {/* Right content area */}
            <div className="flex-1 min-w-0 overflow-y-auto max-h-[calc(80vh-8rem)]">
              <TabsContent value="application">
                <div className="space-y-6">
                  <div>
                    <Label htmlFor="repo-path">Repository Path</Label>
                    <div className="flex gap-2 mt-2">
                      <Input
                        id="repo-path"
                        value={localRepoPath}
                        onChange={(e) => setLocalRepoPath(e.target.value)}
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
                    <Label htmlFor="theme">Theme</Label>
                    <select
                      id="theme"
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
                    <Label htmlFor="font-size">Terminal Font Size</Label>
                    <Input
                      id="font-size"
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
                    <Label htmlFor="diff-font-size">Diff Viewer Font Size</Label>
                    <Input
                      id="diff-font-size"
                      type="number"
                      min={8}
                      max={16}
                      value={diffFontSize}
                      onChange={(e) => {
                        const value = parseInt(e.target.value, 10);
                        if (!isNaN(value) && value >= 8 && value <= 16) {
                          setDiffFontSize(value).catch((error) => {
                            addToast({
                              title: "Error",
                              description: error.message,
                              type: "error",
                            });
                          });
                        }
                      }}
                      placeholder="11"
                      className="mt-2"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Font size for code diff display (8-16, default: 11)
                    </p>
                  </div>

                  <div>
                    <Label htmlFor="default-editor">Default Editor</Label>
                    <select
                      id="default-editor"
                      value={defaultEditor}
                      onChange={(e) => setDefaultEditor(e.target.value)}
                      className="mt-2 w-full px-3 py-2 border rounded-md bg-background text-foreground"
                    >
                      <option value="vscode">VS Code</option>
                      <option value="cursor">Cursor</option>
                      <option value="zed">Zed</option>
                    </select>
                    <p className="text-xs text-muted-foreground mt-1">
                      Default editor for opening worktrees
                    </p>
                  </div>

                  <div className="flex justify-end gap-2 pt-4">
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                      Cancel
                    </Button>
                    <Button onClick={handleSaveApplicationSettings}>
                      Save Settings
                    </Button>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="repository">
                {repoPath ? (
                  <div className="space-y-6">
                    {/* Repository Info Section */}
                    <div className="space-y-3 text-sm border-b border-border pb-6">
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
                          {mainRepoSize !== null && mainRepoSize !== undefined ? formatBytes(mainRepoSize) : "Calculating..."}
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

                    {/* Repository Settings */}
                    <RepositorySettingsContent
                      repoPath={repoPath}
                      onClose={() => onOpenChange(false)}
                    />
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    Please configure a repository path in the Application tab first.
                  </div>
                )}
              </TabsContent>
            </div>
          </Tabs>
        </DialogContent>
      </Dialog>

      {/* Git Init Dialog */}
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
    </>
  );
};

