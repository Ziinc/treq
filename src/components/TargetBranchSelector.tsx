import { useEffect, useState } from "react";
import { GitBranch, Loader2, ChevronDown, Check } from "lucide-react";
import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "./ui/dropdown-menu";
import { useToast } from "./ui/toast";
import {
  gitListBranchesDetailed,
  jjRebaseOnto,
  updateWorkspaceMetadata,
  type BranchListItem,
} from "../lib/api";

interface TargetBranchSelectorProps {
  repoPath: string;
  workspacePath: string;
  workspaceId: number;
  currentBranch: string;
  targetBranch: string | null;
  onTargetChange: (branch: string) => void;
  disabled?: boolean;
}

export const TargetBranchSelector: React.FC<TargetBranchSelectorProps> = ({
  repoPath,
  workspacePath,
  workspaceId,
  currentBranch,
  targetBranch,
  onTargetChange,
  disabled,
}) => {
  const [branches, setBranches] = useState<BranchListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [rebasing, setRebasing] = useState(false);
  const { addToast } = useToast();

  // Load branches on mount
  useEffect(() => {
    loadBranches();
  }, [repoPath]);

  const loadBranches = async () => {
    setLoading(true);
    try {
      const result = await gitListBranchesDetailed(repoPath);
      // Filter out the current branch
      setBranches(result.filter(b => b.name !== currentBranch && !b.is_current));
    } catch (error) {
      addToast({
        title: "Failed to load branches",
        description: error instanceof Error ? error.message : String(error),
        type: "error",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleBranchSelect = async (branch: string) => {
    if (branch === targetBranch) return;

    setRebasing(true);
    try {
      const result = await jjRebaseOnto(workspacePath, branch);

      if (result.has_conflicts) {
        addToast({
          title: "Rebase completed with conflicts",
          description: `${result.conflicted_files.length} file(s) have conflicts. Resolve them in the Changes tab.`,
          type: "warning",
        });
      } else if (result.success) {
        addToast({
          title: "Rebased successfully",
          description: `Workspace rebased onto ${branch}`,
          type: "success",
        });
      } else {
        addToast({
          title: "Rebase failed",
          description: result.message,
          type: "error",
        });
        return;
      }

      // Save target branch to workspace metadata
      try {
        const metadata = JSON.stringify({ target_branch: branch });
        await updateWorkspaceMetadata(repoPath, workspaceId, metadata);
        onTargetChange(branch);
      } catch (error) {
        console.error("Failed to save target branch:", error);
        // Still consider this successful since rebase worked
        onTargetChange(branch);
      }
    } catch (error) {
      addToast({
        title: "Rebase failed",
        description: error instanceof Error ? error.message : String(error),
        type: "error",
      });
    } finally {
      setRebasing(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-muted-foreground">Target branch:</span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            disabled={disabled || rebasing || loading}
            className="gap-2"
          >
            {rebasing ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <GitBranch className="w-4 h-4" />
            )}
            <span className="font-mono">{targetBranch || "Select..."}</span>
            <ChevronDown className="w-4 h-4 opacity-50" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="max-h-96 overflow-auto">
          {loading ? (
            <div className="px-2 py-4 text-sm text-center text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin mx-auto mb-1" />
              Loading branches...
            </div>
          ) : branches.length === 0 ? (
            <div className="px-2 py-4 text-sm text-center text-muted-foreground">
              No branches available
            </div>
          ) : (
            branches.map((branch) => (
              <DropdownMenuItem
                key={branch.full_name}
                onSelect={() => handleBranchSelect(branch.name)}
                className="font-mono"
              >
                <span className="flex-1">{branch.name}</span>
                {branch.name === targetBranch && (
                  <Check className="w-4 h-4 ml-2" />
                )}
              </DropdownMenuItem>
            ))
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
};
