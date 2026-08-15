/**
 * Simulate labeled webhooks → worker → check_suite CI → stubbed merges
 * until the queue has no active entries. No direct merge_queue_entries inserts.
 */
import { expect, it } from "vitest";
import { getServiceClient } from "../clients";
import { withMergeQueueFixture } from "../fixture";
import { recordOutcome } from "../record";
import {
  drainMergeQueueWorker,
  drainQueueViaCiAndMerge,
  simulateEnqueueWorkspace,
  type WorkspacePr,
} from "../webhook";

const WORKSPACES: WorkspacePr[] = [
  {
    number: 11,
    branch: "feat/a",
    headSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  },
  {
    number: 12,
    branch: "feat/b",
    headSha: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  },
  {
    number: 13,
    branch: "feat/c",
    headSha: "cccccccccccccccccccccccccccccccccccccccc",
  },
];

it("drains a multi-workspace queue via webhooks and the worker", async () => {
  await withMergeQueueFixture(async (fx) => {
    await fx.enableQueue();
    await fx.admin
      .from("merge_queue_configs")
      .update({ batch_size: 1, max_parallel_queues: 1 })
      .eq("repo_id", fx.linked.repoId);

    for (const pr of WORKSPACES) {
      await simulateEnqueueWorkspace({
        installationId: fx.linked.installationId,
        repoId: fx.linked.repoId,
        fullName: fx.linked.fullName,
        pr: { ...pr, baseBranch: fx.linked.defaultBranch },
      });
    }

    await drainMergeQueueWorker();

    const { data: afterEnqueue, error: listErr } = await fx.client.rpc(
      "get_repo_branch_queue_statuses",
      { p_repo_full_name: fx.linked.fullName },
    );
    expect(listErr).toBeNull();
    expect((afterEnqueue as unknown[]).length).toBe(3);

    await recordOutcome("service-qa-webhook-01-enqueued", {
      expectations: [
        "Three pull_request labeled webhooks produced three queue entries via the worker (no row seed).",
        "get_repo_branch_queue_statuses returns three branches for the signed-in user.",
      ],
      details: { entries: afterEnqueue },
    });

    await drainQueueViaCiAndMerge({
      installationId: fx.linked.installationId,
      repoId: fx.linked.repoId,
      fullName: fx.linked.fullName,
    });

    const admin = getServiceClient();
    const { data: active } = await admin
      .from("merge_queue_entries")
      .select("id, status, branch_name, merge_queues!inner(repo_id)")
      .eq("merge_queues.repo_id", fx.linked.repoId)
      .in("status", ["queued", "testing", "merging"]);
    expect(active ?? []).toHaveLength(0);

    const { data: finalRows } = await fx.client.rpc(
      "get_repo_branch_queue_statuses",
      { p_repo_full_name: fx.linked.fullName },
    );
    const statuses = ((finalRows ?? []) as { status: string }[]).map(
      (r) => r.status,
    );
    expect(statuses.every((s) => s === "merged")).toBe(true);
    expect(statuses).toHaveLength(3);

    await recordOutcome("service-qa-webhook-02-drained", {
      expectations: [
        "check_suite completed webhooks + stub GitHub merges left zero active entries.",
        "All three branches report status merged via get_repo_branch_queue_statuses.",
      ],
      details: { finalRows },
    });
  });
}, 180_000);
