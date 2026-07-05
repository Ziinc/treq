import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Loader2 } from "lucide-react";
import { getWorkspaceLogs } from "../lib/api";
import { cn } from "../lib/utils";

interface WorkspaceLogsTabProps {
	repoPath: string;
	workspaceId: number | null;
	workspaceKey: string | null;
}

const formatTime = (timestampMs: number) =>
	new Date(timestampMs).toLocaleString(undefined, {
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
	});

export const WorkspaceLogsTab: React.FC<WorkspaceLogsTabProps> = ({
	repoPath,
	workspaceId,
	workspaceKey,
}) => {
	const { data, isPending, error } = useQuery({
		queryKey: ["workspace-logs", repoPath, workspaceId, workspaceKey],
		enabled: Boolean(repoPath),
		queryFn: () => getWorkspaceLogs(repoPath, workspaceId, workspaceKey),
	});

	if (isPending) {
		return (
			<div className="h-full flex items-center justify-center text-muted-foreground gap-2">
				<Loader2 className="w-4 h-4 animate-spin" />
				<span>Loading logs...</span>
			</div>
		);
	}

	if (error) {
		return (
			<div className="h-full flex items-center justify-center p-6 text-sm text-destructive gap-2">
				<AlertTriangle className="w-4 h-4" />
				<span>Failed to load logs</span>
			</div>
		);
	}

	if (!data || data.length === 0) {
		return (
			<div className="h-full flex items-center justify-center p-6 text-sm text-muted-foreground">
				No logs found
			</div>
		);
	}

	return (
		<div className="h-full overflow-auto p-4 space-y-4">
			{data.map((session) => (
				<section
					key={session.session_id}
					className="rounded-lg border border-border bg-card/40"
				>
					<div className="flex items-center justify-between border-b border-border px-4 py-3">
						<div>
							<div className="font-medium">{session.session_id}</div>
							<div className="text-xs text-muted-foreground">
								{session.log_count} log entries
							</div>
						</div>
						<div className="text-xs text-muted-foreground">
							{formatTime(session.first_timestamp_ms)} -{" "}
							{formatTime(session.last_timestamp_ms)}
						</div>
					</div>
					<div className="divide-y divide-border">
						{session.entries.map((entry) => (
							<div key={`${entry.session_id}-${entry.timestamp_ms}-${entry.message}`} className="px-4 py-3 font-mono text-sm">
								<div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground mb-1">
									<span
										className={cn(
											"rounded px-1.5 py-0.5 uppercase tracking-wide",
											entry.level === "error"
												? "bg-destructive/10 text-destructive"
												: entry.level === "warn"
													? "bg-amber-500/10 text-amber-700"
													: "bg-muted text-muted-foreground",
										)}
									>
										{entry.level}
									</span>
									<span>{entry.source}</span>
									<span>{formatTime(entry.timestamp_ms)}</span>
								</div>
								<pre className="whitespace-pre-wrap break-words font-mono text-sm">
									{entry.message}
								</pre>
							</div>
						))}
					</div>
				</section>
			))}
		</div>
	);
};
