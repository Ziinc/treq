import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
	AlertCircle,
	CircleDot,
	Github,
	GitMerge,
	GitPullRequest,
	Layers2,
	Loader2,
	Plus,
	RefreshCw,
	Rocket,
	X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useAuth } from "../hooks/useAuth";
import {
	useDequeueBranches,
	useGitRemoteInfo,
	useMergeQueueEnabled,
	useSetMergeQueueEnabled,
} from "../hooks/useMergeQueueStatus";
import { GH_LIST_PAGE_SIZE, ghListIssues, ghListPrs } from "../lib/api";
import type { QueueEntryStatus } from "../lib/api-types";
import { FEATURES } from "../lib/features";
import { buildQueueStacks, type QueueEntry } from "../lib/merge-queue-stacks";
import { supabase, WEB_URL } from "../lib/supabase";
import { CreateIssueForm, IssueDetailPanel } from "./github-panel/IssueDetail";
import { CreatePrForm, PrDetailPanel } from "./github-panel/PrDetail";
import { EmptyState, IssueListItem, PrListItem } from "./github-panel/shared";
import { Button } from "./ui/button";
import { Switch } from "./ui/switch";
import { Tabs, TabsList, TabsTrigger } from "./ui/tabs";

type TabValue = "issues" | "prs" | "merge-queue";
type StateFilter = "open" | "closed" | "all";

interface GitHubPanelProps {
	repoPath: string;
	/** When set, opens the PRs tab and selects this PR. */
	initialPrNumber?: number | null;
	onInitialPrConsumed?: () => void;
}

const FILTERS: { label: string; value: StateFilter }[] = [
	{ label: "Open", value: "open" },
	{ label: "Closed", value: "closed" },
	{ label: "All", value: "all" },
];

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

