/**
 * HMAC-signed GitHub webhook POSTs + merge-queue-worker drain for service-qa.
 *
 * Simulates the path after a user adds workspaces to the queue (label webhook),
 * CI finishing (check_suite), and the worker merging — without a real GitHub App
 * when MERGE_QUEUE_GITHUB_STUB is set on the Edge runtime.
 */
import { createHmac, randomUUID } from "node:crypto";
import {
  getAnonKey,
  getFunctionsBaseUrl,
  getServiceClient,
  resolveLocalKeys,
} from "./clients";

/** Must match `GITHUB_WEBHOOK_SECRET` in supabase/functions/.env (written by up.sh). */
export const SERVICE_QA_WEBHOOK_SECRET =
  process.env.SERVICE_QA_WEBHOOK_SECRET ?? "service-qa-local-webhook-secret";

export type WorkspacePr = {
  number: number;
  branch: string;
  headSha: string;
  title?: string;
  author?: string;
  baseBranch?: string;
};

function signBody(body: string, secret: string): string {
  return (
    "sha256=" + createHmac("sha256", secret).update(body).digest("hex")
  );
}

export async function postGithubWebhook(
  event: string,
  payload: Record<string, unknown>,
  opts?: { secret?: string; deliveryId?: string },
): Promise<{ status: number; body: unknown }> {
  const secret = opts?.secret ?? SERVICE_QA_WEBHOOK_SECRET;
  const raw = JSON.stringify(payload);
  const res = await fetch(`${getFunctionsBaseUrl()}/github-webhook`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-GitHub-Event": event,
      "X-GitHub-Delivery": opts?.deliveryId ?? randomUUID(),
      "X-Hub-Signature-256": signBody(raw, secret),
      Authorization: `Bearer ${getAnonKey()}`,
      apikey: getAnonKey(),
    },
    body: raw,
  });
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = await res.text();
  }
  return { status: res.status, body };
}

/** Simulate Add-to-Queue → GitHub label → pull_request labeled webhook. */
export async function simulateEnqueueWorkspace(opts: {
  installationId: number;
  repoId: number;
  fullName: string;
  pr: WorkspacePr;
}): Promise<void> {
  const [owner, name] = opts.fullName.split("/");
  const base = opts.pr.baseBranch ?? "main";
  const { status, body } = await postGithubWebhook("pull_request", {
    action: "labeled",
    label: { name: "merge-queue" },
    pull_request: {
      number: opts.pr.number,
      title: opts.pr.title ?? opts.pr.branch,
      user: { login: opts.pr.author ?? "service-qa" },
      head: { sha: opts.pr.headSha, ref: opts.pr.branch },
      base: { ref: base },
      merged: false,
    },
    repository: {
      id: opts.repoId,
      name,
      full_name: opts.fullName,
      private: false,
      default_branch: base,
    },
    installation: { id: opts.installationId },
  });
  if (status !== 202 && status !== 200) {
    throw new Error(
      `simulateEnqueueWorkspace webhook failed: ${status} ${JSON.stringify(body)}`,
    );
  }
}

/** Simulate CI green on a merge-queue test branch. */
export async function simulateCiCompleted(opts: {
  installationId: number;
  repoId: number;
  fullName: string;
  testBranch: string;
  headSha: string;
  conclusion?: string;
}): Promise<void> {
  const [owner, name] = opts.fullName.split("/");
  const { status, body } = await postGithubWebhook("check_suite", {
    action: "completed",
    check_suite: {
      conclusion: opts.conclusion ?? "success",
      head_branch: opts.testBranch,
      head_sha: opts.headSha,
    },
    repository: {
      id: opts.repoId,
      name,
      full_name: opts.fullName,
      owner: { login: owner },
    },
    installation: { id: opts.installationId },
  });
  if (status !== 202 && status !== 200) {
    throw new Error(
      `simulateCiCompleted webhook failed: ${status} ${JSON.stringify(body)}`,
    );
  }
}

export type WorkerBatchResult = {
  read: number;
  succeeded: number;
  skipped: number;
  retried: number;
  dead_lettered: number;
};

