import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { Label } from "./ui/label";
import { useToast } from "./ui/toast";
import { applyBranchNamePattern, sanitizeForBranchName } from "../lib/utils";
import { 
  gitCreateWorktree, 
  addWorktreeToDb, 
  getRepoSetting, 
  gitExecutePostCreateCommand
} from "../lib/api";

interface CreateWorktreeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  repoPath: string;
  onSuccess: () => void;
}

export const CreateWorktreeDialog: React.FC<CreateWorktreeDialogProps> = ({
  open,
  onOpenChange,
  repoPath,
  onSuccess,
}) => {
  const [intent, setIntent] = useState("");
  const [branchName, setBranchName] = useState("");
  const [branchPattern, setBranchPattern] = useState("treq/{name}");
  const [isEditingBranch, setIsEditingBranch] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const { addToast } = useToast();

  // Load branch pattern from repository settings
  useEffect(() => {
    if (open && repoPath) {
      getRepoSetting(repoPath, "branch_name_pattern")
        .then((pattern) => {
          setBranchPattern(pattern || "treq/{name}");
        })
        .catch((err) => {
          console.error("Failed to load branch pattern:", err);
          setBranchPattern("treq/{name}");
        });
    }
  }, [open, repoPath]);

  // Auto-generate branch name from intent
  useEffect(() => {
    if (!isEditingBranch && intent.trim()) {
      const generatedBranch = applyBranchNamePattern(branchPattern, intent);
      setBranchName(generatedBranch);
    } else if (!isEditingBranch && !intent.trim()) {
      setBranchName("");
    }
  }, [intent, branchPattern, isEditingBranch]);

  // Get preview of worktree path
  const getWorktreePath = (): string => {
    if (!branchName.trim()) return `${repoPath}/.treq/worktrees/branch-name`;
    const pathSafeName = sanitizeForBranchName(branchName.split('/').pop() || branchName);
    return `${repoPath}/.treq/worktrees/${pathSafeName}`;
  };

  const handleCreate = async () => {
    if (!intent.trim()) {
      setError("Intent/description is required");
      return;
    }

    if (!branchName.trim()) {
      setError("Branch name is required");
      return;
    }

    setLoading(true);
    setError("");

    try {
      // Create the worktree (auto-generates path)
      const worktreePath = await gitCreateWorktree(repoPath, branchName, true);

      // Prepare metadata with intent
      const metadata = JSON.stringify({
        intent: intent.trim()
      });

      // Add to database with metadata
      await addWorktreeToDb(repoPath, worktreePath, branchName, metadata);

      // Get and execute post-create command if configured
      const postCreateCmd = await getRepoSetting(repoPath, "post_create_command");
      if (postCreateCmd && postCreateCmd.trim()) {
        try {
          addToast({
            title: "Running post-create command...",
            description: "Executing setup command in worktree",
            type: "info",
          });

          const output = await gitExecutePostCreateCommand(worktreePath, postCreateCmd);
          console.log("Post-create command output:", output);
          
          addToast({
            title: "Worktree created successfully",
            description: "Post-create command executed successfully",
            type: "success",
          });
        } catch (cmdError) {
          console.error("Post-create command failed:", cmdError);
          addToast({
            title: "Worktree created",
            description: `Post-create command failed: ${cmdError}`,
            type: "warning",
          });
        }
      } else {
        addToast({
          title: "Worktree created successfully",
          description: `Created worktree for branch ${branchName}`,
          type: "success",
        });
      }

      // Reset form
      setIntent("");
      setBranchName("");
      setIsEditingBranch(false);
      
      onSuccess();
      onOpenChange(false);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      setError(errorMsg);
      addToast({
        title: "Failed to create worktree",
        description: errorMsg,
        type: "error",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Create New Worktree</DialogTitle>
          <DialogDescription>
            Create a new git worktree for parallel development
          </DialogDescription>
        </DialogHeader>
        
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="intent">Intent / Description</Label>
            <Textarea
              id="intent"
              value={intent}
              onChange={(e) => setIntent(e.target.value)}
              placeholder="What do you want to work on? (e.g., Add dark mode toggle to settings)"
              rows={3}
              className="resize-none"
            />
            <p className="text-xs text-muted-foreground">
              Describe what you plan to implement in this worktree
            </p>
          </div>

          <div className="grid gap-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="branch">Branch Name (auto-generated)</Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 text-xs"
                onClick={() => setIsEditingBranch(!isEditingBranch)}
              >
                {isEditingBranch ? "Auto" : "Edit"}
              </Button>
            </div>
            <Input
              id="branch"
              value={branchName}
              onChange={(e) => {
                setBranchName(e.target.value);
                setIsEditingBranch(true);
              }}
              placeholder={branchPattern.replace("{name}", "example")}
              readOnly={!isEditingBranch}
              className={!isEditingBranch ? "bg-secondary cursor-default" : ""}
            />
            <p className="text-xs text-muted-foreground">
              Pattern: {branchPattern} (configure in Repository Settings)
            </p>
          </div>

          <div className="grid gap-2">
            <Label>Worktree Path (preview)</Label>
            <div className="bg-secondary p-3 rounded-md text-sm font-mono break-all text-muted-foreground">
              {getWorktreePath()}
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
            disabled={loading}
          >
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={loading}>
            {loading ? "Creating..." : "Create Worktree"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

