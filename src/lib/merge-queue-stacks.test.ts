import { describe, expect, it } from "vitest";
import { buildQueueStacks, type QueueEntry } from "./merge-queue-stacks";

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
