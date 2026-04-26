import { memo, useEffect, useMemo, useState } from "react";
import { type JjLogCommit, listCommits } from "../lib/api";
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
	({ repoPath, workspaceId, onCommitClick }) => {
		const [commits, setCommits] = useState<JjLogCommit[]>([]);
		const [loading, setLoading] = useState(true);
		const [limit, setLimit] = useState(15);
		const [loadingMore, setLoadingMore] = useState(false);
		const isHomeRepo = workspaceId == null;

		useEffect(() => {
			if (!repoPath) {
				setLoading(false);
				return;
			}
			setLoading(true);
			setLimit(15);
			listCommits(repoPath, workspaceId)
				.then((result) => {
					const nextCommits = result?.commits ?? [];
					setCommits(normalizeCommits(nextCommits));
				})
				.catch((err) => {
					console.error("Failed to fetch commit history:", err);
					setCommits([]);
				})
				.finally(() => {
					setLoading(false);
				});
		}, [repoPath, workspaceId]);

		// Re-fetch when limit increases (beyond initial load)
		useEffect(() => {
			if (limit <= 15) return;
			if (!isHomeRepo) return;
			setLoadingMore(true);
			listCommits(repoPath, workspaceId, false, undefined, limit)
				.then((result) => {
					const nextCommits = result?.commits ?? [];
					setCommits(normalizeCommits(nextCommits));
				})
				.catch(() => {})
				.finally(() => setLoadingMore(false));
		}, [limit, repoPath, workspaceId, isHomeRepo]);

		const dayGroups = useMemo(() => groupCommitsByDay(commits), [commits]);

		if (loading) {
			return <LoadingState />;
		}

		if (commits.length === 0) {
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

						{dayGroups.map((group) => (
							<div key={group.dayKey} className="mt-5 first:mt-0">
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
									onClick={() => setLimit((prev) => prev + 15)}
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
					</div>
				</div>
			</div>
		);
	},
);

interface CommitItemProps {
	commit: JjLogCommit;
	isFirst: boolean;
	onCommitClick?: (changeId: string) => void;
}

function CommitItem({ commit, isFirst, onCommitClick }: CommitItemProps) {
	const firstLine = commit.description.split("\n")[0] || "(no message)";
	const hasStats = commit.insertions > 0 || commit.deletions > 0;

	return (
		<li
			className={cn(
				"relative flex items-start gap-3 py-2 px-2 -mx-2 rounded-md group transition-all duration-200 hover:bg-muted",
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

			<div
				className={cn(
					"flex-1 min-w-0 pt-0.5 rounded-md",
					isFirst && "bg-accent/50 p-2 -m-2 shadow-sm border border-accent",
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
