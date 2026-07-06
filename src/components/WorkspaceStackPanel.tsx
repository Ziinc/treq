import { useQuery } from "@tanstack/react-query";
import { Layers2 } from "lucide-react";
import { memo, useMemo } from "react";
import { getWorkspaces, listCommits, type Workspace } from "../lib/api";
import { cn, formatFullTimestamp, formatRelativeTime } from "../lib/utils";
import { sumWorkspaceDiffStats } from "../lib/workspace-stack";
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
	onSelectWorkspace?: (workspace: Workspace) => void;
}

/**
 * Shows the chain of workspaces stacked on top of one another (a la a
 * stacked-PR view), with the current workspace highlighted. Renders nothing
 * when the given workspace isn't stacked on top of another workspace.
 */
export const WorkspaceStackPanel = memo<WorkspaceStackPanelProps>(
	({ repoPath, workspace, onSelectWorkspace }) => {
		const { data: allWorkspaces } = useQuery({
			queryKey: ["workspaces", repoPath],
			queryFn: () => getWorkspaces(repoPath),
			enabled: Boolean(repoPath),
		});

		const stack = useMemo(() => {
			if (!allWorkspaces) return null;
			return getWorkspaceStack(allWorkspaces, workspace.id);
		}, [allWorkspaces, workspace.id]);

		if (!stack) return null;

		const currentIndex = stack.findIndex((entry) => entry.isCurrent);

		return (
			<div data-testid="workspace-stack-panel" className="p-4">
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
								repoPath={repoPath}
								entry={entry}
								onSelect={onSelectWorkspace}
							/>
						))}
					</ul>
				</div>
			</div>
		);
	},
);

interface StackItemProps {
	repoPath: string;
	entry: StackedWorkspaceEntry;
	onSelect?: (workspace: Workspace) => void;
}

function StackItem({ repoPath, entry, onSelect }: StackItemProps) {
	const { workspace, isCurrent } = entry;

	const { data: logResult } = useQuery({
		queryKey: ["workspace-commits", repoPath, workspace.id],
		queryFn: () => listCommits(repoPath, workspace.id),
		enabled: Boolean(repoPath),
	});

	const diffStats = useMemo(
		() => sumWorkspaceDiffStats(logResult?.commits ?? []),
		[logResult],
	);
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
					"relative z-10 flex w-full items-start gap-3 py-2 px-2 rounded-md text-left transition-all duration-200",
					isCurrent
						? "bg-accent/50 border border-accent shadow-sm"
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
							<span className="text-xs font-mono ml-auto">
								<span className="text-green-600 dark:text-green-400">
									+{diffStats.insertions}
								</span>{" "}
								<span className="text-red-600 dark:text-red-400">
									-{diffStats.deletions}
								</span>
							</span>
						)}
					</div>
				</div>
			</button>
		</li>
	);
}
