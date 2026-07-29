import { openUrl } from "@tauri-apps/plugin-opener";
import { ArrowDown, GitMerge, Layers2, Loader2, Rocket, X } from "lucide-react";
import type { UseMutationResult } from "@tanstack/react-query";
import type { QueueEntryStatus } from "../../lib/api-types";
import {
	buildQueueStacks,
	type QueueEntry,
} from "../../lib/merge-queue-stacks";
import { WEB_URL } from "../../lib/supabase";
import { Button } from "../ui/button";
import { EmptyState } from "./shared";

function queueStatusLabel(status: QueueEntryStatus): string {
	switch (status) {
		case "queued":
			return "Queued";
		case "testing":
			return "Testing";
		case "merging":
			return "Merging";
		case "merged":
			return "Merged";
		case "failed":
			return "Failed";
		case "dequeued":
			return "Dequeued";
		default:
			return status;
	}
}

function queueNodeColor(status: QueueEntryStatus): string {
	switch (status) {
		case "testing":
			return "bg-amber-500";
		case "merging":
			return "bg-green-500 animate-pulse";
		case "merged":
			return "bg-green-600";
		case "failed":
			return "bg-red-500";
		default:
			return "bg-muted-foreground";
	}
}

function QueueStatusChip({ status }: { status: QueueEntryStatus }) {
	const color =
		status === "testing"
			? "bg-amber-500/20 text-amber-600 dark:text-amber-400"
			: status === "failed"
				? "bg-red-500/20 text-red-600 dark:text-red-400"
				: status === "merged" || status === "merging"
					? "bg-green-500/20 text-green-600 dark:text-green-400"
					: "bg-muted text-muted-foreground";

	return (
		<span
			className={`inline-flex items-center px-2 py-0.5 rounded-full text-base ${color}`}
		>
			{queueStatusLabel(status)}
		</span>
	);
}

export function MergeQueueUpsell() {
	return (
		<div className="flex items-center justify-center h-full p-6">
			<div className="max-w-md w-full rounded-xl border border-border bg-gradient-to-br from-muted/40 via-background to-green-500/5 p-8 text-center space-y-4">
				<div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-500/15 text-green-600 dark:text-green-400">
					<Rocket className="w-6 h-6" />
				</div>
				<div className="space-y-2">
					<div className="inline-flex items-center gap-1.5 text-base font-semibold tracking-wide px-1.5 py-0.5 rounded bg-green-500/20 text-green-700 dark:text-green-400">
						PRO
					</div>
					<h2 className="text-lg font-semibold tracking-tight">
						Unlock Merge Queue
					</h2>
					<p className="text-base text-muted-foreground leading-relaxed">
						Queue stacked PRs, run CI in parallel lanes, and merge with
						confidence. Upgrade to Pro to manage your repository&apos;s merge
						queue from Treq.
					</p>
				</div>
				<Button
					size="lg"
					className="gap-2 w-full bg-green-600 hover:bg-green-700 text-white"
					onClick={() => openUrl(`${WEB_URL}/dashboard`)}
				>
					<Rocket className="w-4 h-4" />
					Upgrade to Pro
				</Button>
			</div>
		</div>
	);
}

interface MergeQueueDisabledProps {
	onOpenSettings?: (tab?: string) => void;
}

function MergeQueueDisabled({ onOpenSettings }: MergeQueueDisabledProps) {
	return (
		<div
			data-testid="merge-queue-disabled"
			className="flex flex-col items-center justify-center h-full text-center p-8 gap-3"
		>
			<GitMerge className="w-8 h-8 text-muted-foreground" />
			<p className="text-base text-muted-foreground">
				The merge queue is off for this repository.
			</p>
			<Button
				variant="outline"
				size="sm"
				className="text-base"
				onClick={() => onOpenSettings?.("integrations")}
			>
				Enable it in Settings › Integrations
			</Button>
		</div>
	);
}

interface QueueStackBlockProps {
	stack: ReturnType<typeof buildQueueStacks>[number];
	dequeueBranches: UseMutationResult<string[], Error, string[]>;
}

