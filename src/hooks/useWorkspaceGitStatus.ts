import { useQuery } from "@tanstack/react-query";
import { gitGetStatus, gitGetBranchInfo, gitGetBranchDivergence, gitGetLineDiffStats } from "../lib/api";
import type { GitStatus, BranchInfo, BranchDivergence, LineDiffStats } from "../lib/api";

/**
 * Centralized hook for git status per workspace
 * Uses React Query to share data across components and avoid duplicate polling
 */
export function useWorkspaceGitStatus(workspacePath: string | null | undefined, options?: {
  refetchInterval?: number;
  enabled?: boolean;
  baseBranch?: string | null;
}): {
  status: GitStatus | null;
  branchInfo: BranchInfo | null;
  divergence: BranchDivergence | null;
  lineDiffStats: LineDiffStats | null;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
} {
  const enabled = options?.enabled !== false && !!workspacePath;
  const refetchInterval = options?.refetchInterval ?? 30000; // Default 30s

  const statusQuery = useQuery({
    queryKey: ["workspace-git-status", workspacePath],
    queryFn: async () => {
      if (!workspacePath) return null;
      return gitGetStatus(workspacePath);
    },
    enabled,
    refetchInterval,
    staleTime: 5000, // Consider data stale after 5s
  });

  const branchInfoQuery = useQuery({
    queryKey: ["workspace-branch-info", workspacePath],
    queryFn: async () => {
      if (!workspacePath) return null;
      return gitGetBranchInfo(workspacePath);
    },
    enabled,
    refetchInterval,
    staleTime: 5000,
  });

  const divergenceQuery = useQuery({
    queryKey: ["workspace-divergence", workspacePath, options?.baseBranch],
    queryFn: async () => {
      if (!workspacePath || !options?.baseBranch) return null;
      return gitGetBranchDivergence(workspacePath, options.baseBranch);
    },
    enabled: enabled && !!options?.baseBranch,
    refetchInterval,
    staleTime: 5000,
  });

  const lineDiffStatsQuery = useQuery({
    queryKey: ["workspace-line-diff-stats", workspacePath, options?.baseBranch],
    queryFn: async () => {
      if (!workspacePath || !options?.baseBranch) return null;
      return gitGetLineDiffStats(workspacePath, options.baseBranch);
    },
    enabled: enabled && !!options?.baseBranch,
    refetchInterval,
    staleTime: 10000,
  });

  return {
    status: statusQuery.data ?? null,
    branchInfo: branchInfoQuery.data ?? null,
    divergence: divergenceQuery.data ?? null,
    lineDiffStats: lineDiffStatsQuery.data ?? null,
    isLoading: statusQuery.isLoading || branchInfoQuery.isLoading || divergenceQuery.isLoading || lineDiffStatsQuery.isLoading,
    isError: statusQuery.isError || branchInfoQuery.isError || divergenceQuery.isError || lineDiffStatsQuery.isError,
    error: statusQuery.error || branchInfoQuery.error || divergenceQuery.error || lineDiffStatsQuery.error,
  };
}
