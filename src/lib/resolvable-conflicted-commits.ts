import type { JjLogCommit } from "./api-types";

/**
 * Commits the Commits-tab inplace resolver may rewrite.
 *
 * Immutable commits are included only when every conflicted commit is on the
 * workspace branch (`!on_target_only`) and the listing is a distinct workspace
 * branch, not the home/default branch.
 */
export function resolvableConflictedCommits(
  commits: JjLogCommit[],
  onDistinctWorkspaceBranch: boolean,
): JjLogCommit[] {
  const conflicted = commits.filter(
    (commit) => commit.has_conflicts && !commit.is_working_copy,
  );
  const allOnWorkspaceBranchOnly =
    onDistinctWorkspaceBranch &&
    conflicted.length > 0 &&
    conflicted.every((commit) => !commit.on_target_only);

  return conflicted.filter(
    (commit) =>
      !commit.on_target_only &&
      (!commit.is_immutable || allOnWorkspaceBranchOnly),
  );
}
