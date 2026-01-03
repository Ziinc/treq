import { useState, useEffect, useRef } from "react";
import { Check, AlertCircle, Cloud, Loader2 } from "lucide-react";
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
  getRepoSetting,
  checkBranchExists,
  jjGitFetchBackground,
  type BranchStatus,
  jjGetBranches,
  setWorkspaceTargetBranch,
  getWorkspaces,
  Workspace,
} from "../lib/api";
import { TargetBranchSelector } from "./TargetBranchSelector";
import type { BranchListItem } from "./TargetBranchSelector";
import { getValidTargets } from "../lib/workspace-tree";

interface CreateWorkspaceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  repoPath: string;
  onSuccess: (workspaceId: number) => void;
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
  const [branchStatusData, setBranchStatusData] = useState<BranchStatus | null>(
    null
  );
  const [isCheckingBranch, setIsCheckingBranch] = useState(false);
  const [targetBranch, setTargetBranch] = useState<string | null>(null);
  const [availableBranches, setAvailableBranches] = useState<BranchListItem[]>([]);
  const [branchesLoading, setBranchesLoading] = useState(false);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const { addToast } = useToast();
  const checkBranchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Derive display status from branch status data
  const branchStatus: "new" | "local" | "remote" | "checking" | null =
    isCheckingBranch
      ? "checking"
      : branchStatusData
      ? branchStatusData.local_exists
        ? "local"
        : branchStatusData.remote_exists
        ? "remote"
        : "new"
      : null;

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      console.log("[CreateWorkspaceDialog] Resetting form (dialog opened)");
      setIntent("");
      setBranchName("");
      setIsEditingBranch(false);
      setError("");
      setTargetBranch(null);

      // Fetch remote branches when dialog opens
      if (repoPath) {
        jjGitFetchBackground(repoPath).catch((err) => {
          console.error(
            "[CreateWorkspaceDialog] Failed to fetch remote branches:",
            err
          );
          // Don't show error to user - fetch failure shouldn't block dialog
        });
      }
    }
  }, [open, repoPath]);

  // Load workspaces and branches when dialog opens
  useEffect(() => {
    if (open && repoPath) {
      // Load workspaces
      getWorkspaces(repoPath)
        .then(setWorkspaces)
        .catch((err) => {
          console.error("Failed to load workspaces:", err);
        });

      // Load available branches
      setBranchesLoading(true);
      jjGetBranches(repoPath)
        .then((branches) => {
          setAvailableBranches(
            branches.map((b) => ({
              name: b.name,
              full_name: b.name,
              is_current: b.is_current,
            }))
          );
        })
        .catch((err) => {
          console.error("Failed to load branches:", err);
          setAvailableBranches([]);
        })
        .finally(() => {
          setBranchesLoading(false);
        });
    }
  }, [open, repoPath]);

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
        isEditingBranch,
      });
      setBranchName(generatedBranch);
    } else if (!isEditingBranch && !intent.trim()) {
      console.log("[CreateWorkspaceDialog] Clearing branch name (no intent)");
      setBranchName("");
    }
  }, [intent, branchPattern, isEditingBranch]);

  // Check branch existence with debouncing
  useEffect(() => {
    // Clear any pending timeout
    if (checkBranchTimeoutRef.current) {
      clearTimeout(checkBranchTimeoutRef.current);
    }

    // Reset status if branch name is empty
    if (!branchName.trim()) {
      setBranchStatusData(null);
      setIsCheckingBranch(false);
      return;
    }

    // Set checking status
    setIsCheckingBranch(true);

    // Debounce the branch check (500ms)
    checkBranchTimeoutRef.current = setTimeout(async () => {
      try {
        const status = await checkBranchExists(repoPath, branchName);
        setBranchStatusData(status);
      } catch (err) {
        console.error("Failed to check branch existence:", err);
        // Assume new branch if check fails
        setBranchStatusData({
          local_exists: false,
          remote_exists: false,
          remote_name: undefined,
          remote_ref: undefined,
        });
      } finally {
        setIsCheckingBranch(false);
      }
    }, 500);

    // Cleanup
    return () => {
      if (checkBranchTimeoutRef.current) {
        clearTimeout(checkBranchTimeoutRef.current);
      }
    };
  }, [branchName, repoPath]);

  const handleCreate = async () => {
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
        branchStatus,
        repoPath,
        targetBranch,
      });

      // Step 1: If target branch selected, check if workspace exists for it
      let targetWorkspacePath: string | undefined;
      if (targetBranch) {
        const existingTarget = workspaces.find(
          (w) => w.branch_name === targetBranch
        );

        if (!existingTarget) {
          console.log(
            "[CreateWorkspaceDialog] Auto-creating workspace for target branch:",
            targetBranch
          );
          // Auto-create workspace for target branch
          const targetWorkspaceId = await createWorkspace(
            repoPath,
            targetBranch,
            false, // Don't create new branch - it should already exist
            undefined,
            JSON.stringify({ intent: `Workspace for ${targetBranch}` })
          );

          // Fetch the created workspace to get its path
          const updatedWorkspaces = await getWorkspaces(repoPath);
          const createdTarget = updatedWorkspaces.find(
            (w) => w.id === targetWorkspaceId
          );
          if (createdTarget) {
            targetWorkspacePath = createdTarget.workspace_path;
          }

          addToast({
            title: "Target workspace created",
            description: `Created workspace for ${targetBranch}`,
            type: "success",
          });
        } else {
          targetWorkspacePath = existingTarget.workspace_path;
        }
      }

      // Step 2: Prepare metadata (only include intent if provided)
      const metadata = intent.trim()
        ? JSON.stringify({ intent: intent.trim() })
        : JSON.stringify({});

      // Determine newBranch and sourceBranch based on branch status
      let newBranch = true;
      let effectiveSourceBranch = sourceBranch || undefined;

      if (branchStatusData?.local_exists) {
        // Checkout existing local branch
        newBranch = false;
        effectiveSourceBranch = undefined;
      } else if (
        branchStatusData?.remote_exists &&
        branchStatusData.remote_ref
      ) {
        // Create from remote branch - use remote_ref from backend
        newBranch = true;
        effectiveSourceBranch = branchStatusData.remote_ref;
      }
      // else: new branch, use existing behavior

      // Step 3: Create workspace (jj + database) in single call
      const workspaceId = await createWorkspace(
        repoPath,
        branchName,
        newBranch,
        effectiveSourceBranch,
        metadata
      );

      console.log(
        "[CreateWorkspaceDialog] Workspace created successfully, ID:",
        workspaceId
      );

      // Step 4: Set target branch if one was selected
      if (targetBranch && targetWorkspacePath) {
        // Get the created workspace's path
        const updatedWorkspaces = await getWorkspaces(repoPath);
        const createdWorkspace = updatedWorkspaces.find(
          (w) => w.id === workspaceId
        );

        if (createdWorkspace) {
          console.log(
            "[CreateWorkspaceDialog] Setting target branch:",
            targetBranch
          );
          await setWorkspaceTargetBranch(
            repoPath,
            createdWorkspace.workspace_path,
            workspaceId,
            targetBranch
          );
        }
      }

      addToast({
        title: "Workspace created successfully",
        description: `Created workspace for branch ${branchName}`,
        type: "success",
      });

      // Reset form
      setIntent("");
      setBranchName("");
      setIsEditingBranch(false);
      setTargetBranch(null);

      // Call success callback with workspace ID
      onSuccess(workspaceId);
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

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      handleCreate();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]" onKeyDown={handleKeyDown}>
        <DialogHeader>
          <DialogTitle>Create New Workspace</DialogTitle>
          <DialogDescription>
            Create a new workspace for parallel development
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="intent">Intent / Description (optional)</Label>
            <Textarea
              id="intent"
              value={intent}
              onChange={(e) => setIntent(e.target.value)}
              placeholder="e.g., Add dark mode to settings"
              rows={3}
              className="resize-none"
              autoFocus
              tabIndex={1}
            />
            <p className="text-sm text-muted-foreground">
              Describe what you plan to implement in this workspace (optional).
              If provided, the branch name will be auto-generated.
            </p>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="branch">Branch Name</Label>
            <div className="relative">
              <Input
                id="branch"
                value={branchName}
                onChange={(e) => {
                  setBranchName(e.target.value);
                  setIsEditingBranch(true);
                }}
                placeholder={branchPattern.replace("{name}", "example")}
                className={branchStatus ? "pr-10" : ""}
                tabIndex={1}
              />
              {branchStatus && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  {branchStatus === "checking" && (
                    <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                  )}
                  {branchStatus === "new" && (
                    <Check className="w-4 h-4 text-green-500" />
                  )}
                  {branchStatus === "local" && (
                    <AlertCircle className="w-4 h-4 text-yellow-500" />
                  )}
                  {branchStatus === "remote" && (
                    <Cloud className="w-4 h-4 text-blue-500" />
                  )}
                </div>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              Pattern: {branchPattern} (configure in Repository Settings)
            </p>
            {branchStatus === "local" && (
              <p className="text-sm text-yellow-600 flex items-center gap-2">
                <AlertCircle className="w-3 h-3" />A local branch with this name
                exists. Creating this workspace will checkout the existing
                branch.
              </p>
            )}
            {branchStatus === "remote" && (
              <p className="text-sm text-blue-600 flex items-center gap-2">
                <Cloud className="w-3 h-3" />A remote branch with this name
                exists. This will be fetched and used as the base.
              </p>
            )}
          </div>

          <div className="grid gap-2">
            <Label>Target Branch (optional)</Label>
            <TargetBranchSelector
              branches={(() => {
                // Filter out branches that would create circular references
                if (!branchName) return availableBranches;

                const validTargets = getValidTargets(workspaces, branchName);
                return availableBranches.filter((b) =>
                  validTargets.includes(b.name)
                );
              })()}
              loading={branchesLoading}
              targetBranch={targetBranch}
              onSelect={setTargetBranch}
              disabled={loading}
            />
            <p className="text-sm text-muted-foreground">
              Select a target branch for this workspace to stack on
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
            tabIndex={3}
          >
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={loading} tabIndex={2}>
            {loading ? "Creating..." : "Create Workspace"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
