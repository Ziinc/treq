import { openUrl } from "@tauri-apps/plugin-opener";
import { useQueries, useQuery } from "@tanstack/react-query";
import { ArrowDown, GitMerge, Layers2, Loader2, Rocket, X } from "lucide-react";
import { useMemo, useState } from "react";
import type { UseMutationResult } from "@tanstack/react-query";
import type { QueueEntryStatus } from "../../lib/api-types";
import { listCommits, listWorkspaceStatuses } from "../../lib/api";
import {
  MERGE_QUEUE_HISTORY_PAGE_SIZE,
  partitionQueueStacks,
  takeHistoryPage,
  type QueueEntry,
  type QueueStack,
} from "../../lib/merge-queue-stacks";
import { WEB_URL } from "../../lib/supabase";
import {
  sumWorkspaceDiffStats,
  type WorkspaceDiffStats,
} from "../../lib/workspace-stack";
import { DiffStatsInline } from "../DiffBar";
import { Button } from "../ui/button";
import { Switch } from "../ui/switch";
import { EmptyState } from "./shared";

function queueStatusLabel(status: QueueEntryStatus): string {
  switch (status) {
    case "queued":
      return "Queued";
    case "testing":
      return "Running checks";
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

function stackMaxChange(entries: readonly QueueEntry[]): number {
  return Math.max(
    0,
    ...entries.map((entry) =>
      Math.max(entry.insertions ?? 0, entry.deletions ?? 0),
    ),
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
  stack: QueueStack;
  dequeueBranches: UseMutationResult<string[], Error, string[]>;
  /** History stacks are read-only — no Remove controls. */
  showRemove?: boolean;
}

function QueueStackBlock({
  stack,
  dequeueBranches,
  showRemove = true,
}: QueueStackBlockProps) {
  const isStack = stack.entries.length > 1;
  const stackKey = stack.entries[0].branch_name;
  const maxChange = stackMaxChange(stack.entries);

  return (
    <div
      data-testid={
        isStack
          ? `merge-queue-stack-${stackKey}`
          : `merge-queue-single-${stackKey}`
      }
      className="border rounded-lg p-4 bg-background"
    >
      {isStack && (
        <div className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground mb-3">
          <Layers2 className="w-4 h-4 shrink-0" />
          <span>Stack of {stack.entries.length}</span>
          <span className="text-xs font-normal text-muted-foreground truncate">
            merges bottom-up into {stack.targetBranch}
          </span>
          <div className="flex-1" />
          {showRemove && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-base shrink-0 font-normal"
              disabled={dequeueBranches.isPending}
              aria-label={`Remove stack of ${stack.entries.length} from queue`}
              onClick={() =>
                dequeueBranches.mutate(stack.entries.map((e) => e.branch_name))
              }
            >
              Remove
            </Button>
          )}
        </div>
      )}

      <div className="relative">
        {isStack && (
          <div
            className="absolute left-[7px] top-2 bottom-2 w-0.5 bg-border"
            aria-hidden="true"
          />
        )}
        <ul className="space-y-0">
          {stack.entries.map((entry) => {
            const insertions = entry.insertions ?? 0;
            const deletions = entry.deletions ?? 0;
            return (
              <li
                key={entry.branch_name}
                data-testid={`merge-queue-entry-${entry.position}`}
                className="relative z-10 flex w-full items-start gap-3 py-2"
              >
                <div className="flex-shrink-0 mt-0.5 w-[14px] h-[14px] flex items-center justify-center">
                  <div
                    className={`w-[14px] h-[14px] rounded-full border-2 border-background ${queueNodeColor(entry.status)}`}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm text-muted-foreground tabular-nums">
                      #{entry.position}
                    </span>
                    <span className="text-sm font-medium truncate">
                      {entry.pr_number != null
                        ? `PR #${entry.pr_number}`
                        : "No PR"}
                    </span>
                    <QueueStatusChip status={entry.status} />
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    <p className="text-xs font-mono text-muted-foreground truncate min-w-0">
                      {entry.branch_name} → {entry.target_branch}
                    </p>
                    <DiffStatsInline
                      insertions={insertions}
                      deletions={deletions}
                      maxChange={maxChange}
                    />
                  </div>
                </div>
                {showRemove && !isStack && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0"
                    disabled={dequeueBranches.isPending}
                    aria-label={`Remove ${entry.branch_name} from queue`}
                    title="Remove from queue"
                    onClick={() =>
                      dequeueBranches.mutate([entry.branch_name])
                    }
                  >
                    <X className="w-3.5 h-3.5" />
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

/**
 * Overlay local workspace commit LOC onto queue entries that don't already
 * carry insertions/deletions (e.g. from fixtures or a future RPC).
 */
function mergeLocalDiffStats(
  entries: readonly QueueEntry[],
  statsByBranch: Map<string, WorkspaceDiffStats>,
): QueueEntry[] {
  return entries.map((entry) => {
    if (entry.insertions != null || entry.deletions != null) return entry;
    const stats = statsByBranch.get(entry.branch_name);
    if (!stats) return entry;
    return {
      ...entry,
      insertions: stats.insertions,
      deletions: stats.deletions,
    };
  });
}

interface MergeQueueListProps {
  repoPath: string;
  queueLoading: boolean;
  queueEntries: QueueEntry[];
  dequeueBranches: UseMutationResult<string[], Error, string[]>;
}

function MergeQueueList({
  repoPath,
  queueLoading,
  queueEntries,
  dequeueBranches,
}: MergeQueueListProps) {
  const [showMergedHistory, setShowMergedHistory] = useState(false);
  const [historyLimit, setHistoryLimit] = useState(MERGE_QUEUE_HISTORY_PAGE_SIZE);

  const { data: workspaceStatuses } = useQuery({
    queryKey: ["workspace-statuses", repoPath],
    queryFn: () => listWorkspaceStatuses(repoPath),
    enabled: Boolean(repoPath) && queueEntries.length > 0,
  });

  const branchToWorkspaceId = useMemo(() => {
    const map = new Map<string, number>();
    for (const status of workspaceStatuses ?? []) {
      map.set(status.current.branch_name, status.current.id);
    }
    return map;
  }, [workspaceStatuses]);

  const branchesNeedingStats = useMemo(
    () =>
      queueEntries.filter(
        (entry) =>
          entry.insertions == null &&
          entry.deletions == null &&
          branchToWorkspaceId.has(entry.branch_name),
      ),
    [queueEntries, branchToWorkspaceId],
  );

  const commitQueries = useQueries({
    queries: branchesNeedingStats.map((entry) => {
      const workspaceId = branchToWorkspaceId.get(entry.branch_name)!;
      return {
        queryKey: ["workspace-commits", repoPath, workspaceId],
        queryFn: () => listCommits(repoPath, workspaceId),
      };
    }),
  });

  const localStatsByBranch = useMemo(() => {
    const map = new Map<string, WorkspaceDiffStats>();
    branchesNeedingStats.forEach((entry, index) => {
      const result = commitQueries[index]?.data;
      if (!result) return;
      map.set(entry.branch_name, sumWorkspaceDiffStats(result.commits));
    });
    return map;
  }, [branchesNeedingStats, commitQueries]);

  const enrichedEntries = useMemo(
    () => mergeLocalDiffStats(queueEntries, localStatsByBranch),
    [queueEntries, localStatsByBranch],
  );

  if (queueLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const { active, history } = partitionQueueStacks(enrichedEntries);
  const { visible: visibleHistory, hasMore } = takeHistoryPage(
    history,
    showMergedHistory ? historyLimit : 0,
  );
  const targetBranch =
    active[0]?.targetBranch ?? history[0]?.targetBranch ?? "main";
  const hasHistory = history.length > 0;

  return (
    <div className="flex flex-col h-full" data-testid="merge-queue-list">
      {hasHistory && (
        <div className="flex items-center justify-between gap-3 px-3 pt-3 pb-1 shrink-0">
          <label
            htmlFor="merge-queue-show-merged"
            className="text-base text-muted-foreground"
          >
            Show merged
          </label>
          <Switch
            id="merge-queue-show-merged"
            checked={showMergedHistory}
            onCheckedChange={(next) => {
              setShowMergedHistory(next);
              if (next) setHistoryLimit(MERGE_QUEUE_HISTORY_PAGE_SIZE);
            }}
            aria-label="Show merged pull requests"
          />
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {active.length === 0 ? (
          <div className="py-8">
            <EmptyState icon={GitMerge} message="Merge queue is empty." />
          </div>
        ) : (
          active.map((stack) => (
            <QueueStackBlock
              key={stack.entries[0].branch_name}
              stack={stack}
              dequeueBranches={dequeueBranches}
            />
          ))
        )}

        <div
          className="flex items-center gap-3 py-1 px-1 text-muted-foreground"
          data-testid="merge-queue-target"
        >
          <div className="shrink-0 w-[14px] h-[14px] flex items-center justify-center">
            <ArrowDown className="w-3.5 h-3.5" />
          </div>
          <p className="text-sm font-mono truncate">{targetBranch}</p>
        </div>

        {showMergedHistory && visibleHistory.length > 0 && (
          <div data-testid="merge-queue-history" className="space-y-3 pt-1">
            {visibleHistory.map((stack) => (
              <QueueStackBlock
                key={`history-${stack.entries[0].branch_name}`}
                stack={stack}
                dequeueBranches={dequeueBranches}
                showRemove={false}
              />
            ))}
            {hasMore && (
              <div className="flex justify-center pt-1 pb-1">
                <Button
                  variant="outline"
                  size="sm"
                  className="text-base"
                  onClick={() =>
                    setHistoryLimit((n) => n + MERGE_QUEUE_HISTORY_PAGE_SIZE)
                  }
                >
                  Load more
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export interface MergeQueueTabProps {
  isPro: boolean;
  hasRemote: boolean;
  repoPath: string;
  queueEnabled: boolean | undefined;
  queueLoading: boolean;
  queueEntries: QueueEntry[];
  dequeueBranches: UseMutationResult<string[], Error, string[]>;
  onOpenSettings?: (tab?: string) => void;
}

export function MergeQueueTab({
  isPro,
  hasRemote,
  repoPath,
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
      repoPath={repoPath}
      queueLoading={queueLoading}
      queueEntries={queueEntries}
      dequeueBranches={dequeueBranches}
    />
  );
}
