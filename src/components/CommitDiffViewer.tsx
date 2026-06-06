/* eslint-disable max-lines, max-params, max-nested-callbacks, no-await-in-loop */

import {
	Fragment,
	memo,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import {
	type JjDiffHunk,
	type JjFileDiff,
	type JjLogCommit,
	type JjRevisionDiff,
	abandonCommit,
	getCommitDiff,
	getCommitFileDiff,
	listCommits,
} from "../lib/api";
import {
	cn,
	formatDayLabel,
	formatFullTimestamp,
	formatRelativeTime,
	getDayKey,
} from "../lib/utils";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "./ui/tooltip";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import {
	ArrowRightLeft,
	ChevronRight,
	FileText,
	Loader2,
	Plus,
	Trash2,
} from "lucide-react";
import { CommentInput } from "./CommentInput";
import { useToast } from "./ui/toast";
import { ask } from "@tauri-apps/plugin-dialog";

interface CommitDiffViewerProps {
	repoPath: string;
	workspaceId: number | null;
	scrollToCommitId?: string | null;
	onScrollComplete?: () => void;
	onCommitMoved?: () => void;
	onCommitAbandoned?: () => void;
	onCreateAgentWithComment?: (
		filePath: string,
		startLine: number,
		endLine: number,
		lineContent: string[],
		commentText: string,
		commitShortId: string,
		mode: "plan" | "acceptEdits",
	) => void;
	/** Called when user wants to move a commit to a new workspace */
	onMoveCommitToNewWorkspace?: (commit: JjLogCommit) => void;
	/** Called when user wants to move a commit to an existing workspace */
	onMoveCommitToExistingWorkspace?: (commit: JjLogCommit) => void;
}

interface DayGroup {
	dayKey: string;
	label: string;
	commits: JjLogCommit[];
}

function normalizeCommits(commits: JjLogCommit[]): JjLogCommit[] {
	if (commits.length < 2) {
		return commits;
	}

	const [first, second, ...rest] = commits;
	const looksLikeWorkingCopyPlaceholder =
		first.description === "(no description)" &&
		first.bookmarks.length === 0 &&
		!first.is_immutable &&
		first.parent_ids.includes(second.commit_id);

	if (!looksLikeWorkingCopyPlaceholder) {
		return commits;
	}

	return [second, ...rest];
}

function groupCommitsByDay(commits: JjLogCommit[]): DayGroup[] {
	const groups: DayGroup[] = [];
	for (const commit of commits) {
		const key = getDayKey(commit.timestamp);
		const last = groups[groups.length - 1];
		if (last && last.dayKey === key) {
			last.commits.push(commit);
		} else {
			groups.push({
				dayKey: key,
				label: formatDayLabel(commit.timestamp),
				commits: [commit],
			});
		}
	}
	return groups;
}

// Parse hunk header to extract starting line numbers
const parseHunkHeader = (
	header: string,
): { oldStart: number; newStart: number } => {
	const match = header.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
	if (!match) return { oldStart: 1, newStart: 1 };
	return {
		oldStart: parseInt(match[1], 10),
		newStart: parseInt(match[2], 10),
	};
};

export const CommitDiffViewer = memo<CommitDiffViewerProps>(
	({
		repoPath,
		workspaceId,
		scrollToCommitId,
		onScrollComplete,
		onCommitAbandoned,
		onCreateAgentWithComment,
		onMoveCommitToNewWorkspace,
		onMoveCommitToExistingWorkspace,
	}) => {
		const isHomeRepo = workspaceId == null;
		const [commits, setCommits] = useState<JjLogCommit[]>([]);
		const [targetBranchCommits, setTargetBranchCommits] = useState<
			JjLogCommit[]
		>([]);
		const [targetBranchCommitsBranch, setTargetBranchCommitsBranch] = useState<
			string | null
		>(null);
		const [workspaceBranch, setWorkspaceBranch] = useState<string | null>(null);
		const [targetBranchLimit, setTargetBranchLimit] = useState(10);
		const [homeRepoLimit, setHomeRepoLimit] = useState(15);
		const [loadingMore, setLoadingMore] = useState(false);
		const [loading, setLoading] = useState(true);
		const [expandedCommits, setExpandedCommits] = useState<Set<string>>(
			new Set(),
		);
		const [commitDiffs, setCommitDiffs] = useState<
			Map<string, { diff: JjRevisionDiff; loading: boolean; error?: string }>
		>(new Map());
		const containerRef = useRef<HTMLDivElement>(null);

		// Move/abandon commit state
		const [removingCommitIds, setRemovingCommitIds] = useState<Set<string>>(
			new Set(),
		);
		const { addToast } = useToast();

		const handleMoveToNew = useCallback(
			(commit: JjLogCommit) => {
				onMoveCommitToNewWorkspace?.(commit);
			},
			[onMoveCommitToNewWorkspace],
		);

		const handleMoveToExisting = useCallback(
			(commit: JjLogCommit) => {
				onMoveCommitToExistingWorkspace?.(commit);
			},
			[onMoveCommitToExistingWorkspace],
		);

		const REMOVE_ANIMATION_MS = 220;

		const loadCommitDiff = useCallback(
			async (commitId: string): Promise<JjRevisionDiff> => {
				const commit = commits.find((c) => c.commit_id === commitId);
				// Commit IDs resolve more consistently for per-commit diffs; keep
				// change_id as a fallback for rewritten/alternate revisions.
				const revisions = [commitId, commit?.change_id].filter(
					(value, index, values): value is string =>
						typeof value === "string" &&
						value.length > 0 &&
						values.indexOf(value) === index,
				);

				let lastError: unknown;
				for (const revision of revisions) {
					try {
						const diff = await getCommitDiff(repoPath, workspaceId, revision);
						if (
							diff.too_large_to_render ||
							diff.committed_files.length > 0 ||
							diff.hunks_by_file.length > 0
						) {
							return diff;
						}
					} catch (error) {
						lastError = error;
					}
				}

				if (lastError) throw lastError;
				return {
					committed_files: [],
					hunks_by_file: [],
					too_large_to_render: false,
					render_block_reason: null,
				};
			},
			[repoPath, workspaceId, commits],
		);

		const loadCommitFileDiff = useCallback(
			async (commitId: string, filePath: string): Promise<JjFileDiff> => {
				const commit = commits.find(
					(candidate) => candidate.commit_id === commitId,
				);
				const revisions = [commitId, commit?.change_id].filter(
					(value, index, values): value is string =>
						typeof value === "string" &&
						value.length > 0 &&
						values.indexOf(value) === index,
				);

				let lastError: unknown;
				for (const revision of revisions) {
					try {
						return await getCommitFileDiff(
							repoPath,
							workspaceId,
							revision,
							filePath,
						);
					} catch (error) {
						lastError = error;
					}
				}

				throw lastError ?? new Error("Failed to load commit file diff");
			},
			[repoPath, workspaceId, commits],
		);

		const handleAbandon = useCallback(
			async (commit: JjLogCommit) => {
				if (!repoPath || !workspaceId) return;

				const firstLine = commit.description.split("\n")[0] || "(no message)";
				const confirmed = await ask(
					`Abandon commit ${commit.short_id} — ${firstLine}?`,
					{ title: "Delete Commit", kind: "warning" },
				);
				if (!confirmed) return;

				try {
					await abandonCommit(repoPath, workspaceId, commit.change_id);
					setRemovingCommitIds((prev) => new Set(prev).add(commit.commit_id));

					window.setTimeout(() => {
						setCommits((prev) =>
							prev.filter((c) => c.commit_id !== commit.commit_id),
						);
						setRemovingCommitIds((prev) => {
							const next = new Set(prev);
							next.delete(commit.commit_id);
							return next;
						});
						onCommitAbandoned?.();
					}, REMOVE_ANIMATION_MS);

					addToast({
						title: "Commit deleted",
						description: `Abandoned commit ${commit.short_id}`,
						type: "success",
					});
				} catch (err) {
					const errorMsg = err instanceof Error ? err.message : String(err);
					addToast({
						title: "Failed to delete commit",
						description: errorMsg,
						type: "error",
					});
				}
			},
			[repoPath, workspaceId, onCommitAbandoned, addToast],
		);

		// Fetch commits
		useEffect(() => {
			if (!repoPath) {
				setLoading(false);
				return;
			}
			setLoading(true);
			setTargetBranchLimit(10);
			setHomeRepoLimit(15);
			listCommits(repoPath, workspaceId, !isHomeRepo)
				.then((result) => {
					const nextCommits = result?.commits ?? [];
					setCommits(normalizeCommits(nextCommits));
					setWorkspaceBranch(result?.workspace_branch ?? null);
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
					setWorkspaceBranch(null);
				})
				.finally(() => setLoading(false));
		}, [repoPath, workspaceId, isHomeRepo]);

		// Re-fetch target branch commits when limit changes (beyond initial load)
		useEffect(() => {
			if (targetBranchLimit <= 10) return; // initial load handled above
			if (isHomeRepo || workspaceId == null) return;
			setLoadingMore(true);
			listCommits(repoPath, workspaceId, true, targetBranchLimit)
				.then((result) => {
					setTargetBranchCommits(result?.target_branch_commits ?? []);
				})
				.catch(() => {})
				.finally(() => setLoadingMore(false));
		}, [targetBranchLimit, repoPath, workspaceId, isHomeRepo]);

		// Re-fetch home repo commits when limit changes (beyond initial load)
		useEffect(() => {
			if (homeRepoLimit <= 15) return; // initial load handled above
			if (!isHomeRepo || !repoPath) return;
			setLoadingMore(true);
			listCommits(repoPath, null, false, undefined, homeRepoLimit)
				.then((result) => {
					setCommits(normalizeCommits(result?.commits ?? []));
				})
				.catch(() => {})
				.finally(() => setLoadingMore(false));
		}, [homeRepoLimit, repoPath, isHomeRepo]);

		// Scroll to commit when scrollToCommitId changes
		useEffect(() => {
			if (!scrollToCommitId || loading) return;
			// Find the commit by change_id to get its commit_id for the key
			const commit = commits.find((c) => c.change_id === scrollToCommitId);
			if (!commit) return;
			const el = containerRef.current?.querySelector(
				`[data-commit-id="${commit.commit_id}"]`,
			);
			if (el) {
				el.scrollIntoView({ behavior: "smooth", block: "start" });
				// Auto-expand the commit
				fetchAndExpand(commit.commit_id);
				onScrollComplete?.();
			}
		}, [scrollToCommitId, loading, commits]);

		const fetchAndExpand = useCallback(
			(commitId: string) => {
				setExpandedCommits((prev) => {
					if (prev.has(commitId)) return prev;
					const next = new Set(prev);
					next.add(commitId);
					return next;
				});
				// Fetch diff if not already loaded
				if (!commitDiffs.has(commitId)) {
					setCommitDiffs((prev) => {
						const next = new Map(prev);
						next.set(commitId, {
							diff: {
								committed_files: [],
								hunks_by_file: [],
								too_large_to_render: false,
								render_block_reason: null,
							},
							loading: true,
						});
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
									diff: {
										committed_files: [],
										hunks_by_file: [],
										too_large_to_render: false,
										render_block_reason: null,
									},
									loading: false,
									error: String(err),
								});
								return next;
							});
						});
				}
			},
			[commitDiffs, loadCommitDiff],
		);

		const toggleCommit = useCallback(
			(commitId: string) => {
				setExpandedCommits((prev) => {
					const next = new Set(prev);
					if (next.has(commitId)) {
						next.delete(commitId);
					} else {
						next.add(commitId);
						// Fetch diff if not already loaded
						if (!commitDiffs.has(commitId)) {
							setCommitDiffs((prev) => {
								const next = new Map(prev);
								next.set(commitId, {
									diff: {
										committed_files: [],
										hunks_by_file: [],
										too_large_to_render: false,
										render_block_reason: null,
									},
									loading: true,
								});
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
											diff: {
												committed_files: [],
												hunks_by_file: [],
												too_large_to_render: false,
												render_block_reason: null,
											},
											loading: false,
											error: String(err),
										});
										return next;
									});
								});
						}
					}
					return next;
				});
			},
			[commitDiffs, loadCommitDiff],
		);

		const dayGroups = useMemo(() => groupCommitsByDay(commits), [commits]);

		const targetBranchDayGroups = useMemo(
			() => groupCommitsByDay(targetBranchCommits),
			[targetBranchCommits],
		);
		const isDefaultWorkspaceBranch =
			!isHomeRepo &&
			workspaceBranch != null &&
			targetBranchCommitsBranch != null &&
			workspaceBranch === targetBranchCommitsBranch;
		const showTargetBranchSection =
			!isHomeRepo &&
			!isDefaultWorkspaceBranch &&
			targetBranchCommits.length > 0;

		if (loading) {
			return (
				<div className="h-full flex items-center justify-center p-4">
					<Loader2 className="w-4 h-4 animate-spin mr-2" />
					<p className="text-sm text-muted-foreground">Loading commits...</p>
				</div>
			);
		}

		if (commits.length === 0 && !showTargetBranchSection) {
			return (
				<div className="p-4 text-center">
					<p className="text-sm text-muted-foreground">No commits yet.</p>
					<p className="text-sm text-muted-foreground">
						Changes you commit will appear here.
					</p>
				</div>
			);
		}

		let globalIndex = 0;

		return (
			<>
				<div ref={containerRef} className="h-full overflow-auto">
					<div className="p-4">
						<div className="relative">
							<div
								className="absolute left-[7px] top-2 bottom-2 w-0.5 bg-border"
								aria-hidden="true"
							/>

							{dayGroups.map((group, groupIndex) => (
								<div
									key={`${group.dayKey}-${groupIndex}`}
									className="mt-5 first:mt-0"
								>
									<p className="text-xs font-semibold text-muted-foreground mb-1 pl-7">
										{group.label}
									</p>
									<div className="space-y-0">
										{group.commits.map((commit) => {
											const isFirst = globalIndex === 0;
											globalIndex++;
											const isExpanded = expandedCommits.has(commit.commit_id);
											const diffData = commitDiffs.get(commit.commit_id);

											return (
												<CommitWithDiff
													key={commit.commit_id}
													commit={commit}
													isFirst={isFirst}
													isExpanded={isExpanded}
													diffData={diffData}
													onToggle={() => toggleCommit(commit.commit_id)}
													canAction={!commit.is_immutable}
													isRemoving={removingCommitIds.has(commit.commit_id)}
													onMoveToNew={handleMoveToNew}
													onMoveToExisting={handleMoveToExisting}
													onAbandon={handleAbandon}
													onCreateAgentWithComment={onCreateAgentWithComment}
													onLoadDeferredFileDiff={(filePath) =>
														loadCommitFileDiff(commit.commit_id, filePath).then(
															(fileDiff) => {
																setCommitDiffs((prev) => {
																	const next = new Map(prev);
																	const current = next.get(commit.commit_id);
																	if (!current) return prev;
																	next.set(commit.commit_id, {
																		...current,
																		diff: {
																			...current.diff,
																			hunks_by_file: [
																				...current.diff.hunks_by_file.filter(
																					(candidate) =>
																						candidate.path !== fileDiff.path,
																				),
																				fileDiff,
																			],
																		},
																	});
																	return next;
																});
															},
														)
													}
												/>
											);
										})}
									</div>
								</div>
							))}

							{isHomeRepo && commits.length + 1 >= homeRepoLimit && (
								<div className="mt-3 pl-7">
									<button
										type="button"
										className="text-xs text-muted-foreground hover:text-foreground transition-colors"
										disabled={loadingMore}
										onClick={() => setHomeRepoLimit((prev) => prev + 15)}
									>
										{loadingMore ? (
											<span className="flex items-center gap-1.5">
												<Loader2 className="w-3 h-3 animate-spin" />
												Loading...
											</span>
										) : (
											"Load more commits"
										)}
									</button>
								</div>
							)}

							{showTargetBranchSection && (
								<>
									{commits.length === 0 && (
										<p className="text-sm text-muted-foreground mb-3 pl-7">
											There are no commits within this workspace branch yet.
										</p>
									)}
									<div className="border-t border-border my-4 mx-2" />
									<p className="text-xs font-semibold text-muted-foreground mb-2 pl-7">
										Recent on {targetBranchCommitsBranch}
									</p>
									{targetBranchDayGroups.map((group, groupIndex) => (
										<div
											key={`tb-${group.dayKey}-${groupIndex}`}
											className="mt-5 first:mt-0"
										>
											<p className="text-xs font-semibold text-muted-foreground mb-1 pl-7">
												{group.label}
											</p>
											<div className="space-y-0">
												{group.commits.map((commit) => {
													const isExpanded = expandedCommits.has(
														commit.commit_id,
													);
													const diffData = commitDiffs.get(commit.commit_id);

													return (
														<CommitWithDiff
															key={commit.commit_id}
															commit={commit}
															isFirst={false}
															isExpanded={isExpanded}
															diffData={diffData}
															onToggle={() => toggleCommit(commit.commit_id)}
															canAction={false}
															isRemoving={false}
															onMoveToNew={() => {}}
															onMoveToExisting={() => {}}
															onAbandon={() => {}}
															onCreateAgentWithComment={
																onCreateAgentWithComment
															}
															onLoadDeferredFileDiff={(filePath) =>
																loadCommitFileDiff(
																	commit.commit_id,
																	filePath,
																).then((fileDiff) => {
																	setCommitDiffs((prev) => {
																		const next = new Map(prev);
																		const current = next.get(commit.commit_id);
																		if (!current) return prev;
																		next.set(commit.commit_id, {
																			...current,
																			diff: {
																				...current.diff,
																				hunks_by_file: [
																					...current.diff.hunks_by_file.filter(
																						(candidate) =>
																							candidate.path !== fileDiff.path,
																					),
																					fileDiff,
																				],
																			},
																		});
																		return next;
																	});
																})
															}
														/>
													);
												})}
											</div>
										</div>
									))}
									{targetBranchCommits.length >= targetBranchLimit && (
										<div className="mt-3 pl-7">
											<button
												type="button"
												className="text-xs text-muted-foreground hover:text-foreground transition-colors"
												disabled={loadingMore}
												onClick={() =>
													setTargetBranchLimit((prev) => prev + 10)
												}
											>
												{loadingMore ? (
													<span className="flex items-center gap-1.5">
														<Loader2 className="w-3 h-3 animate-spin" />
														Loading...
													</span>
												) : (
													"Load more commits"
												)}
											</button>
										</div>
									)}
								</>
							)}
						</div>
					</div>
				</div>
			</>
		);
	},
);

