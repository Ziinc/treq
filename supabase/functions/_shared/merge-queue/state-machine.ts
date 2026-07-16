// Pure state-transition logic for the merge queue.
//
// No Supabase client, no GitHub calls, no Deno APIs — everything here is
// deterministic and unit-testable.

export type EntryStatus =
  | "queued"
  | "testing"
  | "merging"
  | "merged"
  | "failed"
  | "dequeued";

export type CiRunStatus =
  | "pending"
  | "running"
  | "passed"
  | "merged"
  | "failed"
  | "cancelled";

// ── Entry transitions ─────────────────────────────────────────────────────────

const ENTRY_TRANSITIONS: Record<EntryStatus, readonly EntryStatus[]> = {
  queued: ["testing", "dequeued", "failed", "queued"],
  testing: ["merging", "merged", "failed", "dequeued", "queued"],
  merging: ["merged", "failed", "queued"],
  merged: [],
  failed: ["queued"],
  dequeued: ["queued"],
};

export function canTransitionEntry(from: EntryStatus, to: EntryStatus): boolean {
  return ENTRY_TRANSITIONS[from]?.includes(to) ?? false;
}

// Terminal entry states: commands targeting these entries are obsolete
// (except explicit re-enqueue, which is allowed from failed/dequeued).
export function isEntryFinished(status: EntryStatus): boolean {
  return status === "merged" || status === "failed" || status === "dequeued";
}

// ── CI conclusion evaluation ──────────────────────────────────────────────────

export type CheckEvaluation = "pending" | "passed" | "failed";

export interface CheckRun {
  name: string;
  status: string; // queued | in_progress | completed
  conclusion: string | null;
}

// Evaluate the configured required checks against the check runs observed on
// the tested SHA. "neutral" and "skipped" are NOT success unless explicitly
// allowed by configuration.
export function evaluateRequiredChecks(
  requiredChecks: readonly string[],
  checkRuns: readonly CheckRun[],
  options: { allowNeutral?: boolean; allowSkipped?: boolean } = {},
): CheckEvaluation {
  if (requiredChecks.length === 0) {
    throw new Error("evaluateRequiredChecks called with no required checks");
  }

  const successConclusions = new Set(["success"]);
  if (options.allowNeutral) successConclusions.add("neutral");
  if (options.allowSkipped) successConclusions.add("skipped");

  let allPassed = true;

  for (const name of requiredChecks) {
    const runs = checkRuns.filter((r) => r.name === name);
    if (runs.length === 0) {
      // Required check has not been reported yet.
      return "pending";
    }
    // A check may run multiple times (re-runs); the latest occurrence is
    // last in GitHub's list. Any incomplete run means we must keep waiting.
    const incomplete = runs.some((r) => r.status !== "completed");
    if (incomplete) return "pending";

    const latest = runs[runs.length - 1];
    if (latest.conclusion === null) return "pending";
    if (!successConclusions.has(latest.conclusion)) {
      allPassed = false;
    }
  }

  return allPassed ? "passed" : "failed";
}

// When no required checks are configured, fall back to the check-suite
// conclusion delivered by the webhook. Only an explicit "success" passes.
export function evaluateSuiteConclusion(conclusion: string): CheckEvaluation {
  if (conclusion === "success") return "passed";
  return "failed";
}

// ── Obsolete-command detection ────────────────────────────────────────────────

// A ci.completed command is only applicable while its run is still the active
// truth. Cancelled/completed runs make the command obsolete, not an error.
export function isCiCompletionObsolete(
  runStatus: CiRunStatus,
  runHeadSha: string,
  testedSha: string,
): boolean {
  if (runStatus !== "running" && runStatus !== "pending") return true;
  if (runHeadSha !== testedSha) return true;
  return false;
}

// A merge may only proceed when the PR still looks exactly like what was
// tested. Returns null when safe, otherwise the reason to abort.
export function mergePreconditionViolation(pr: {
  state: string;
  baseRef: string;
  headSha: string;
}, expected: {
  targetBranch: string;
  testedHeadSha: string;
}): string | null {
  if (pr.state !== "open") return `PR is ${pr.state}, not open`;
  if (pr.baseRef !== expected.targetBranch) {
    return `PR base ${pr.baseRef} no longer targets ${expected.targetBranch}`;
  }
  if (pr.headSha !== expected.testedHeadSha) {
    return `PR head ${pr.headSha} moved since tested SHA ${expected.testedHeadSha}`;
  }
  return null;
}

// ── Lane failure policy ───────────────────────────────────────────────────────

export type LaneFailureDecision =
  | { action: "fail_entry" }
  | { action: "bisect" };

// A failed single-entry lane definitively blames that entry; a failed batch
// switches the queue to bisect mode to isolate the culprit.
export function decideLaneFailure(entryCount: number): LaneFailureDecision {
  return entryCount <= 1 ? { action: "fail_entry" } : { action: "bisect" };
}
