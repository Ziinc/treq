import { invalidateQueries } from "./swr-cache";

export function reviewChangeCountQueryKey(
  repoPath: string | undefined,
  workspaceId: number | null,
) {
  return ["workspace-review-change-count", repoPath, workspaceId] as const;
}

export function invalidateReviewChangeCount(
  repoPath: string | undefined,
  workspaceId: number | null | undefined,
) {
  return invalidateQueries([
    ...reviewChangeCountQueryKey(repoPath, workspaceId ?? null),
  ]);
}
