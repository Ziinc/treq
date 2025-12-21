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
import { applyBranchNamePattern } from "../lib/utils";
import {
  createWorkspace,
  getRepoSetting
} from "../lib/api";

interface CreateWorkspaceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  repoPath: string;
  onSuccess: () => void;
  sourceBranch?: string;
}

export const CreateWorkspaceDialog: React.FC<CreateWorkspaceDialogProps> = ({
  open,
  onOpenChange,
  repoPath,
  onSuccess,
  sourceBranch,
}) => {
  const [intent, setIntent] = useState("");
  const [branchName, setBranchName] = useState("");
  const [branchPattern, setBranchPattern] = useState("treq/{name}");
  const [isEditingBranch, setIsEditingBranch] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const { addToast } = useToast();

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      console.log("[CreateWorkspaceDialog] Resetting form (dialog opened)");
      setIntent("");
      setBranchName("");
      setIsEditingBranch(false);
      setError("");
    }
  }, [open]);

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
      console.log("[CreateWorkspaceDialog] Auto-generating branch name:", {
        intent: intent.trim(),
        branchPattern,
        generatedBranch,
        isEditingBranch
      });
      setBranchName(generatedBranch);
    } else if (!isEditingBranch && !intent.trim()) {
      console.log("[CreateWorkspaceDialog] Clearing branch name (no intent)");
      setBranchName("");
    }
  }, [intent, branchPattern, isEditingBranch]);

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
      console.log("[CreateWorkspaceDialog] Creating workspace with:", {
        intent: intent.trim(),
        branchName,
        branchPattern,
        repoPath
      });

      // Prepare metadata
      const metadata = JSON.stringify({ intent: intent.trim() });

      // Create workspace (jj + database) in single call
      await createWorkspace(
        repoPath,
        branchName,
        true,
        sourceBranch || undefined,
        metadata
      );

      console.log("[CreateWorkspaceDialog] Workspace created successfully");

      addToast({
        title: "Workspace created successfully",
        description: `Created workspace for branch ${branchName}`,
        type: "success",
      });

      // Reset form
      setIntent("");
      setBranchName("");
      setIsEditingBranch(false);

      // Call success callback
      onSuccess();
      onOpenChange(false);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      setError(errorMsg);
      addToast({
        title: "Failed to create workspace",
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
          <DialogTitle>Create New Workspace</DialogTitle>
          <DialogDescription>
            Create a new workspace for parallel development
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="intent">Intent / Description</Label>
            <Textarea
              id="intent"
              value={intent}
              onChange={(e) => setIntent(e.target.value)}
              placeholder="e.g., Add dark mode to settings"
              rows={3}
              className="resize-none"
            />
            <p className="text-sm text-muted-foreground">
              Describe what you plan to implement in this workspace
            </p>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="branch">Branch Name</Label>
            <Input
              id="branch"
              value={branchName}
              onChange={(e) => {
                setBranchName(e.target.value);
                setIsEditingBranch(true);
              }}
              placeholder={branchPattern.replace("{name}", "example")}
            />
            <p className="text-sm text-muted-foreground">
              Pattern: {branchPattern} (configure in Repository Settings)
            </p>
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
            {loading ? "Creating..." : "Create Workspace"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
