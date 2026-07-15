import {
	AlertCircle,
	ChevronRight,
	CircleDot,
	GitMerge,
	GitPullRequest,
} from "lucide-react";
import type { GhIssue, GhLabel, GhPullRequest } from "../../lib/api-types";

export function formatDate(iso: string) {
	try {
		return new Date(iso).toLocaleDateString(undefined, {
			year: "numeric",
			month: "short",
			day: "numeric",
		});
	} catch {
		return iso;
	}
}

export function StateChip({ state }: { state: string }) {
	const s = state.toUpperCase();
	if (s === "OPEN") {
		return (
			<span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-green-500/20 text-green-600 dark:text-green-400">
				<CircleDot className="w-3 h-3" />
				Open
			</span>
		);
	}
	if (s === "MERGED") {
		return (
			<span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-purple-500/20 text-purple-600 dark:text-purple-400">
				<GitMerge className="w-3 h-3" />
				Merged
			</span>
		);
	}
	return (
		<span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-red-500/20 text-red-600 dark:text-red-400">
			<AlertCircle className="w-3 h-3" />
			Closed
		</span>
	);
}

export function LabelChip({ name, color }: GhLabel) {
	const hex = color.startsWith("#") ? color : `#${color}`;
	return (
		<span
			className="inline-block px-1.5 py-0.5 rounded text-xs font-medium"
			style={{
				backgroundColor: `${hex}33`,
				color: hex,
				border: `1px solid ${hex}66`,
			}}
		>
			{name}
		</span>
	);
}

export function IssueListItem({
	issue,
	selected,
	onClick,
}: {
	issue: GhIssue;
	selected: boolean;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={`w-full text-left px-3 py-2.5 border-b border-border hover:bg-muted/50 transition-colors ${
				selected ? "bg-primary/10" : ""
			}`}
		>
			<div className="flex items-start gap-2">
				<div className="flex-1 min-w-0">
					<div className="flex items-center gap-2 flex-wrap">
						<StateChip state={issue.state} />
						<span className="text-xs text-muted-foreground">
							#{issue.number}
						</span>
					</div>
					<p className="text-sm font-medium truncate mt-0.5">{issue.title}</p>
					<div className="flex items-center gap-2 mt-1 flex-wrap">
						{issue.labels.map((l) => (
							<LabelChip key={l.name} name={l.name} color={l.color} />
						))}
						<span className="text-xs text-muted-foreground">
							{issue.author.login} · {formatDate(issue.created_at)}
						</span>
					</div>
				</div>
				<ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 mt-1" />
			</div>
		</button>
	);
}

export function PrListItem({
	pr,
	selected,
	onClick,
}: {
	pr: GhPullRequest;
	selected: boolean;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={`w-full text-left px-3 py-2.5 border-b border-border hover:bg-muted/50 transition-colors ${
				selected ? "bg-primary/10" : ""
			}`}
		>
			<div className="flex items-start gap-2">
				<div className="flex-1 min-w-0">
					<div className="flex items-center gap-2 flex-wrap">
						<StateChip state={pr.state} />
						<span className="text-xs text-muted-foreground">#{pr.number}</span>
					</div>
					<p className="text-sm font-medium truncate mt-0.5">{pr.title}</p>
					<div className="flex items-center gap-2 mt-1 flex-wrap">
						{pr.labels.map((l) => (
							<LabelChip key={l.name} name={l.name} color={l.color} />
						))}
						<span className="text-xs text-muted-foreground font-mono">
							{pr.head_ref_name} → {pr.base_ref_name}
						</span>
						<span className="text-xs text-muted-foreground">
							{pr.author.login} · {formatDate(pr.created_at)}
						</span>
					</div>
				</div>
				<ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 mt-1" />
			</div>
		</button>
	);
}

export function EmptyState({
	icon: Icon,
	message,
}: {
	icon: React.ComponentType<{ className?: string }>;
	message: string;
}) {
	return (
		<div className="flex flex-col items-center justify-center py-12 text-center px-6 gap-2">
			<Icon className="w-6 h-6 text-muted-foreground" />
			<p className="text-sm text-muted-foreground">{message}</p>
		</div>
	);
}

export { CircleDot, GitPullRequest };
