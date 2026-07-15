import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
	AlertCircle,
	CircleDot,
	GitPullRequest,
	Loader2,
	Plus,
	RefreshCw,
	X,
} from "lucide-react";
import { Button } from "./ui/button";
import { Tabs, TabsList, TabsTrigger } from "./ui/tabs";
import { useGitRemoteInfo } from "../hooks/useMergeQueueStatus";
import { ghListIssues, ghListPrs } from "../lib/api";
import { CreateIssueForm, IssueDetailPanel } from "./github-panel/IssueDetail";
import { CreatePrForm, PrDetailPanel } from "./github-panel/PrDetail";
import { EmptyState, IssueListItem, PrListItem } from "./github-panel/shared";

type TabValue = "issues" | "prs";
type StateFilter = "open" | "closed" | "all";

interface GitHubPanelProps {
	repoPath: string;
	onClose: () => void;
}

const FILTERS: { label: string; value: StateFilter }[] = [
	{ label: "Open", value: "open" },
	{ label: "Closed", value: "closed" },
	{ label: "All", value: "all" },
];

export const GitHubPanel: React.FC<GitHubPanelProps> = ({
	repoPath,
	onClose,
}) => {
	const { data: remoteInfo, isLoading: remoteLoading } =
		useGitRemoteInfo(repoPath);
	const [activeTab, setActiveTab] = useState<TabValue>("issues");
	const [issueFilter, setIssueFilter] = useState<StateFilter>("open");
	const [prFilter, setPrFilter] = useState<StateFilter>("open");
	const [selectedIssue, setSelectedIssue] = useState<number | null>(null);
	const [selectedPr, setSelectedPr] = useState<number | null>(null);
	const [showCreateForm, setShowCreateForm] = useState(false);

	const repoFullName = remoteInfo?.full_name ?? "";

	const {
		data: issues = [],
		isLoading: issuesLoading,
		refetch: refetchIssues,
	} = useQuery({
		queryKey: ["gh-issues", repoFullName, issueFilter],
		queryFn: () => ghListIssues(repoFullName, issueFilter),
		enabled: !!repoFullName && activeTab === "issues",
	});

	const {
		data: prs = [],
		isLoading: prsLoading,
		refetch: refetchPrs,
	} = useQuery({
		queryKey: ["gh-prs", repoFullName, prFilter],
		queryFn: () => ghListPrs(repoFullName, prFilter),
		enabled: !!repoFullName && activeTab === "prs",
	});

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

	return (
		<div className="flex h-full bg-background">
			{/* List panel */}
			<div
				className={`flex flex-col border-r border-border overflow-hidden ${showDetail ? "w-[380px] shrink-0" : "flex-1"}`}
			>
				<div className="flex items-center justify-between px-4 pt-4 pb-2 shrink-0">
					<div className="flex items-center gap-2">
						<GitPullRequest className="w-5 h-5 text-muted-foreground" />
						<div>
							<h1 className="text-sm font-semibold leading-tight">GitHub</h1>
							{remoteLoading ? (
								<span className="text-xs text-muted-foreground">Loading…</span>
							) : remoteInfo ? (
								<span className="text-xs text-muted-foreground font-mono">
									{remoteInfo.full_name}
								</span>
							) : (
								<span className="text-xs text-destructive">
									No GitHub remote
								</span>
							)}
						</div>
					</div>
					<Button
						variant="ghost"
						size="icon"
						className="h-7 w-7"
						onClick={onClose}
					>
						<X className="w-4 h-4" />
					</Button>
				</div>

				<div className="px-4 pb-2 shrink-0">
					<Tabs value={activeTab} onValueChange={handleTabChange}>
						<TabsList className="w-full">
							<TabsTrigger value="issues" className="flex-1">
								Issues
							</TabsTrigger>
							<TabsTrigger value="prs" className="flex-1">
								Pull Requests
							</TabsTrigger>
						</TabsList>
					</Tabs>
				</div>

				<div className="flex items-center gap-2 px-4 pb-2 shrink-0">
					<div className="flex items-center gap-1 border border-border rounded-md p-0.5 bg-muted/30">
						{FILTERS.map((btn) => (
							<button
								key={btn.value}
								type="button"
								onClick={() => setCurrentFilter(btn.value)}
								className={`text-xs px-2 py-0.5 rounded transition-colors ${
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
						onClick={() =>
							activeTab === "issues" ? refetchIssues() : refetchPrs()
						}
						title="Refresh"
					>
						<RefreshCw className="w-3.5 h-3.5" />
					</Button>
					{remoteInfo && (
						<Button size="sm" className="h-7 text-xs" onClick={handleNewClick}>
							<Plus className="w-3 h-3 mr-1" />
							New
						</Button>
					)}
				</div>

				{showCreateForm && remoteInfo && (
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
					{!remoteInfo && !remoteLoading && (
						<div className="flex flex-col items-center justify-center h-full text-center p-8 gap-3">
							<AlertCircle className="w-8 h-8 text-muted-foreground" />
							<p className="text-sm text-muted-foreground">
								No GitHub remote detected for this repository.
							</p>
						</div>
					)}

					{remoteInfo && isListLoading && (
						<div className="flex items-center justify-center py-12">
							<Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
						</div>
					)}

					{remoteInfo && !isListLoading && activeTab === "issues" && (
						<>
							{issues.length === 0 ? (
								<EmptyState icon={CircleDot} message="No issues found." />
							) : (
								issues.map((issue) => (
									<IssueListItem
										key={issue.number}
										issue={issue}
										selected={selectedIssue === issue.number}
										onClick={() => handleSelectIssue(issue.number)}
									/>
								))
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
								prs.map((pr) => (
									<PrListItem
										key={pr.number}
										pr={pr}
										selected={selectedPr === pr.number}
										onClick={() => handleSelectPr(pr.number)}
									/>
								))
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
