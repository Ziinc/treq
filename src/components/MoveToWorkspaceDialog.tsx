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
  jjCreateWorkspace,
  gitStashPushFiles,
  gitStashPop,
  addWorkspaceToDb,
  getRepoSetting,
  gitExecutePostCreateCommand,
} from "../lib/api";
import { ChevronDown, ChevronRight, FileText } from "lucide-react";

interface MoveToWorkspaceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  repoPath: string;
  selectedFiles: string[];
  onSuccess: (workspaceInfo: {
    id: number;
    workspaceName: string;
    workspacePath: string;
    branchName: string;
    metadata: string;
  }) => void;
}

export const MoveToWorkspaceDialog: React.FC<MoveToWorkspaceDialogProps> = ({
  open,
  onOpenChange,
  repoPath,
  selectedFiles,
  onSuccess,
}) => {
  const [intent, setIntent] = useState("");
  const [branchName, setBranchName] = useState("");
  const [branchPattern, setBranchPattern] = useState("treq/{name}");
  const [isEditingBranch, setIsEditingBranch] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showAllFiles, setShowAllFiles] = useState(false);
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

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      setIntent("");
      setBranchName("");
      setIsEditingBranch(false);
      setError("");
      setShowAllFiles(false);
    }
  }, [open]);

  // Auto-generate branch name from intent
  useEffect(() => {
    if (!isEditingBranch && intent.trim()) {
      const generatedBranch = applyBranchNamePattern(branchPattern, intent);
      setBranchName(generatedBranch);
    } else if (!isEditingBranch && !intent.trim()) {
      setBranchName("");
    }
  }, [intent, branchPattern, isEditingBranch]);

  // Get preview of workspace path
  const getWorkspacePath = (): string => {
    if (!branchName.trim()) return `${repoPath}/.treq/workspaces/branch-name`;
    const pathSafeName = sanitizeForBranchName(branchName.split("/").pop() || branchName);
    return `${repoPath}/.treq/workspaces/${pathSafeName}`;
  };

  const handleMove = async () => {
    if (!intent.trim()) {
      setError("Intent/description is required");
      return;
    }

    if (!branchName.trim()) {
      setError("Branch name is required");
      return;
    }

    if (selectedFiles.length === 0) {
      setError("No files selected to move");
      return;
    }

    setLoading(true);
    setError("");

    let stashCreated = false;
    let workspacePath: string | null = null;

    try {
      // Step 1: Stash selected files in source repo
      addToast({
        title: "Stashing files...",
        description: `Stashing ${selectedFiles.length} file(s)`,
        type: "info",
      });

      await gitStashPushFiles(repoPath, selectedFiles, `treq-move: ${intent.trim()}`);
      stashCreated = true;

      // Step 2: Create new jj workspace
      addToast({
        title: "Creating workspace...",
        description: `Creating branch ${branchName}`,
        type: "info",
      });

      workspacePath = await jjCreateWorkspace(repoPath, branchName, branchName, true);

      // Step 3: Pop stash in new workspace
      addToast({
        title: "Moving files...",
        description: "Applying changes to new workspace",
        type: "info",
      });

      await gitStashPop(workspacePath);

      // Step 4: Add workspace to database with metadata
      const metadata = JSON.stringify({
        intent: intent.trim(),
        movedFiles: selectedFiles,
      });

      const workspaceId = await addWorkspaceToDb(repoPath, branchName, workspacePath, branchName, metadata);

      // Step 5: Execute post-create command if configured
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
            title: "Files moved successfully",
            description: `${selectedFiles.length} file(s) moved to ${branchName}`,
            type: "success",
          });
        } catch (cmdError) {
          console.error("Post-create command failed:", cmdError);
          addToast({
            title: "Files moved",
            description: `Post-create command failed: ${cmdError}`,
            type: "warning",
          });
        }
      } else {
        addToast({
          title: "Files moved successfully",
          description: `${selectedFiles.length} file(s) moved to ${branchName}`,
          type: "success",
        });
      }

      onSuccess({
        id: workspaceId,
        workspaceName: branchName,
        workspacePath,
        branchName,
        metadata,
      });
      onOpenChange(false);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      setError(errorMsg);

      // Provide recovery information if stash was created but workspace failed
      if (stashCreated && !workspacePath) {
        addToast({
          title: "Failed to create workspace",
          description: `Your changes were stashed. Use 'git stash pop' to recover them.`,
          type: "error",
        });
      } else {
        addToast({
          title: "Failed to move files",
          description: errorMsg,
          type: "error",
        });
      }
    } finally {
      setLoading(false);
    }
  };

  const displayedFiles = showAllFiles ? selectedFiles : selectedFiles.slice(0, 5);
  const hasMoreFiles = selectedFiles.length > 5;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Move Files to New Workspace</DialogTitle>
          <DialogDescription>
            Move {selectedFiles.length} selected file(s) to a new workspace
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          {/* File list */}
          <div className="grid gap-2">
            <Label>Files to Move ({selectedFiles.length})</Label>
            <div className="bg-secondary rounded-md max-h-32 overflow-y-auto">
              {displayedFiles.map((file) => (
                <div
                  key={file}
                  className="px-3 py-1.5 text-xs flex items-center gap-2 border-b border-border/50 last:border-0"
                >
                  <FileText className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                  <span className="truncate font-mono">{file}</span>
                </div>
              ))}
            </div>
            {hasMoreFiles && (
              <button
                type="button"
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                onClick={() => setShowAllFiles(!showAllFiles)}
              >
                {showAllFiles ? (
                  <>
                    <ChevronDown className="w-3 h-3" />
                    Show less
                  </>
                ) : (
                  <>
                    <ChevronRight className="w-3 h-3" />
                    Show all {selectedFiles.length} files
                  </>
                )}
              </button>
            )}
          </div>

          {/* Intent */}
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
              Describe what you plan to implement with these files
            </p>
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
            <p className="text-xs text-muted-foreground">
              Pattern: {branchPattern} (configure in Repository Settings)
            </p>
          </div>

          {/* Workspace path preview */}
          <div className="grid gap-2">
            <Label>Workspace Path (preview)</Label>
            <div className="bg-secondary p-3 rounded-md text-sm font-mono break-all text-muted-foreground">
              {getWorkspacePath()}
            </div>
          </div>

          {error && <div className="text-sm text-destructive">{error}</div>}
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleMove} disabled={loading}>
            {loading ? "Moving..." : "Move to Workspace"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
