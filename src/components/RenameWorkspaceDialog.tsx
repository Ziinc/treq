import { useState, useEffect, useRef } from "react";
import { Check, AlertCircle, Loader2 } from "lucide-react";
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
import { renameWorkspace, type Workspace } from "../lib/api";
import { useQueryClient } from "@tanstack/react-query";

interface RenameWorkspaceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  repoPath: string;
  workspace: Workspace;
  onSuccess: () => void;
}

export const RenameWorkspaceDialog: React.FC<RenameWorkspaceDialogProps> = ({
  open,
  onOpenChange,
  repoPath,
  workspace,
  onSuccess,
}) => {
  const [branchName, setBranchName] = useState(workspace.branch_name);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [isChecking, setIsChecking] = useState(false);
  const [validationResult, setValidationResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);
  const checkTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const { addToast } = useToast();
  const queryClient = useQueryClient();

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setBranchName(workspace.branch_name);
      setError("");
      setValidationResult(null);
      setIsChecking(false);
    }
  }, [open, workspace.branch_name]);

  // Debounced dry-run validation
  useEffect(() => {
    if (checkTimeoutRef.current) {
      clearTimeout(checkTimeoutRef.current);
    }

    if (!branchName.trim() || branchName === workspace.branch_name) {
      setValidationResult(null);
      setIsChecking(false);
      return;
    }

    setIsChecking(true);

    checkTimeoutRef.current = setTimeout(async () => {
      try {
        const result = await renameWorkspace(
          repoPath,
          workspace.id,
          branchName,
          true,
        );
        setValidationResult({ success: result.success, message: result.message });
      } catch (err) {
        setValidationResult({
          success: false,
          message: err instanceof Error ? err.message : String(err),
        });
      } finally {
        setIsChecking(false);
      }
    }, 500);

    return () => {
      if (checkTimeoutRef.current) {
        clearTimeout(checkTimeoutRef.current);
      }
    };
  }, [branchName, repoPath, workspace.id, workspace.branch_name]);

  const handleRename = async () => {
    if (!branchName.trim() || branchName === workspace.branch_name) return;

    setLoading(true);
    setError("");

    try {
      const result = await renameWorkspace(
        repoPath,
        workspace.id,
        branchName,
        false,
      );

      if (!result.success) {
        setError(result.message);
        return;
      }

      addToast({
        title: "Workspace renamed",
        description: `Renamed to ${branchName}`,
        type: "success",
      });

      queryClient.invalidateQueries({ queryKey: ["workspaces"] });
      queryClient.invalidateQueries({ queryKey: ["workspace-statuses"] });
      onSuccess();
      onOpenChange(false);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      setError(errorMsg);
      addToast({
        title: "Failed to rename workspace",
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
      handleRename();
    }
    if (e.key === "Escape") {
      e.preventDefault();
      onOpenChange(false);
    }
  };

  const canSubmit =
    branchName.trim() &&
    branchName !== workspace.branch_name &&
    !isChecking &&
    validationResult?.success &&
    !loading;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]" onKeyDown={handleKeyDown}>
        <DialogHeader>
          <DialogTitle>Rename Workspace</DialogTitle>
          <DialogDescription>
            Rename the branch for this workspace
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="branch-name">Branch Name</Label>
            <div className="relative">
              <Input
                id="branch-name"
                value={branchName}
                onChange={(e) => setBranchName(e.target.value)}
                placeholder="e.g., feat/new-name"
                className={
                  isChecking || validationResult ? "pr-10" : ""
                }
                autoFocus
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                {isChecking && (
                  <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                )}
                {!isChecking && validationResult?.success && (
                  <Check className="w-4 h-4 text-green-500" />
                )}
                {!isChecking && validationResult && !validationResult.success && (
                  <AlertCircle className="w-4 h-4 text-destructive" />
                )}
              </div>
            </div>
            {!isChecking && validationResult && !validationResult.success && (
              <p className="text-sm text-destructive flex items-center gap-2">
                <AlertCircle className="w-3 h-3 shrink-0" />
                {validationResult.message}
              </p>
            )}
          </div>

          {error && (
            <div className="text-sm text-destructive">{error}</div>
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
          <Button
            onClick={handleRename}
            disabled={!canSubmit}
          >
            {loading ? "Renaming..." : "Rename"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
