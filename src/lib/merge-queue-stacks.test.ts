import { describe, expect, it } from "vitest";
import { buildQueueStacks, type QueueEntry } from "./merge-queue-stacks";

function entry(
	branch: string,
	target: string,
	position: number,
	overrides: Partial<QueueEntry> = {},
): QueueEntry {
	return {
		branch_name: branch,
		pr_number: position,
		status: "queued",
		position,
		target_branch: target,
		...overrides,
	};
}

describe("buildQueueStacks", () => {
	it("returns one single-entry stack per independent branch", () => {
		const stacks = buildQueueStacks([
			entry("feat/a", "main", 1),
			entry("feat/b", "main", 2),
		]);

		expect(stacks).toHaveLength(2);
		expect(stacks.map((s) => s.entries.map((e) => e.branch_name))).toEqual([
			["feat/a"],
			["feat/b"],
		]);
		expect(stacks.every((s) => s.targetBranch === "main")).toBe(true);
	});

	it("chains branches stacked on each other bottom-up", () => {
		const stacks = buildQueueStacks([
			entry("feat/top", "feat/mid", 3),
			entry("feat/base", "main", 1),
			entry("feat/mid", "feat/base", 2),
		]);

		expect(stacks).toHaveLength(1);
		expect(stacks[0].targetBranch).toBe("main");
		expect(stacks[0].entries.map((e) => e.branch_name)).toEqual([
			"feat/base",
			"feat/mid",
			"feat/top",
		]);
	});

	it("keeps stacks and singletons in merge order", () => {
		const stacks = buildQueueStacks([
			entry("solo", "main", 4),
			entry("feat/base", "main", 1),
			entry("feat/top", "feat/base", 2),
		]);

		expect(stacks.map((s) => s.entries.map((e) => e.branch_name))).toEqual([
			["feat/base", "feat/top"],
			["solo"],
		]);
	});

	it("never drops an entry that sits in a cycle", () => {
		const stacks = buildQueueStacks([entry("a", "b", 1), entry("b", "a", 2)]);

		const branches = stacks.flatMap((s) => s.entries.map((e) => e.branch_name));
		expect(branches.sort()).toEqual(["a", "b"]);
	});

	it("returns nothing for an empty queue", () => {
		expect(buildQueueStacks([])).toEqual([]);
	});
});
