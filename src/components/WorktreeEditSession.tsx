import { useEffect, useState } from "react";
import { Terminal } from "./Terminal";
import { StagingDiffViewer } from "./StagingDiffViewer";
import { Button } from "./ui/button";
import { X, GitBranch } from "lucide-react";
import { Worktree, BranchInfo, BranchDivergence, gitGetBranchInfo, gitGetBranchDivergence, getSetting } from "../lib/api";
import { cn } from "../lib/utils";

interface WorktreeEditSessionProps {
  worktree: Worktree;
  onClose: () => void;
}

export const WorktreeEditSession: React.FC<WorktreeEditSessionProps> = ({
  worktree,
  onClose,
}) => {
  const [remoteBranchInfo, setRemoteBranchInfo] = useState<BranchInfo | null>(null);
  const [maintreeBranchName, setMaintreeBranchName] = useState<string | null>(null);
  const [maintreeDivergence, setMaintreeDivergence] = useState<BranchDivergence | null>(null);
  const [mainTreePath, setMainTreePath] = useState<string | null>(null);

  useEffect(() => {
    let isCancelled = false;

    const loadMainTreePath = async () => {
      try {
        const repoPath = await getSetting("repo_path");
        if (!isCancelled) {
          setMainTreePath(repoPath || null);
        }
      } catch {
        if (!isCancelled) {
          setMainTreePath(null);
        }
      }
    };

    loadMainTreePath();
    return () => {
      isCancelled = true;
    };
  }, []);

  useEffect(() => {
    let isCancelled = false;

    const loadBranchComparisons = async () => {
      if (!worktree?.worktree_path) {
        if (!isCancelled) {
          setRemoteBranchInfo(null);
          setMaintreeBranchName(null);
          setMaintreeDivergence(null);
        }
        return;
      }

      try {
        const info = await gitGetBranchInfo(worktree.worktree_path);
        if (!isCancelled) {
          setRemoteBranchInfo(info);
        }
      } catch {
        if (!isCancelled) {
          setRemoteBranchInfo(null);
        }
      }

      if (!mainTreePath) {
        if (!isCancelled) {
          setMaintreeBranchName(null);
          setMaintreeDivergence(null);
        }
        return;
      }

      let baseBranchName = "";
      try {
        const baseInfo = await gitGetBranchInfo(mainTreePath);
        if (isCancelled) {
          return;
        }
        baseBranchName = baseInfo.name.trim();
        setMaintreeBranchName(baseInfo.name);
      } catch {
        if (!isCancelled) {
          setMaintreeBranchName(null);
          setMaintreeDivergence(null);
        }
        return;
      }

      if (!baseBranchName) {
        if (!isCancelled) {
          setMaintreeDivergence(null);
        }
        return;
      }

      try {
        const divergence = await gitGetBranchDivergence(
          mainTreePath,
          worktree.branch_name
        );
        if (!isCancelled) {
          setMaintreeDivergence(divergence);
        }
      } catch {
        if (!isCancelled) {
          setMaintreeDivergence(null);
        }
      }
    };

    loadBranchComparisons();
    const interval = setInterval(loadBranchComparisons, 30000);
    return () => {
      isCancelled = true;
      clearInterval(interval);
    };
  }, [worktree?.worktree_path, worktree?.branch_name, mainTreePath]);

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Header */}
      <div className="border-b p-4">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h2 className="text-lg font-semibold">
              Edit Session - {worktree.branch_name}
            </h2>
            <p className="text-sm text-muted-foreground">
              {worktree.worktree_path}
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
          >
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* Status indicators */}
        <div className="flex items-start gap-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1 font-mono text-foreground">
            <GitBranch className="w-3 h-3" />
            <span className="font-semibold block max-w-[160px] truncate" title={worktree.branch_name}>
              {worktree.branch_name}
            </span>
          </span>

          {maintreeBranchName && (
            <div className="flex flex-col items-center gap-1">
              <span
                className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[11px] font-mono"
                title={`Compared to ${maintreeBranchName}`}
              >
                <span>{maintreeDivergence?.ahead ?? 0}↑</span>
                <span>{maintreeDivergence?.behind ?? 0}↓</span>
              </span>
              <span className="text-[10px] uppercase tracking-wide">maintree</span>
            </div>
          )}

          <div className="flex flex-col items-center gap-1">
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[11px] font-mono",
                !remoteBranchInfo?.upstream && "opacity-50"
              )}
              title={remoteBranchInfo?.upstream ? `Tracking ${remoteBranchInfo.upstream}` : "No upstream configured"}
            >
              <span>{remoteBranchInfo?.ahead ?? 0}↑</span>
              <span>{remoteBranchInfo?.behind ?? 0}↓</span>
            </span>
            <span className="text-[10px] uppercase tracking-wide">remote</span>
          </div>
        </div>
      </div>

      {/* Split panel layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left panel - Terminal */}
        <div className="flex-1 min-w-0 border-r">
          <Terminal
            sessionId={`worktree-edit-${worktree.id}`}
            workingDir={worktree.worktree_path}
          />
        </div>

        {/* Right panel - Staging Diff Viewer */}
        <div className="flex-1 min-w-0">
          <StagingDiffViewer worktreePath={worktree.worktree_path} />
        </div>
      </div>
    </div>
  );
};


