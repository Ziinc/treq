import { useQueries, useQuery } from "@tanstack/react-query";
import { ArrowDown, Layers2 } from "lucide-react";
import { memo, useMemo } from "react";
import { listCommits, listWorkspaceStatuses, type Workspace } from "../lib/api";
import { cn, formatFullTimestamp, formatRelativeTime } from "../lib/utils";
import {
	sumWorkspaceDiffStats,
	type WorkspaceDiffStats,
} from "../lib/workspace-stack";
import {
	getWorkspaceStack,
	type StackedWorkspaceEntry,
} from "../lib/workspace-tree";
import { getWorkspaceDisplayTitle } from "../lib/workspace-utils";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "./ui/tooltip";

interface WorkspaceStackPanelProps {
	repoPath: string;
	workspace: Workspace;
	/** The repo's default branch name, e.g. "main" */
	defaultBranch: string;
	onSelectWorkspace?: (workspace: Workspace) => void;
}

/**
 * Shows the chain of workspaces stacked on top of one another (a la a
 * stacked-PR view), with the current workspace highlighted. Renders nothing
 * when the given workspace isn't part of a multi-workspace stack (alone on
 * the default/external branch with no stacked descendants).
 */
export const WorkspaceStackPanel = memo<WorkspaceStackPanelProps>(
	({ repoPath, workspace, defaultBranch, onSelectWorkspace }) => {
		const { data: workspaceStatuses } = useQuery({
			queryKey: ["workspace-statuses", repoPath],
			queryFn: () => listWorkspaceStatuses(repoPath),
			enabled: Boolean(repoPath),
		});

		const stack = useMemo(() => {
			if (!workspaceStatuses) return null;
			// A workspace record can exist for the repo's own default branch
			// (surfaced in the sidebar for target-branch bookkeeping). It isn't
			// a real stacked workspace, so it must not count as an ancestor.
			const allWorkspaces = workspaceStatuses
				.map((status) => status.current)
				.filter((ws) => ws.branch_name !== defaultBranch);
			return getWorkspaceStack(allWorkspaces, workspace.id);
		}, [workspaceStatuses, workspace.id, defaultBranch]);

		const commitQueries = useQueries({
			queries: (stack ?? []).map((entry) => ({
				queryKey: ["workspace-commits", repoPath, entry.workspace.id],
				queryFn: () => listCommits(repoPath, entry.workspace.id),
				enabled: Boolean(repoPath),
			})),
		});

		const diffStatsByWorkspaceId = useMemo(() => {
			const map = new Map<number, WorkspaceDiffStats>();
			(stack ?? []).forEach((entry, index) => {
				map.set(
					entry.workspace.id,
					sumWorkspaceDiffStats(commitQueries[index]?.data?.commits ?? []),
				);
			});
			return map;
		}, [stack, commitQueries]);

		// Each side of the bar is sized relative to the largest single-direction
		// change (insertions or deletions) in the stack, a la Gerrit's change
		// list.
		const maxChange = useMemo(
			() =>
				Math.max(
					0,
					...Array.from(diffStatsByWorkspaceId.values()).map((stats) =>
						Math.max(stats.insertions, stats.deletions),
					),
				),
			[diffStatsByWorkspaceId],
		);

		if (!stack) return null;

		const currentIndex = stack.findIndex((entry) => entry.isCurrent);

		return (
			<div
				data-testid="workspace-stack-panel"
				className="border rounded-lg p-4"
			>
				<div className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground mb-4">
					<Layers2 className="w-4 h-4" />
					<span>Stack</span>
					<span className="ml-auto text-xs font-normal">
						{currentIndex + 1} of {stack.length}
					</span>
				</div>
				<div className="relative">
					<div
						className="absolute left-[7px] top-2 bottom-2 w-0.5 bg-border"
						aria-hidden="true"
					/>
					<ul className="space-y-0">
						{stack.map((entry) => (
							<StackItem
								key={entry.workspace.id}
								entry={entry}
								diffStats={
									diffStatsByWorkspaceId.get(entry.workspace.id) ?? {
										insertions: 0,
										deletions: 0,
									}
								}
								maxChange={maxChange}
								onSelect={onSelectWorkspace}
							/>
						))}
						<li>
							<div className="relative z-10 flex w-full items-start gap-3 py-2 px-2 -mx-2 text-muted-foreground">
								<div className="flex-shrink-0 mt-0.5 w-[14px] h-[14px] flex items-center justify-center">
									<ArrowDown className="w-3.5 h-3.5" />
								</div>
								<div className="flex-1 min-w-0">
									<p className="text-sm font-mono truncate">{defaultBranch}</p>
								</div>
							</div>
						</li>
					</ul>
				</div>
			</div>
		);
	},
);

