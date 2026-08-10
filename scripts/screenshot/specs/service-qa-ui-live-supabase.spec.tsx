/**
 * UI proof that Settings › Integrations talks to the live local Supabase CLI
 * (email/password session + real get/set_merge_queue_enabled RPCs).
 *
 * Unlike merge-queue-setting.spec.tsx, this does NOT mock src/lib/supabase.
 * useAuth is only stubbed for the Pro subscription gate (Stripe FDW is empty
 * locally); the singleton supabase client holds a real session.
 */
import * as React from "react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { SettingsPage } from "../../../src/components/SettingsPage";
import { GitHubPanel } from "../../../src/components/GitHubPanel";
import { supabase } from "../../../src/lib/supabase";
import { render, screen, waitFor, within } from "../../../test/test-utils";
import { createTestRepo, openRepo } from "../../../test/utils";
import { captureDocument } from "../capture";
import {
  createTestUser,
  deleteTestUser,
  linkGithubRepo,
  signInWithEmailPassword,
  enqueueBranch,
} from "../../service-qa/seed";
import { getServiceClient } from "../../service-qa/clients";
import { FEATURES as SERVICE_QA_FEATURES } from "../../service-qa/features";

const { mockGetGitRemoteUrl, auth } = vi.hoisted(() => ({
  mockGetGitRemoteUrl: vi.fn(),
  auth: {
    user: null as { id: string; email?: string } | null,
    session: null as { access_token: string; refresh_token: string } | null,
    loading: false,
    subscription: {
      plan: "pro" as const,
      status: "active" as const,
      current_period_end: null as string | null,
    },
    signIn: vi.fn(),
    signOut: vi.fn(),
    refreshSubscription: vi.fn(),
    exchangeToken: vi.fn(),
  },
}));

vi.mock("../../../src/lib/features", () => ({
  FEATURES: {
    pro: true,
    stripePayments: false,
    emailSignup: true,
    mergeQueue: true,
  },
}));

vi.mock("../../../src/hooks/useAuth", () => ({
  useAuth: () => auth,
}));

vi.mock("../../../src/lib/api", async () => {
  const actual = await vi.importActual<typeof import("../../../src/lib/api")>(
    "../../../src/lib/api",
  );
  return {
    ...actual,
    getGitRemoteUrl: mockGetGitRemoteUrl,
    // Keep GitHub CLI out of scope — this spec proves Supabase I/O only.
    ghListIssues: vi.fn().mockResolvedValue({ items: [], hasMore: false }),
    ghListPrs: vi.fn().mockResolvedValue({ items: [], hasMore: false }),
  };
});

expect(SERVICE_QA_FEATURES.emailSignup).toBe(true);

async function seedLiveSupabaseUser(fullName: string) {
  const admin = getServiceClient();
  const testUser = await createTestUser();
  const linked = await linkGithubRepo(admin, testUser.user.id, { fullName });
  const { client, user } = await signInWithEmailPassword(
    testUser.email,
    testUser.password,
  );
  const {
    data: { session },
    error,
  } = await client.auth.getSession();
  if (error || !session) {
    throw new Error(`getSession failed: ${error?.message ?? "no session"}`);
  }

  // Drive the app singleton — hooks/RPCs use this client, not the seed client.
  const { error: setErr } = await supabase.auth.setSession({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  });
  if (setErr) throw setErr;

  auth.user = { id: user.id, email: testUser.email };
  auth.session = {
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  };
  auth.subscription = {
    plan: "pro",
    status: "active",
    current_period_end: null,
  };

  return { admin, testUser, linked, session };
}