// --- Sub-components ---

interface CommitWithDiffProps {
	commit: JjLogCommit;
	isFirst: boolean;
	isExpanded: boolean;
	diffData?: {
		diff: JjRevisionDiff;
		loading: boolean;
		error?: string;
	};
	onToggle: () => void;
	canAction: boolean;
	isRemoving: boolean;
	onMoveToNew: (commit: JjLogCommit) => void;
	onMoveToExisting: (commit: JjLogCommit) => void;
	onAbandon: (commit: JjLogCommit) => void;
	onCreateAgentWithComment?: (
		filePath: string,
		startLine: number,
		endLine: number,
		lineContent: string[],
		commentText: string,
		commitShortId: string,
		mode: "plan" | "acceptEdits",
	) => void;
	onLoadDeferredFileDiff: (filePath: string) => Promise<void>;
}

function CommitWithDiff({
	commit,
	isFirst,
	isExpanded,
	diffData,
	onToggle,
	isRemoving,
	onMoveToNew,
	onMoveToExisting,
	onAbandon,
	onCreateAgentWithComment,
	onLoadDeferredFileDiff,
}: CommitWithDiffProps) {
	const firstLine = commit.description.split("\n")[0] || "(no message)";
	const hasStats = commit.insertions > 0 || commit.deletions > 0;

	const handleAgentComment = useCallback(
		(
			filePath: string,
			startLine: number,
			endLine: number,
			lineContent: string[],
			commentText: string,
			mode: "plan" | "acceptEdits",
		) => {
			onCreateAgentWithComment?.(
				filePath,
				startLine,
				endLine,
				lineContent,
				commentText,
				commit.short_id,
				mode,
			);
		},
		[onCreateAgentWithComment, commit.short_id],
	);

	return (
		<div data-commit-id={commit.commit_id}>
			{/* Commit header row */}
			<button
				type="button"
				onClick={onToggle}
				className={cn(
					"relative flex items-start gap-3 py-2 px-2 -mx-2 w-full text-left group",
					"hover:bg-muted/50 rounded-md transition-colors cursor-pointer",
				)}
			>
				<div className="relative z-10 flex-shrink-0">
					<div
						className={cn(
							"w-[14px] h-[14px] rounded-full border-2 border-background",
							isFirst ? "bg-primary" : "bg-muted-foreground",
						)}
					/>
				</div>

				<div className="flex-1 min-w-0 pt-0.5">
					<div className="flex items-center gap-1.5">
						<ChevronRight
							className={cn(
								"w-4 h-4 text-muted-foreground transition-transform flex-shrink-0",
								isExpanded && "rotate-90",
							)}
						/>
						<p className="text-sm truncate" title={firstLine}>
							{firstLine}
						</p>
					</div>
					<div className="flex items-center gap-2 mt-0.5 pl-5">
						<p className="text-xs text-muted-foreground font-mono">
							{commit.short_id}
						</p>
						{commit.is_immutable && (
							<span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground border border-border font-medium">
								Immutable
							</span>
						)}
						<TooltipProvider delayDuration={300}>
							<Tooltip>
								<TooltipTrigger asChild>
									<span className="text-xs text-muted-foreground">
										{formatRelativeTime(commit.timestamp)}
									</span>
								</TooltipTrigger>
								<TooltipContent>
									<p>{formatFullTimestamp(commit.timestamp)}</p>
								</TooltipContent>
							</Tooltip>
						</TooltipProvider>
						{hasStats && (
							<span className="text-xs text-muted-foreground ml-auto">
								<span className="text-green-600">+{commit.insertions}</span>{" "}
								<span className="text-red-600">-{commit.deletions}</span>
							</span>
						)}
					</div>
				</div>
			</button>

			{/* Expanded diff content */}
			{isExpanded && (
				<div className="ml-7 mb-3">
					<div className="flex items-center gap-2 mb-2">
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<button className="flex items-center gap-1.5 px-2 py-1 text-xs rounded-md border border-border hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
									<ArrowRightLeft className="w-4 h-4" />
									Move commit
								</button>
							</DropdownMenuTrigger>
							<DropdownMenuContent align="start">
								<DropdownMenuItem onClick={() => onMoveToNew(commit)}>
									Move to New Workspace
								</DropdownMenuItem>
								<DropdownMenuItem onClick={() => onMoveToExisting(commit)}>
									Move to Existing Workspace
								</DropdownMenuItem>
							</DropdownMenuContent>
						</DropdownMenu>
						<button
							className="flex items-center gap-1.5 px-2 py-1 text-xs rounded-md border border-border hover:bg-muted text-muted-foreground hover:text-destructive transition-colors"
							onClick={() => onAbandon(commit)}
							disabled={isRemoving}
						>
							<Trash2 className="w-4 h-4" />
							Delete commit
						</button>
					</div>

					<div className="border border-border rounded-md overflow-hidden">
						{diffData?.loading ? (
							<div className="flex items-center gap-2 p-3 text-sm text-muted-foreground">
								<Loader2 className="w-4 h-4 animate-spin" />
								Loading diff...
							</div>
						) : diffData?.error ? (
							<div className="p-3 text-sm text-destructive">
								Failed to load diff: {diffData.error}
							</div>
						) : diffData?.diff ? (
							<CommitDiffContent
								diff={diffData.diff}
								onCreateAgentWithComment={
									onCreateAgentWithComment ? handleAgentComment : undefined
								}
								onLoadDeferredFileDiff={onLoadDeferredFileDiff}
							/>
						) : null}
					</div>
				</div>
			)}
		</div>
	);
}