// Half-width of each side of the bar (insertions grow left from the axis,
// deletions grow right), a la Gerrit's change list.
const DIFF_BAR_HALF_WIDTH_PX = 14;

function DiffBar({
	diffStats,
	maxChange,
}: {
	diffStats: WorkspaceDiffStats;
	maxChange: number;
}) {
	const { insertions, deletions } = diffStats;
	if (insertions === 0 && deletions === 0) return null;

	const insertionWidth =
		maxChange === 0 || insertions === 0
			? 0
			: Math.max(
					1,
					Math.round((insertions / maxChange) * DIFF_BAR_HALF_WIDTH_PX),
				);
	const deletionWidth =
		maxChange === 0 || deletions === 0
			? 0
			: Math.max(
					1,
					Math.round((deletions / maxChange) * DIFF_BAR_HALF_WIDTH_PX),
				);

	return (
		<div
			className="flex h-1.5 flex-shrink-0 items-center"
			title={`+${insertions} -${deletions}`}
		>
			<div
				className="flex h-full justify-end"
				style={{ width: DIFF_BAR_HALF_WIDTH_PX }}
			>
				<div
					className="h-full bg-green-600 dark:bg-green-400"
					style={{ width: insertionWidth }}
				/>
			</div>
			<div className="w-px h-full bg-border" aria-hidden="true" />
			<div
				className="flex h-full justify-start"
				style={{ width: DIFF_BAR_HALF_WIDTH_PX }}
			>
				<div
					className="h-full bg-red-600 dark:bg-red-400"
					style={{ width: deletionWidth }}
				/>
			</div>
		</div>
	);
}

interface StackItemProps {
	entry: StackedWorkspaceEntry;
	diffStats: WorkspaceDiffStats;
	maxChange: number;
	onSelect?: (workspace: Workspace) => void;
}

function StackItem({ entry, diffStats, maxChange, onSelect }: StackItemProps) {
	const { workspace, isCurrent } = entry;
	const hasStats = diffStats.insertions > 0 || diffStats.deletions > 0;
	const title = getWorkspaceDisplayTitle(workspace);

	return (
		<li>
			<button
				type="button"
				data-testid={`workspace-stack-item-${workspace.id}`}
				aria-current={isCurrent ? "true" : undefined}
				onClick={() => onSelect?.(workspace)}
				className={cn(
					"relative z-10 flex w-full items-start gap-3 py-2 px-2 -mx-2 rounded-md text-left transition-all duration-200",
					isCurrent
						? "bg-primary/10 border border-primary/40 shadow-sm"
						: "hover:bg-muted",
				)}
			>
				<div className="flex-shrink-0 mt-0.5">
					<div
						className={cn(
							"w-[14px] h-[14px] rounded-full border-2 border-background",
							isCurrent ? "bg-primary" : "bg-muted-foreground",
						)}
					/>
				</div>
				<div className="flex-1 min-w-0">
					<p className="text-sm truncate" title={title}>
						{title}
					</p>
					<div className="flex items-center gap-2 mt-0.5 flex-wrap">
						<TooltipProvider delayDuration={300}>
							<Tooltip>
								<TooltipTrigger asChild>
									<span className="text-xs text-muted-foreground">
										{formatRelativeTime(workspace.created_at)}
									</span>
								</TooltipTrigger>
								<TooltipContent>
									<p>{formatFullTimestamp(workspace.created_at)}</p>
								</TooltipContent>
							</Tooltip>
						</TooltipProvider>
						{hasStats && (
							<div className="ml-auto flex items-center gap-1.5">
								<span className="text-xs font-mono text-green-600 dark:text-green-400">
									+{diffStats.insertions}
								</span>
								<DiffBar diffStats={diffStats} maxChange={maxChange} />
								<span className="text-xs font-mono text-red-600 dark:text-red-400">
									-{diffStats.deletions}
								</span>
							</div>
						)}
					</div>
				</div>
			</button>
		</li>
	);
}
