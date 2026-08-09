import type { JjLogCommit } from "./api-types";

export interface WorkspaceDiffStats {
  insertions: number;
  deletions: number;
}

/**
 * Sum insertions/deletions across a workspace's own commits, excluding
 * commits that only belong to the target branch (`on_target_only`).
 */
export function sumWorkspaceDiffStats(
  commits: JjLogCommit[],
): WorkspaceDiffStats {
  return commits.reduce<WorkspaceDiffStats>(
    (totals, commit) => {
      if (commit.on_target_only) return totals;
      return {
        insertions: totals.insertions + commit.insertions,
        deletions: totals.deletions + commit.deletions,
      };
    },
    { insertions: 0, deletions: 0 },
  );
}
