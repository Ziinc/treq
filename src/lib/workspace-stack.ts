import type {
  JjLogCommit,
  JjLogResult,
  JjTentativeWorkingCopy,
} from "./api-types";

export interface WorkspaceDiffStats {
  insertions: number;
  deletions: number;
}

/**
 * Sum insertions/deletions across a workspace's own commits, excluding
 * commits that only belong to the target branch (`on_target_only`).
 * When `tentativeWorkingCopy` is provided, its LOC is included so the
 * total covers committed + uncommitted working-copy changes.
 */
export function sumWorkspaceDiffStats(
  commits: JjLogCommit[],
  tentativeWorkingCopy?: JjTentativeWorkingCopy | null,
): WorkspaceDiffStats {
  const fromCommits = commits.reduce<WorkspaceDiffStats>(
    (totals, commit) => {
      if (commit.on_target_only) return totals;
      return {
        insertions: totals.insertions + commit.insertions,
        deletions: totals.deletions + commit.deletions,
      };
    },
    { insertions: 0, deletions: 0 },
  );

  if (!tentativeWorkingCopy) return fromCommits;

  return {
    insertions: fromCommits.insertions + tentativeWorkingCopy.commit.insertions,
    deletions: fromCommits.deletions + tentativeWorkingCopy.commit.deletions,
  };
}

/** Aggregate LOC for a workspace from a `listCommits` result (commits + WC). */
export function sumWorkspaceLocFromLog(
  result: Pick<JjLogResult, "commits" | "tentative_working_copy">,
): WorkspaceDiffStats {
  return sumWorkspaceDiffStats(
    result.commits ?? [],
    result.tentative_working_copy,
  );
}
