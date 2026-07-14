import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getGitRemoteUrl } from "../lib/api";
import { supabase } from "../lib/supabase";
import type { WorkspaceQueueStatus } from "../lib/api-types";

export function useGitRemoteInfo(repoPath: string | undefined) {
	return useQuery({
		queryKey: ["git-remote-info", repoPath],
		queryFn: () => getGitRemoteUrl(repoPath!),
		enabled: !!repoPath,
		staleTime: 5 * 60 * 1000, // remote URL rarely changes
	});
}

export function useMergeQueueStatus(
	repoPath: string | undefined,
	branchName: string | undefined,
) {
	const { data: remoteInfo } = useGitRemoteInfo(repoPath);

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
		enabled: !!remoteInfo && !!branchName,
		refetchInterval: 30_000,
	});
}

export function useEnqueueWorkspace(
	repoPath: string | undefined,
	branchName: string | undefined,
) {
	const queryClient = useQueryClient();
	const { data: remoteInfo } = useGitRemoteInfo(repoPath);

	const mutate = useCallback(
		async (action: "enqueue" | "dequeue") => {
			if (!remoteInfo || !branchName) throw new Error("Repository or branch not detected");
			const { error } = await supabase.functions.invoke("enqueue-workspace", {
				body: {
					repo_full_name: remoteInfo.full_name,
					branch_name: branchName,
					action,
				},
			});
			if (error) throw error;
			await queryClient.invalidateQueries({
				queryKey: ["merge-queue-status", remoteInfo.full_name, branchName],
			});
		},
		[remoteInfo, branchName, queryClient],
	);

	const enqueue = useMutation({ mutationFn: () => mutate("enqueue") });
	const dequeue = useMutation({ mutationFn: () => mutate("dequeue") });

	return { enqueue, dequeue, remoteInfo };
}
