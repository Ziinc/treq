import type { QueueEntryStatus } from "./api-types";

export interface QueueEntry {
  branch_name: string;
  pr_number: number | null;
  status: QueueEntryStatus;
  position: number;
  target_branch: string;
  /** Optional LOC from local workspace enrichment or fixtures. */
  insertions?: number;
  deletions?: number;
}

export interface QueueStack {
  /** Branch the whole stack ultimately lands on (never itself queued). */
  targetBranch: string;
  /** Entries in the order the queue will merge them, bottom of stack first. */
  entries: QueueEntry[];
}

/** Default page size for merged history below the target-branch terminator. */
export const MERGE_QUEUE_HISTORY_PAGE_SIZE = 5;

/**
 * Group flat queue entries into stacks.
 *
 * A branch whose target is another queued branch is stacked on top of it, and
 * the queue must land them bottom-up. Everything else is a stack of one. Within
 * a stack entries are ordered by the chain itself, and stacks are ordered by
 * their lowest queue position so the block that merges first renders first.
 */
export function buildQueueStacks(entries: readonly QueueEntry[]): QueueStack[] {
  const byBranch = new Map(entries.map((entry) => [entry.branch_name, entry]));
  const childrenOf = new Map<string, QueueEntry[]>();
  const roots: QueueEntry[] = [];

  for (const entry of entries) {
    if (byBranch.has(entry.target_branch)) {
      const siblings = childrenOf.get(entry.target_branch) ?? [];
      siblings.push(entry);
      childrenOf.set(entry.target_branch, siblings);
    } else {
      roots.push(entry);
    }
  }

  const claimed = new Set<string>();
  const stacks: QueueStack[] = [];

  for (const root of roots.sort((a, b) => a.position - b.position)) {
    const chain: QueueEntry[] = [];
    let current: QueueEntry | undefined = root;
    while (current && !claimed.has(current.branch_name)) {
      claimed.add(current.branch_name);
      chain.push(current);
      // Lowest position wins if a branch is unexpectedly forked.
      [current] = (childrenOf.get(current.branch_name) ?? []).sort(
        (a, b) => a.position - b.position,
      );
    }
    stacks.push({ targetBranch: root.target_branch, entries: chain });
  }

  // A leftover sits in a cycle with no root; surface it rather than drop it.
  for (const entry of entries) {
    if (claimed.has(entry.branch_name)) continue;
    claimed.add(entry.branch_name);
    stacks.push({ targetBranch: entry.target_branch, entries: [entry] });
  }

  return stacks.sort(
    (a, b) =>
      Math.min(...a.entries.map((e) => e.position)) -
      Math.min(...b.entries.map((e) => e.position)),
  );
}

export function isStackFullyMerged(stack: QueueStack): boolean {
  return (
    stack.entries.length > 0 &&
    stack.entries.every((entry) => entry.status === "merged")
  );
}

export type PartitionedQueueStacks = {
  /** Still in the queue (may include Merged rows at the bottom of a partial stack). */
  active: QueueStack[];
  /**
   * Fully merged stacks, newest first (closest to the target-branch tip).
   * Shown only when the history toggle is on, below the terminator.
   */
  history: QueueStack[];
};

/**
 * Split stacks into the live queue vs completed merge history.
 *
 * A stack stays **active** until every entry is `merged` — so the first PR in
 * a stack can show as Merged while upper PRs are still running. Once the whole
 * stack has merged bottom-up, it moves to **history** (hidden by default).
 */
export function partitionQueueStacks(
  entries: readonly QueueEntry[],
): PartitionedQueueStacks {
  const stacks = buildQueueStacks(entries);
  const active: QueueStack[] = [];
  const history: QueueStack[] = [];

  for (const stack of stacks) {
    if (isStackFullyMerged(stack)) history.push(stack);
    else active.push(stack);
  }

  // Newest completed stacks sit just under the target branch tip.
  history.sort(
    (a, b) =>
      Math.min(...b.entries.map((e) => e.position)) -
      Math.min(...a.entries.map((e) => e.position)),
  );

  return { active, history };
}

/** Take the first stacks whose combined entry count reaches `limit`. */
export function takeHistoryPage(
  history: readonly QueueStack[],
  limit: number,
): { visible: QueueStack[]; hasMore: boolean } {
  if (limit <= 0) return { visible: [], hasMore: history.length > 0 };

  const visible: QueueStack[] = [];
  let count = 0;
  for (const stack of history) {
    if (count >= limit) break;
    visible.push(stack);
    count += stack.entries.length;
  }
  const visibleEntries = visible.reduce((n, s) => n + s.entries.length, 0);
  const totalEntries = history.reduce((n, s) => n + s.entries.length, 0);
  return { visible, hasMore: visibleEntries < totalEntries };
}

/**
 * Flip merge-order stacks for the UI: tip of each stack first, and the stack
 * that merges next closest to the target-branch terminator (list bottom).
 * Keeps `entries` merge-order elsewhere (e.g. dequeue still reverses top-down).
 */
export function stacksForDisplay(
  stacks: readonly QueueStack[],
  options: { reverseStackOrder: boolean } = { reverseStackOrder: true },
): QueueStack[] {
  const withTipFirst = stacks.map((stack) => ({
    ...stack,
    entries: [...stack.entries].reverse(),
  }));
  return options.reverseStackOrder
    ? withTipFirst.reverse()
    : withTipFirst;
}
