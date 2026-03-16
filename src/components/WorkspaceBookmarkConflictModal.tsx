import { useEffect, useMemo, useState } from "react";
import type { WorkspaceBookmarkConflict } from "../lib/api";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { cn, formatFullTimestamp, formatRelativeTime } from "../lib/utils";
import { Loader2, GitBranch } from "lucide-react";

interface WorkspaceBookmarkConflictModalProps {
	conflict: WorkspaceBookmarkConflict | null;
	open: boolean;
	onClose: () => void;
	onResolve: (revisionId: string) => Promise<void> | void;
	resolving: boolean;
}

export function WorkspaceBookmarkConflictModal({
	conflict,
	open,
	onClose,
	onResolve,
	resolving,
}: WorkspaceBookmarkConflictModalProps) {
	const [selectedRevision, setSelectedRevision] = useState<string | null>(null);

	const commits = conflict?.commits ?? [];
	const bookmarkName = conflict?.bookmark ?? "";

	useEffect(() => {
		if (!open) {
			setSelectedRevision(null);
		}
	}, [open, bookmarkName]);

	const formattedDescription = useMemo(() => {
		if (!bookmarkName) return "";
		return `Bookmark ${bookmarkName} has multiple histories. Choose which commit it should point to so Treq can finish syncing the workspace.`;
	}, [bookmarkName]);

	const handleResolve = () => {
		if (!selectedRevision || resolving) return;
		onResolve(selectedRevision);
	};

	return (
		<Dialog
			open={open}
			onOpenChange={(next) => (!next ? onClose() : undefined)}
		>
			<DialogContent className="max-w-2xl">
				<DialogHeader className="space-y-2">
					<DialogTitle className="flex items-center gap-2">
						<GitBranch className="h-4 w-4 text-amber-500" />
						Resolve bookmark conflict
					</DialogTitle>
					<DialogDescription>{formattedDescription}</DialogDescription>
				</DialogHeader>

				<div className="rounded-md border border-border bg-muted/30 p-3 text-sm">
					<p className="font-medium text-foreground">
						{conflict?.workspace_name}
					</p>
					<p className="text-muted-foreground">
						Workspace branch{" "}
						<span className="font-mono">{conflict?.branch_name}</span>
					</p>
				</div>

				<div className="space-y-2">
					<p className="text-sm text-muted-foreground">
						Select the commit you want the bookmark to track:
					</p>
					<div className="max-h-72 space-y-2 overflow-y-auto pr-1">
						{commits.map((commit) => {
							const isSelected = selectedRevision === commit.commit_id;
							return (
								<button
									key={commit.commit_id}
									type="button"
									onClick={() => setSelectedRevision(commit.commit_id)}
									className={cn(
										"w-full rounded-md border bg-background p-3 text-left transition",
										isSelected
											? "border-blue-500 ring-2 ring-blue-200 dark:ring-blue-400/40"
											: "border-border hover:border-blue-200 dark:hover:border-blue-600",
									)}
								>
									<div className="flex items-baseline justify-between gap-4">
										<div className="font-mono text-sm text-foreground">
											{commit.short_commit_id}
											<span className="text-muted-foreground">
												{" "}
												({commit.change_id})
											</span>
										</div>
										<span
											className="text-xs text-muted-foreground"
											title={formatFullTimestamp(commit.timestamp)}
										>
											{formatRelativeTime(commit.timestamp)}
										</span>
									</div>
									<p className="mt-1 text-sm text-foreground">
										{commit.description}
									</p>
									<div className="mt-1 text-xs text-muted-foreground">
										{commit.author_name}
										{commit.diff_summary ? ` • ${commit.diff_summary}` : null}
									</div>
								</button>
							);
						})}
						{commits.length === 0 && (
							<div className="rounded-md border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
								Unable to load conflicting revisions. Try running{" "}
								<code>jj bookmark list</code> manually.
							</div>
						)}
					</div>
				</div>

				<div className="flex flex-col gap-2 sm:flex-row sm:justify-between">
					<Button variant="outline" onClick={onClose}>
						Skip for now
					</Button>
					<Button
						onClick={handleResolve}
						disabled={!selectedRevision || resolving}
						className="min-w-[160px]"
					>
						{resolving ? (
							<Loader2 className="mr-2 h-4 w-4 animate-spin" />
						) : null}
						Resolve conflict
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	);
}
