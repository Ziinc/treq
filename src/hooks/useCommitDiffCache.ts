import { useState, useCallback } from "react";
import type { JjRevisionDiff } from "../lib/api";

interface DiffCacheEntry {
	diff: JjRevisionDiff;
	loading: boolean;
	error?: string;
}

interface UseCommitDiffCacheResult {
	expandedCommits: Set<string>;
	commitDiffs: Map<string, DiffCacheEntry>;
	/** Expand a commit and fetch its diff; does nothing if already expanded. */
	fetchAndExpand: (commitId: string) => void;
	/** Toggle expanded state; fetches diff on first expand. */
	toggleCommit: (commitId: string) => void;
}

const EMPTY_DIFF: JjRevisionDiff = { files: [], hunks_by_file: [] };

export function useCommitDiffCache(
	loadCommitDiff: (commitId: string) => Promise<JjRevisionDiff>,
): UseCommitDiffCacheResult {
	const [expandedCommits, setExpandedCommits] = useState<Set<string>>(
		new Set(),
	);
	const [commitDiffs, setCommitDiffs] = useState<Map<string, DiffCacheEntry>>(
		new Map(),
	);

	const fetchDiff = useCallback(
		(commitId: string, currentDiffs: Map<string, DiffCacheEntry>) => {
			if (currentDiffs.has(commitId)) return; // already cached
			setCommitDiffs((prev) => {
				const next = new Map(prev);
				next.set(commitId, { diff: EMPTY_DIFF, loading: true });
				return next;
			});
			loadCommitDiff(commitId)
				.then((diff) => {
					setCommitDiffs((prev) => {
						const next = new Map(prev);
						next.set(commitId, { diff, loading: false });
						return next;
					});
				})
				.catch((err) => {
					setCommitDiffs((prev) => {
						const next = new Map(prev);
						next.set(commitId, {
							diff: EMPTY_DIFF,
							loading: false,
							error: String(err),
						});
						return next;
					});
				});
		},
		[loadCommitDiff],
	);

	const fetchAndExpand = useCallback(
		(commitId: string) => {
			setExpandedCommits((prev) => {
				if (prev.has(commitId)) return prev;
				const next = new Set(prev);
				next.add(commitId);
				return next;
			});
			setCommitDiffs((currentDiffs) => {
				fetchDiff(commitId, currentDiffs);
				return currentDiffs;
			});
		},
		[fetchDiff],
	);

	const toggleCommit = useCallback(
		(commitId: string) => {
			setExpandedCommits((prev) => {
				const next = new Set(prev);
				if (next.has(commitId)) {
					next.delete(commitId);
					return next;
				}
				next.add(commitId);
				return next;
			});
			setCommitDiffs((currentDiffs) => {
				if (!currentDiffs.has(commitId)) {
					fetchDiff(commitId, currentDiffs);
				}
				return currentDiffs;
			});
		},
		[fetchDiff],
	);

	return { expandedCommits, commitDiffs, fetchAndExpand, toggleCommit };
}
