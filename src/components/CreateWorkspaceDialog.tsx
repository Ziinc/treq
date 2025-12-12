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
  addWorkspaceToDb,
  getRepoSetting,
  gitExecutePostCreateCommand
} from "../lib/api";
import { PlanSection } from "../types/planning";

interface CreateWorkspaceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  repoPath: string;
  onSuccess: () => void;

  // Plan execution mode props
  planSection?: PlanSection;
  sourceBranch?: string;
  initialSessionName?: string;
  onSuccessWithPlan?: (
    workspaceInfo: { id: number; workspaceName: string; workspacePath: string; branchName: string; metadata: string },
    planSection: PlanSection,
    sessionName?: string
  ) => void;
}

export const CreateWorkspaceDialog: React.FC<CreateWorkspaceDialogProps> = ({
  open,
  onOpenChange,
  repoPath,
  onSuccess,
  planSection,
  sourceBranch,
  initialSessionName,
  onSuccessWithPlan,
}) => {
  const [intent, setIntent] = useState("");
  const [branchName, setBranchName] = useState("");
  const [branchPattern, setBranchPattern] = useState("treq/{name}");
  const [isEditingBranch, setIsEditingBranch] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const { addToast } = useToast();

  // Plan execution mode detection
  const isPlanExecution = !!planSection;

  // Pre-populate intent from plan title when in plan execution mode
  useEffect(() => {
    if (open && planSection) {
      setIntent(planSection.title);
    }
  }, [open, planSection]);

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

  // Get preview of workspace path
  const getWorkspacePath = (): string => {
    if (!branchName.trim()) return `${repoPath}/.treq/workspaces/branch-name`;
    const pathSafeName = sanitizeForBranchName(branchName.split('/').pop() || branchName);
    return `${repoPath}/.treq/workspaces/${pathSafeName}`;
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
      // Create the jj workspace (creates git workspace + initializes jj)
      // Pass source branch if executing from workspace
      const workspacePath = await jjCreateWorkspace(
        repoPath,
        branchName,
        branchName,
        true,
        sourceBranch || undefined
      );

      // Prepare metadata based on execution mode
      const metadata = JSON.stringify(
        isPlanExecution && planSection
          ? {
              initial_plan_title: planSection.title,
              source_branch: sourceBranch,
            }
          : { intent: intent.trim() }
      );

      // Add to database with metadata
      const workspaceId = await addWorkspaceToDb(repoPath, branchName, workspacePath, branchName, metadata);

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
            description: "Post-create command executed successfully",
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
          description: `Created workspace for branch ${branchName}`,
          type: "success",
        });
      }

      // Reset form
      setIntent("");
      setBranchName("");
      setIsEditingBranch(false);

      // Call appropriate success callback based on mode
      if (isPlanExecution && onSuccessWithPlan && planSection) {
        await onSuccessWithPlan(
          { id: workspaceId, workspaceName: branchName, workspacePath, branchName, metadata },
          planSection,
          initialSessionName
        );
      } else {
        onSuccess();
      }
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
            <p className="text-xs text-muted-foreground">
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
            <p className="text-xs text-muted-foreground">
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