/** Invoke merge-queue-worker once (service-role JWT). */
export async function invokeMergeQueueWorker(): Promise<WorkerBatchResult> {
  const serviceKey = resolveLocalKeys().serviceRoleKey;
  const res = await fetch(`${getFunctionsBaseUrl()}/merge-queue-worker`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${serviceKey}`,
      apikey: serviceKey,
    },
    body: JSON.stringify({ reason: "service-qa" }),
  });
  const body = (await res.json()) as WorkerBatchResult & { error?: string };
  if (!res.ok) {
    throw new Error(
      `merge-queue-worker failed: ${res.status} ${body.error ?? JSON.stringify(body)}`,
    );
  }
  return body;
}

/**
 * Drain the PGMQ command queue until a quiet round (read=0) or max rounds.
 * Honors worker retry backoff by sleeping when a batch only retried.
 */
export async function drainMergeQueueWorker(
  opts?: { maxRounds?: number; quietRounds?: number },
): Promise<{ rounds: number; succeeded: number }> {
  const maxRounds = opts?.maxRounds ?? 60;
  const quietNeeded = opts?.quietRounds ?? 2;
  let quiet = 0;
  let rounds = 0;
  let succeeded = 0;
  while (rounds < maxRounds) {
    const batch = await invokeMergeQueueWorker();
    rounds++;
    succeeded += batch.succeeded;
    if (batch.read === 0) {
      quiet++;
      if (quiet >= quietNeeded) break;
    } else {
      quiet = 0;
      // Retries use visibility delay; give PGMQ a beat before the next read.
      if (batch.retried > 0 && batch.succeeded === 0) {
        await new Promise((r) => setTimeout(r, 1_100));
      }
    }
  }
  return { rounds, succeeded };
}

export type ActiveCiRun = {
  id: string;
  queue_id: string;
  head_sha: string;
  test_branch: string;
  status: string;
  lane_number: number;
};

/** Running/pending CI lanes for a repo (service role). */
export async function listActiveCiRuns(repoId: number): Promise<ActiveCiRun[]> {
  const admin = getServiceClient();
  const { data: queues, error: qErr } = await admin
    .from("merge_queues")
    .select("id")
    .eq("repo_id", repoId);
  if (qErr) throw new Error(`listActiveCiRuns queues: ${qErr.message}`);
  const queueIds = (queues ?? []).map((q) => q.id as string);
  if (queueIds.length === 0) return [];

  const { data, error } = await admin
    .from("ci_runs")
    .select("id, queue_id, head_sha, test_branch, status, lane_number")
    .in("queue_id", queueIds)
    .in("status", ["pending", "running"]);
  if (error) throw new Error(`listActiveCiRuns: ${error.message}`);
  return (data ?? []) as ActiveCiRun[];
}

/**
 * For every active CI run: post check_suite success + drain worker until
 * no active (queued/testing/merging) entries remain — or maxCycles.
 */
export async function drainQueueViaCiAndMerge(opts: {
  installationId: number;
  repoId: number;
  fullName: string;
  maxCycles?: number;
}): Promise<void> {
  const maxCycles = opts.maxCycles ?? 20;
  const admin = getServiceClient();

  for (let cycle = 0; cycle < maxCycles; cycle++) {
    await drainMergeQueueWorker();

    const { data: active, error } = await admin
      .from("merge_queue_entries")
      .select("id, status, merge_queues!inner(repo_id)")
      .eq("merge_queues.repo_id", opts.repoId)
      .in("status", ["queued", "testing", "merging"]);
    if (error) throw new Error(`drainQueue status: ${error.message}`);
    if (!active || active.length === 0) return;

    const runs = await listActiveCiRuns(opts.repoId);
    if (runs.length === 0) {
      // Entries queued but no lane yet — drive the worker again.
      await drainMergeQueueWorker();
      continue;
    }

    for (const run of runs) {
      if (!run.head_sha || !run.test_branch) continue;
      await simulateCiCompleted({
        installationId: opts.installationId,
        repoId: opts.repoId,
        fullName: opts.fullName,
        testBranch: run.test_branch,
        headSha: run.head_sha,
      });
    }
    await drainMergeQueueWorker();
  }

  throw new Error(
    `drainQueueViaCiAndMerge: still had active entries after ${maxCycles} cycles`,
  );
}
