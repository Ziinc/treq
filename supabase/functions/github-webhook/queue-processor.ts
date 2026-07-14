import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { GitHubClient } from "./github-client.ts";

interface QueueConfig {
  required_checks: string[];
  max_parallel_queues: number;
  batch_size: number;
  merge_method: string;
  queue_trigger_label: string;
  delete_branch_on_merge: boolean;
}

interface Queue {
  id: string;
  repo_id: number;
  target_branch: string;
  paused: boolean;
  bisect_mode: boolean;
}

interface QueueEntry {
  id: string;
  queue_id: string;
  pr_number: number;
  pr_sha: string;
  pr_title: string | null;
  pr_author: string | null;
  position: number;
  status: string;
}

interface CIRun {
  id: string;
  queue_id: string;
  entry_ids: string[];
  head_sha: string;
  test_branch: string;
  lane_number: number;
  status: string;
}

function testBranchName(targetBranch: string, lane: number): string {
  // e.g. main → treq-queue/main/lane-1
  //      releases/v2 → treq-queue/releases-v2/lane-2
  const safe = targetBranch.replace(/\//g, "-");
  return `treq-queue/${safe}/lane-${lane}`;
}

const DEFAULT_CONFIG: QueueConfig = {
  required_checks: [],
  max_parallel_queues: 1,
  batch_size: 5,
  merge_method: "squash",
  queue_trigger_label: "merge-queue",
  delete_branch_on_merge: true,
};

async function getQueueConfig(
  supabase: SupabaseClient,
  repoId: number,
  targetBranch: string
): Promise<QueueConfig> {
  const { data } = await supabase
    .from("merge_queue_configs")
    .select("*")
    .eq("repo_id", repoId)
    .eq("target_branch", targetBranch)
    .single();
  return data ?? DEFAULT_CONFIG;
}

// Fetch installation_id + owner + name for a repo from the DB.
async function getRepoMeta(
  supabase: SupabaseClient,
  repoId: number
): Promise<{ installationId: number; owner: string; name: string } | null> {
  const { data } = await supabase
    .from("github_repositories")
    .select("installation_id, owner, name")
    .eq("id", repoId)
    .single();
  if (!data) return null;
  return {
    installationId: data.installation_id,
    owner: data.owner,
    name: data.name,
  };
}

// Ensure a queue row exists for this repo+branch, creating it if missing.
export async function getOrCreateQueue(
  supabase: SupabaseClient,
  repoId: number,
  targetBranch: string
): Promise<Queue> {
  const { data: existing } = await supabase
    .from("merge_queues")
    .select("*")
    .eq("repo_id", repoId)
    .eq("target_branch", targetBranch)
    .single();

  if (existing) return existing as Queue;

  const { data: created, error } = await supabase
    .from("merge_queues")
    .insert({ repo_id: repoId, target_branch: targetBranch })
    .select()
    .single();

  if (error || !created) {
    // Race — another worker inserted it first; fetch it.
    const { data: retry } = await supabase
      .from("merge_queues")
      .select("*")
      .eq("repo_id", repoId)
      .eq("target_branch", targetBranch)
      .single();
    return retry as Queue;
  }
  return created as Queue;
}

export async function enqueueEntry(
  supabase: SupabaseClient,
  queueId: string,
  prNumber: number,
  prSha: string,
  prTitle: string | null,
  prAuthor: string | null
): Promise<void> {
  const { data: last } = await supabase
    .from("merge_queue_entries")
    .select("position")
    .eq("queue_id", queueId)
    .in("status", ["queued", "testing"])
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  const position = (last?.position ?? 0) + 1;

  await supabase.from("merge_queue_entries").upsert(
    {
      queue_id: queueId,
      pr_number: prNumber,
      pr_sha: prSha,
      pr_title: prTitle,
      pr_author: prAuthor,
      position,
      status: "queued",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "queue_id,pr_number" }
  );
}

export async function dequeueEntry(
  supabase: SupabaseClient,
  queueId: string,
  prNumber: number,
  reason: string
): Promise<void> {
  const { data: entry } = await supabase
    .from("merge_queue_entries")
    .select("*")
    .eq("queue_id", queueId)
    .eq("pr_number", prNumber)
    .maybeSingle();

  if (!entry) return;
  if (["merged", "failed", "dequeued"].includes(entry.status)) return;

  await supabase
    .from("merge_queue_entries")
    .update({
      status: "dequeued",
      failure_reason: reason,
      updated_at: new Date().toISOString(),
    })
    .eq("id", entry.id);

  // If the entry was in a CI run, cancel that run and all higher lanes.
  if (entry.status === "testing") {
    const { data: ciRuns } = await supabase
      .from("ci_runs")
      .select("*")
      .eq("queue_id", queueId)
      .in("status", ["pending", "running"])
      .contains("entry_ids", [entry.id]);

    for (const ciRun of ciRuns ?? []) {
      const meta = await getRepoMeta(supabase, 0); // dummy; we'll handle below
      await cancelRunAndHigherLanes(supabase, null, ciRun as CIRun, queueId);
    }
  }
}

async function cancelRunAndHigherLanes(
  supabase: SupabaseClient,
  gh: GitHubClient | null,
  fromRun: CIRun,
  queueId: string
): Promise<void> {
  const { data: toCancel } = await supabase
    .from("ci_runs")
    .select("*")
    .eq("queue_id", queueId)
    .gte("lane_number", fromRun.lane_number)
    .in("status", ["pending", "running"]);

  for (const run of (toCancel ?? []) as CIRun[]) {
    await supabase
      .from("ci_runs")
      .update({ status: "cancelled", completed_at: new Date().toISOString() })
      .eq("id", run.id);

    // Reset any entries that were in testing state for this run back to queued
    if (run.entry_ids.length > 0) {
      await supabase
        .from("merge_queue_entries")
        .update({ status: "queued", updated_at: new Date().toISOString() })
        .in("id", run.entry_ids)
        .eq("status", "testing");
    }

    if (gh) {
      try {
        await gh.deleteBranch(run.test_branch);
      } catch {
        // Branch may not exist
      }
    }
  }
}

// Core queue driver — picks queued entries and starts parallel CI lanes.
export async function processQueue(
  supabase: SupabaseClient,
  queue: Queue,
  installationId: number,
  owner: string,
  repo: string,
  batchSizeOverride?: number
): Promise<void> {
  if (queue.paused) return;

  const config = await getQueueConfig(supabase, queue.repo_id, queue.target_branch);
  const effectiveBatchSize =
    batchSizeOverride ?? (queue.bisect_mode ? 1 : config.batch_size);

  // Active parallel lanes
  const { data: activeLanes } = await supabase
    .from("ci_runs")
    .select("*")
    .eq("queue_id", queue.id)
    .in("status", ["pending", "running"])
    .order("lane_number", { ascending: true });

  const lanes = (activeLanes ?? []) as CIRun[];
  if (lanes.length >= config.max_parallel_queues) return;

  // Entries currently sitting in an active lane (exclude from new batches)
  const occupiedEntryIds = new Set(lanes.flatMap((l) => l.entry_ids));

  const { data: queuedRows } = await supabase
    .from("merge_queue_entries")
    .select("*")
    .eq("queue_id", queue.id)
    .eq("status", "queued")
    .order("position", { ascending: true })
    .limit(effectiveBatchSize * (config.max_parallel_queues - lanes.length));

  const available = ((queuedRows ?? []) as QueueEntry[]).filter(
    (e) => !occupiedEntryIds.has(e.id)
  );

  if (available.length === 0) {
    // Nothing left; clear bisect mode if it was on
    if (queue.bisect_mode) {
      await supabase
        .from("merge_queues")
        .update({ bisect_mode: false, updated_at: new Date().toISOString() })
        .eq("id", queue.id);
    }
    return;
  }

  const gh = await GitHubClient.forInstallation(installationId, owner, repo);

  // Start as many new lanes as we're allowed
  let laneIdx = 0;
  while (
    lanes.length + laneIdx < config.max_parallel_queues &&
    laneIdx * effectiveBatchSize < available.length
  ) {
    const nextLaneNumber =
      lanes.length > 0 ? Math.max(...lanes.map((l) => l.lane_number)) + 1 + laneIdx : 1 + laneIdx;

    const batch = available.slice(
      laneIdx * effectiveBatchSize,
      (laneIdx + 1) * effectiveBatchSize
    );

    if (batch.length === 0) break;

    // Optimistic base: build on top of the highest active lane, or real branch tip
    let baseSha: string;
    if (lanes.length + laneIdx === 0) {
      baseSha = await gh.getBranchSha(queue.target_branch);
    } else {
      const topLane = lanes[lanes.length - 1 + laneIdx] ?? lanes[lanes.length - 1];
      baseSha = topLane.head_sha;
    }

    await startLane(supabase, gh, queue, config, nextLaneNumber, baseSha, batch);
    laneIdx++;
  }
}

async function startLane(
  supabase: SupabaseClient,
  gh: GitHubClient,
  queue: Queue,
  config: QueueConfig,
  laneNumber: number,
  baseSha: string,
  entries: QueueEntry[]
): Promise<void> {
  const testBranch = testBranchName(queue.target_branch, laneNumber);

  // Create (or reset) the test branch at the base commit
  try {
    await gh.createBranch(testBranch, baseSha);
  } catch {
    await gh.updateBranch(testBranch, baseSha);
  }

  // Merge each PR's HEAD into the test branch in queue order
  let headSha = baseSha;
  const merged: QueueEntry[] = [];
  const failed: QueueEntry[] = [];

  for (const entry of entries) {
    try {
      const sha = await gh.mergeInto(
        testBranch,
        entry.pr_sha,
        `[treq] Merge PR #${entry.pr_number} into test branch`
      );
      headSha = sha ?? headSha;
      merged.push(entry);
    } catch (err) {
      console.error(`Merge conflict for PR #${entry.pr_number}:`, err);
      failed.push(entry);
      // Mark conflicting PR as failed immediately — no need for CI
      await supabase
        .from("merge_queue_entries")
        .update({
          status: "failed",
          failure_reason: "Merge conflict when building test batch",
          updated_at: new Date().toISOString(),
        })
        .eq("id", entry.id);
      await gh.createComment(
        entry.pr_number,
        `❌ **Treq Merge Queue**: This PR has a merge conflict with another PR in the queue and has been removed. Please rebase and re-add the \`${config.queue_trigger_label}\` label.`
      );
    }
  }

  if (merged.length === 0) {
    // All entries conflicted; nothing to test
    await gh.deleteBranch(testBranch);
    return;
  }

  // Record the CI run
  await supabase.from("ci_runs").insert({
    queue_id: queue.id,
    entry_ids: merged.map((e) => e.id),
    head_sha: headSha,
    test_branch: testBranch,
    lane_number: laneNumber,
    status: "running",
  });

  // Mark entries as testing
  await supabase
    .from("merge_queue_entries")
    .update({ status: "testing", updated_at: new Date().toISOString() })
    .in(
      "id",
      merged.map((e) => e.id)
    );

  // Notify PRs
  const prList = merged.map((e) => `#${e.pr_number}`).join(", ");
  for (const entry of merged) {
    await gh.createComment(
      entry.pr_number,
      `🚦 **Treq Merge Queue**: Added to the queue (lane ${laneNumber}, batch with ${prList}). CI is running on \`${testBranch}\` @ \`${headSha.slice(0, 7)}\`.`
    );
  }
}

// Called when a check_suite completes on a treq-queue branch.
export async function handleCICompletion(
  supabase: SupabaseClient,
  ciRun: CIRun,
  conclusion: string,
  installationId: number,
  owner: string,
  repo: string
): Promise<void> {
  const { data: queueRow } = await supabase
    .from("merge_queues")
    .select("*")
    .eq("id", ciRun.queue_id)
    .single();

  if (!queueRow) return;

  const queue = queueRow as Queue;
  const config = await getQueueConfig(supabase, queue.repo_id, queue.target_branch);
  const gh = await GitHubClient.forInstallation(installationId, owner, repo);
  const passed = conclusion === "success";

  await supabase
    .from("ci_runs")
    .update({
      status: passed ? "passed" : "failed",
      conclusion,
      completed_at: new Date().toISOString(),
    })
    .eq("id", ciRun.id);

  if (passed) {
    await onCIPassed(supabase, gh, ciRun, queue, config, installationId, owner, repo);
  } else {
    await onCIFailed(supabase, gh, ciRun, queue, config, installationId, owner, repo);
  }
}

async function onCIPassed(
  supabase: SupabaseClient,
  gh: GitHubClient,
  ciRun: CIRun,
  queue: Queue,
  config: QueueConfig,
  installationId: number,
  owner: string,
  repo: string
): Promise<void> {
  // Wait for any lower lanes to merge first
  const { data: lowerActive } = await supabase
    .from("ci_runs")
    .select("id")
    .eq("queue_id", queue.id)
    .lt("lane_number", ciRun.lane_number)
    .in("status", ["pending", "running", "passed"]);

  if ((lowerActive ?? []).length > 0) {
    // Lower lane hasn't merged yet; this run is already updated to "passed" in DB.
    // It will be picked up by onCIPassed when the lower lane finishes.
    return;
  }

  // Fetch the entries for this run in queue order
  const { data: entryRows } = await supabase
    .from("merge_queue_entries")
    .select("*")
    .in("id", ciRun.entry_ids)
    .order("position", { ascending: true });

  const entries = (entryRows ?? []) as QueueEntry[];

  // Merge each PR into the target branch in order
  for (const entry of entries) {
    try {
      await gh.mergePR(
        entry.pr_number,
        config.merge_method,
        `${entry.pr_title ?? `PR #${entry.pr_number}`} (#${entry.pr_number})`
      );
      await supabase
        .from("merge_queue_entries")
        .update({
          status: "merged",
          merged_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", entry.id);
    } catch (err) {
      console.error(`Failed to merge PR #${entry.pr_number}:`, err);
      await supabase
        .from("merge_queue_entries")
        .update({
          status: "failed",
          failure_reason: `Merge failed: ${(err as Error).message}`,
          updated_at: new Date().toISOString(),
        })
        .eq("id", entry.id);
      await gh.createComment(
        entry.pr_number,
        `❌ **Treq Merge Queue**: CI passed but merge failed — ${(err as Error).message}. Please check the PR and re-queue.`
      );
    }
  }

  // Clean up test branch
  try {
    await gh.deleteBranch(ciRun.test_branch);
  } catch {
    // ignore
  }

  // If the next lane already passed CI, merge it now too (chain reaction)
  const { data: nextPassed } = await supabase
    .from("ci_runs")
    .select("*")
    .eq("queue_id", queue.id)
    .eq("lane_number", ciRun.lane_number + 1)
    .eq("status", "passed")
    .maybeSingle();

  if (nextPassed) {
    await onCIPassed(
      supabase,
      gh,
      nextPassed as CIRun,
      queue,
      config,
      installationId,
      owner,
      repo
    );
  } else {
    // No more ready lanes — process the rest of the queue
    const updatedQueue = { ...queue, bisect_mode: false };
    await processQueue(supabase, updatedQueue, installationId, owner, repo);
  }
}

async function onCIFailed(
  supabase: SupabaseClient,
  gh: GitHubClient,
  ciRun: CIRun,
  queue: Queue,
  config: QueueConfig,
  installationId: number,
  owner: string,
  repo: string
): Promise<void> {
  // Cancel this lane and all higher lanes (they were built optimistically on top of this one)
  await cancelRunAndHigherLanes(supabase, gh, ciRun, queue.id);

  const { data: entryRows } = await supabase
    .from("merge_queue_entries")
    .select("*")
    .in("id", ciRun.entry_ids)
    .order("position", { ascending: true });

  const entries = (entryRows ?? []) as QueueEntry[];

  if (entries.length === 1) {
    // Single PR definitively failed
    const entry = entries[0];
    await supabase
      .from("merge_queue_entries")
      .update({
        status: "failed",
        failure_reason: "CI failed",
        updated_at: new Date().toISOString(),
      })
      .eq("id", entry.id);

    await gh.createComment(
      entry.pr_number,
      `❌ **Treq Merge Queue**: CI failed for this PR. It has been removed from the queue. Fix the issue and re-add the \`${config.queue_trigger_label}\` label to re-queue.`
    );
    await gh.removeLabel(entry.pr_number, config.queue_trigger_label);

    // Continue processing without the failed PR
    await processQueue(supabase, queue, installationId, owner, repo);
  } else {
    // Multiple PRs failed together — switch to bisect mode (batch_size=1)
    await supabase
      .from("merge_queues")
      .update({ bisect_mode: true, updated_at: new Date().toISOString() })
      .eq("id", queue.id);

    // All entries were reset to "queued" by cancelRunAndHigherLanes
    for (const entry of entries) {
      await gh.createComment(
        entry.pr_number,
        `⚠️ **Treq Merge Queue**: CI failed for the batch. Re-queuing this PR individually to find the culprit.`
      );
    }

    // Start individual tests for each entry (up to max_parallel_queues at once)
    const bisectQueue = { ...queue, bisect_mode: true };
    for (let i = 0; i < config.max_parallel_queues; i++) {
      await processQueue(supabase, bisectQueue, installationId, owner, repo, 1);
    }
  }
}