interface CommitDiffContentProps {
	diff: JjRevisionDiff;
	onCreateAgentWithComment?: (
		filePath: string,
		startLine: number,
		endLine: number,
		lineContent: string[],
		commentText: string,
		mode: "plan" | "acceptEdits",
	) => void;
	onLoadDeferredFileDiff: (filePath: string) => Promise<void>;
}

interface DiffLineSelection {
	filePath: string;
	lines: { hunkIndex: number; lineIndex: number; content: string }[];
}

interface PendingComment {
	filePath: string;
	hunkIndex: number;
	displayAtLineIndex: number;
	startLine: number;
	endLine: number;
	lineContent: string[];
}

function CommitDiffContent({
	diff,
	onCreateAgentWithComment,
	onLoadDeferredFileDiff,
}: CommitDiffContentProps) {
	// Always show all files expanded
	const [expandedFiles, setExpandedFiles] = useState<Set<string>>(
		() => new Set(diff.committed_files.map((file) => file.path)),
	);
	const [loadingDeferredFiles, setLoadingDeferredFiles] = useState<Set<string>>(
		new Set(),
	);
	const [deferredFileErrors, setDeferredFileErrors] = useState<
		Map<string, string>
	>(new Map());

	// Comment/selection state
	const [diffLineSelection, setDiffLineSelection] =
		useState<DiffLineSelection | null>(null);
	const [isSelecting, setIsSelecting] = useState(false);
	const [selectionAnchor, setSelectionAnchor] = useState<{
		filePath: string;
		hunkIndex: number;
		lineIndex: number;
	} | null>(null);
	const [pendingComment, setPendingComment] = useState<PendingComment | null>(
		null,
	);
	const [showCommentInput, setShowCommentInput] = useState(false);

	// Global mouseup listener to end drag selection
	useEffect(() => {
		const handleMouseUp = () => {
			if (isSelecting) {
				setIsSelecting(false);
			}
		};
		window.addEventListener("mouseup", handleMouseUp);
		return () => window.removeEventListener("mouseup", handleMouseUp);
	}, [isSelecting]);

	if (diff.too_large_to_render) {
		return (
			<div className="p-3 text-sm text-muted-foreground">
				{diff.render_block_reason ?? "This commit diff is too large to render."}
			</div>
		);
	}

	if (diff.committed_files.length === 0) {
		return <div className="p-3 text-sm text-muted-foreground">No changes</div>;
	}

	const toggleFile = (path: string) => {
		setExpandedFiles((prev) => {
			const next = new Set(prev);
			if (next.has(path)) {
				next.delete(path);
			} else {
				next.add(path);
			}
			return next;
		});
	};

	// Compute line numbers for a hunk
	const computeHunkLineNumbers = (hunk: JjDiffHunk) => {
		const { oldStart, newStart } = parseHunkHeader(hunk.header);
		let oldLine = oldStart;
		let newLine = newStart;

		return hunk.lines.map((line) => {
			if (line.startsWith("+")) {
				return { old: undefined, new: newLine++ };
			} else if (line.startsWith("-")) {
				return { old: oldLine++, new: undefined };
			} else {
				const result = { old: oldLine++, new: newLine++ };
				return result;
			}
		});
	};

	const buildSelectionRange = (
		filePath: string,
		fromHunk: number,
		fromLine: number,
		toHunk: number,
		toLine: number,
	): { hunkIndex: number; lineIndex: number; content: string }[] | null => {
		const fileDiff = diff.hunks_by_file.find((f) => f.path === filePath);
		if (!fileDiff) return null;

		const lines: { hunkIndex: number; lineIndex: number; content: string }[] =
			[];

		const fromGlobal = getGlobalLineIndex(fileDiff.hunks, fromHunk, fromLine);
		const toGlobal = getGlobalLineIndex(fileDiff.hunks, toHunk, toLine);

		const startGlobal = Math.min(fromGlobal, toGlobal);
		const endGlobal = Math.max(fromGlobal, toGlobal);

		let globalIdx = 0;
		for (let hi = 0; hi < fileDiff.hunks.length; hi++) {
			for (let li = 0; li < fileDiff.hunks[hi].lines.length; li++) {
				if (globalIdx >= startGlobal && globalIdx <= endGlobal) {
					lines.push({
						hunkIndex: hi,
						lineIndex: li,
						content: fileDiff.hunks[hi].lines[li],
					});
				}
				globalIdx++;
			}
		}

		return lines;
	};

	const handleLineMouseDown = (
		e: React.MouseEvent,
		filePath: string,
		hunkIndex: number,
		lineIndex: number,
		lineContent: string,
	) => {
		if (!onCreateAgentWithComment) return;
		e.preventDefault();

		// Shift-click: extend selection from existing anchor
		if (
			e.shiftKey &&
			selectionAnchor &&
			selectionAnchor.filePath === filePath
		) {
			const lines = buildSelectionRange(
				filePath,
				selectionAnchor.hunkIndex,
				selectionAnchor.lineIndex,
				hunkIndex,
				lineIndex,
			);
			if (lines) {
				setDiffLineSelection({ filePath, lines });
			}
			// Don't reset anchor or start drag
			setShowCommentInput(false);
			setPendingComment(null);
			return;
		}

		setIsSelecting(true);
		setSelectionAnchor({ filePath, hunkIndex, lineIndex });
		setDiffLineSelection({
			filePath,
			lines: [{ hunkIndex, lineIndex, content: lineContent }],
		});
		// Reset any pending comment
		setShowCommentInput(false);
		setPendingComment(null);
	};

	const handleLineMouseEnter = (
		filePath: string,
		hunkIndex: number,
		lineIndex: number,
	) => {
		if (
			!isSelecting ||
			!selectionAnchor ||
			selectionAnchor.filePath !== filePath
		)
			return;

		const lines = buildSelectionRange(
			filePath,
			selectionAnchor.hunkIndex,
			selectionAnchor.lineIndex,
			hunkIndex,
			lineIndex,
		);
		if (lines) {
			setDiffLineSelection({ filePath, lines });
		}
	};

	const handleLineMouseUp = () => {
		setIsSelecting(false);
	};

	const handleAddComment = (
		filePath: string,
		hunkIndex: number,
		lineIndex: number,
		lineContent: string,
		lineNum: number,
	) => {
		if (!onCreateAgentWithComment) return;

		// If there's a multi-line selection, use that
		if (
			diffLineSelection &&
			diffLineSelection.filePath === filePath &&
			diffLineSelection.lines.length > 1
		) {
			handleAddCommentFromSelection();
			return;
		}

		setPendingComment({
			filePath,
			hunkIndex,
			displayAtLineIndex: lineIndex,
			startLine: lineNum,
			endLine: lineNum,
			lineContent: [lineContent],
		});
		setShowCommentInput(true);
	};

	const handleAddCommentFromSelection = () => {
		if (!diffLineSelection || diffLineSelection.lines.length === 0) return;

		const { filePath } = diffLineSelection;
		const fileDiff = diff.hunks_by_file.find((f) => f.path === filePath);
		if (!fileDiff) return;

		const lineContents: string[] = [];
		let minLineNum = Infinity;
		let maxLineNum = -Infinity;
		let lastHunkIndex = 0;
		let lastLineIndex = 0;

		for (const line of diffLineSelection.lines) {
			const hunk = fileDiff.hunks[line.hunkIndex];
			if (!hunk) continue;

			const lineNumbers = computeHunkLineNumbers(hunk);
			const lineNum =
				lineNumbers[line.lineIndex]?.new ??
				lineNumbers[line.lineIndex]?.old ??
				line.lineIndex + 1;

			minLineNum = Math.min(minLineNum, lineNum);
			maxLineNum = Math.max(maxLineNum, lineNum);
			lineContents.push(line.content);
			lastHunkIndex = line.hunkIndex;
			lastLineIndex = line.lineIndex;
		}

		setPendingComment({
			filePath,
			hunkIndex: lastHunkIndex,
			displayAtLineIndex: lastLineIndex,
			startLine: minLineNum,
			endLine: maxLineNum,
			lineContent: lineContents,
		});
		setShowCommentInput(true);
	};

	const handleCommentSubmit = (text: string, mode: "plan" | "acceptEdits") => {
		if (!pendingComment || !onCreateAgentWithComment) return;

		onCreateAgentWithComment(
			pendingComment.filePath,
			pendingComment.startLine,
			pendingComment.endLine,
			pendingComment.lineContent,
			text,
			mode,
		);

		setShowCommentInput(false);
		setPendingComment(null);
		setDiffLineSelection(null);
	};

	const handleCommentCancel = () => {
		setShowCommentInput(false);
		setPendingComment(null);
	};

	const isLineSelected = (
		filePath: string,
		hunkIndex: number,
		lineIndex: number,
	) => {
		if (!diffLineSelection || diffLineSelection.filePath !== filePath)
			return false;
		return diffLineSelection.lines.some(
			(l) => l.hunkIndex === hunkIndex && l.lineIndex === lineIndex,
		);
	};

	return (
		<div className="divide-y divide-border">
			{diff.committed_files.map((file) => {
				const fileDiff = diff.hunks_by_file.find((f) => f.path === file.path);
				const isFileExpanded = expandedFiles.has(file.path);
				const isDeferred = file.diff_deferred && !fileDiff;
				const isLoadingDeferred = loadingDeferredFiles.has(file.path);
				const deferredFileError = deferredFileErrors.get(file.path);

				return (
					<div key={file.path}>
						<button
							type="button"
							onClick={() => toggleFile(file.path)}
							className="flex items-center gap-2 px-3 py-1.5 w-full text-left hover:bg-muted/40 transition-colors"
						>
							<ChevronRight
								className={cn(
									"w-4 h-4 text-muted-foreground transition-transform flex-shrink-0",
									isFileExpanded && "rotate-90",
								)}
							/>
							<FileText className="w-4 h-4 text-muted-foreground flex-shrink-0" />
							<span className="text-sm font-mono truncate flex-1">
								{file.path}
							</span>
							<span
								className={cn(
									"text-xs font-medium px-1.5 py-0.5 rounded",
									file.status === "A" && "text-green-600 bg-green-500/10",
									file.status === "M" && "text-blue-600 bg-blue-500/10",
									file.status === "D" && "text-red-600 bg-red-500/10",
								)}
							>
								{file.status}
							</span>
						</button>

						{isFileExpanded && (
							<div className="bg-muted/20">
								{fileDiff ? (
									fileDiff.hunks.map((hunk, hunkIndex) => (
										<HunkView
											key={hunk.id}
											hunk={hunk}
											filePath={file.path}
											hunkIndex={hunkIndex}
											hasCommentSupport={!!onCreateAgentWithComment}
											isLineSelected={isLineSelected}
											showCommentInput={showCommentInput}
											pendingComment={pendingComment}
											onLineMouseDown={handleLineMouseDown}
											onLineMouseEnter={handleLineMouseEnter}
											onLineMouseUp={handleLineMouseUp}
											onAddComment={handleAddComment}
											onCommentSubmit={handleCommentSubmit}
											onCommentCancel={handleCommentCancel}
										/>
									))
								) : isDeferred ? (
									<div className="flex items-center justify-between gap-3 border-t border-border px-3 py-3">
										<p className="text-sm text-muted-foreground">
											This diff has {file.changed_line_count} changed lines.
										</p>
										<div className="flex items-center gap-3">
											{deferredFileError && (
												<span className="text-xs text-destructive">
													{deferredFileError}
												</span>
											)}
											<button
												type="button"
												className="rounded-md border border-border px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-60"
												disabled={isLoadingDeferred}
												onClick={() => {
													setLoadingDeferredFiles((prev) => {
														const next = new Set(prev);
														next.add(file.path);
														return next;
													});
													setDeferredFileErrors((prev) => {
														const next = new Map(prev);
														next.delete(file.path);
														return next;
													});
													void onLoadDeferredFileDiff(file.path)
														.catch((error) => {
															setDeferredFileErrors((prev) => {
																const next = new Map(prev);
																next.set(
																	file.path,
																	error instanceof Error
																		? error.message
																		: String(error),
																);
																return next;
															});
														})
														.finally(() => {
															setLoadingDeferredFiles((prev) => {
																const next = new Set(prev);
																next.delete(file.path);
																return next;
															});
														});
												}}
											>
												{isLoadingDeferred ? "Loading..." : "Load diff"}
											</button>
										</div>
									</div>
								) : null}
								{!fileDiff && !isDeferred && (
									<div className="border-t border-border px-3 py-3 text-sm text-muted-foreground">
										No diff content available.
									</div>
								)}
							</div>
						)}
					</div>
				);
			})}
		</div>
	);
}

