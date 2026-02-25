import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { Label } from "./ui/label";
import { useToast } from "./ui/toast";
import {
  moveCommitToExistingWorkspace,
  getWorkspaces,
  type JjLogCommit,
  type Workspace,
} from "../lib/api";

interface MoveCommitToExistingWorkspaceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  commit: JjLogCommit;
  repoPath: string;
  sourceWorkspaceId: number;
  onSuccess: () => void;
}

export const MoveCommitToExistingWorkspaceDialog: React.FC<MoveCommitToExistingWorkspaceDialogProps> = ({
  open,
  onOpenChange,
  commit,
  repoPath,
  sourceWorkspaceId,
  onSuccess,
}) => {
  const firstLine = commit.description.split("\n")[0] || "(no message)";

  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const { addToast } = useToast();

  // Fetch available workspaces (excluding the source)
  useEffect(() => {
    if (open && repoPath) {
      getWorkspaces(repoPath)
        .then((all) => {
          const others = all.filter((w) => w.id !== sourceWorkspaceId);
          setWorkspaces(others);
          setSelectedWorkspaceId(others.length > 0 ? others[0].id : null);
        })
        .catch((err) => {
          console.error("Failed to load workspaces:", err);
          setWorkspaces([]);
        });
    }
  }, [open, repoPath, sourceWorkspaceId]);

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setError("");
    }
  }, [open]);

  const handleMove = async () => {
    if (selectedWorkspaceId === null) {
      setError("Please select a target workspace");
      return;
    }

    setLoading(true);
    setError("");

    try {
      await moveCommitToExistingWorkspace(
        repoPath,
        sourceWorkspaceId,
        commit.change_id,
        selectedWorkspaceId,
      );

      const targetWorkspace = workspaces.find((w) => w.id === selectedWorkspaceId);
      addToast({
        title: "Commit moved",
        description: `Commit moved to workspace: ${targetWorkspace?.branch_name ?? ""}`,
        type: "success",
      });

      onSuccess();
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
          <DialogTitle>Move Commit to Existing Workspace</DialogTitle>
          <DialogDescription>
            Move this commit's changes into an existing workspace.
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

          {/* Target workspace selector */}
          <div className="grid gap-2">
            <Label htmlFor="target-workspace">Target Workspace</Label>
            {workspaces.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No other workspaces available.
              </p>
            ) : (
              <select
                id="target-workspace"
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                value={selectedWorkspaceId ?? ""}
                onChange={(e) => setSelectedWorkspaceId(Number(e.target.value))}
              >
                {workspaces.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.branch_name}
                  </option>
                ))}
              </select>
            )}
          </div>

          {error && <div className="text-sm text-destructive">{error}</div>}
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancel
          </Button>
          <Button
            onClick={handleMove}
            disabled={loading || selectedWorkspaceId === null || workspaces.length === 0}
          >
            {loading ? "Moving..." : "Move to Workspace"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
