import { memo, useEffect, useMemo, useState } from "react";
import { type JjLogCommit, type JjLogResult, listCommits } from "../lib/api";
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
import { Loader2 } from "lucide-react";

interface LinearCommitHistoryProps {
	repoPath: string;
	workspaceId: number | null;
	onCommitClick?: (changeId: string) => void;
	/** Called when the commits result is loaded (allows parent to inspect counts) */
	onCommitsLoaded?: (result: JjLogResult) => void;
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

export const LinearCommitHistory = memo<LinearCommitHistoryProps>(
	({ repoPath, workspaceId, onCommitClick, onCommitsLoaded }) => {
		const [commits, setCommits] = useState<JjLogCommit[]>([]);
		const [targetBranchCommits, setTargetBranchCommits] = useState<JjLogCommit[]>([]);
		const [mergeBaseId, setMergeBaseId] = useState<string | null>(null);
		const [targetBranch, setTargetBranch] = useState<string>("");
		const [loading, setLoading] = useState(true);
		const [limit, setLimit] = useState(14);
		const [loadingMore, setLoadingMore] = useState(false);
		const isHomeRepo = workspaceId == null;

		useEffect(() => {
			if (!repoPath) {
				setLoading(false);
				return;
			}
			setLoading(true);
			setLimit(14);
			listCommits(repoPath, workspaceId, false, undefined, 14)
				.then((result) => {
					const nextCommits = result?.commits ?? [];
					setCommits(normalizeCommits(nextCommits));
					setTargetBranchCommits(result?.target_branch_commits ?? []);
					setMergeBaseId(result?.merge_base_id ?? null);
					setTargetBranch(result?.target_branch ?? "");
					onCommitsLoaded?.(result);
				})
				.catch((err) => {
					console.error("Failed to fetch commit history:", err);
					setCommits([]);
					setTargetBranchCommits([]);
				})
				.finally(() => {
					setLoading(false);
				});
		}, [repoPath, workspaceId]); // eslint-disable-line react-hooks/exhaustive-deps

		// Re-fetch when limit increases (beyond initial load)
		useEffect(() => {
			if (limit <= 14) return;
			if (!isHomeRepo) return;
			setLoadingMore(true);
			listCommits(repoPath, workspaceId, false, undefined, limit)
				.then((result) => {
					const nextCommits = result?.commits ?? [];
					setCommits(normalizeCommits(nextCommits));
					setTargetBranchCommits(result?.target_branch_commits ?? []);
					setMergeBaseId(result?.merge_base_id ?? null);
					setTargetBranch(result?.target_branch ?? "");
					onCommitsLoaded?.(result);
				})
				.catch(() => {})
				.finally(() => setLoadingMore(false));
		}, [limit, repoPath, workspaceId, isHomeRepo]); // eslint-disable-line react-hooks/exhaustive-deps

		const dayGroups = useMemo(() => groupCommitsByDay(commits), [commits]);
		const targetDayGroups = useMemo(
			() => groupCommitsByDay(targetBranchCommits),
			[targetBranchCommits],
		);
		const hasDivergence = isHomeRepo && targetBranchCommits.length > 0;

		if (loading) {
			return <LoadingState />;
		}

		if (commits.length === 0 && !hasDivergence) {
			return (
				<div className="p-4">
					<h3 className="text-sm font-semibold text-muted-foreground mb-4">
						Commits
					</h3>
					<p className="text-sm text-muted-foreground text-center">
						No commits yet.
					</p>
					<p className="text-sm text-muted-foreground text-center">
						Changes you commit will appear here.
					</p>
				</div>
			);
		}

		let globalIndex = 0;

		return (
			<div className="h-full overflow-auto">
				<div className="p-4">
					<h3 className="text-sm font-semibold text-muted-foreground mb-4">
						Commits
					</h3>
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
								<ul className="space-y-0">
									{group.commits.map((commit) => {
										const isFirst = globalIndex === 0;
										globalIndex++;
										return (
											<CommitItem
												key={commit.commit_id}
												commit={commit}
												isFirst={isFirst}
												onCommitClick={onCommitClick}
											/>
										);
									})}
								</ul>
							</div>
						))}

