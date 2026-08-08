import type { QueryClient } from "@tanstack/react-query";

export function reviewChangeCountQueryKey(
	repoPath: string | undefined,
	workspaceId: number | null,
) {
	return ["workspace-review-change-count", repoPath, workspaceId] as const;
}

export function invalidateReviewChangeCount(
	queryClient: QueryClient,
	repoPath: string | undefined,
	workspaceId: number | null | undefined,
) {
	return queryClient.invalidateQueries({
		queryKey: reviewChangeCountQueryKey(repoPath, workspaceId ?? null),
	});
}
