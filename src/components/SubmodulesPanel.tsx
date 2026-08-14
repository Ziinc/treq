import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { listGitSubmodules, updateGitSubmodules } from "../lib/api";
import type { GitSubmodule, GitSubmoduleState } from "../lib/api-types";
import { Button } from "./ui/button";

export interface SubmodulesPanelProps {
	repoPath: string;
	workspaceId: number | null;
}

function stateLabel(state: GitSubmoduleState): string {
	switch (state) {
		case "missing":
			return "missing";
		case "clean":
			return "at pin";
		case "dirty":
			return "dirty";
		case "diverged":
			return "wrong commit";
		default:
			return state;
	}
}

function shortHex(value: string | null): string {
	if (!value) {
		return "-";
	}
	return value.slice(0, 8);
}

export function SubmodulesPanel({ repoPath, workspaceId }: SubmodulesPanelProps) {
	const queryClient = useQueryClient();
	const queryKey = ["git-submodules", repoPath, workspaceId];
	const { data: submodules = [], isPending } = useQuery({
		queryKey,
		queryFn: () => listGitSubmodules(repoPath, workspaceId),
		enabled: Boolean(repoPath),
	});

	const update = useMutation({
		mutationFn: (path?: string) =>
			updateGitSubmodules(repoPath, workspaceId, path ?? null),
		onSuccess: (next) => {
			queryClient.setQueryData(queryKey, next);
		},
	});

	if (!isPending && submodules.length === 0) {
		return null;
	}

	const needsUpdate = submodules.some(
		(submodule) => submodule.state === "missing" || submodule.state === "diverged",
	);

	return (
		<div
			className="border rounded-lg p-3 space-y-2"
			data-testid="submodules-panel"
		>
			<div className="flex items-center justify-between gap-2">
				<h3 className="text-sm font-medium">Submodules</h3>
				{needsUpdate && (
					<Button
						type="button"
						size="sm"
						variant="outline"
						disabled={update.isPending}
						onClick={() => update.mutate(undefined)}
					>
						{update.isPending ? (
							<Loader2 className="w-3 h-3 animate-spin" />
						) : (
							"Update"
						)}
					</Button>
				)}
			</div>
			{isPending ? (
				<div className="flex items-center gap-2 text-sm text-muted-foreground">
					<Loader2 className="w-3 h-3 animate-spin" />
					<span>Checking submodules</span>
				</div>
			) : (
				<ul className="space-y-1">
					{submodules.map((submodule: GitSubmodule) => (
						<li
							key={submodule.path}
							className="flex items-center justify-between gap-2 text-sm"
							data-testid={`submodule-row-${submodule.path}`}
						>
							<div className="min-w-0">
								<div className="truncate font-medium">{submodule.path}</div>
								<div className="text-xs text-muted-foreground truncate">
									{stateLabel(submodule.state)} · pin {shortHex(submodule.pin)}
								</div>
							</div>
							{(submodule.state === "missing" ||
								submodule.state === "diverged") && (
								<Button
									type="button"
									size="sm"
									variant="ghost"
									disabled={update.isPending}
									onClick={() => update.mutate(submodule.path)}
								>
									Checkout
								</Button>
							)}
						</li>
					))}
				</ul>
			)}
			{update.isError && (
				<p className="text-xs text-destructive">
					{update.error instanceof Error
						? update.error.message
						: "Failed to update submodules"}
				</p>
			)}
		</div>
	);
}