						{isHomeRepo && commits.length + 1 >= limit && (
							<div className="mt-3 pl-7">
								<button
									type="button"
									className="text-xs text-muted-foreground hover:text-foreground transition-colors"
									disabled={loadingMore}
									onClick={() => setLimit((prev) => prev + 14)}
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

						{hasDivergence && (
							<>
								<div className="my-4 pl-7">
									<div className="flex items-center gap-2">
										<div className="flex-1 border-t border-dashed border-border" />
										<span className="text-xs text-muted-foreground whitespace-nowrap px-2">
											Diverged from{" "}
											<span className="font-mono">{targetBranch}</span>
											{mergeBaseId && (
												<span className="ml-1 font-mono opacity-60">
													@ {mergeBaseId}
												</span>
											)}
										</span>
										<div className="flex-1 border-t border-dashed border-border" />
									</div>
								</div>

								{targetDayGroups.map((group, groupIndex) => (
									<div
										key={`target-${group.dayKey}-${groupIndex}`}
										className="mt-5 first:mt-0"
									>
										<p className="text-xs font-semibold text-muted-foreground mb-1 pl-7">
											{group.label}
										</p>
										<ul className="space-y-0">
											{group.commits.map((commit) => (
												<CommitItem
													key={commit.commit_id}
													commit={commit}
													isFirst={false}
													isTargetOnly={true}
													onCommitClick={onCommitClick}
												/>
											))}
										</ul>
									</div>
								))}
							</>
						)}
					</div>
				</div>
			</div>
		);
	},
);

interface CommitItemProps {
	commit: JjLogCommit;
	isFirst: boolean;
	isTargetOnly?: boolean;
	onCommitClick?: (changeId: string) => void;
}

function CommitItem({ commit, isFirst, isTargetOnly, onCommitClick }: CommitItemProps) {
	const firstLine = commit.description.split("\n")[0] || "(no message)";
	const hasStats = commit.insertions > 0 || commit.deletions > 0;

	return (
		<li
			className={cn(
				"relative flex items-start gap-3 py-2 px-2 -mx-2 rounded-md group transition-all duration-200 hover:bg-muted",
				isTargetOnly && "opacity-60",
			)}
		>
			<div className="relative z-10 flex-shrink-0">
				<div
					className={cn(
						"w-[14px] h-[14px] rounded-full border-2 border-background",
						isFirst ? "bg-primary" : "bg-muted-foreground",
						isTargetOnly && "bg-muted-foreground/50",
					)}
				/>
			</div>

			<div
				className={cn(
					"flex-1 min-w-0 pt-0.5 rounded-md",
					isFirst && !isTargetOnly && "bg-accent/50 p-2 -m-2 shadow-sm border border-accent",
					isTargetOnly && "bg-muted/30 p-2 -m-2 rounded-md",
					onCommitClick && "cursor-pointer hover:bg-muted/40 transition-colors",
				)}
				onClick={
					onCommitClick ? () => onCommitClick(commit.change_id) : undefined
				}
			>
				<p className="text-sm truncate" title={firstLine}>
					{firstLine}
				</p>
				<div className="flex items-center gap-2 mt-0.5 flex-wrap">
					<p className="text-xs text-muted-foreground font-mono">
						{commit.short_id}
					</p>
					{commit.is_immutable && (
						<span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground border border-border font-medium">
							Immutable
						</span>
					)}
					{isTargetOnly && (
						<span className="text-[10px] px-1.5 py-0.5 rounded-full bg-orange-500/20 text-orange-600 dark:text-orange-400 border border-orange-500/30 font-medium">
							on target
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
		</li>
	);
}

function LoadingState() {
	return (
		<div className="h-full flex items-center justify-center p-4">
			<p className="text-sm text-muted-foreground">Loading commits...</p>
		</div>
	);
}