function QueueStackBlock({ stack, dequeueBranches }: QueueStackBlockProps) {
	const isStack = stack.entries.length > 1;
	const stackKey = stack.entries[0].branch_name;

	return (
		<div
			data-testid={
				isStack
					? `merge-queue-stack-${stackKey}`
					: `merge-queue-single-${stackKey}`
			}
		>
			{isStack && (
				<div className="relative z-10 flex items-center gap-2 pl-8 py-1.5">
					<Layers2 className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
					<span className="text-base font-medium">
						Stack of {stack.entries.length}
					</span>
					<span className="text-base text-muted-foreground truncate">
						merges bottom-up into {stack.targetBranch}
					</span>
					<div className="flex-1" />
					<Button
						variant="ghost"
						size="sm"
						className="h-7 text-base shrink-0"
						disabled={dequeueBranches.isPending}
						aria-label={`Remove stack of ${stack.entries.length} from queue`}
						onClick={() =>
							dequeueBranches.mutate(stack.entries.map((e) => e.branch_name))
						}
					>
						<X className="w-3.5 h-3.5 mr-1" />
						Remove stack
					</Button>
				</div>
			)}
			{stack.entries.map((entry, indexInStack) => (
				<div
					key={entry.branch_name}
					data-testid={`merge-queue-entry-${entry.position}`}
					className="relative flex items-start gap-3 py-2"
				>
					<div className="shrink-0 mt-1">
						<div
							className={`w-[14px] h-[14px] rounded-full border-2 border-background ${queueNodeColor(entry.status)}`}
						/>
					</div>
					<div
						className={`min-w-0 flex-1 ${isStack ? "border-l-2 border-border/70 pl-3" : ""}`}
					>
						<div className="flex items-center gap-2 flex-wrap">
							<span className="text-base text-muted-foreground tabular-nums">
								#{entry.position}
							</span>
							<span className="text-base font-medium">
								{entry.pr_number != null ? `PR #${entry.pr_number}` : "No PR"}
							</span>
							<QueueStatusChip status={entry.status} />
						</div>
						<p className="text-base font-mono text-muted-foreground mt-0.5 truncate">
							{entry.branch_name} → {entry.target_branch}
						</p>
					</div>
					<Button
						variant="ghost"
						size="icon"
						className="h-7 w-7 shrink-0"
						disabled={dequeueBranches.isPending}
						aria-label={`Remove ${entry.branch_name} from queue`}
						title={
							isStack
								? "Remove this branch (and anything stacked above it)"
								: "Remove from queue"
						}
						onClick={() =>
							// Removing mid-stack would strand everything above it -- take that too.
							dequeueBranches.mutate(
								stack.entries.slice(indexInStack).map((e) => e.branch_name),
							)
						}
					>
						<X className="w-3.5 h-3.5" />
					</Button>
				</div>
			))}
		</div>
	);
}

interface MergeQueueListProps {
	queueLoading: boolean;
	queueEntries: QueueEntry[];
	dequeueBranches: UseMutationResult<string[], Error, string[]>;
}

function MergeQueueList({
	queueLoading,
	queueEntries,
	dequeueBranches,
}: MergeQueueListProps) {
	if (queueLoading) {
		return (
			<div className="flex items-center justify-center py-12">
				<Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
			</div>
		);
	}
	if (queueEntries.length === 0) {
		return <EmptyState icon={GitMerge} message="Merge queue is empty." />;
	}

	const queueStacks = buildQueueStacks(queueEntries);

	return (
		// One continuous rail: stacks are groupings within a single merge sequence.
		<div className="relative p-3" data-testid="merge-queue-list">
			<div
				className="absolute left-[19px] top-5 bottom-5 w-0.5 bg-border"
				aria-hidden="true"
			/>
			{queueStacks.map((stack) => (
				<QueueStackBlock
					key={stack.entries[0].branch_name}
					stack={stack}
					dequeueBranches={dequeueBranches}
				/>
			))}
			<div className="relative z-10 flex items-center gap-3 py-2 text-muted-foreground">
				<div className="shrink-0 w-[14px] h-[14px] flex items-center justify-center">
					<ArrowDown className="w-3.5 h-3.5" />
				</div>
				<p className="text-base font-mono truncate">
					{queueStacks[0]?.targetBranch ?? "main"}
				</p>
			</div>
		</div>
	);
}

export interface MergeQueueTabProps {
	isPro: boolean;
	hasRemote: boolean;
	queueEnabled: boolean | undefined;
	queueLoading: boolean;
	queueEntries: QueueEntry[];
	dequeueBranches: UseMutationResult<string[], Error, string[]>;
	onOpenSettings?: (tab?: string) => void;
}

export function MergeQueueTab({
	isPro,
	hasRemote,
	queueEnabled,
	queueLoading,
	queueEntries,
	dequeueBranches,
	onOpenSettings,
}: MergeQueueTabProps) {
	if (!isPro) return <MergeQueueUpsell />;
	if (!hasRemote) return null;
	if (!queueEnabled)
		return <MergeQueueDisabled onOpenSettings={onOpenSettings} />;

	return (
		<MergeQueueList
			queueLoading={queueLoading}
			queueEntries={queueEntries}
			dequeueBranches={dequeueBranches}
		/>
	);
}
