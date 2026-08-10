/**
 * Merge-queue RPC integration against the local Supabase CLI.
 *
 * Real Auth email/password (feature flag overridden on) + real PostgREST RPCs.
 * No vi.mock of supabase-js. Each case uses withMergeQueueFixture for
 * setup/teardown so users, installs, and queue rows do not leak.
 */
import { describe, it, expect } from "vitest";
import { withMergeQueueFixture } from "../fixture";
import {
  createTestUser,
  deleteTestUser,
  signInWithEmailPassword,
} from "../seed";
import { getServiceClient } from "../clients";
import { FEATURES } from "../features";
import { recordOutcome } from "../record";

describe("merge queue RPCs (email/password + real API)", () => {
  it("forces emailSignup on for service-qa", () => {
    expect(FEATURES.emailSignup).toBe(true);
  });

  it("reports merge queue off when the repo has no config row", async () => {
    await withMergeQueueFixture(async ({ client, linked }) => {
      const { data, error } = await client.rpc("get_merge_queue_enabled", {
        p_repo_full_name: linked.fullName,
      });
      expect(error).toBeNull();
      expect(data).toBe(false);

      await recordOutcome("merge-queue-01-default-off", {
        expectations: [
          "get_merge_queue_enabled returns false for a linked repo with no config row.",
        ],
        details: { fullName: linked.fullName, enabled: data },
      });
    });
  }, 60_000);

  it("enables and disables the merge queue via set/get RPCs", async () => {
    await withMergeQueueFixture(async ({ client, linked }) => {
      const { data: setOn, error: setOnError } = await client.rpc(
        "set_merge_queue_enabled",
        {
          p_repo_full_name: linked.fullName,
          p_enabled: true,
        },
      );
      expect(setOnError).toBeNull();
      expect(setOn).toBe(true);

      const { data: afterOn, error: afterOnError } = await client.rpc(
        "get_merge_queue_enabled",
        { p_repo_full_name: linked.fullName },
      );
      expect(afterOnError).toBeNull();
      expect(afterOn).toBe(true);

      const { data: setOff, error: setOffError } = await client.rpc(
        "set_merge_queue_enabled",
        {
          p_repo_full_name: linked.fullName,
          p_enabled: false,
        },
      );
      expect(setOffError).toBeNull();
      expect(setOff).toBe(false);

      const { data: afterOff, error: afterOffError } = await client.rpc(
        "get_merge_queue_enabled",
        { p_repo_full_name: linked.fullName },
      );
      expect(afterOffError).toBeNull();
      expect(afterOff).toBe(false);

      await recordOutcome("merge-queue-02-toggle", {
        expectations: [
          "set_merge_queue_enabled(true) makes get_merge_queue_enabled return true.",
          "set_merge_queue_enabled(false) makes get_merge_queue_enabled return false.",
        ],
        details: { fullName: linked.fullName, afterOn, afterOff },
      });
    });
  }, 60_000);

  it("rejects set_merge_queue_enabled for an unlinked repo", async () => {
    const testUser = await createTestUser();
    const admin = getServiceClient();
    try {
      const { client } = await signInWithEmailPassword(
        testUser.email,
        testUser.password,
      );

      const { data, error } = await client.rpc("set_merge_queue_enabled", {
        p_repo_full_name: "nobody/not-installed",
        p_enabled: true,
      });
      expect(data).toBeNull();
      expect(error).toBeTruthy();
      expect(error?.message ?? "").toMatch(/not linked|GitHub App/i);

      await recordOutcome("merge-queue-03-unlinked-repo", {
        expectations: [
          "set_merge_queue_enabled errors when the repo is not linked to the caller's install.",
        ],
        details: { message: error?.message },
      });

      await client.auth.signOut();
    } finally {
      await deleteTestUser(admin, testUser.user.id);
    }
  }, 60_000);

  it("returns workspace and repo branch queue statuses for a seeded entry", async () => {
    await withMergeQueueFixture(async (fixture) => {
      const { client, linked, enableQueue, seedQueuedEntry } = fixture;
      await enableQueue();

      const branchName = "feat/service-qa-queue";
      const prNumber = 42;
      const { entryId } = await seedQueuedEntry({
        branchName,
        prNumber,
        position: 1,
      });

      const { data: workspaceStatus, error: workspaceError } = await client.rpc(
        "get_workspace_queue_status",
        {
          p_repo_full_name: linked.fullName,
          p_branch_name: branchName,
        },
      );
      expect(workspaceError).toBeNull();
      const workspaceRow = Array.isArray(workspaceStatus)
        ? workspaceStatus[0]
        : workspaceStatus;
      expect(workspaceRow).toMatchObject({
        pr_number: prNumber,
        status: "queued",
        position: 1,
        target_branch: linked.defaultBranch,
      });
      expect(workspaceRow.entry_id).toBe(entryId);

      const { data: branchStatuses, error: branchError } = await client.rpc(
        "get_repo_branch_queue_statuses",
        { p_repo_full_name: linked.fullName },
      );
      expect(branchError).toBeNull();
      expect(branchStatuses).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            branch_name: branchName,
            pr_number: prNumber,
            status: "queued",
            position: 1,
            target_branch: linked.defaultBranch,
          }),
        ]),
      );

      await recordOutcome("merge-queue-04-status-rpcs", {
        expectations: [
          "get_workspace_queue_status returns the seeded queued entry for the branch.",
          "get_repo_branch_queue_statuses lists that branch with pr_number and status.",
        ],
        details: {
          fullName: linked.fullName,
          branchName,
          workspaceRow,
          branchStatuses,
        },
      });
    });
  }, 60_000);

  it("hides queue status from a different email/password user (RLS)", async () => {
    await withMergeQueueFixture(async (owner) => {
      await owner.enableQueue();
      const branchName = "feat/private-queue";
      await owner.seedQueuedEntry({
        branchName,
        prNumber: 7,
        position: 1,
      });

      const other = await createTestUser();
      const admin = getServiceClient();
      try {
        const { client: otherClient } = await signInWithEmailPassword(
          other.email,
          other.password,
        );

        const { data: enabled } = await otherClient.rpc(
          "get_merge_queue_enabled",
          { p_repo_full_name: owner.linked.fullName },
        );
        expect(enabled).toBe(false);

        const { data: status } = await otherClient.rpc(
          "get_workspace_queue_status",
          {
            p_repo_full_name: owner.linked.fullName,
            p_branch_name: branchName,
          },
        );
        const rows = Array.isArray(status) ? status : status ? [status] : [];
        expect(rows.length).toBe(0);

        await otherClient.auth.signOut();

        await recordOutcome("merge-queue-05-rls-isolation", {
          expectations: [
            "A different signed-in user does not see another account's merge queue enabled state.",
            "get_workspace_queue_status returns no rows for a repo the caller does not own.",
          ],
          details: { ownerEmail: owner.email, otherEmail: other.email },
        });
      } finally {
        await deleteTestUser(admin, other.user.id);
      }
    });
  }, 60_000);
});
