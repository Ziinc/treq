import {
	AlertCircle,
	CheckCircle2,
	ChevronRight,
	CircleDashed,
	CircleDot,
	ExternalLink,
	GitMerge,
	GitPullRequest,
	GitPullRequestDraft,
	Loader2,
	XCircle,
} from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import type {
	GhCheckRun,
	GhIssue,
	GhLabel,
	GhPullRequest,
} from "../../lib/api-types";
import { Button } from "../ui/button";

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

export function OpenInWebButton({ url }: { url: string }) {
	return (
		<Button
			size="sm"
			variant="outline"
			className="text-base shrink-0 gap-1.5"
			onClick={() => openUrl(url)}
		>
			<ExternalLink className="w-4 h-4" />
			Open in Web
		</Button>
	);
}

export function StateChip({
	state,
	isDraft = false,
}: {
	state: string;
	isDraft?: boolean;
}) {
	const s = state.toUpperCase();
	if (isDraft && s === "OPEN") {
		return (
			<span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-base bg-muted text-muted-foreground">
				<GitPullRequestDraft className="w-3 h-3" />
				Draft
			</span>
		);
	}
	if (s === "OPEN") {
		return (
			<span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-base bg-green-500/20 text-green-600 dark:text-green-400">
				<CircleDot className="w-3 h-3" />
				Open
			</span>
		);
	}
	if (s === "MERGED") {
		return (
			<span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-base bg-purple-500/20 text-purple-600 dark:text-purple-400">
				<GitMerge className="w-3 h-3" />
				Merged
			</span>
		);
	}
	return (
		<span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-base bg-red-500/20 text-red-600 dark:text-red-400">
			<AlertCircle className="w-3 h-3" />
			Closed
		</span>
	);
}

export function LabelChip({ name, color }: GhLabel) {
	const hex = color.startsWith("#") ? color : `#${color}`;
	return (
		<span
			className="inline-block px-1.5 py-0.5 rounded text-base font-medium"
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

type CheckRunKind = "success" | "failure" | "pending" | "neutral";

const CHECK_RUN_STYLES: Record<
	CheckRunKind,
	{ className: string; icon: React.ComponentType<{ className?: string }> }
> = {
	success: {
		className: "text-green-600 dark:text-green-400",
		icon: CheckCircle2,
	},
	failure: { className: "text-red-600 dark:text-red-400", icon: XCircle },
	pending: {
		className: "text-amber-600 dark:text-amber-400",
		icon: Loader2,
	},
	neutral: {
		className: "text-muted-foreground",
		icon: CircleDashed,
	},
};

/** Normalizes a statusCheckRollup entry (a Checks API CheckRun or legacy StatusContext) into a display-ready shape. */
export function normalizeCheckRun(check: GhCheckRun): {
	name: string;
	kind: CheckRunKind;
	label: string;
	url: string | null;
} {
	const name = check.name ?? check.context ?? "Check";
	const url = check.details_url ?? check.target_url ?? null;

	if (check.conclusion) {
		const c = check.conclusion.toUpperCase();
		if (c === "SUCCESS") return { name, kind: "success", label: "Success", url };
		if (["FAILURE", "TIMED_OUT", "ACTION_REQUIRED", "STARTUP_FAILURE"].includes(c)) {
			return { name, kind: "failure", label: "Failed", url };
		}
		return {
			name,
			kind: "neutral",
			label: c.charAt(0) + c.slice(1).toLowerCase(),
			url,
		};
	}

	if (check.state) {
		const s = check.state.toUpperCase();
		if (s === "SUCCESS") return { name, kind: "success", label: "Success", url };
		if (s === "FAILURE" || s === "ERROR") {
			return { name, kind: "failure", label: "Failed", url };
		}
		return { name, kind: "pending", label: "Pending", url };
	}

	if (check.status) {
		const s = check.status.toUpperCase();
		if (s === "IN_PROGRESS") return { name, kind: "pending", label: "In progress", url };
		if (s === "QUEUED") return { name, kind: "pending", label: "Queued", url };
	}

	return { name, kind: "pending", label: "Pending", url };
}

export function CheckRunRow({ check }: { check: GhCheckRun }) {
	const { name, kind, label, url } = normalizeCheckRun(check);
	const { className, icon: Icon } = CHECK_RUN_STYLES[kind];

	const content = (
		<div className="flex items-center gap-2 py-1.5 px-2 text-base">
			<Icon
				className={`w-4 h-4 shrink-0 ${className} ${kind === "pending" ? "animate-spin" : ""}`}
			/>
			<span className="flex-1 min-w-0 truncate">{name}</span>
			<span className={`shrink-0 ${className}`}>{label}</span>
		</div>
	);

	if (!url) return content;
	return (
		<button
			type="button"
			className="w-full text-left hover:bg-muted/50 transition-colors rounded"
			onClick={() => openUrl(url)}
		>
			{content}
		</button>
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
					<div className="flex items-center gap-2 min-w-0">
						<p className="text-lg font-medium truncate min-w-0">
							{issue.title}
						</p>
						<span className="text-base text-muted-foreground shrink-0">
							#{issue.number}
						</span>
					</div>
					<div className="flex items-center gap-2 mt-1 min-w-0 text-base text-muted-foreground">
						<StateChip state={issue.state} />
						<span className="shrink-0">{formatDate(issue.created_at)}</span>
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
					<div className="flex items-center gap-2 min-w-0">
						<p className="text-lg font-medium truncate min-w-0">{pr.title}</p>
						<span className="text-base text-muted-foreground shrink-0">
							#{pr.number}
						</span>
					</div>
					<div className="flex items-center gap-2 mt-1 min-w-0 text-base text-muted-foreground">
						<StateChip state={pr.state} isDraft={Boolean(pr.is_draft)} />
						<span className="font-mono inline-flex items-center gap-1 min-w-0">
							<span className="truncate max-w-[16rem]" title={pr.head_ref_name}>
								{pr.head_ref_name}
							</span>
							<span className="shrink-0">→</span>
							<span className="truncate max-w-[16rem]" title={pr.base_ref_name}>
								{pr.base_ref_name}
							</span>
						</span>
						<span className="shrink-0">{formatDate(pr.created_at)}</span>
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
			<p className="text-base text-muted-foreground">{message}</p>
		</div>
	);
}

export { CircleDot, GitPullRequest };
