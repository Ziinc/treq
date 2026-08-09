import { describe, expect, it } from "vitest";
import {
  type ActiveLane,
  availableLaneCapacity,
  canMergeLane,
  effectiveBatchSize,
  entrySetHash,
  isQueueTestBranch,
  nextMergeableLane,
  planLaneStarts,
  type QueuedEntry,
  testBranchName,
} from "../../supabase/functions/_shared/merge-queue/scheduler.ts";

const config = { batchSize: 2, maxParallelLanes: 3 };

function entry(n: number, position: number): QueuedEntry {
  return {
    entryId: `e-${n}`,
    pullRequestNumber: n,
    headSha: `sha-${n}`,
    position,
  };
}

function lane(
  laneNumber: number,
  status: ActiveLane["status"] = "running",
): ActiveLane {
  return { laneNumber, headSha: `lane-sha-${laneNumber}`, status };
}

describe("batch sizing and capacity", () => {
  it("uses the configured batch size normally", () => {
    expect(effectiveBatchSize(config, false)).toBe(2);
  });

  it("forces batch size 1 in bisect mode", () => {
    expect(effectiveBatchSize(config, true)).toBe(1);
  });

  it("computes remaining lane capacity", () => {
    expect(availableLaneCapacity(config, 0)).toBe(3);
    expect(availableLaneCapacity(config, 2)).toBe(1);
    expect(availableLaneCapacity(config, 3)).toBe(0);
    expect(availableLaneCapacity(config, 5)).toBe(0);
  });
});

describe("planLaneStarts", () => {
  it("plans nothing without capacity or entries", () => {
    expect(
      planLaneStarts(config, false, [lane(1), lane(2), lane(3)], [entry(1, 1)]),
    ).toEqual([]);
    expect(planLaneStarts(config, false, [], [])).toEqual([]);
  });

  it("batches entries in queue order across lanes", () => {
    const entries = [
      entry(3, 3),
      entry(1, 1),
      entry(2, 2),
      entry(4, 4),
      entry(5, 5),
    ];
    const lanes = planLaneStarts(config, false, [], entries);
    expect(lanes).toHaveLength(3);
    expect(lanes[0].entries.map((e) => e.pullRequestNumber)).toEqual([1, 2]);
    expect(lanes[1].entries.map((e) => e.pullRequestNumber)).toEqual([3, 4]);
    expect(lanes[2].entries.map((e) => e.pullRequestNumber)).toEqual([5]);
    expect(lanes.map((l) => l.laneNumber)).toEqual([1, 2, 3]);
  });

  it("numbers new lanes above the highest active lane", () => {
    const lanes = planLaneStarts(config, false, [lane(2)], [entry(1, 1)]);
    expect(lanes).toHaveLength(1);
    expect(lanes[0].laneNumber).toBe(3);
  });

  it("stacks the first new lane on the top active lane's head", () => {
    const lanes = planLaneStarts(
      config,
      false,
      [lane(1), lane(2)],
      [entry(9, 1)],
    );
    expect(lanes[0].expectedBaseSha).toBe("lane-sha-2");
  });

  it("builds on the branch tip when no lanes are active", () => {
    const lanes = planLaneStarts(config, false, [], [entry(9, 1)]);
    expect(lanes[0].expectedBaseSha).toBeNull();
  });

  it("plans single-entry lanes in bisect mode", () => {
    const entries = [entry(1, 1), entry(2, 2), entry(3, 3)];
    const lanes = planLaneStarts(config, true, [], entries);
    expect(lanes.map((l) => l.entries.length)).toEqual([1, 1, 1]);
  });
});

describe("lane merging order", () => {
  it("only the lowest unfinished lane can merge", () => {
    const lanes = [lane(1, "passed"), lane(2, "passed"), lane(3, "running")];
    expect(canMergeLane(1, lanes)).toBe(true);
    expect(canMergeLane(2, lanes)).toBe(false); // lane 1 not merged yet
    expect(canMergeLane(3, lanes)).toBe(false);
  });

  it("unblocks once lower lanes are gone", () => {
    expect(canMergeLane(2, [lane(2, "passed"), lane(3, "running")])).toBe(true);
  });

  it("chains to exactly the next passed lane", () => {
    const lanes = [lane(2, "passed"), lane(3, "running")];
    expect(nextMergeableLane(1, lanes)?.laneNumber).toBe(2);
    expect(nextMergeableLane(2, lanes)).toBeNull(); // lane 3 still running
  });
});

describe("test branch naming", () => {
  it("derives deterministic names from queue and run ids", () => {
    expect(testBranchName("q-1", "run-1")).toBe("treq/merge-queue/q-1/run-1");
  });

  it("recognises current and legacy queue branches", () => {
    expect(isQueueTestBranch("treq/merge-queue/q/r")).toBe(true);
    expect(isQueueTestBranch("treq-queue/main/lane-1")).toBe(true);
    expect(isQueueTestBranch("feature/treq")).toBe(false);
    expect(isQueueTestBranch("main")).toBe(false);
  });
});

describe("entrySetHash", () => {
  it("is stable and order-insensitive", () => {
    expect(entrySetHash(["a", "b", "c"])).toBe(entrySetHash(["c", "a", "b"]));
  });

  it("differs for different sets", () => {
    expect(entrySetHash(["a", "b"])).not.toBe(entrySetHash(["a", "c"]));
  });
});
