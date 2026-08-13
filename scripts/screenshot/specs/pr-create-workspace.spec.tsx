/**
 * Verifies the GitHub PR detail page exposes Create Workspace / Open Workspace
 * for the PR head, and that creating lands a real workspace from the remote tip.
 */

import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { GitHubPanel } from "../../../src/components/GitHubPanel";
import type { GhPullRequest } from "../../../src/lib/api-types";
import { getWorkspaces } from "../../../src/lib/api";
import { render, screen, waitFor } from "../../../test/test-utils";
import { createTestRepo } from "../../../test/utils";
import { captureDocument } from "../capture";

const {
  mockGetGitRemoteUrl,
  mockGhListPrs,
  mockGhViewPr,
  mockGetPrChecksForPr,
} = vi.hoisted(() => ({
  mockGetGitRemoteUrl: vi.fn(),
  mockGhListPrs: vi.fn(),
  mockGhViewPr: vi.fn(),
  mockGetPrChecksForPr: vi.fn(),
}));

vi.mock("../../../src/lib/api", async () => {
  const actual = await vi.importActual<typeof import("../../../src/lib/api")>(
    "../../../src/lib/api",
  );
  return {
    ...actual,
    getGitRemoteUrl: mockGetGitRemoteUrl,
    ghListIssues: vi.fn().mockResolvedValue({ items: [], hasMore: false }),
    ghListPrs: mockGhListPrs,
    ghViewPr: mockGhViewPr,
    getPrChecksForPr: mockGetPrChecksForPr,
  };
});

const REMOTE_INFO = {
  owner: "treq-dev",
  repo: "treq",
  full_name: "treq-dev/treq",
};

it("creates a workspace from the GitHub PR detail page", async () => {
  const { repoPath, defaultBranch } = createTestRepo(true);

  const pr: GhPullRequest = {
    number: 42,
    title: "Ship remote feature",
    state: "OPEN",
    url: "https://github.com/treq-dev/treq/pull/42",
    body: "PR body for the remote feature branch.",
    author: { login: "octocat", avatar_url: null },
    labels: [],
    head_ref_name: "feature-remote",
    base_ref_name: defaultBranch,
    merge_state_status: "CLEAN",
    created_at: "2026-07-20T10:00:00Z",
    updated_at: "2026-07-20T10:00:00Z",
    comments: [],
    is_draft: false,
  };

  mockGetGitRemoteUrl.mockResolvedValue(REMOTE_INFO);
  mockGhListPrs.mockResolvedValue({ items: [pr], hasMore: false });
  mockGhViewPr.mockResolvedValue(pr);
  mockGetPrChecksForPr.mockResolvedValue(null);

  const user = userEvent.setup();
  render(<GitHubPanel repoPath={repoPath} onOpenSettings={vi.fn()} />);

  await user.click(await screen.findByRole("tab", { name: /pull requests/i }));
  await user.click(await screen.findByText("Ship remote feature"));
  await screen.findByText("Pull Request #42");

  const createButton = await screen.findByRole("button", {
    name: /create workspace/i,
  });

  await captureDocument(document, {
    name: "pr-create-workspace-01-before",
    expectations: [
      'Primary "Create Workspace" button shows an upright branch icon (stem node at bottom, branch curving up-right) with a small plus at bottom-right, beside "Open in Web".',
      'Branch line reads "feature-remote →" followed by the repo default branch.',
      "Button label is Create Workspace (not Open) because no workspace exists yet.",
    ],
  });

  await user.click(createButton);

  await waitFor(async () => {
    const workspaces = await getWorkspaces(repoPath);
    expect(
      workspaces.some((w) => w.branch_name === "feature-remote"),
    ).toBe(true);
  });

  expect(
    await screen.findByRole("button", { name: /open workspace/i }),
  ).toBeVisible();

  await captureDocument(document, {
    name: "pr-create-workspace-02-after",
    expectations: [
      'Header button now reads "Open Workspace" (outline) with the same upright branch icon and no plus badge.',
      'A success toast reports that a workspace was created for feature-remote.',
      "PR title Ship remote feature remains visible in the detail panel.",
    ],
  });
}, 60000);
