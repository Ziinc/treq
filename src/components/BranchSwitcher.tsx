import { useState, useEffect } from "react";
import { Command } from "cmdk";
import { GitBranch, Check, ArrowRight } from "lucide-react";
import { BranchListItem, gitListBranchesDetailed, gitCheckoutBranch } from "../lib/api";

interface BranchSwitcherProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  repoPath: string;
  onBranchChanged?: (branchName: string) => void;
}

export const BranchSwitcher: React.FC<BranchSwitcherProps> = ({
  open,
  onOpenChange,
  repoPath,
  onBranchChanged,
}) => {
  const [branches, setBranches] = useState<BranchListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [switching, setSwitching] = useState(false);

  useEffect(() => {
    if (open) {
      loadBranches();
    }
  }, [open, repoPath]);

  const loadBranches = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await gitListBranchesDetailed(repoPath);
      setBranches(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleSelectBranch = async (branch: BranchListItem) => {
    if (branch.is_current) {
      onOpenChange(false);
      return;
    }

    setSwitching(true);
    setError(null);

    try {
      // If it's a remote branch, we need to create a local tracking branch
      if (branch.is_remote) {
        // Extract the branch name without the remote prefix (e.g., origin/feature -> feature)
        const parts = branch.name.split('/');
        const localBranchName = parts.slice(1).join('/'); // Remove the remote name

        // Check if a local branch with this name already exists
        const localBranchExists = branches.some(
          b => !b.is_remote && b.name === localBranchName
        );

        if (localBranchExists) {
          // If local branch exists, just checkout
          await gitCheckoutBranch(repoPath, localBranchName, false);
        } else {
          // Create a new local tracking branch
          await gitCheckoutBranch(repoPath, localBranchName, true);
        }

        onBranchChanged?.(localBranchName);
      } else {
        // For local branches, just checkout
        await gitCheckoutBranch(repoPath, branch.name, false);
        onBranchChanged?.(branch.name);
      }

      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSwitching(false);
    }
  };

  const groupedBranches = {
    current: branches.filter(b => b.is_current),
    local: branches.filter(b => !b.is_current && !b.is_remote),
    remote: branches.filter(b => !b.is_current && b.is_remote),
  };

  return (
    <Command.Dialog
      open={open}
      onOpenChange={onOpenChange}
      label="Switch Branch"
    >
      <div className="bg-popover text-popover-foreground rounded-xl border border-border/50 shadow-2xl w-[40vw] max-w-none overflow-hidden">
        {/* Search Input */}
        <div className="flex items-center border-b border-border px-3">
          <GitBranch className="w-4 h-4 text-muted-foreground mr-2" />
          <Command.Input
            placeholder="Search branches..."
            className="border-0 focus-visible:ring-0 focus-visible:ring-offset-0 h-12 flex-1 bg-transparent outline-none text-sm placeholder:text-muted-foreground"
            disabled={switching}
          />
        </div>

        {/* Results List */}
        <Command.List className="max-h-[400px] overflow-y-auto py-2">
          {loading && (
            <div className="px-4 py-8 text-center text-muted-foreground text-sm">
              Loading branches...
            </div>
          )}

          {error && (
            <div className="px-4 py-3 text-center text-destructive text-sm border-b border-border">
              Error: {error}
            </div>
          )}

          <Command.Empty>
            <div className="px-4 py-8 text-center text-muted-foreground text-sm">
              No branches found
            </div>
          </Command.Empty>

          {!loading && !error && (
            <>
              {/* Current Branch */}
              {groupedBranches.current.length > 0 && (
                <Command.Group heading="Current Branch">
                  {groupedBranches.current.map((branch) => (
                    <Command.Item
                      key={branch.full_name}
                      value={branch.name}
                      onSelect={() => handleSelectBranch(branch)}
                      disabled={switching}
                      className="px-3 py-2 flex items-center gap-3 cursor-pointer aria-selected:bg-accent aria-selected:text-accent-foreground data-[disabled]:opacity-50 data-[disabled]:pointer-events-none"
                    >
                      <Check className="w-4 h-4 text-green-500" />
                      <div className="flex-1 min-w-0">
                        <div className="truncate text-sm font-medium">{branch.name}</div>
                      </div>
                      <span className="text-xs text-muted-foreground">current</span>
                    </Command.Item>
                  ))}
                </Command.Group>
              )}

              {/* Local Branches */}
              {groupedBranches.local.length > 0 && (
                <Command.Group heading="Local Branches">
                  {groupedBranches.local.map((branch) => (
                    <Command.Item
                      key={branch.full_name}
                      value={branch.name}
                      onSelect={() => handleSelectBranch(branch)}
                      disabled={switching}
                      className="px-3 py-2 flex items-center gap-3 cursor-pointer aria-selected:bg-accent aria-selected:text-accent-foreground data-[disabled]:opacity-50 data-[disabled]:pointer-events-none"
                    >
                      <GitBranch className="w-4 h-4 text-muted-foreground" />
                      <div className="flex-1 min-w-0">
                        <div className="truncate text-sm">{branch.name}</div>
                      </div>
                    </Command.Item>
                  ))}
                </Command.Group>
              )}

              {/* Remote Branches */}
              {groupedBranches.remote.length > 0 && (
                <Command.Group heading="Remote Branches">
                  {groupedBranches.remote.map((branch) => (
                    <Command.Item
                      key={branch.full_name}
                      value={branch.name}
                      onSelect={() => handleSelectBranch(branch)}
                      disabled={switching}
                      className="px-3 py-2 flex items-center gap-3 cursor-pointer aria-selected:bg-accent aria-selected:text-accent-foreground data-[disabled]:opacity-50 data-[disabled]:pointer-events-none"
                    >
                      <ArrowRight className="w-4 h-4 text-muted-foreground" />
                      <div className="flex-1 min-w-0">
                        <div className="truncate text-sm">{branch.name}</div>
                      </div>
                      <span className="text-xs text-muted-foreground">remote</span>
                    </Command.Item>
                  ))}
                </Command.Group>
              )}
            </>
          )}
        </Command.List>

        {/* Footer with keyboard hints */}
        <div className="border-t border-border px-3 py-2 flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-3">
            <span><kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px]">↑↓</kbd> Navigate</span>
            <span><kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px]">↵</kbd> Switch</span>
            <span><kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px]">Esc</kbd> Close</span>
          </div>
          {switching && <span className="text-xs">Switching...</span>}
        </div>
      </div>
    </Command.Dialog>
  );
};