// Helper to get a global line index across all hunks
function getGlobalLineIndex(
	hunks: JjDiffHunk[],
	hunkIndex: number,
	lineIndex: number,
): number {
	let idx = 0;
	for (let h = 0; h < hunkIndex; h++) {
		idx += hunks[h].lines.length;
	}
	return idx + lineIndex;
}

interface HunkViewProps {
	hunk: JjDiffHunk;
	filePath: string;
	hunkIndex: number;
	hasCommentSupport: boolean;
	isLineSelected: (
		filePath: string,
		hunkIndex: number,
		lineIndex: number,
	) => boolean;
	showCommentInput: boolean;
	pendingComment: PendingComment | null;
	onLineMouseDown: (
		e: React.MouseEvent,
		filePath: string,
		hunkIndex: number,
		lineIndex: number,
		lineContent: string,
	) => void;
	onLineMouseEnter: (
		filePath: string,
		hunkIndex: number,
		lineIndex: number,
	) => void;
	onLineMouseUp: () => void;
	onAddComment: (
		filePath: string,
		hunkIndex: number,
		lineIndex: number,
		lineContent: string,
		lineNum: number,
	) => void;
	onCommentSubmit: (text: string, mode: "plan" | "acceptEdits") => void;
	onCommentCancel: () => void;
}

