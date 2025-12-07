import { useQuery } from "@tanstack/react-query";
import { gitGetStatus, gitGetBranchInfo, gitGetBranchDivergence, gitGetLineDiffStats } from "../lib/api";
import type { GitStatus, BranchInfo, BranchDivergence, LineDiffStats } from "../lib/api";

/**
 * Centralized hook for git status per worktree
 * Uses React Query to share data across components and avoid duplicate polling
 */
export function useWorktreeGitStatus(worktreePath: string | null | undefined, options?: {
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
  const enabled = options?.enabled !== false && !!worktreePath;
  const refetchInterval = options?.refetchInterval ?? 30000; // Default 30s

  const statusQuery = useQuery({
    queryKey: ["worktree-git-status", worktreePath],
    queryFn: async () => {
      if (!worktreePath) return null;
      return gitGetStatus(worktreePath);
    },
    enabled,
    refetchInterval,
    staleTime: 5000, // Consider data stale after 5s
  });

  const branchInfoQuery = useQuery({
    queryKey: ["worktree-branch-info", worktreePath],
    queryFn: async () => {
      if (!worktreePath) return null;
      return gitGetBranchInfo(worktreePath);
    },
    enabled,
    refetchInterval,
    staleTime: 5000,
  });

  const divergenceQuery = useQuery({
    queryKey: ["worktree-divergence", worktreePath, options?.baseBranch],
    queryFn: async () => {
      if (!worktreePath || !options?.baseBranch) return null;
      return gitGetBranchDivergence(worktreePath, options.baseBranch);
    },
    enabled: enabled && !!options?.baseBranch,
    refetchInterval,
    staleTime: 5000,
  });

  const lineDiffStatsQuery = useQuery({
    queryKey: ["worktree-line-diff-stats", worktreePath, options?.baseBranch],
    queryFn: async () => {
      if (!worktreePath || !options?.baseBranch) return null;
      return gitGetLineDiffStats(worktreePath, options.baseBranch);
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
