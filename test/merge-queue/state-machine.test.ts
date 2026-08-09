import { describe, expect, it } from "vitest";
import {
  canTransitionEntry,
  type CheckRun,
  decideLaneFailure,
  evaluateRequiredChecks,
  evaluateSuiteConclusion,
  isCiCompletionObsolete,
  isEntryFinished,
  mergePreconditionViolation,
} from "../../supabase/functions/_shared/merge-queue/state-machine.ts";

describe("entry transitions", () => {
  it("allows the standard lifecycle", () => {
    expect(canTransitionEntry("queued", "testing")).toBe(true);
    expect(canTransitionEntry("testing", "merging")).toBe(true);
    expect(canTransitionEntry("merging", "merged")).toBe(true);
    expect(canTransitionEntry("testing", "queued")).toBe(true); // lane cancelled
    expect(canTransitionEntry("failed", "queued")).toBe(true); // re-label
  });

  it("blocks transitions out of merged", () => {
    expect(canTransitionEntry("merged", "queued")).toBe(false);
    expect(canTransitionEntry("merged", "failed")).toBe(false);
  });

  it("identifies finished entries", () => {
    expect(isEntryFinished("merged")).toBe(true);
    expect(isEntryFinished("failed")).toBe(true);
    expect(isEntryFinished("dequeued")).toBe(true);
    expect(isEntryFinished("queued")).toBe(false);
    expect(isEntryFinished("testing")).toBe(false);
  });
});

function run(
  name: string,
  status: string,
  conclusion: string | null,
): CheckRun {
  return { name, status, conclusion };
}

describe("evaluateRequiredChecks", () => {
  const required = ["build", "test"];

  it("is pending when a required check has not reported", () => {
    const checks = [run("build", "completed", "success")];
    expect(evaluateRequiredChecks(required, checks)).toBe("pending");
  });

  it("is pending while any required check is incomplete", () => {
    const checks = [
      run("build", "completed", "success"),
      run("test", "in_progress", null),
    ];
    expect(evaluateRequiredChecks(required, checks)).toBe("pending");
  });

  it("passes when every required check succeeded", () => {
    const checks = [
      run("build", "completed", "success"),
      run("test", "completed", "success"),
      run("unrelated", "completed", "failure"),
    ];
    expect(evaluateRequiredChecks(required, checks)).toBe("passed");
  });

  it("fails on failure, cancellation and timeout conclusions", () => {
    for (const conclusion of [
      "failure",
      "cancelled",
      "timed_out",
      "action_required",
      "stale",
      "startup_failure",
    ]) {
      const checks = [
        run("build", "completed", "success"),
        run("test", "completed", conclusion),
      ];
      expect(evaluateRequiredChecks(required, checks), conclusion).toBe(
        "failed",
      );
    }
  });

  it("does not treat neutral or skipped as success by default", () => {
    const checks = [
      run("build", "completed", "neutral"),
      run("test", "completed", "skipped"),
    ];
    expect(evaluateRequiredChecks(required, checks)).toBe("failed");
    expect(
      evaluateRequiredChecks(required, checks, {
        allowNeutral: true,
        allowSkipped: true,
      }),
    ).toBe("passed");
  });

  it("uses the latest occurrence of a re-run check", () => {
    const checks = [
      run("build", "completed", "failure"),
      run("build", "completed", "success"),
      run("test", "completed", "success"),
    ];
    expect(evaluateRequiredChecks(required, checks)).toBe("passed");
  });

  it("throws when called without required checks", () => {
    expect(() => evaluateRequiredChecks([], [])).toThrow();
  });
});

describe("evaluateSuiteConclusion", () => {
  it("passes only explicit success", () => {
    expect(evaluateSuiteConclusion("success")).toBe("passed");
    for (const c of ["neutral", "skipped", "failure", "timed_out"]) {
      expect(evaluateSuiteConclusion(c), c).toBe("failed");
    }
  });
});

describe("isCiCompletionObsolete", () => {
  it("is applicable while the run is active at the tested sha", () => {
    expect(isCiCompletionObsolete("running", "sha-1", "sha-1")).toBe(false);
    expect(isCiCompletionObsolete("pending", "sha-1", "sha-1")).toBe(false);
  });

  it("is obsolete for finished runs or stale shas", () => {
    expect(isCiCompletionObsolete("cancelled", "sha-1", "sha-1")).toBe(true);
    expect(isCiCompletionObsolete("passed", "sha-1", "sha-1")).toBe(true);
    expect(isCiCompletionObsolete("running", "sha-2", "sha-1")).toBe(true);
  });
});

describe("mergePreconditionViolation", () => {
  const expected = { targetBranch: "main", testedHeadSha: "sha-1" };

  it("is null when the PR still matches what was tested", () => {
    const pr = { state: "open", baseRef: "main", headSha: "sha-1" };
    expect(mergePreconditionViolation(pr, expected)).toBeNull();
  });

  it("rejects closed PRs, retargeted bases and moved heads", () => {
    expect(
      mergePreconditionViolation(
        { state: "closed", baseRef: "main", headSha: "sha-1" },
        expected,
      ),
    ).toContain("not open");
    expect(
      mergePreconditionViolation(
        { state: "open", baseRef: "develop", headSha: "sha-1" },
        expected,
      ),
    ).toContain("no longer targets");
    expect(
      mergePreconditionViolation(
        { state: "open", baseRef: "main", headSha: "sha-2" },
        expected,
      ),
    ).toContain("moved");
  });
});

describe("decideLaneFailure", () => {
  it("blames a single entry directly", () => {
    expect(decideLaneFailure(1)).toEqual({ action: "fail_entry" });
  });

  it("bisects failed batches", () => {
    expect(decideLaneFailure(2)).toEqual({ action: "bisect" });
    expect(decideLaneFailure(5)).toEqual({ action: "bisect" });
  });
});
