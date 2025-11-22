import { useState, useEffect } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "./ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { RepositorySettingsContent } from "./RepositorySettingsContent";
import { useTheme } from "../hooks/useTheme";
import { useTerminalSettings } from "../hooks/useTerminalSettings";
import { useToast } from "./ui/toast";
import { getSetting, setSetting, selectFolder, isGitRepository, gitInit, BranchInfo } from "../lib/api";
import { Settings, FolderGit2, FolderOpen, GitBranch, HardDrive } from "lucide-react";
import { formatBytes } from "../lib/utils";

type TabValue = "application" | "repository";

interface SettingsPageProps {
  repoPath: string;
  onRepoPathChange: (path: string) => void;
  initialTab?: TabValue;
  onRefresh?: () => void;
  onClose: () => void;
  repoName?: string;
  mainRepoSize?: number | null;
  currentBranch?: string | null;
  mainBranchInfo?: BranchInfo | null;
}

export const SettingsPage: React.FC<SettingsPageProps> = ({
  repoPath,
  onRepoPathChange,
  initialTab = "repository",
  onRefresh,
  onClose,
  repoName,
  mainRepoSize,
  currentBranch,
  mainBranchInfo,
}) => {
  const [currentTab, setCurrentTab] = useState<TabValue>(initialTab);
  const [localRepoPath, setLocalRepoPath] = useState(repoPath);
  const [showGitInitDialog, setShowGitInitDialog] = useState(false);
  const [pendingRepoPath, setPendingRepoPath] = useState("");

  const { theme, setTheme } = useTheme();
  const { fontSize, setFontSize } = useTerminalSettings();
  const { addToast } = useToast();

  // Track if there are unsaved changes
  const hasChanges = localRepoPath !== repoPath;

  // Load settings on mount
  useEffect(() => {
    setLocalRepoPath(repoPath);
  }, [repoPath]);

  const handleCancelChanges = () => {
    setLocalRepoPath(repoPath);
  };

  const handleSaveApplicationSettings = async () => {
    try {
      await setSetting("repo_path", localRepoPath);

      onRepoPathChange(localRepoPath);
      onRefresh?.();

      addToast({
        title: "Settings Saved",
        description: "Application settings updated successfully",
        type: "success",
      });
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
      <div className="h-full flex flex-col bg-background">
        {/* Header */}
        <div className="border-b border-border px-6 py-4 flex items-center justify-between">
          <h1 className="text-lg font-semibold">Settings</h1>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleCancelChanges}
              disabled={!hasChanges}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSaveApplicationSettings}
              disabled={!hasChanges}
            >
              Save Settings
            </Button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto">
          <div className="max-w-4xl mx-auto p-6">
            <Tabs
              value={currentTab}
              onValueChange={(value) => setCurrentTab(value as TabValue)}
              orientation="vertical"
              className="flex gap-8"
            >
              {/* Left sidebar with vertical tabs */}
              <TabsList className="w-48 flex-shrink-0 sticky top-0">
                <TabsTrigger value="repository">
                  <FolderGit2 className="w-4 h-4" />
                  Repository
                </TabsTrigger>
                <TabsTrigger value="application">
                  <Settings className="w-4 h-4" />
                  Application
                </TabsTrigger>
              </TabsList>

              {/* Right content area */}
              <div className="flex-1 min-w-0">
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

                      {/* Repository Settings */}
                      <RepositorySettingsContent
                        repoPath={repoPath}
                        onClose={onClose}
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
          </div>
        </div>
      </div>

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
