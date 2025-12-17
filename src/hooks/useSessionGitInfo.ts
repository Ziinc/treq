import { useState, useEffect } from "react";
import {
  getSetting,
  gitGetBranchInfo,
  gitGetBranchDivergence,
  gitGetLineDiffStats,
  type BranchInfo,
  type BranchDivergence,
  type LineDiffStats,
  type Workspace,
} from "../lib/api";

export interface SessionGitInfo {
  mainTreePath: string | null;
  remoteBranchInfo: BranchInfo | null;
  maintreeBranchName: string | null;
  maintreeDivergence: BranchDivergence | null;
  lineStats: LineDiffStats | null;
}

/**
 * Hook to load and track git information for a session workspace
 * including branch info, divergence from main tree, and line diff stats
 */
export function useSessionGitInfo(
  workspace: Workspace | undefined,
  refreshSignal: number,
  isHidden: boolean,
  mainRepoBranch: string | null
): SessionGitInfo {
  const [mainTreePath, setMainTreePath] = useState<string | null>(null);
  const [remoteBranchInfo, setRemoteBranchInfo] = useState<BranchInfo | null>(null);
  const [maintreeBranchName, setMaintreeBranchName] = useState<string | null>(null);
  const [maintreeDivergence, setMaintreeDivergence] = useState<BranchDivergence | null>(null);
  const [lineStats, setLineStats] = useState<LineDiffStats | null>(null);

  // Load main tree path from settings
  useEffect(() => {
    const loadMainTreePath = async () => {
      try {
        const repoPath = await getSetting("repo_path");
        setMainTreePath(repoPath || null);
      } catch {
        setMainTreePath(null);
      }
    };
    loadMainTreePath();
  }, []);

  // Load branch comparison information
  useEffect(() => {
    // Skip expensive git operations when hidden
    if (isHidden) {
      return;
    }

    let isCancelled = false;

    const loadBranchComparisons = async () => {
      if (!workspace?.workspace_path) {
        if (!isCancelled) {
          setRemoteBranchInfo(null);
          setMaintreeBranchName(null);
          setMaintreeDivergence(null);
          setLineStats(null);
        }
        return;
      }

      // Parallelize: Fetch both workspace and main tree branch info at once
      const branchInfoPromises: [
        Promise<BranchInfo>,
        Promise<BranchInfo | null>
      ] = [
        gitGetBranchInfo(workspace.workspace_path),
        mainTreePath ? gitGetBranchInfo(mainTreePath) : Promise.resolve(null),
      ];

      let mainTreeBranchInfo: BranchInfo | null = null;

      try {
        const [wsInfo, mtInfo] = await Promise.all(branchInfoPromises);
        if (isCancelled) return;

        mainTreeBranchInfo = mtInfo;

        setRemoteBranchInfo(wsInfo);
        setMaintreeBranchName(mtInfo?.name ?? null);
      } catch (error) {
        if (isCancelled) return;
        setRemoteBranchInfo(null);
        setMaintreeBranchName(null);
        setMaintreeDivergence(null);
        setLineStats(null);
        return;
      }

      // If no main tree branch, we're done
      if (!mainTreeBranchInfo?.name) {
        if (!isCancelled) {
          setMaintreeDivergence(null);
          setLineStats(null);
        }
        return;
      }

      const baseBranchName = mainTreeBranchInfo.name.trim();
      if (!baseBranchName) {
        if (!isCancelled) {
          setMaintreeDivergence(null);
          setLineStats(null);
        }
        return;
      }

      // Parallelize: Fetch divergence and line stats at once
      try {
        const [divergence, stats] = await Promise.all([
          gitGetBranchDivergence(workspace.workspace_path, baseBranchName),
          gitGetLineDiffStats(workspace.workspace_path, baseBranchName),
        ]);

        if (!isCancelled) {
          setMaintreeDivergence(divergence);
          setLineStats(stats);
        }
      } catch (error) {
        if (!isCancelled) {
          // Set what we can, even if one fails
          setMaintreeDivergence(null);
          setLineStats(null);
        }
      }
    };

    loadBranchComparisons();

    return () => {
      isCancelled = true;
    };
  }, [
    workspace?.workspace_path,
    mainTreePath,
    refreshSignal,
    isHidden,
    mainRepoBranch,
  ]);

  return {
    mainTreePath,
    remoteBranchInfo,
    maintreeBranchName,
    maintreeDivergence,
    lineStats,
  };
}
