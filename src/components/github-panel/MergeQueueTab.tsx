import { openUrl } from "@tauri-apps/plugin-opener";
import { ArrowDown, GitMerge, Layers2, Loader2, Rocket, X } from "lucide-react";
import { useState } from "react";
import type { UseMutationResult } from "@tanstack/react-query";
import type { QueueEntryStatus } from "../../lib/api-types";
import {
  MERGE_QUEUE_HISTORY_PAGE_SIZE,
  partitionQueueStacks,
  takeHistoryPage,
  type QueueEntry,
  type QueueStack,
} from "../../lib/merge-queue-stacks";
import { WEB_URL } from "../../lib/supabase";
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
          {showRemove && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-base shrink-0"
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
      {stack.entries.map((entry) => (
        <div
          key={entry.branch_name}
          data-testid={`merge-queue-entry-${entry.position}`}
          className={`relative flex items-start py-2 ${isStack ? "" : "gap-3"}`}
        >
          <div className="shrink-0 mt-1 w-[14px] flex justify-center">
            <div
              className={`w-[14px] h-[14px] rounded-full border-2 border-background ${queueNodeColor(entry.status)}`}
            />
          </div>
          {/*
            Stack accent: header uses pl-8 so the Layers icon starts at 32px.
            Node is 14px wide; ml-[18px] puts the border-l under that icon.
          */}
          <div
            className={`min-w-0 flex-1 ${
              isStack ? "ml-[18px] border-l-2 border-border/70 pl-3" : ""
            }`}
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
          {showRemove && !isStack && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0"
              disabled={dequeueBranches.isPending}
              aria-label={`Remove ${entry.branch_name} from queue`}
              title="Remove from queue"
              onClick={() => dequeueBranches.mutate([entry.branch_name])}
            >
              <X className="w-3.5 h-3.5" />
            </Button>
          )}
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
  const [showMergedHistory, setShowMergedHistory] = useState(false);
  const [historyLimit, setHistoryLimit] = useState(MERGE_QUEUE_HISTORY_PAGE_SIZE);

  if (queueLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const { active, history } = partitionQueueStacks(queueEntries);
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

      <div className="relative flex-1 overflow-y-auto p-3">
        {/* Continuous rail through the active queue and terminator. */}
        <div
          className="absolute left-[19px] top-2 bottom-2 w-0.5 bg-border"
          aria-hidden="true"
        />

        {active.length === 0 ? (
          <div className="relative z-10 py-8">
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
          className="relative z-10 flex items-center gap-3 py-2 text-muted-foreground"
          data-testid="merge-queue-target"
        >
          <div className="shrink-0 w-[14px] h-[14px] flex items-center justify-center">
            <ArrowDown className="w-3.5 h-3.5" />
          </div>
          <p className="text-base font-mono truncate">{targetBranch}</p>
        </div>

        {showMergedHistory && visibleHistory.length > 0 && (
          <div data-testid="merge-queue-history" className="relative z-10 pt-1">
            {visibleHistory.map((stack) => (
              <QueueStackBlock
                key={`history-${stack.entries[0].branch_name}`}
                stack={stack}
                dequeueBranches={dequeueBranches}
                showRemove={false}
              />
            ))}
            {hasMore && (
              <div className="flex justify-center pt-2 pb-1">
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
