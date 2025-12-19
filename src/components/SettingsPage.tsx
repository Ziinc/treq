import { useState, useEffect } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "./ui/tabs";
import { RepositorySettingsContent } from "./RepositorySettingsContent";
import { useTheme } from "../hooks/useTheme";
import { useTerminalSettings } from "../hooks/useTerminalSettings";
import { useDiffSettings } from "../hooks/useDiffSettings";
import { useToast } from "./ui/toast";
import { getSetting, setSetting } from "../lib/api";
import { Settings, FolderGit2, GitBranch } from "lucide-react";

type TabValue = "application" | "repository";

interface SettingsPageProps {
  repoPath: string;
  onRepoPathChange: (path: string) => void;
  initialTab?: TabValue;
  onRefresh?: () => void;
  onClose: () => void;
  repoName?: string;
  currentBranch?: string | null;
}

export const SettingsPage: React.FC<SettingsPageProps> = ({
  repoPath,
  onRepoPathChange,
  initialTab = "repository",
  onRefresh,
  onClose,
  repoName,
  currentBranch,
}) => {
  const [currentTab, setCurrentTab] = useState<TabValue>(initialTab);
  const [defaultModel, setDefaultModel] = useState<string>("");
  const [originalFontSize, setOriginalFontSize] = useState<number | null>(null);
  const [localFontSize, setLocalFontSize] = useState<number>(12);

  const { theme, setTheme } = useTheme();
  const { fontSize, setFontSize } = useTerminalSettings();
  const { fontSize: diffFontSize, setFontSize: setDiffFontSize } = useDiffSettings();
  const { addToast } = useToast();

  // Load settings on mount
  useEffect(() => {
    getSetting("default_model").then((model: string | null) => {
      if (model) setDefaultModel(model);
    });
    // Store original font size and initialize local font size
    setOriginalFontSize(fontSize);
    setLocalFontSize(fontSize);
  }, []);

  const handleSaveApplicationSettings = async () => {
    try {
      await setSetting("default_model", defaultModel);

      // Save font size settings
      await setFontSize(localFontSize);
      await setDiffFontSize(localFontSize);

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

  return (
    <>
      <div className="h-full flex flex-col bg-background">
        {/* Header */}
        <div className="border-b border-border px-6 py-2 flex items-center justify-between">
          <h1 className="text-lg font-semibold">Settings</h1>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onClose}
            >
              Close
            </Button>
            <Button
              size="sm"
              onClick={handleSaveApplicationSettings}
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
                      <Label htmlFor="font-size">Font Size</Label>
                      <Input
                        id="font-size"
                        type="number"
                        min={8}
                        max={32}
                        value={localFontSize}
                        onChange={(e) => {
                          const value = parseInt(e.target.value, 10);
                          if (!isNaN(value) && value >= 8 && value <= 32) {
                            setLocalFontSize(value);
                          }
                        }}
                        placeholder="12"
                        className="mt-2"
                      />
                      {originalFontSize !== null && localFontSize !== originalFontSize && (
                        <div className="mt-3 p-3 border rounded-md bg-muted/30">
                          <div className="text-sm text-muted-foreground mb-2">Preview:</div>
                          <div className="space-y-2">
                            <div style={{ fontSize: `${originalFontSize}px` }} className="font-mono text-muted-foreground">
                              Original ({originalFontSize}px): The quick brown fox jumps over the lazy dog
                            </div>
                            <div style={{ fontSize: `${localFontSize}px` }} className="font-mono">
                              New ({localFontSize}px): The quick brown fox jumps over the lazy dog
                            </div>
                          </div>
                        </div>
                      )}
                      <p className="text-sm text-muted-foreground mt-2">
                        Font size for terminal, code diff display, and overview files (8-32)
                      </p>
                    </div>

                    <div>
                      <Label htmlFor="default-model">Claude Code Model</Label>
                      <select
                        id="default-model"
                        value={defaultModel}
                        onChange={(e) => setDefaultModel(e.target.value)}
                        className="mt-2 w-full px-3 py-2 border rounded-md bg-background text-foreground"
                      >
                        <option value="">Default</option>
                        <option value="sonnet">Sonnet</option>
                        <option value="opus">Opus</option>
                        <option value="haiku">Haiku</option>
                        <option value="sonnet[1m]">Sonnet (1M)</option>
                        <option value="opusplan">Opus Plan</option>
                      </select>
                      <p className="text-sm text-muted-foreground mt-1">
                        Default model for new Claude Code sessions
                      </p>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="repository">
                  {repoPath ? (
                    <div className="space-y-6">
                      {/* Repository Info Section */}
                      {currentBranch && (
                        <div className="space-y-3 text-sm border-b border-border pb-6">
                          <div className="space-y-1">
                            <div className="text-sm text-muted-foreground">Current Branch</div>
                            <div className="flex items-center gap-2 text-sm">
                              <GitBranch className="w-3 h-3" />
                              <code>{currentBranch}</code>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Repository Settings */}
                      <RepositorySettingsContent
                        repoPath={repoPath}
                        onClose={onClose}
                      />
                    </div>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      Set repository in Application tab
                    </div>
                  )}
                </TabsContent>
              </div>
            </Tabs>
          </div>
        </div>
      </div>

      {/* Note: Git Init Dialog removed - JJ doesn't need this */}
    </>
  );
};
