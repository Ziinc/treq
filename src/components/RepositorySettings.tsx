import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
import { Label } from "./ui/label";
import { getRepoSetting, setRepoSetting } from "../lib/api";
import { useToast } from "./ui/toast";
import { ArrowLeft } from "lucide-react";

interface RepositorySettingsProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  repoPath: string;
}

export const RepositorySettings: React.FC<RepositorySettingsProps> = ({
  open,
  onOpenChange,
  repoPath,
}) => {
  const [postCreateCommand, setPostCreateCommand] = useState("");
  const [excludedDirs, setExcludedDirs] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { addToast } = useToast();

  // Load settings when dialog opens
  useEffect(() => {
    if (open && repoPath) {
      setLoading(true);
      setError(null);
      
      Promise.all([
        getRepoSetting(repoPath, "post_create_command"),
        getRepoSetting(repoPath, "excluded_copy_dirs"),
      ])
        .then(([postCommand, excludedPatterns]) => {
          setPostCreateCommand(postCommand || "");
          setExcludedDirs(excludedPatterns || "");
        })
        .catch((err) => {
          setError(`Failed to load settings: ${err}`);
          setPostCreateCommand("");
          setExcludedDirs("");
        })
        .finally(() => {
          setLoading(false);
        });
    }
  }, [open, repoPath]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);

    try {
      await Promise.all([
        setRepoSetting(repoPath, "post_create_command", postCreateCommand),
        setRepoSetting(repoPath, "excluded_copy_dirs", excludedDirs),
      ]);
      addToast({
        title: "Settings saved",
        description: "Repository settings have been updated successfully.",
        type: "success",
      });
      onOpenChange(false);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      setError(`Failed to save settings: ${errorMsg}`);
      addToast({
        title: "Error",
        description: `Failed to save settings: ${errorMsg}`,
        type: "error",
      });
    } finally {
      setSaving(false);
    }
  };

  const addPattern = (pattern: string) => {
    if (excludedDirs.trim()) {
      setExcludedDirs(excludedDirs + "\n" + pattern);
    } else {
      setExcludedDirs(pattern);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]" onKeyDown={handleKeyDown}>
        <DialogHeader>
          <div className="flex items-center gap-2 mb-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onOpenChange(false)}
              className="h-8 w-8 p-0"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <DialogTitle className="m-0">Repository Settings</DialogTitle>
          </div>
          <DialogDescription>
            Configure settings for this repository
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-8 text-center text-muted-foreground">
            Loading settings...
          </div>
        ) : (
          <>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="post-create-command">
                  Default Post-Create Command
                </Label>
                <Textarea
                  id="post-create-command"
                  value={postCreateCommand}
                  onChange={(e) => setPostCreateCommand(e.target.value)}
                  placeholder="e.g., npm install && npm run dev"
                  rows={4}
                  className="font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  This command will run in each new worktree after creation. Leave empty to skip.
                </p>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="excluded-dirs">
                  Excluded Directories
                </Label>
                <Textarea
                  id="excluded-dirs"
                  value={excludedDirs}
                  onChange={(e) => setExcludedDirs(e.target.value)}
                  placeholder="e.g., node_modules&#10;**/target/**&#10;.venv"
                  rows={6}
                  className="font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  Glob patterns for directories to exclude when copying .gitignored files to new worktrees.
                  One pattern per line. Supports ** for recursive matching.
                </p>
                <div className="flex flex-wrap gap-2 mt-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => addPattern("node_modules")}
                    className="text-xs h-7"
                  >
                    + node_modules
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => addPattern("**/target/**")}
                    className="text-xs h-7"
                  >
                    + target
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => addPattern(".venv\nvenv")}
                    className="text-xs h-7"
                  >
                    + .venv/venv
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => addPattern("**/dist/**\n**/build/**")}
                    className="text-xs h-7"
                  >
                    + dist/build
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => addPattern("**/.next/**")}
                    className="text-xs h-7"
                  >
                    + .next
                  </Button>
                </div>
              </div>

              {error && (
                <div className="text-sm text-destructive">
                  {error}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? "Saving..." : "Save Settings"}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};

