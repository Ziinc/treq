import { useState, useEffect } from "react";
import { listCommits, type JjLogCommit } from "../lib/api";

interface UsePaginatedCommitsResult {
	commits: JjLogCommit[];
	targetBranchCommits: JjLogCommit[];
	targetBranchCommitsBranch: string | null;
	loading: boolean;
	loadingMore: boolean;
	loadMoreHomeRepo: () => void;
	loadMoreTargetBranch: () => void;
	/** Remove a single commit from the local list (e.g. after abandon). */
	removeCommit: (commitId: string) => void;
	/** True when there are likely more home-repo commits to fetch. */
	canLoadMoreHomeRepo: (visibleCount: number) => boolean;
	/** True when there are likely more target-branch commits to fetch. */
	canLoadMoreTargetBranch: (visibleCount: number) => boolean;
}

const HOME_REPO_INITIAL_LIMIT = 15;
const HOME_REPO_PAGE_SIZE = 15;
const TARGET_BRANCH_INITIAL_LIMIT = 10;
const TARGET_BRANCH_PAGE_SIZE = 10;

export function usePaginatedCommits(
	repoPath: string,
	workspaceId: number | null,
): UsePaginatedCommitsResult {
	const isHomeRepo = workspaceId == null;

	const [commits, setCommits] = useState<JjLogCommit[]>([]);
	const [targetBranchCommits, setTargetBranchCommits] = useState<JjLogCommit[]>([]);
	const [targetBranchCommitsBranch, setTargetBranchCommitsBranch] = useState<string | null>(null);
	const [targetBranchLimit, setTargetBranchLimit] = useState(TARGET_BRANCH_INITIAL_LIMIT);
	const [homeRepoLimit, setHomeRepoLimit] = useState(HOME_REPO_INITIAL_LIMIT);
	const [loadingMore, setLoadingMore] = useState(false);
	const [loading, setLoading] = useState(true);

	// Initial load — also resets limits when repoPath/workspaceId changes
	useEffect(() => {
		if (!repoPath) {
			setLoading(false);
			return;
		}
		setLoading(true);
		setTargetBranchLimit(TARGET_BRANCH_INITIAL_LIMIT);
		setHomeRepoLimit(HOME_REPO_INITIAL_LIMIT);
		listCommits(repoPath, workspaceId, !isHomeRepo)
			.then((result) => {
				const nextCommits = result?.commits ?? [];
				setCommits(nextCommits.slice(1)); // Skip working copy
				if (!isHomeRepo) {
					setTargetBranchCommits(result?.target_branch_commits ?? []);
					setTargetBranchCommitsBranch(result?.target_branch ?? null);
				} else {
					setTargetBranchCommits([]);
					setTargetBranchCommitsBranch(null);
				}
			})
			.catch((err) => {
				console.error("Failed to fetch commit history:", err);
				setCommits([]);
				setTargetBranchCommits([]);
			})
			.finally(() => setLoading(false));
	}, [repoPath, workspaceId, isHomeRepo]);

	// Re-fetch target branch commits when the limit is increased
	useEffect(() => {
		if (targetBranchLimit <= TARGET_BRANCH_INITIAL_LIMIT) return;
		if (isHomeRepo || workspaceId == null) return;
		setLoadingMore(true);
		listCommits(repoPath, workspaceId, true, targetBranchLimit)
			.then((result) => {
				setTargetBranchCommits(result?.target_branch_commits ?? []);
			})
			.catch(() => {})
			.finally(() => setLoadingMore(false));
	}, [targetBranchLimit, repoPath, workspaceId, isHomeRepo]);

	// Re-fetch home repo commits when the limit is increased
	useEffect(() => {
		if (homeRepoLimit <= HOME_REPO_INITIAL_LIMIT) return;
		if (!isHomeRepo || !repoPath) return;
		setLoadingMore(true);
		listCommits(repoPath, null, false, undefined, homeRepoLimit)
			.then((result) => {
				setCommits((result?.commits ?? []).slice(1)); // Skip working copy
			})
			.catch(() => {})
			.finally(() => setLoadingMore(false));
	}, [homeRepoLimit, repoPath, isHomeRepo]);

	return {
		commits,
		targetBranchCommits,
		targetBranchCommitsBranch,
		loading,
		loadingMore,
		loadMoreHomeRepo: () => setHomeRepoLimit((prev) => prev + HOME_REPO_PAGE_SIZE),
		loadMoreTargetBranch: () => setTargetBranchLimit((prev) => prev + TARGET_BRANCH_PAGE_SIZE),
		removeCommit: (commitId: string) =>
			setCommits((prev) => prev.filter((c) => c.commit_id !== commitId)),
		canLoadMoreHomeRepo: (visibleCount: number) =>
			visibleCount + 1 >= homeRepoLimit,
		canLoadMoreTargetBranch: (visibleCount: number) =>
			visibleCount >= targetBranchLimit,
	};
}
