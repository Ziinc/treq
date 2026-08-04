import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { getGitRemoteUrl, getPrChecksViaGh, getPrInfoViaGh } from "../lib/api";
import type {
	PrCiStatus,
	PrInfo,
	WorkspaceQueueStatus,
} from "../lib/api-types";
import { FEATURES } from "../lib/features";
import { supabase } from "../lib/supabase";

/** Query key for the per-repo merge queue opt-in. */
export const mergeQueueEnabledKey = (repoFullName: string | undefined) => [
	"merge-queue-enabled",
	repoFullName,
];

export function useGitRemoteInfo(repoPath: string | undefined) {
	return useQuery({
		queryKey: ["git-remote-info", repoPath],
		queryFn: () => getGitRemoteUrl(repoPath!),
		enabled: !!repoPath,
		staleTime: 5 * 60 * 1000,
	});
}

/** Try `gh pr view`; null means the command positively reported no PR. */
export function usePrInfoViaGh(
	repoPath: string | undefined,
	branchName: string | undefined,
) {
	return useQuery<PrInfo | null>({
		queryKey: ["pr-info-gh", repoPath, branchName],
		queryFn: () => getPrInfoViaGh(repoPath!, branchName!),
		enabled: !!repoPath && !!branchName,
		staleTime: 30_000,
		refetchInterval: 60_000,
	});
}

/**
 * CI status for the branch's PR, rolled up from `gh pr checks`. Polls every
 * 15s so the indicator next to the View PR button stays live while the
 * workspace is on screen; React Query pauses the interval automatically
 * once the tab/window loses focus.
 */
export function usePrCiStatus(
	repoPath: string | undefined,
	branchName: string | undefined,
) {
	return useQuery<PrCiStatus | null>({
		queryKey: ["pr-ci-status", repoPath, branchName],
		queryFn: () => getPrChecksViaGh(repoPath!, branchName!),
		enabled: !!repoPath && !!branchName,
		staleTime: 10_000,
		refetchInterval: 15_000,
	});
}

/**
 * Whether the merge queue is switched on for this repo, as stored in Postgres.
 * A repo with no config row has never opted in, so this resolves to false --
 * the user has to turn the queue on before anything can be enqueued.
 */
export function useMergeQueueEnabled(repoPath: string | undefined) {
	const { data: remoteInfo } = useGitRemoteInfo(repoPath);

	return useQuery<boolean>({
		queryKey: mergeQueueEnabledKey(remoteInfo?.full_name),
		queryFn: async () => {
			const { data, error } = await supabase.rpc("get_merge_queue_enabled", {
				p_repo_full_name: remoteInfo!.full_name,
			});
			if (error) throw error;
			return data === true;
		},
		enabled: FEATURES.mergeQueue && !!remoteInfo,
		staleTime: 60_000,
	});
}

export function useSetMergeQueueEnabled(repoPath: string | undefined) {
	const queryClient = useQueryClient();
	const { data: remoteInfo } = useGitRemoteInfo(repoPath);

	return useMutation({
		mutationFn: async (enabled: boolean) => {
			if (!remoteInfo) throw new Error("No GitHub remote detected");
			const { error } = await supabase.rpc("set_merge_queue_enabled", {
				p_repo_full_name: remoteInfo.full_name,
				p_enabled: enabled,
			});
			if (error) throw error;
			return enabled;
		},
		onSuccess: () => {
			void queryClient.invalidateQueries({
				queryKey: mergeQueueEnabledKey(remoteInfo?.full_name),
			});
		},
	});
}

/**
 * Remove one or more branches from the queue, used by the GitHub panel's queue
 * list. Stacks are removed top-down so a branch is never left queued on top of
 * a parent that has already gone.
 */
