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
import { moveCommitToNewWorkspace, getRepoSetting, type JjLogCommit } from "../lib/api";

interface MoveCommitToNewWorkspaceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  commit: JjLogCommit;
  repoPath: string;
  sourceWorkspaceId: number;
  onSuccess: (newWorkspaceId: number) => void;
}

export const MoveCommitToNewWorkspaceDialog: React.FC<MoveCommitToNewWorkspaceDialogProps> = ({
  open,
  onOpenChange,
  commit,
  repoPath,
  sourceWorkspaceId,
  onSuccess,
}) => {
  const firstLine = commit.description.split("\n")[0] || "(no message)";

  const [intent, setIntent] = useState(firstLine);
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
        .catch(() => {
          setBranchPattern("treq/{name}");
        });
    }
  }, [open, repoPath]);

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      setIntent(firstLine);
      setBranchName("");
      setIsEditingBranch(false);
      setError("");
    }
  }, [open, firstLine]);

  // Auto-generate branch name from intent
  useEffect(() => {
    if (!isEditingBranch && intent.trim()) {
      setBranchName(applyBranchNamePattern(branchPattern, intent));
    } else if (!isEditingBranch && !intent.trim()) {
      setBranchName("");
    }
  }, [intent, branchPattern, isEditingBranch]);

  const handleMove = async () => {
    if (!branchName.trim()) {
      setError("Branch name is required");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const newWorkspaceId = await moveCommitToNewWorkspace(
        repoPath,
        sourceWorkspaceId,
        commit.change_id,
        branchName.trim(),
        intent.trim() || null,
      );

      addToast({
        title: "Commit moved",
        description: `Commit moved to new workspace: ${branchName}`,
        type: "success",
      });

      onSuccess(newWorkspaceId);
      onOpenChange(false);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      setError(errorMsg);
      addToast({
        title: "Failed to move commit",
        description: errorMsg,
        type: "error",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Move Commit to New Workspace</DialogTitle>
          <DialogDescription>
            Move this commit's changes into a brand-new workspace.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          {/* Commit being moved */}
          <div className="grid gap-2">
            <Label>Commit</Label>
            <div className="bg-secondary rounded-md px-3 py-2 text-sm font-mono truncate text-muted-foreground">
              {commit.short_id} — {firstLine}
            </div>
          </div>

          {/* Intent */}
          <div className="grid gap-2">
            <Label htmlFor="intent">Intent / Description</Label>
            <Textarea
              id="intent"
              value={intent}
              onChange={(e) => setIntent(e.target.value)}
              placeholder="What does this commit do?"
              rows={3}
              className="resize-none"
            />
          </div>

          {/* Branch name */}
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
          </div>

          {error && <div className="text-sm text-destructive">{error}</div>}
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleMove} disabled={loading || !branchName.trim()}>
            {loading ? "Moving..." : "Move to New Workspace"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