function MergeQueueUpsell() {
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

export const GitHubPanel: React.FC<GitHubPanelProps> = ({
	repoPath,
	initialPrNumber = null,
	onInitialPrConsumed,
}) => {
	const { subscription } = useAuth();
	const isPro =
		subscription?.plan === "pro" && subscription.status === "active";
	const { data: remoteInfo, isLoading: remoteLoading } =
		useGitRemoteInfo(repoPath);
	const { data: queueEnabled, isLoading: queueEnabledLoading } =
		useMergeQueueEnabled(repoPath);
	const setQueueEnabled = useSetMergeQueueEnabled(repoPath);
	const dequeueBranches = useDequeueBranches(repoPath);
	const [activeTab, setActiveTab] = useState<TabValue>("issues");
	const [queueToggleError, setQueueToggleError] = useState<string | null>(null);
	const [issueFilter, setIssueFilter] = useState<StateFilter>("open");
	const [prFilter, setPrFilter] = useState<StateFilter>("open");
	const [selectedIssue, setSelectedIssue] = useState<number | null>(null);
	const [selectedPr, setSelectedPr] = useState<number | null>(null);
	const [showCreateForm, setShowCreateForm] = useState(false);

	useEffect(() => {
		if (initialPrNumber == null) return;
		setActiveTab("prs");
		setPrFilter("all");
		setSelectedIssue(null);
		setShowCreateForm(false);
		setSelectedPr(initialPrNumber);
		onInitialPrConsumed?.();
	}, [initialPrNumber, onInitialPrConsumed]);

	const repoFullName = remoteInfo?.full_name ?? "";
	const isListTab = activeTab === "issues" || activeTab === "prs";

	const {
		data: issuesData,
		isLoading: issuesLoading,
		isFetchingNextPage: issuesFetchingNext,
		hasNextPage: issuesHasNextPage,
		fetchNextPage: fetchNextIssues,
		refetch: refetchIssues,
	} = useInfiniteQuery({
		queryKey: ["gh-issues", repoFullName, issueFilter],
		queryFn: ({ pageParam }) =>
			ghListIssues(repoFullName, issueFilter, GH_LIST_PAGE_SIZE, pageParam),
		initialPageParam: 1,
		getNextPageParam: (lastPage, _pages, lastPageParam) =>
			lastPage.hasMore ? lastPageParam + 1 : undefined,
		enabled: !!repoFullName && activeTab === "issues",
	});

	const {
		data: prsData,
		isLoading: prsLoading,
		isFetchingNextPage: prsFetchingNext,
		hasNextPage: prsHasNextPage,
		fetchNextPage: fetchNextPrs,
		refetch: refetchPrs,
	} = useInfiniteQuery({
		queryKey: ["gh-prs", repoFullName, prFilter],
		queryFn: ({ pageParam }) =>
			ghListPrs(repoFullName, prFilter, GH_LIST_PAGE_SIZE, pageParam),
		initialPageParam: 1,
		getNextPageParam: (lastPage, _pages, lastPageParam) =>
			lastPage.hasMore ? lastPageParam + 1 : undefined,
		enabled: !!repoFullName && activeTab === "prs",
	});

	const issues = issuesData?.pages.flatMap((page) => page.items) ?? [];
	const prs = prsData?.pages.flatMap((page) => page.items) ?? [];

	const {
		data: queueEntries = [],
		isLoading: queueLoading,
		refetch: refetchQueue,
	} = useQuery({
		queryKey: ["repo-branch-queue-statuses-panel", repoFullName],
		queryFn: async () => {
			const { data, error } = await supabase.rpc(
				"get_repo_branch_queue_statuses",
				{ p_repo_full_name: repoFullName },
			);
			if (error) throw error;
			return ((data ?? []) as QueueEntry[]).slice().sort((a, b) => {
				if (a.position !== b.position) return a.position - b.position;
				return a.branch_name.localeCompare(b.branch_name);
			});
		},
		enabled:
			FEATURES.mergeQueue &&
			queueEnabled === true &&
			!!repoFullName &&
			activeTab === "merge-queue" &&
			isPro,
		refetchInterval: 30_000,
	});

	const queueStacks = buildQueueStacks(queueEntries);

	const isListLoading = activeTab === "issues" ? issuesLoading : prsLoading;
	const currentFilter = activeTab === "issues" ? issueFilter : prFilter;
	const setCurrentFilter =
		activeTab === "issues" ? setIssueFilter : setPrFilter;

	const showDetail =
		(activeTab === "issues" && selectedIssue !== null) ||
		(activeTab === "prs" && selectedPr !== null);

	function handleTabChange(v: string) {
		setActiveTab(v as TabValue);
		setSelectedIssue(null);
		setSelectedPr(null);
		setShowCreateForm(false);
	}

	function handleSelectIssue(n: number) {
		setSelectedIssue(n);
		setShowCreateForm(false);
	}

	function handleSelectPr(n: number) {
		setSelectedPr(n);
		setShowCreateForm(false);
	}

	function handleNewClick() {
		setShowCreateForm(true);
		setSelectedIssue(null);
		setSelectedPr(null);
	}

	function handleRefresh() {
		if (activeTab === "issues") void refetchIssues();
		else if (activeTab === "prs") void refetchPrs();
		else void refetchQueue();
	}

	return (
		<div className="flex h-full bg-background">
			{/* List panel */}
			<div
				className={`flex flex-col border-r border-border overflow-hidden ${showDetail ? "w-[380px] shrink-0" : "flex-1"}`}
			>
				<div className="flex items-center px-4 pt-4 pb-2 shrink-0">
					<div className="flex items-center gap-2">
						<Github className="w-5 h-5 text-muted-foreground" />
						<div>
							{remoteLoading ? (
								<h1 className="text-base font-semibold leading-tight text-muted-foreground">
									<span className="sr-only">GitHub </span>
									Loading…
								</h1>
							) : remoteInfo ? (
								<h1 className="text-base font-semibold leading-tight font-mono">
									<span className="sr-only">GitHub </span>
									{remoteInfo.full_name}
								</h1>
							) : (
								<h1 className="text-base font-semibold leading-tight text-destructive">
									No GitHub remote
								</h1>
							)}
						</div>
					</div>
				</div>

				<div className="px-4 pb-2 shrink-0">
					<Tabs value={activeTab} onValueChange={handleTabChange}>
						<TabsList className="text-base">
							<TabsTrigger value="issues">Issues</TabsTrigger>
							<TabsTrigger value="prs">Pull Requests</TabsTrigger>
							{FEATURES.mergeQueue && (
								<TabsTrigger
									value="merge-queue"
									className="inline-flex items-center gap-1.5"
								>
									Merge Queue
									{!isPro && (
										<span className="text-base font-semibold tracking-wide px-1 py-px rounded bg-green-500/20 text-green-700 dark:text-green-400 leading-none">
											PRO
										</span>
									)}
								</TabsTrigger>
							)}
						</TabsList>
					</Tabs>
				</div>

				{isListTab && (
					<div className="flex items-center gap-2 px-4 pb-2 shrink-0">
						<div className="flex items-center gap-1 border border-border rounded-md p-0.5 bg-muted/30">
							{FILTERS.map((btn) => (
								<button
									key={btn.value}
									type="button"
									onClick={() => setCurrentFilter(btn.value)}
									className={`text-base px-2 py-0.5 rounded transition-colors ${
										currentFilter === btn.value
											? "bg-background shadow-sm text-foreground"
											: "text-muted-foreground hover:text-foreground"
									}`}
								>
									{btn.label}
								</button>
							))}
						</div>
						<div className="flex-1" />
						<Button
							variant="ghost"
							size="icon"
							className="h-7 w-7"
							onClick={handleRefresh}
							title="Refresh"
						>
							<RefreshCw className="w-3.5 h-3.5" />
						</Button>
						{remoteInfo && (
							<Button
								size="sm"
								className="h-7 text-base"
								onClick={handleNewClick}
							>
								<Plus className="w-3 h-3 mr-1" />
								New
							</Button>
						)}
					</div>
				)}

				{showCreateForm && remoteInfo && isListTab && (
					<div className="shrink-0 overflow-y-auto">
						{activeTab === "issues" ? (
							<CreateIssueForm
								repoFullName={repoFullName}
								onSuccess={(n) => {
									setShowCreateForm(false);
									setSelectedIssue(n);
								}}
								onCancel={() => setShowCreateForm(false)}
							/>
						) : (
							<CreatePrForm
								repoFullName={repoFullName}
								onSuccess={(n) => {
									setShowCreateForm(false);
									setSelectedPr(n);
								}}
								onCancel={() => setShowCreateForm(false)}
							/>
						)}
					</div>
				)}

				<div className="flex-1 overflow-y-auto">
					{!remoteInfo && !remoteLoading && activeTab !== "merge-queue" && (
						<div className="flex flex-col items-center justify-center h-full text-center p-8 gap-3">
							<AlertCircle className="w-8 h-8 text-muted-foreground" />
							<p className="text-base text-muted-foreground">
								No GitHub remote detected for this repository.
							</p>
						</div>
					)}

					{remoteInfo && isListTab && isListLoading && (
						<div className="flex items-center justify-center py-12">
							<Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
						</div>
					)}

					{remoteInfo && !isListLoading && activeTab === "issues" && (
						<>
							{issues.length === 0 ? (
								<EmptyState icon={CircleDot} message="No issues found." />
							) : (
								<>
									{issues.map((issue) => (
										<IssueListItem
											key={issue.number}
											issue={issue}
											selected={selectedIssue === issue.number}
											onClick={() => handleSelectIssue(issue.number)}
										/>
									))}
									{issuesHasNextPage && (
										<div className="p-3">
											<Button
												variant="outline"
												className="w-full text-base"
												disabled={issuesFetchingNext}
												onClick={() => void fetchNextIssues()}
											>
												{issuesFetchingNext ? (
													<Loader2 className="w-4 h-4 mr-2 animate-spin" />
												) : null}
												Load more
											</Button>
										</div>
									)}
								</>
							)}
						</>
					)}

					{remoteInfo && !isListLoading && activeTab === "prs" && (
						<>
							{prs.length === 0 ? (
								<EmptyState
									icon={GitPullRequest}
									message="No pull requests found."
								/>
							) : (
								<>
									{prs.map((pr) => (
										<PrListItem
											key={pr.number}
											pr={pr}
											selected={selectedPr === pr.number}
											onClick={() => handleSelectPr(pr.number)}
										/>
									))}
									{prsHasNextPage && (
										<div className="p-3">
											<Button
												variant="outline"
												className="w-full text-base"
												disabled={prsFetchingNext}
												onClick={() => void fetchNextPrs()}
											>
												{prsFetchingNext ? (
													<Loader2 className="w-4 h-4 mr-2 animate-spin" />
												) : null}
												Load more
											</Button>
										</div>
									)}
								</>
							)}
						</>
					)}

					{activeTab === "merge-queue" && !isPro && <MergeQueueUpsell />}

					{remoteInfo && activeTab === "merge-queue" && isPro && (
						<>
							<div
								data-testid="merge-queue-toggle-row"
								className="flex items-center justify-between gap-3 px-3 py-2.5 border-b border-border"
							>
								<div className="min-w-0">
									<p className="text-base font-medium">Merge queue</p>
									<p className="text-base text-muted-foreground">
										{queueEnabled
											? "Enabled for this repository."
											: "Turn on the merge queue to start adding branches."}
									</p>
								</div>
								<div className="flex items-center gap-2 shrink-0">
									{setQueueEnabled.isPending && (
										<Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
									)}
									<Switch
										aria-label="Enable merge queue"
										checked={queueEnabled === true}
										disabled={queueEnabledLoading || setQueueEnabled.isPending}
										onCheckedChange={async (next) => {
											setQueueToggleError(null);
											try {
												await setQueueEnabled.mutateAsync(next);
											} catch (err) {
												setQueueToggleError((err as Error).message);
											}
										}}
									/>
								</div>
							</div>

							{queueToggleError && (
								<div className="flex items-start gap-2 px-3 py-2 border-b border-border text-base text-destructive">
									<AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
									<span>{queueToggleError}</span>
								</div>
							)}

							{!queueEnabled ? (
								<EmptyState
									icon={GitMerge}
									message="The merge queue is off for this repository."
								/>
							) : queueLoading ? (
								<div className="flex items-center justify-center py-12">
									<Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
								</div>
							) : queueEntries.length === 0 ? (
								<EmptyState icon={GitMerge} message="Merge queue is empty." />
							) : (
								<div className="p-3 space-y-3">
									{queueStacks.map((stack) => {
										const isStack = stack.entries.length > 1;
										const stackKey = stack.entries[0].branch_name;
										return (
											<div
												key={stackKey}
												data-testid={
													isStack
														? `merge-queue-stack-${stackKey}`
														: `merge-queue-single-${stackKey}`
												}
												className={
													isStack
														? "rounded-md border border-border bg-muted/20"
														: "rounded-md border border-border"
												}
											>
												{isStack && (
													<div className="flex items-center gap-2 px-3 py-2 border-b border-border">
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
																dequeueBranches.mutate(
																	stack.entries.map((e) => e.branch_name),
																)
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
														className={`flex items-start gap-2 px-3 py-2.5 ${
															indexInStack > 0 ? "border-t border-border" : ""
														}`}
													>
														<div className="min-w-0 flex-1">
															<div className="flex items-center gap-2 flex-wrap">
																<span className="text-base text-muted-foreground tabular-nums">
																	#{entry.position}
																</span>
																<span className="text-base font-medium">
																	{entry.pr_number != null
																		? `PR #${entry.pr_number}`
																		: "No PR"}
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
																dequeueBranches.mutate(
																	// Removing a branch mid-stack would strand
																	// everything built on top of it, so take the
																	// whole upper part of the stack with it.
																	stack.entries
																		.slice(indexInStack)
																		.map((e) => e.branch_name),
																)
															}
														>
															<X className="w-3.5 h-3.5" />
														</Button>
													</div>
												))}
											</div>
										);
									})}
								</div>
							)}
						</>
					)}
				</div>
			</div>

			{/* Detail panel */}
			{showDetail && (
				<div className="flex-1 flex flex-col overflow-hidden">
					{activeTab === "issues" && selectedIssue !== null && (
						<IssueDetailPanel
							repoFullName={repoFullName}
							issueNumber={selectedIssue}
							onClose={() => setSelectedIssue(null)}
						/>
					)}
					{activeTab === "prs" && selectedPr !== null && (
						<PrDetailPanel
							repoFullName={repoFullName}
							prNumber={selectedPr}
							onClose={() => setSelectedPr(null)}
						/>
					)}
				</div>
			)}
		</div>
	);
};