export function useDequeueBranches(repoPath: string | undefined) {
	const queryClient = useQueryClient();
	const { data: remoteInfo } = useGitRemoteInfo(repoPath);

	return useMutation({
		mutationFn: async (branchNames: string[]) => {
			if (!remoteInfo) throw new Error("No GitHub remote detected");
			const fullName = remoteInfo.full_name;
			// Sequential top-down: never dequeue a branch before what's stacked above it.
			await [...branchNames].reverse().reduce(
				(prev, branchName) =>
					prev.then(async () => {
						const { error } = await supabase.functions.invoke(
							"enqueue-workspace",
							{
								body: {
									repo_full_name: fullName,
									branch_name: branchName,
									action: "dequeue",
								},
							},
						);
						if (error) throw error;
					}),
				Promise.resolve(),
			);
			return branchNames;
		},
		onSuccess: () => {
			void queryClient.invalidateQueries({
				queryKey: ["repo-branch-queue-statuses-panel", remoteInfo?.full_name],
			});
			void queryClient.invalidateQueries({
				queryKey: ["repo-branch-queue-statuses", remoteInfo?.full_name],
			});
			void queryClient.invalidateQueries({ queryKey: ["merge-queue-status"] });
		},
	});
}

export function useMergeQueueStatus(
	repoPath: string | undefined,
	branchName: string | undefined,
) {
	const { data: remoteInfo } = useGitRemoteInfo(repoPath);
	const { data: queueEnabled } = useMergeQueueEnabled(repoPath);

	return useQuery<WorkspaceQueueStatus | null>({
		queryKey: ["merge-queue-status", remoteInfo?.full_name, branchName],
		queryFn: async () => {
			if (!remoteInfo || !branchName) return null;
			const { data, error } = await supabase.rpc("get_workspace_queue_status", {
				p_repo_full_name: remoteInfo.full_name,
				p_branch_name: branchName,
			});
			if (error) throw error;
			return (data as WorkspaceQueueStatus[] | null)?.[0] ?? null;
		},
		// Never poll when off, whether by the build flag or the per-repo opt-in.
		enabled:
			FEATURES.mergeQueue &&
			queueEnabled === true &&
			!!remoteInfo &&
			!!branchName,
		refetchInterval: 30_000,
	});
}

export function useEnqueueWorkspace(
	repoPath: string | undefined,
	branchName: string | undefined,
) {
	const queryClient = useQueryClient();
	const { data: remoteInfo } = useGitRemoteInfo(repoPath);
	const { data: prInfoGh, error: prInfoGhError } = usePrInfoViaGh(
		repoPath,
		branchName,
	);
	const { data: queueEnabled } = useMergeQueueEnabled(repoPath);

	const mutate = useCallback(
		async (action: "enqueue" | "dequeue") => {
			if (!remoteInfo || !branchName)
				throw new Error("Repository or branch not detected");
			if (action === "enqueue" && !queueEnabled)
				throw new Error(
					"The merge queue is not enabled for this repository. Turn it on in the GitHub panel's Merge Queue tab.",
				);
			if (action === "enqueue" && prInfoGhError) throw prInfoGhError;

			if (prInfoGh !== undefined && prInfoGh !== null) {
				if (prInfoGh.state !== "OPEN" && action === "enqueue") {
					throw new Error(
						`No open PR found for branch '${branchName}' (gh reports: ${prInfoGh.state})`,
					);
				}
			}

			const { error } = await supabase.functions.invoke("enqueue-workspace", {
				body: {
					repo_full_name: remoteInfo.full_name,
					branch_name: branchName,
					action,
				},
			});
			if (error) throw error;

			// Refresh every view of the queue, not just this workspace's button.
			await Promise.all([
				queryClient.invalidateQueries({
					queryKey: ["merge-queue-status", remoteInfo.full_name, branchName],
				}),
				queryClient.invalidateQueries({
					queryKey: ["repo-branch-queue-statuses", remoteInfo.full_name],
				}),
				queryClient.invalidateQueries({
					queryKey: ["repo-branch-queue-statuses-panel", remoteInfo.full_name],
				}),
			]);
		},
		[
			remoteInfo,
			branchName,
			prInfoGh,
			prInfoGhError,
			queueEnabled,
			queryClient,
		],
	);

	const enqueue = useMutation({ mutationFn: () => mutate("enqueue") });
	const dequeue = useMutation({ mutationFn: () => mutate("dequeue") });

	return { enqueue, dequeue, remoteInfo, prInfoGh, prInfoGhError };
}
