/**
 * Worked example: RPCs the desktop merge-queue toggle calls
 * (useMergeQueueEnabled / useSetMergeQueueEnabled).
 *
 * Seeds a linked GitHub installation + repo, then flips enabled via the same
 * RPC names and argument shapes the app uses.
 */
import { it, expect } from "vitest";
import { getAnonClient, getServiceClient } from "../clients";
import { createTestUser, linkGithubRepo } from "../seed";
import { recordOutcome } from "../record";

it("reports merge queue off when the repo has no config row", async () => {
  const admin = getServiceClient();
  const { user, email, password } = await createTestUser(admin);
  const linked = await linkGithubRepo(admin, user.id);

  const anon = getAnonClient();
  const { error: signInError } = await anon.auth.signInWithPassword({
    email,
    password,
  });
  expect(signInError).toBeNull();

  const { data, error } = await anon.rpc("get_merge_queue_enabled", {
    p_repo_full_name: linked.fullName,
  });
  expect(error).toBeNull();
  expect(data).toBe(false);

  await recordOutcome("merge-queue-enabled-rpc-01-default-off", {
    expectations: [
      "get_merge_queue_enabled returns false for a linked repo with no config row.",
    ],
    details: { fullName: linked.fullName, enabled: data },
  });
}, 60_000);

it("enables and disables the merge queue for a linked repo", async () => {
  const admin = getServiceClient();
  const { user, email, password } = await createTestUser(admin);
  const linked = await linkGithubRepo(admin, user.id);

  const anon = getAnonClient();
  const { error: signInError } = await anon.auth.signInWithPassword({
    email,
    password,
  });
  expect(signInError).toBeNull();

  const { data: setOn, error: setOnError } = await anon.rpc(
    "set_merge_queue_enabled",
    {
      p_repo_full_name: linked.fullName,
      p_enabled: true,
    },
  );
  expect(setOnError).toBeNull();
  expect(setOn).toBe(true);

  const { data: afterOn, error: afterOnError } = await anon.rpc(
    "get_merge_queue_enabled",
    { p_repo_full_name: linked.fullName },
  );
  expect(afterOnError).toBeNull();
  expect(afterOn).toBe(true);

  const { data: setOff, error: setOffError } = await anon.rpc(
    "set_merge_queue_enabled",
    {
      p_repo_full_name: linked.fullName,
      p_enabled: false,
    },
  );
  expect(setOffError).toBeNull();
  expect(setOff).toBe(false);

  const { data: afterOff, error: afterOffError } = await anon.rpc(
    "get_merge_queue_enabled",
    { p_repo_full_name: linked.fullName },
  );
  expect(afterOffError).toBeNull();
  expect(afterOff).toBe(false);

  await recordOutcome("merge-queue-enabled-rpc-02-toggle", {
    expectations: [
      "set_merge_queue_enabled(true) makes get_merge_queue_enabled return true.",
      "set_merge_queue_enabled(false) makes get_merge_queue_enabled return false.",
    ],
    details: {
      fullName: linked.fullName,
      afterOn,
      afterOff,
    },
  });
}, 60_000);

it("rejects set_merge_queue_enabled for an unlinked repo", async () => {
  const admin = getServiceClient();
  const { email, password } = await createTestUser(admin);

  const anon = getAnonClient();
  const { error: signInError } = await anon.auth.signInWithPassword({
    email,
    password,
  });
  expect(signInError).toBeNull();

  const { data, error } = await anon.rpc("set_merge_queue_enabled", {
    p_repo_full_name: "nobody/not-installed",
    p_enabled: true,
  });
  expect(data).toBeNull();
  expect(error).toBeTruthy();
  expect(error?.message ?? "").toMatch(/not linked|GitHub App/i);

  await recordOutcome("merge-queue-enabled-rpc-03-unlinked-repo", {
    expectations: [
      "set_merge_queue_enabled errors when the repo is not linked to the caller's GitHub App install.",
    ],
    details: { message: error?.message },
  });
}, 60_000);