function HunkView({
	hunk,
	filePath,
	hunkIndex,
	hasCommentSupport,
	isLineSelected,
	showCommentInput,
	pendingComment,
	onLineMouseDown,
	onLineMouseEnter,
	onLineMouseUp,
	onAddComment,
	onCommentSubmit,
	onCommentCancel,
}: HunkViewProps) {
	const { oldStart, newStart } = parseHunkHeader(hunk.header);
	let oldLine = oldStart;
	let newLine = newStart;

	return (
		<div className="text-sm font-mono">
			{/* Hunk header */}
			<div className="px-3 py-0.5 bg-muted/60 text-muted-foreground border-t border-border text-xs">
				{hunk.header}
			</div>
			{/* Hunk lines */}
			{hunk.lines.map((line, i) => {
				let oldNum: number | undefined;
				let newNum: number | undefined;
				let bgClass = "";
				let prefix = " ";

				if (line.startsWith("+")) {
					newNum = newLine++;
					bgClass = "bg-emerald-500/20";
					prefix = "+";
				} else if (line.startsWith("-")) {
					oldNum = oldLine++;
					bgClass = "bg-red-500/20";
					prefix = "-";
				} else {
					oldNum = oldLine++;
					newNum = newLine++;
				}

				const actualLineNum = newNum ?? oldNum ?? i + 1;
				const selected = isLineSelected(filePath, hunkIndex, i);
				const showCommentInputHere =
					showCommentInput &&
					pendingComment &&
					pendingComment.filePath === filePath &&
					pendingComment.hunkIndex === hunkIndex &&
					i === pendingComment.displayAtLineIndex;

				return (
					<Fragment key={i}>
						<div
							className={cn(
								"group flex",
								bgClass,
								selected && "!bg-blue-500/10",
							)}
							onMouseEnter={() => onLineMouseEnter(filePath, hunkIndex, i)}
							onMouseUp={onLineMouseUp}
						>
							{/* Line number gutter — click to start selection */}
							<div
								className={cn(
									"w-10 text-right pr-1 text-muted-foreground/60 select-none flex-shrink-0",
									hasCommentSupport && "cursor-pointer hover:bg-muted/50",
								)}
								onMouseDown={(e) =>
									onLineMouseDown(e, filePath, hunkIndex, i, line)
								}
							>
								{oldNum ?? ""}
							</div>
							<div
								className={cn(
									"w-10 text-right pr-1 text-muted-foreground/60 select-none flex-shrink-0",
									hasCommentSupport && "cursor-pointer hover:bg-muted/50",
								)}
								onMouseDown={(e) =>
									onLineMouseDown(e, filePath, hunkIndex, i, line)
								}
							>
								{newNum ?? ""}
							</div>
							{/* Plus button column */}
							{hasCommentSupport ? (
								<div className="w-5 flex-shrink-0 flex items-center justify-center select-none">
									<button
										className="p-[1px] rounded bg-primary text-primary-foreground hover:bg-primary/90 invisible group-hover:visible"
										onMouseDown={(e) => e.stopPropagation()}
										onClick={(e) => {
											e.stopPropagation();
											onAddComment(filePath, hunkIndex, i, line, actualLineNum);
										}}
										title="Add comment"
									>
										<Plus className="w-3 h-3" />
									</button>
								</div>
							) : (
								<span className="w-4 text-center text-muted-foreground/60 select-none flex-shrink-0">
									{prefix}
								</span>
							)}
							{/* Line prefix when comment support is enabled */}
							{hasCommentSupport && (
								<span className="w-4 text-center text-muted-foreground/60 select-none flex-shrink-0">
									{prefix}
								</span>
							)}
							<span className="flex-1 whitespace-pre overflow-x-auto">
								{line.slice(1)}
							</span>
						</div>

						{/* Comment input */}
						{showCommentInputHere && pendingComment && (
							<CommentInput
								key={`comment-${pendingComment.filePath}-${hunkIndex}-${pendingComment.displayAtLineIndex}`}
								onSubmit={() => {}}
								onSubmitWithMode={onCommentSubmit}
								onCancel={onCommentCancel}
								filePath={pendingComment.filePath}
								startLine={pendingComment.startLine}
								endLine={pendingComment.endLine}
							/>
						)}
					</Fragment>
				);
			})}
		</div>
	);
}
