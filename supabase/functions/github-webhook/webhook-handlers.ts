import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { GitHubClient } from "./github-client.ts";
import {
  enqueueEntry,
  dequeueEntry,
  getOrCreateQueue,
  handleCICompletion,
  processQueue,
} from "./queue-processor.ts";

// ── installation / installation_repositories ─────────────────────────────────

export async function handleInstallation(
  supabase: SupabaseClient,
  // deno-lint-ignore no-explicit-any
  payload: Record<string, any>,
  event: string
): Promise<void> {
  const installation = payload.installation;
  const action = payload.action as string;

  if (event === "installation") {
    if (action === "deleted" || action === "unsuspend") {
      if (action === "deleted") {
        await supabase
          .from("github_app_installations")
          .delete()
          .eq("id", installation.id);
        return;
      }
      if (action === "unsuspend") {
        await supabase
          .from("github_app_installations")
          .update({ suspended_at: null, updated_at: new Date().toISOString() })
          .eq("id", installation.id);
        return;
      }
    }

    if (action === "suspend") {
      await supabase
        .from("github_app_installations")
        .update({
          suspended_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", installation.id);
      return;
    }

    // created / new_permissions_accepted
    await supabase.from("github_app_installations").upsert(
      {
        id: installation.id,
        account_login: installation.account.login,
        account_type: installation.account.type,
        account_avatar_url: installation.account.avatar_url ?? null,
        app_id: installation.app_id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" }
    );

    // Upsert repos included in the installation event
    const repos = payload.repositories ?? [];
    await upsertRepos(supabase, installation.id, repos);
  }

  if (event === "installation_repositories") {
    const added = payload.repositories_added ?? [];
    const removed = payload.repositories_removed ?? [];

    await upsertRepos(supabase, installation.id, added);

    for (const r of removed as { id: number }[]) {
      await supabase
        .from("github_repositories")
        .delete()
        .eq("id", r.id);
    }
  }
}

async function upsertRepos(
  supabase: SupabaseClient,
  installationId: number,
  // deno-lint-ignore no-explicit-any
  repos: any[]
): Promise<void> {
  if (repos.length === 0) return;
  await supabase.from("github_repositories").upsert(
    repos.map((r) => ({
      id: r.id,
      installation_id: installationId,
      owner: r.full_name.split("/")[0],
      name: r.name,
      full_name: r.full_name,
      private: r.private ?? false,
      default_branch: r.default_branch ?? "main",
      updated_at: new Date().toISOString(),
    })),
    { onConflict: "id" }
  );
}

// ── pull_request ──────────────────────────────────────────────────────────────

export async function handlePullRequest(
  supabase: SupabaseClient,
  // deno-lint-ignore no-explicit-any
  payload: Record<string, any>
): Promise<void> {
  const action = payload.action as string;
  const pr = payload.pull_request;
  const repoPayload = payload.repository;
  const installationId: number = payload.installation?.id;

  if (!installationId) return;

  // Resolve repo in our DB
  const { data: repoRow } = await supabase
    .from("github_repositories")
    .select("id, default_branch")
    .eq("id", repoPayload.id)
    .maybeSingle();

  if (!repoRow) return; // repo not tracked

  // Determine target branch (base ref of the PR)
  const targetBranch: string = pr.base.ref;

  // Get queue config to know the trigger label
  const { data: configRow } = await supabase
    .from("merge_queue_configs")
    .select("queue_trigger_label, enabled")
    .eq("repo_id", repoRow.id)
    .eq("target_branch", targetBranch)
    .maybeSingle();

  // Default trigger label if no config exists yet
  const triggerLabel: string = configRow?.queue_trigger_label ?? "merge-queue";
  const queueEnabled: boolean = configRow?.enabled ?? true;

  if (!queueEnabled) return;

  const labelName: string | undefined =
    action === "labeled" || action === "unlabeled"
      ? payload.label?.name
      : undefined;

  if (action === "labeled" && labelName === triggerLabel) {
    // Enqueue the PR
    const queue = await getOrCreateQueue(supabase, repoRow.id, targetBranch);
    await enqueueEntry(
      supabase,
      queue.id,
      pr.number,
      pr.head.sha,
      pr.title,
      pr.user?.login ?? null
    );
    await processQueue(supabase, queue, installationId, repoPayload.owner.login, repoPayload.name);
    return;
  }

  if (
    (action === "unlabeled" && labelName === triggerLabel) ||
    action === "closed"
  ) {
    // Dequeue the PR
    const { data: queueRow } = await supabase
      .from("merge_queues")
      .select("id, paused, bisect_mode")
      .eq("repo_id", repoRow.id)
      .eq("target_branch", targetBranch)
      .maybeSingle();

    if (!queueRow) return;

    await dequeueEntry(
      supabase,
      queueRow.id,
      pr.number,
      action === "closed"
        ? pr.merged
          ? "PR merged outside the queue"
          : "PR closed"
        : "Label removed"
    );
    return;
  }

  if (action === "synchronize") {
    // PR's HEAD changed while in the queue — update SHA and restart CI for its lane
    const { data: queueRow } = await supabase
      .from("merge_queues")
      .select("id, paused, bisect_mode")
      .eq("repo_id", repoRow.id)
      .eq("target_branch", targetBranch)
      .maybeSingle();

    if (!queueRow) return;

    const { data: entryRow } = await supabase
      .from("merge_queue_entries")
      .select("id, status")
      .eq("queue_id", queueRow.id)
      .eq("pr_number", pr.number)
      .maybeSingle();

    if (!entryRow) return;
    if (["merged", "failed", "dequeued"].includes(entryRow.status)) return;

    // Update SHA
    await supabase
      .from("merge_queue_entries")
      .update({ pr_sha: pr.head.sha, updated_at: new Date().toISOString() })
      .eq("id", entryRow.id);

    if (entryRow.status === "testing") {
      // Cancel the CI run containing this entry and restart
      const { data: ciRuns } = await supabase
        .from("ci_runs")
        .select("*")
        .eq("queue_id", queueRow.id)
        .in("status", ["pending", "running"])
        .contains("entry_ids", [entryRow.id]);

      const gh = await GitHubClient.forInstallation(
        installationId,
        repoPayload.owner.login,
        repoPayload.name
      );

      for (const run of ciRuns ?? []) {
        // cancelRunAndHigherLanes is not exported; we replicate the logic inline
        const { data: toCancel } = await supabase
          .from("ci_runs")
          .select("*")
          .eq("queue_id", queueRow.id)
          .gte("lane_number", run.lane_number)
          .in("status", ["pending", "running"]);

        for (const r of toCancel ?? []) {
          await supabase
            .from("ci_runs")
            .update({ status: "cancelled", completed_at: new Date().toISOString() })
            .eq("id", r.id);
          await supabase
            .from("merge_queue_entries")
            .update({ status: "queued", updated_at: new Date().toISOString() })
            .in("id", r.entry_ids)
            .eq("status", "testing");
          try {
            await gh.deleteBranch(r.test_branch);
          } catch {
            // ignore
          }
        }
      }

      await processQueue(
        supabase,
        queueRow,
        installationId,
        repoPayload.owner.login,
        repoPayload.name
      );
    }
  }
}

// ── check_suite ───────────────────────────────────────────────────────────────

export async function handleCheckSuite(
  supabase: SupabaseClient,
  // deno-lint-ignore no-explicit-any
  payload: Record<string, any>
): Promise<void> {
  const action = payload.action as string;
  if (action !== "completed") return;

  const suite = payload.check_suite;
  const headSha: string = suite.head_sha;
  const headBranch: string | null = suite.head_branch;
  const conclusion: string | null = suite.conclusion;
  const installationId: number = payload.installation?.id;

  if (!installationId) return;
  if (!conclusion) return; // null means still in progress

  // Only handle our test branches
  if (!headBranch?.startsWith("treq-queue/")) return;

  // Look up the CI run by head SHA
  const { data: ciRun } = await supabase
    .from("ci_runs")
    .select("*")
    .eq("head_sha", headSha)
    .eq("status", "running")
    .maybeSingle();

  if (!ciRun) return;

  const repoPayload = payload.repository;
  const owner: string = repoPayload.owner.login;
  const repo: string = repoPayload.name;

  // Map GitHub conclusions to pass/fail
  // GitHub conclusions: success | failure | neutral | cancelled | skipped | timed_out | action_required
  const normalizedConclusion =
    conclusion === "success" || conclusion === "neutral" || conclusion === "skipped"
      ? "success"
      : conclusion;

  await handleCICompletion(
    supabase,
    ciRun,
    normalizedConclusion,
    installationId,
    owner,
    repo
  );
}