it("captures Enable merge queue against live local Supabase RPCs", async () => {
  const fullName = `service-qa/ui-${Date.now()}`;
  const { admin, testUser, linked } = await seedLiveSupabaseUser(fullName);
  const { repoPath } = createTestRepo(false);
  openRepo(repoPath);

  const [owner, repo] = fullName.split("/");
  mockGetGitRemoteUrl.mockResolvedValue({ owner, repo, full_name: fullName });

  try {
    // Prove the queue is off via the same RPC the UI will call.
    const { data: before, error: beforeErr } = await supabase.rpc(
      "get_merge_queue_enabled",
      { p_repo_full_name: fullName },
    );
    expect(beforeErr).toBeNull();
    expect(before).toBe(false);

    const user = userEvent.setup();
    render(<SettingsPage repoPath={repoPath} onClose={vi.fn()} />);
    await user.click(await screen.findByRole("tab", { name: /integrations/i }));

    const section = await screen.findByTestId("merge-queue-setting");
    const cta = await within(section).findByRole("button", {
      name: /enable merge queue/i,
    });
    await captureDocument(document, {
      name: "service-qa-ui-01-merge-queue-off",
      expectations: [
        'Settings › Integrations shows an "Enable merge queue" CTA for the linked repo.',
        "The merge queue row describes automatic merges once CI passes.",
        "No ON toggle is shown yet — the queue is still off.",
      ],
    });

    await user.click(cta);

    const toggle = await within(section).findByRole("switch", {
      name: /enable merge queue/i,
    });
    await waitFor(() => {
      expect(toggle).toHaveAttribute("aria-checked", "true");
    });

    // Prove the UI mutation landed in Postgres (not a mock).
    const { data: after, error: afterErr } = await supabase.rpc(
      "get_merge_queue_enabled",
      { p_repo_full_name: fullName },
    );
    expect(afterErr).toBeNull();
    expect(after).toBe(true);
    expect(linked.fullName).toBe(fullName);

    await captureDocument(document, {
      name: "service-qa-ui-02-merge-queue-on",
      expectations: [
        "After clicking Enable, the control is an ON toggle (aria-checked true).",
        'Copy updates to "Queued branches merge automatically once CI passes."',
        "No error text is visible — the live set_merge_queue_enabled RPC succeeded.",
      ],
    });
  } finally {
    await supabase.auth.signOut();
    await admin
      .from("github_app_installations")
      .delete()
      .eq("id", linked.installationId);
    await deleteTestUser(admin, testUser.user.id);
  }
}, 120_000);

it("captures the GitHub Merge Queue tab listing a live seeded entry", async () => {
  const fullName = `service-qa/ui-tab-${Date.now()}`;
  const { admin, testUser, linked } = await seedLiveSupabaseUser(fullName);
  const { repoPath } = createTestRepo(false);
  openRepo(repoPath);

  const [owner, repo] = fullName.split("/");
  mockGetGitRemoteUrl.mockResolvedValue({ owner, repo, full_name: fullName });

  try {
    // Enable + seed a queued PR the way the backend would after enqueue.
    const { error: enableErr } = await supabase.rpc("set_merge_queue_enabled", {
      p_repo_full_name: fullName,
      p_enabled: true,
    });
    expect(enableErr).toBeNull();

    await enqueueBranch(admin, {
      repoId: linked.repoId,
      branchName: "feat/live-ui-queue",
      prNumber: 101,
      prSha: "deadbeef",
      position: 1,
      targetBranch: linked.defaultBranch,
    });

    const user = userEvent.setup();
    render(
      <div className="h-[800px] w-[420px] border border-border bg-background">
        <GitHubPanel repoPath={repoPath} onOpenSettings={vi.fn()} />
      </div>,
    );

    await user.click(await screen.findByRole("tab", { name: /merge queue/i }));

    // Branch + target share one <p> ("feat/live-ui-queue → main"), so match
    // with a regex rather than an exact full-string getByText.
    await screen.findByText(/feat\/live-ui-queue/);
    await screen.findByText("PR #101");
    expect(
      screen.getByTestId("merge-queue-single-feat/live-ui-queue"),
    ).toBeInTheDocument();

    await captureDocument(document, {
      name: "service-qa-ui-03-merge-queue-tab",
      viewport: { width: 480, height: 820 },
      expectations: [
        "The GitHub panel Merge Queue tab is selected.",
        "A queued branch feat/live-ui-queue from the live Supabase seed is listed.",
        "PR #101 is visible for that queue entry.",
      ],
    });
  } finally {
    await supabase.auth.signOut();
    await admin
      .from("github_app_installations")
      .delete()
      .eq("id", linked.installationId);
    await deleteTestUser(admin, testUser.user.id);
  }
}, 120_000);
