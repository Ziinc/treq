import { describe, expect, it } from "vitest";
import {
  buildQueueStacks,
  isStackFullyMerged,
  partitionQueueStacks,
  stacksForDisplay,
  takeHistoryPage,
  type QueueEntry,
} from "./merge-queue-stacks";

interface EntryOptions {
  branch: string;
  target: string;
  position: number;
  overrides?: Partial<QueueEntry>;
}

function entry({
  branch,
  target,
  position,
  overrides = {},
}: EntryOptions): QueueEntry {
  return {
    branch_name: branch,
    pr_number: position,
    status: "queued",
    position,
    target_branch: target,
    ...overrides,
  };
}

function branchNames(entries: QueueEntry[]): string[] {
  return entries.map((e) => e.branch_name);
}

function stackBranches(
  stacks: ReturnType<typeof buildQueueStacks>,
): string[][] {
  return stacks.map((s) => branchNames(s.entries));
}

describe("buildQueueStacks", () => {
  it("returns one single-entry stack per independent branch", () => {
    const stacks = buildQueueStacks([
      entry({ branch: "feat/a", target: "main", position: 1 }),
      entry({ branch: "feat/b", target: "main", position: 2 }),
    ]);

    expect(stacks).toHaveLength(2);
    expect(stackBranches(stacks)).toEqual([["feat/a"], ["feat/b"]]);
    expect(stacks.every((s) => s.targetBranch === "main")).toBe(true);
  });

  it("chains branches stacked on each other bottom-up", () => {
    const stacks = buildQueueStacks([
      entry({ branch: "feat/top", target: "feat/mid", position: 3 }),
      entry({ branch: "feat/base", target: "main", position: 1 }),
      entry({ branch: "feat/mid", target: "feat/base", position: 2 }),
    ]);

    expect(stacks).toHaveLength(1);
    expect(stacks[0].targetBranch).toBe("main");
    expect(branchNames(stacks[0].entries)).toEqual([
      "feat/base",
      "feat/mid",
      "feat/top",
    ]);
  });

  it("keeps stacks and singletons in merge order", () => {
    const stacks = buildQueueStacks([
      entry({ branch: "solo", target: "main", position: 4 }),
      entry({ branch: "feat/base", target: "main", position: 1 }),
      entry({ branch: "feat/top", target: "feat/base", position: 2 }),
    ]);

    expect(stackBranches(stacks)).toEqual([
      ["feat/base", "feat/top"],
      ["solo"],
    ]);
  });

  it("never drops an entry that sits in a cycle", () => {
    const stacks = buildQueueStacks([
      entry({ branch: "a", target: "b", position: 1 }),
      entry({ branch: "b", target: "a", position: 2 }),
    ]);

    const allBranches = stackBranches(stacks).flat();
    expect(allBranches.sort()).toEqual(["a", "b"]);
  });

  it("returns nothing for an empty queue", () => {
    expect(buildQueueStacks([])).toEqual([]);
  });
});

describe("partitionQueueStacks", () => {
  it("keeps a partially merged stack in active with Merged at the bottom", () => {
    const { active, history } = partitionQueueStacks([
      entry({
        branch: "feat/base",
        target: "main",
        position: 1,
        overrides: { status: "merged" },
      }),
      entry({
        branch: "feat/mid",
        target: "feat/base",
        position: 2,
        overrides: { status: "testing" },
      }),
      entry({
        branch: "feat/top",
        target: "feat/mid",
        position: 3,
        overrides: { status: "queued" },
      }),
    ]);

    expect(history).toHaveLength(0);
    expect(active).toHaveLength(1);
    expect(branchNames(active[0].entries)).toEqual([
      "feat/base",
      "feat/mid",
      "feat/top",
    ]);
    expect(active[0].entries[0].status).toBe("merged");
    expect(isStackFullyMerged(active[0])).toBe(false);
  });

  it("moves a fully merged stack to history and hides it from active", () => {
    const { active, history } = partitionQueueStacks([
      entry({
        branch: "feat/base",
        target: "main",
        position: 1,
        overrides: { status: "merged" },
      }),
      entry({
        branch: "feat/top",
        target: "feat/base",
        position: 2,
        overrides: { status: "merged" },
      }),
      entry({
        branch: "fix/solo",
        target: "main",
        position: 3,
        overrides: { status: "queued" },
      }),
    ]);

    expect(stackBranches(active)).toEqual([["fix/solo"]]);
    expect(stackBranches(history)).toEqual([["feat/base", "feat/top"]]);
  });

  it("orders history newest-first (highest position closest to the tip)", () => {
    const { history } = partitionQueueStacks([
      entry({
        branch: "old",
        target: "main",
        position: 1,
        overrides: { status: "merged" },
      }),
      entry({
        branch: "newer",
        target: "main",
        position: 5,
        overrides: { status: "merged" },
      }),
    ]);

    expect(stackBranches(history)).toEqual([["newer"], ["old"]]);
  });
});

describe("takeHistoryPage", () => {
  it("pages by entry count and reports hasMore", () => {
    const stacks = buildQueueStacks([
      entry({ branch: "a", target: "main", position: 1 }),
      entry({ branch: "b", target: "main", position: 2 }),
      entry({ branch: "c", target: "main", position: 3 }),
      entry({ branch: "d", target: "main", position: 4 }),
    ]);

    const page = takeHistoryPage(stacks, 2);
    expect(page.visible).toHaveLength(2);
    expect(page.hasMore).toBe(true);

    const all = takeHistoryPage(stacks, 10);
    expect(all.visible).toHaveLength(4);
    expect(all.hasMore).toBe(false);
  });

  it("keeps a multi-entry stack intact even when it exceeds the remaining budget", () => {
    const stacks = buildQueueStacks([
      entry({ branch: "base", target: "main", position: 1 }),
      entry({ branch: "top", target: "base", position: 2 }),
      entry({ branch: "solo", target: "main", position: 3 }),
    ]);

    const page = takeHistoryPage(stacks, 1);
    // First stack has 2 entries; we still take the whole stack as one unit.
    expect(stackBranches(page.visible)).toEqual([["base", "top"]]);
    expect(page.hasMore).toBe(true);
  });
});

describe("stacksForDisplay", () => {
  it("puts tip first and the next-to-merge stack closest to the terminator", () => {
    const stacks = buildQueueStacks([
      entry({ branch: "feat/base", target: "main", position: 1 }),
      entry({ branch: "feat/top", target: "feat/base", position: 2 }),
      entry({ branch: "solo", target: "main", position: 3 }),
    ]);

    expect(stackBranches(stacksForDisplay(stacks))).toEqual([
      ["solo"],
      ["feat/top", "feat/base"],
    ]);
  });

  it("keeps history stack order and only flips entries tip-first", () => {
    const historyOrdered = [
      {
        targetBranch: "main",
        entries: [
          entry({ branch: "newer-base", target: "main", position: 5 }),
          entry({
            branch: "newer-top",
            target: "newer-base",
            position: 6,
          }),
        ],
      },
      {
        targetBranch: "main",
        entries: [entry({ branch: "old", target: "main", position: 1 })],
      },
    ];

    expect(
      stackBranches(
        stacksForDisplay(historyOrdered, { reverseStackOrder: false }),
      ),
    ).toEqual([["newer-top", "newer-base"], ["old"]]);
  });
});
