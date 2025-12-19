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
  gitListRemotes,
  jjCreateWorkspace,
  addWorkspaceToDb
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
  const [branchName, setBranchName] = useState("");
  const [selectedRemote, setSelectedRemote] = useState("");
  const [remotes, setRemotes] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingRemotes, setLoadingRemotes] = useState(false);
  const [error, setError] = useState("");
  const { addToast } = useToast();

  // Load remotes when dialog opens
  useEffect(() => {
    if (open && repoPath) {
      loadRemotes();
    }
  }, [open, repoPath]);

  const loadRemotes = async () => {
    setLoadingRemotes(true);
    try {
      const remotesList = await gitListRemotes(repoPath);
      setRemotes(remotesList);
      // Default to first remote (usually 'origin')
      if (remotesList.length > 0) {
        setSelectedRemote(remotesList[0]);
      }
    } catch (err) {
      console.error("Failed to load remotes:", err);
      addToast({
        title: "Failed to load remotes",
        description: err instanceof Error ? err.message : String(err),
        type: "error",
      });
    } finally {
      setLoadingRemotes(false);
    }
  };

  const handleCreate = async () => {
    if (!branchName.trim()) {
      setError("Branch name is required");
      return;
    }

    if (!selectedRemote) {
      setError("No remote available");
      return;
    }

    setLoading(true);
    setError("");

    try {
      // Construct full remote branch reference
      const remoteBranchRef = `${selectedRemote}/${branchName.trim()}`;

      // Use sanitized branch name for local branch and workspace name
      const localBranchName = branchName.trim();
      const workspaceName = sanitizeForBranchName(localBranchName);

      // Create the jj workspace from the remote branch
      const workspacePath = await jjCreateWorkspace(
        repoPath,
        workspaceName, // workspace name derived from branch
        localBranchName,
        true, // create new branch
        remoteBranchRef // source branch (full remote/branch reference)
      );

      // Add metadata with branch name as intent
      const metadata = JSON.stringify({
        intent: localBranchName,
      });

      // Add to database with metadata
      await addWorkspaceToDb(
        repoPath,
        workspaceName,
        workspacePath,
        localBranchName,
        metadata
      );

      addToast({
        title: "Workspace created successfully",
        description: `Created workspace from ${remoteBranchRef}`,
        type: "success",
      });

      // Reset form
      setBranchName("");

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
          {remotes.length > 1 && (
            <div className="grid gap-2">
              <Label htmlFor="remote">Remote</Label>
              <select
                id="remote"
                value={selectedRemote}
                onChange={(e) => setSelectedRemote(e.target.value)}
                disabled={loadingRemotes}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {remotes.map((remote) => (
                  <option key={remote} value={remote}>
                    {remote}
                  </option>
                ))}
              </select>
              <p className="text-sm text-muted-foreground">
                Select the remote to fetch the branch from
              </p>
            </div>
          )}

          <div className="grid gap-2">
            <Label htmlFor="branch-name">Branch Name</Label>
            <Input
              id="branch-name"
              value={branchName}
              onChange={(e) => setBranchName(e.target.value)}
              placeholder="e.g., feature/my-branch"
              disabled={loadingRemotes}
            />
            <p className="text-sm text-muted-foreground">
              Enter the name of the remote branch (without remote prefix)
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
          <Button onClick={handleCreate} disabled={loading || loadingRemotes}>
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
