import { useQuery } from "@tanstack/react-query";
import { gitGetWorkspaceInfo } from "../lib/api";
import type { GitStatus, BranchInfo, BranchDivergence, LineDiffStats } from "../lib/api";

/**
 * Centralized hook for git status per workspace
 * Uses React Query to share data across components and avoid duplicate polling
 * Fetches all git info in a single combined query for better performance
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

  const combinedQuery = useQuery({
    queryKey: ["workspace-git-info", workspacePath, options?.baseBranch],
    queryFn: async () => {
      if (!workspacePath) return null;
      return gitGetWorkspaceInfo(workspacePath, options?.baseBranch);
    },
    enabled,
    refetchInterval,
    staleTime: 5000, // Consider data stale after 5s
  });

  return {
    status: combinedQuery.data?.status ?? null,
    branchInfo: combinedQuery.data?.branch_info ?? null,
    divergence: combinedQuery.data?.divergence ?? null,
    lineDiffStats: combinedQuery.data?.line_diff_stats ?? null,
    isLoading: combinedQuery.isLoading,
    isError: combinedQuery.isError,
    error: combinedQuery.error,
  };
}
