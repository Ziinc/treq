import { useState, useEffect } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { Label } from "./ui/label";
import { getRepoSetting, setRepoSetting, gitListGitignoredFiles } from "../lib/api";
import { useToast } from "./ui/toast";

interface RepositorySettingsContentProps {
  repoPath: string;
  onClose?: () => void;
}

export const RepositorySettingsContent: React.FC<RepositorySettingsContentProps> = ({
  repoPath,
  onClose,
}) => {
  const [branchNamePattern, setBranchNamePattern] = useState("treq/{name}");
  const [postCreateCommand, setPostCreateCommand] = useState("");
  const [includedFiles, setIncludedFiles] = useState("");
  const [defaultModel, setDefaultModel] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [availableFiles, setAvailableFiles] = useState<string[]>([]);
  const { addToast } = useToast();

  // Load settings and available gitignored files when repo path changes
  useEffect(() => {
    if (repoPath) {
      setLoading(true);
      setError(null);
      
      Promise.all([
        getRepoSetting(repoPath, "branch_name_pattern"),
        getRepoSetting(repoPath, "post_create_command"),
        getRepoSetting(repoPath, "included_copy_files"),
        getRepoSetting(repoPath, "default_model"),
        gitListGitignoredFiles(repoPath),
      ])
        .then(([branchPattern, postCommand, includedPatterns, model, gitignored]) => {
          setBranchNamePattern(branchPattern || "treq/{name}");
          setPostCreateCommand(postCommand || "");
          setIncludedFiles(includedPatterns || "");
          setDefaultModel(model || "");
          setAvailableFiles(gitignored || []);
        })
        .catch((err) => {
          setError(`Failed to load settings: ${err}`);
          setBranchNamePattern("treq/{name}");
          setPostCreateCommand("");
          setIncludedFiles("");
          setDefaultModel("");
          setAvailableFiles([]);
        })
        .finally(() => {
          setLoading(false);
        });
    }
  }, [repoPath]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);

    try {
      await Promise.all([
        setRepoSetting(repoPath, "branch_name_pattern", branchNamePattern),
        setRepoSetting(repoPath, "post_create_command", postCreateCommand),
        setRepoSetting(repoPath, "included_copy_files", includedFiles),
        setRepoSetting(repoPath, "default_model", defaultModel),
      ]);
      addToast({
        title: "Settings saved",
        description: "Repository settings have been updated successfully.",
        type: "success",
      });
      onClose?.();
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
    if (includedFiles.trim()) {
      setIncludedFiles(includedFiles + "\n" + pattern);
    } else {
      setIncludedFiles(pattern);
    }
  };

  if (loading) {
    return (
      <div className="py-8 text-center text-muted-foreground">
        Loading settings...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <Label htmlFor="branch-name-pattern">
          Branch Name Pattern
        </Label>
        <Input
          id="branch-name-pattern"
          value={branchNamePattern}
          onChange={(e) => setBranchNamePattern(e.target.value)}
          placeholder="treq/{name}"
          className="mt-2"
        />
        <p className="text-xs text-muted-foreground mt-1">
          Pattern for auto-generating branch names. Use {"{name}"} as placeholder for the sanitized intent/title. Example: "treq/{"{name}"}" → "treq/add-dark-mode"
        </p>
      </div>

      <div>
        <Label htmlFor="post-create-command">
          Default Post-Create Command
        </Label>
        <Textarea
          id="post-create-command"
          value={postCreateCommand}
          onChange={(e) => setPostCreateCommand(e.target.value)}
          placeholder="e.g., npm install && npm run dev"
          rows={4}
          className="font-mono text-sm mt-2"
        />
        <p className="text-xs text-muted-foreground mt-1">
          This command will run in each new worktree after creation. Leave empty to skip.
        </p>
      </div>

      <div>
        <Label htmlFor="included-files">
          Included Files/Directories
        </Label>
        <Textarea
          id="included-files"
          value={includedFiles}
          onChange={(e) => setIncludedFiles(e.target.value)}
          placeholder="e.g., node_modules&#10;**/target/**&#10;.env"
          rows={6}
          className="font-mono text-sm mt-2"
        />
        <p className="text-xs text-muted-foreground mt-1">
          Glob patterns for .gitignored files/directories to copy to new worktrees (opt-in).
          One pattern per line. Supports ** for recursive matching. Leave empty to copy nothing.
        </p>
        {availableFiles.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-2">
            {availableFiles.map((file) => (
              <Button
                key={file}
                type="button"
                variant="outline"
                size="sm"
                onClick={() => addPattern(file)}
                className="text-xs h-7"
              >
                + {file}
              </Button>
            ))}
          </div>
        )}
        {availableFiles.length === 0 && !loading && (
          <p className="text-xs text-muted-foreground italic mt-2">
            No .gitignored files found in repository root
          </p>
        )}
      </div>

      <div>
        <Label htmlFor="repo-default-model">Claude Code Model</Label>
        <select
          id="repo-default-model"
          value={defaultModel}
          onChange={(e) => setDefaultModel(e.target.value)}
          className="mt-2 w-full px-3 py-2 border rounded-md bg-background text-foreground"
        >
          <option value="">Use Application Default</option>
          <option value="claude-sonnet-4-5-20250929">Sonnet 4.5</option>
          <option value="claude-3-5-sonnet-20241022">Sonnet 3.5</option>
          <option value="claude-opus-4-20250514">Opus 4</option>
          <option value="claude-3-7-sonnet-20250219">Sonnet 3.7</option>
        </select>
        <p className="text-xs text-muted-foreground mt-1">
          Default model for new Claude Code sessions in this repository (overrides application default)
        </p>
      </div>

      {error && (
        <div className="text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="flex justify-end gap-2 pt-4">
        {onClose && (
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
        )}
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "Save Settings"}
        </Button>
      </div>
    </div>
  );
};

