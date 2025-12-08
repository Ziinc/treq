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
import { Label } from "./ui/label";
import { useToast } from "./ui/toast";
import { sanitizeForBranchName } from "../lib/utils";
import {
  gitListBranchesDetailed,
  gitFetch,
  jjCreateWorkspace,
  addWorkspaceToDb,
  getRepoSetting,
  gitExecutePostCreateCommand,
  BranchListItem,
} from "../lib/api";
import { Loader2 } from "lucide-react";

interface CreateWorkspaceFromRemoteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  repoPath: string;
  onSuccess: () => void;
}

export const CreateWorkspaceFromRemoteDialog: React.FC<CreateWorkspaceFromRemoteDialogProps> = ({
  open,
  onOpenChange,
  repoPath,
  onSuccess,
}) => {
  const [workspaceTitle, setWorkspaceTitle] = useState("");
  const [selectedRemoteBranch, setSelectedRemoteBranch] = useState("");
  const [remoteBranches, setRemoteBranches] = useState<BranchListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetchingBranches, setFetchingBranches] = useState(false);
  const [error, setError] = useState("");
  const { addToast } = useToast();

  // Load remote branches when dialog opens
  useEffect(() => {
    if (open && repoPath) {
      loadRemoteBranches();
    }
  }, [open, repoPath]);

  const loadRemoteBranches = async () => {
    setFetchingBranches(true);
    try {
      // Fetch from remote first to get latest branches
      await gitFetch(repoPath);

      // Get all branches
      const branches = await gitListBranchesDetailed(repoPath);

      // Filter to only remote branches (excluding HEAD)
      const remoteBranches = branches.filter(
        (b) => b.is_remote && !b.name.includes("HEAD")
      );

      setRemoteBranches(remoteBranches);
    } catch (err) {
      console.error("Failed to load remote branches:", err);
      addToast({
        title: "Failed to load remote branches",
        description: err instanceof Error ? err.message : String(err),
        type: "error",
      });
    } finally {
      setFetchingBranches(false);
    }
  };

  // Get preview of workspace path
  const getWorkspacePath = (): string => {
    if (!workspaceTitle.trim()) return `${repoPath}/.treq/workspaces/workspace-title`;
    const pathSafeName = sanitizeForBranchName(workspaceTitle);
    return `${repoPath}/.treq/workspaces/${pathSafeName}`;
  };

  const handleCreate = async () => {
    if (!workspaceTitle.trim()) {
      setError("Workspace title is required");
      return;
    }

    if (!selectedRemoteBranch) {
      setError("Please select a remote branch");
      return;
    }

    setLoading(true);
    setError("");

    try {
      // Extract the branch name from the remote branch (e.g., "origin/feature" -> "feature")
      const branchParts = selectedRemoteBranch.split("/");
      const localBranchName = branchParts.slice(1).join("/"); // Handle branches with slashes

      // Create the jj workspace from the remote branch
      // This will create a new local branch tracking the remote branch
      const workspacePath = await jjCreateWorkspace(
        repoPath,
        workspaceTitle.trim(), // workspace name
        localBranchName,
        true, // create new branch
        selectedRemoteBranch // source branch (the remote branch)
      );

      // Add metadata with workspace title
      const metadata = JSON.stringify({
        intent: workspaceTitle.trim(),
      });

      // Add to database with metadata
      await addWorkspaceToDb(
        repoPath,
        workspaceTitle.trim(),
        workspacePath,
        localBranchName,
        metadata
      );

      // Get and execute post-create command if configured
      const postCreateCmd = await getRepoSetting(repoPath, "post_create_command");
      if (postCreateCmd && postCreateCmd.trim()) {
        try {
          addToast({
            title: "Running post-create command...",
            description: "Executing setup command in workspace",
            type: "info",
          });

          await gitExecutePostCreateCommand(workspacePath, postCreateCmd);

          addToast({
            title: "Workspace created successfully",
            description: `Created workspace from ${selectedRemoteBranch}`,
            type: "success",
          });
        } catch (cmdError) {
          console.error("Post-create command failed:", cmdError);
          addToast({
            title: "Workspace created",
            description: `Post-create command failed: ${cmdError}`,
            type: "warning",
          });
        }
      } else {
        addToast({
          title: "Workspace created successfully",
          description: `Created workspace from ${selectedRemoteBranch}`,
          type: "success",
        });
      }

      // Reset form
      setWorkspaceTitle("");
      setSelectedRemoteBranch("");

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
          <DialogTitle>Create Workspace from Remote Branch</DialogTitle>
          <DialogDescription>
            Create a new workspace from an existing remote branch
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="remote-branch">Remote Branch</Label>
            {fetchingBranches ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Fetching remote branches...
              </div>
            ) : (
              <select
                id="remote-branch"
                value={selectedRemoteBranch}
                onChange={(e) => setSelectedRemoteBranch(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <option value="">Select a remote branch</option>
                {remoteBranches.map((branch) => (
                  <option key={branch.full_name} value={branch.name}>
                    {branch.name}
                  </option>
                ))}
              </select>
            )}
            {!fetchingBranches && remoteBranches.length === 0 && (
              <p className="text-xs text-destructive">
                No remote branches found. Make sure you have a remote configured.
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Select the remote branch to create a workspace from
            </p>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="title">Workspace Title</Label>
            <Input
              id="title"
              value={workspaceTitle}
              onChange={(e) => setWorkspaceTitle(e.target.value)}
              placeholder="e.g., Review feature implementation"
            />
            <p className="text-xs text-muted-foreground">
              A descriptive title for this workspace
            </p>
          </div>

          <div className="grid gap-2">
            <Label>Workspace Path (preview)</Label>
            <div className="bg-secondary p-3 rounded-md text-sm font-mono break-all text-muted-foreground">
              {getWorkspacePath()}
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
          <Button onClick={handleCreate} disabled={loading || fetchingBranches}>
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Creating...
              </>
            ) : (
              "Create Workspace"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
