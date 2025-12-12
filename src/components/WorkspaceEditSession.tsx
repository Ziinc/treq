import { useEffect, useState } from "react";
import { Terminal } from "./Terminal";
import { StagingDiffViewer } from "./StagingDiffViewer";
import { Button } from "./ui/button";
import { X, GitBranch } from "lucide-react";
import { Workspace, BranchInfo, BranchDivergence, gitGetBranchInfo, gitGetBranchDivergence, getSetting } from "../lib/api";
import { cn } from "../lib/utils";

interface WorkspaceEditSessionProps {
  workspace: Workspace;
  onClose: () => void;
}

export const WorkspaceEditSession: React.FC<WorkspaceEditSessionProps> = ({
  workspace,
  onClose,
}) => {
  const [remoteBranchInfo, setRemoteBranchInfo] = useState<BranchInfo | null>(null);
  const [mainBranchName, setMainBranchName] = useState<string | null>(null);
  const [mainDivergence, setMainDivergence] = useState<BranchDivergence | null>(null);
  const [mainRepoPath, setMainRepoPath] = useState<string | null>(null);

  useEffect(() => {
    let isCancelled = false;

    const loadMainRepoPath = async () => {
      try {
        const repoPath = await getSetting("repo_path");
        if (!isCancelled) {
          setMainRepoPath(repoPath || null);
        }
      } catch {
        if (!isCancelled) {
          setMainRepoPath(null);
        }
      }
    };

    loadMainRepoPath();
    return () => {
      isCancelled = true;
    };
  }, []);

  useEffect(() => {
    let isCancelled = false;

    const loadBranchComparisons = async () => {
      if (!workspace?.workspace_path) {
        if (!isCancelled) {
          setRemoteBranchInfo(null);
          setMainBranchName(null);
          setMainDivergence(null);
        }
        return;
      }

      try {
        const info = await gitGetBranchInfo(workspace.workspace_path);
        if (!isCancelled) {
          setRemoteBranchInfo(info);
        }
      } catch {
        if (!isCancelled) {
          setRemoteBranchInfo(null);
        }
      }

      if (!mainRepoPath) {
        if (!isCancelled) {
          setMainBranchName(null);
          setMainDivergence(null);
        }
        return;
      }

      let baseBranchName = "";
      try {
        const baseInfo = await gitGetBranchInfo(mainRepoPath);
        if (isCancelled) {
          return;
        }
        baseBranchName = baseInfo.name.trim();
        setMainBranchName(baseInfo.name);
      } catch {
        if (!isCancelled) {
          setMainBranchName(null);
          setMainDivergence(null);
        }
        return;
      }

      if (!baseBranchName) {
        if (!isCancelled) {
          setMainDivergence(null);
        }
        return;
      }

      try {
        const divergence = await gitGetBranchDivergence(
          mainRepoPath,
          workspace.branch_name
        );
        if (!isCancelled) {
          setMainDivergence(divergence);
        }
      } catch {
        if (!isCancelled) {
          setMainDivergence(null);
        }
      }
    };

    loadBranchComparisons();
    const interval = setInterval(loadBranchComparisons, 30000);
    return () => {
      isCancelled = true;
      clearInterval(interval);
    };
  }, [workspace?.workspace_path, workspace?.branch_name, mainRepoPath]);

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Header */}
      <div className="border-b p-4">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h2 className="text-lg font-semibold">
              Edit Session - {workspace.branch_name}
            </h2>
            <p className="text-sm text-muted-foreground">
              {workspace.workspace_path}
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
            <span className="font-semibold block max-w-[160px] truncate" title={workspace.branch_name}>
              {workspace.branch_name}
            </span>
          </span>

          {mainBranchName && (
            <div className="flex flex-col items-center gap-1">
              <span
                className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[11px] font-mono"
                title={`Compared to ${mainBranchName}`}
              >
                <span>{mainDivergence?.ahead ?? 0}↑</span>
                <span>{mainDivergence?.behind ?? 0}↓</span>
              </span>
              <span className="text-[10px] uppercase tracking-wide">main</span>
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
            sessionId={`workspace-edit-${workspace.id}`}
            workingDir={workspace.workspace_path}
          />
        </div>

        {/* Right panel - Staging Diff Viewer */}
        {/* <div className="flex-1 min-w-0">
          <StagingDiffViewer workspacePath={workspace.workspace_path} />
        </div> */}
      </div>
    </div>
  );
};
