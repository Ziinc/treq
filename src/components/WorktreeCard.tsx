import { useEffect, useState } from "react";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./ui/card";
import { Button } from "./ui/button";
import { Worktree, GitStatus, BranchInfo, gitGetStatus, gitGetBranchInfo, calculateDirectorySize } from "../lib/api";
import { formatBytes } from "../lib/utils";
import { GitBranch, FileText, HardDrive, Info } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "./ui/popover";

interface WorktreeCardProps {
  worktree: Worktree;
}

export const WorktreeCard: React.FC<WorktreeCardProps> = ({
  worktree,
}) => {
  const [status, setStatus] = useState<GitStatus | null>(null);
  const [branchInfo, setBranchInfo] = useState<BranchInfo | null>(null);
  const [size, setSize] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  // Parse metadata to get title/intent
  const getDisplayTitle = (): string => {
    if (worktree.metadata) {
      try {
        const metadata = JSON.parse(worktree.metadata);
        return metadata.initial_plan_title || metadata.intent || worktree.branch_name;
      } catch {
        return worktree.branch_name;
      }
    }
    return worktree.branch_name;
  };

  const hasMetadata = (): boolean => {
    if (!worktree.metadata) return false;
    try {
      const metadata = JSON.parse(worktree.metadata);
      return !!(metadata.initial_plan_title || metadata.intent);
    } catch {
      return false;
    }
  };

  const displayTitle = getDisplayTitle();

  useEffect(() => {
    const fetchGitInfo = async () => {
      try {
        const [gitStatus, branchData, dirSize] = await Promise.all([
          gitGetStatus(worktree.worktree_path),
          gitGetBranchInfo(worktree.worktree_path),
          calculateDirectorySize(worktree.worktree_path),
        ]);
        setStatus(gitStatus);
        setBranchInfo(branchData);
        setSize(dirSize);
      } catch (err) {
        console.error("Failed to fetch git info:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchGitInfo();
    // Refresh every 30 seconds
    const interval = setInterval(fetchGitInfo, 30000);
    return () => clearInterval(interval);
  }, [worktree.worktree_path]);

  const totalChanges = status
    ? status.modified + status.added + status.deleted + status.untracked
    : 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <CardTitle className="flex items-center gap-2 mb-1">
              {hasMetadata() ? (
                <FileText className="w-5 h-5 flex-shrink-0" />
              ) : (
                <GitBranch className="w-5 h-5 flex-shrink-0" />
              )}
              <span className="truncate">{displayTitle}</span>
            </CardTitle>
            {hasMetadata() && (
              <CardDescription className="text-xs flex items-center gap-1">
                <GitBranch className="w-3 h-3" />
                {worktree.branch_name}
              </CardDescription>
            )}
          </div>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 flex-shrink-0">
                <Info className="w-4 h-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80">
              <div className="space-y-3">
                <div>
                  <h4 className="font-semibold text-sm mb-1">Worktree Details</h4>
                </div>
                <div className="space-y-2 text-sm">
                  <div>
                    <div className="text-xs text-muted-foreground mb-0.5">Branch</div>
                    <div className="font-mono text-xs break-all">{worktree.branch_name}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground mb-0.5">Path</div>
                    <div className="font-mono text-xs break-all">{worktree.worktree_path}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground mb-0.5">Created</div>
                    <div className="text-xs">{new Date(worktree.created_at).toLocaleString()}</div>
                  </div>
                  {size !== null && (
                    <div>
                      <div className="text-xs text-muted-foreground mb-0.5">Size</div>
                      <div className="text-xs flex items-center gap-1">
                        <HardDrive className="w-3 h-3" />
                        {formatBytes(size)}
                      </div>
                    </div>
                  )}
                </div>

                {/* Git Status */}
                {loading ? (
                  <div className="text-xs text-muted-foreground">Loading git info...</div>
                ) : (
                  <div className="space-y-2">
                    <div className="text-xs text-muted-foreground">Git Status</div>
                    {branchInfo && (
                      <div className="flex flex-wrap gap-1.5 text-xs">
                        {branchInfo.ahead > 0 && (
                          <div className="px-2 py-0.5 bg-green-500/10 text-green-600 dark:text-green-400 rounded-md">
                            ↑ {branchInfo.ahead} ahead
                          </div>
                        )}
                        {branchInfo.behind > 0 && (
                          <div className="px-2 py-0.5 bg-orange-500/10 text-orange-600 dark:text-orange-400 rounded-md">
                            ↓ {branchInfo.behind} behind
                          </div>
                        )}
                        {branchInfo.ahead === 0 && branchInfo.behind === 0 && (
                          <div className="px-2 py-0.5 bg-muted text-muted-foreground rounded-md">
                            Up to date
                          </div>
                        )}
                      </div>
                    )}
                    {status && (
                      <div className="flex flex-wrap gap-1.5 text-xs">
                        {totalChanges > 0 ? (
                          <>
                            {status.modified > 0 && (
                              <div className="px-2 py-0.5 bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 rounded-md">
                                {status.modified} modified
                              </div>
                            )}
                            {(status.added + status.untracked) > 0 && (
                              <div className="px-2 py-0.5 bg-green-500/10 text-green-600 dark:text-green-400 rounded-md">
                                {status.added} added | {status.untracked} untracked
                              </div>
                            )}
                            {status.deleted > 0 && (
                              <div className="px-2 py-0.5 bg-red-500/10 text-red-600 dark:text-red-400 rounded-md">
                                {status.deleted} deleted
                              </div>
                            )}
                          </>
                        ) : (
                          <div className="px-2 py-0.5 bg-muted text-muted-foreground rounded-md">
                            No changes
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </CardHeader>
    </Card>
  );
};
