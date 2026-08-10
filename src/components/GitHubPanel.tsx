import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import {
  AlertCircle,
  CircleDot,
  Github,
  GitPullRequest,
  Loader2,
  Plus,
  RefreshCw,
} from "lucide-react";
import { useLocation, useRoute } from "wouter";
import { useAuth } from "../hooks/useAuth";
import {
  useDequeueBranches,
  useGitRemoteInfo,
  useMergeQueueEnabled,
} from "../hooks/useMergeQueueStatus";
import { GH_LIST_PAGE_SIZE, ghListIssues, ghListPrs } from "../lib/api";
import { FEATURES } from "../lib/features";
import type { GitHubIssueAttachment } from "../lib/promptAttachments";
import {
  githubDetailPath,
  githubListPath,
  githubNewItemPath,
  githubTabPath,
  type GitHubStateFilter,
  type GitHubTab,
} from "../lib/githubRoutes";
import type { QueueEntry } from "../lib/merge-queue-stacks";
import { supabase } from "../lib/supabase";
import { MergeQueueTab } from "./github-panel/MergeQueueTab";
import { CreateIssueForm, IssueDetailPanel } from "./github-panel/IssueDetail";
import { CreatePrForm, PrDetailPanel } from "./github-panel/PrDetail";
import { EmptyState, IssueListItem, PrListItem } from "./github-panel/shared";
import { Button } from "./ui/button";
import { Tabs, TabsList, TabsTrigger } from "./ui/tabs";

interface GitHubPanelProps {
  repoPath: string;
  /** Opens the settings page, where the merge queue opt-in lives. */
  onOpenSettings?: (tab?: string) => void;
  /** Open the agent prompt dialog with a GitHub issue chip pre-attached. */
  onStartPromptFromIssue?: (issue: GitHubIssueAttachment) => void;
  /** Navigate to a workspace after creating/opening one from a PR. */
  onOpenWorkspace?: (workspaceId: number) => void;
}

const FILTERS: { label: string; value: GitHubStateFilter }[] = [
  { label: "Open", value: "open" },
  { label: "Closed", value: "closed" },
  { label: "All", value: "all" },
];

export const GitHubPanel: React.FC<GitHubPanelProps> = ({
  repoPath,
  onOpenSettings,
  onStartPromptFromIssue,
  onOpenWorkspace,
}) => {
  const { subscription } = useAuth();
  const isPro =
    subscription?.plan === "pro" && subscription.status === "active";
  const { data: remoteInfo, isLoading: remoteLoading } =
    useGitRemoteInfo(repoPath);
  const { data: queueEnabled } = useMergeQueueEnabled(repoPath);
  const dequeueBranches = useDequeueBranches(repoPath);

  // Routing: the current tab, filter, selection, and create-form state all
  // live in the URL (as /github/<tab>/<filter>/<selector?>) so browser
  // back/forward moves between them.
  const [, navigate] = useLocation();
  const [isMergeQueueRoute] = useRoute("/github/merge-queue");
  const [isIssuesRoute, issuesParams] = useRoute<{
    filter: string;
    selector?: string;
  }>("/github/issues/:filter/:selector?");
  const [isPrsRoute, prsParams] = useRoute<{
    filter: string;
    selector?: string;
  }>("/github/prs/:filter/:selector?");

  const activeTab: GitHubTab = isMergeQueueRoute
    ? "merge-queue"
    : isPrsRoute
      ? "prs"
      : "issues";
  const routeParams = activeTab === "prs" ? prsParams : issuesParams;
  const rawFilter = (isIssuesRoute || isPrsRoute) && routeParams?.filter;
  const currentFilter: GitHubStateFilter =
    rawFilter === "closed" || rawFilter === "all" ? rawFilter : "open";
  const selector = routeParams?.selector;
  const showCreateForm = selector === "new";

  const parsedSelectedNumber =
    selector !== undefined && selector !== "new" ? Number(selector) : NaN;
  const selectedNumber = Number.isFinite(parsedSelectedNumber)
    ? parsedSelectedNumber
    : null;
  const selectedIssue = activeTab === "issues" ? selectedNumber : null;
  const selectedPr = activeTab === "prs" ? selectedNumber : null;

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
    queryKey: ["gh-issues", repoFullName, currentFilter],
    queryFn: ({ pageParam }) =>
      ghListIssues(repoFullName, currentFilter, GH_LIST_PAGE_SIZE, pageParam),
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
    queryKey: ["gh-prs", repoFullName, currentFilter],
    queryFn: ({ pageParam }) =>
      ghListPrs(repoFullName, currentFilter, GH_LIST_PAGE_SIZE, pageParam),
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

  const isListLoading = activeTab === "issues" ? issuesLoading : prsLoading;

  const showDetail =
    (activeTab === "issues" && selectedIssue !== null) ||
    (activeTab === "prs" && selectedPr !== null);

  function handleTabChange(v: string) {
    navigate(
      v === "merge-queue"
        ? githubTabPath("merge-queue")
        : githubListPath(v as "issues" | "prs"),
    );
  }

  function handleFilterChange(value: GitHubStateFilter) {
    navigate(githubListPath(activeTab as "issues" | "prs", value));
  }

  function handleSelectIssue(n: number) {
    navigate(githubDetailPath("issues", n, currentFilter));
  }

  function handleSelectPr(n: number) {
    navigate(githubDetailPath("prs", n, currentFilter));
  }

  function handleNewClick() {
    navigate(githubNewItemPath(activeTab as "issues" | "prs", currentFilter));
  }

  function handleCloseDetail() {
    navigate(githubListPath(activeTab as "issues" | "prs", currentFilter), {
      replace: true,
    });
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
                  onClick={() => handleFilterChange(btn.value)}
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
                onSuccess={(n) =>
                  navigate(githubDetailPath("issues", n, currentFilter), {
                    replace: true,
                  })
                }
                onCancel={handleCloseDetail}
              />
            ) : (
              <CreatePrForm
                repoFullName={repoFullName}
                onSuccess={(n) =>
                  navigate(githubDetailPath("prs", n, currentFilter), {
                    replace: true,
                  })
                }
                onCancel={handleCloseDetail}
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
                      hideBranches={showDetail}
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

          {activeTab === "merge-queue" && (
            <MergeQueueTab
              isPro={isPro}
              hasRemote={!!remoteInfo}
              repoPath={repoPath}
              queueEnabled={queueEnabled}
              queueLoading={queueLoading}
              queueEntries={queueEntries}
              dequeueBranches={dequeueBranches}
              onOpenSettings={onOpenSettings}
            />
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
              onClose={handleCloseDetail}
              onStartPrompt={onStartPromptFromIssue}
            />
          )}
          {activeTab === "prs" && selectedPr !== null && (
            <PrDetailPanel
              repoPath={repoPath}
              repoFullName={repoFullName}
              prNumber={selectedPr}
              onClose={handleCloseDetail}
              onOpenWorkspace={onOpenWorkspace}
            />
          )}
        </div>
      )}
    </div>
  );
};
