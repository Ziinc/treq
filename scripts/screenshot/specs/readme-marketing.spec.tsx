/**
 * README / web-home marketing screenshots → assets/screenshots/*.png
 *
 * Real jj repo via NAPI, real Dashboard, GitHub/CI cache stubbed (no gh CLI).
 * Terminal TUI pixels are injected because xterm canvas does not serialize.
 */

import path from "node:path";
import userEvent from "@testing-library/user-event";
import * as React from "react";
import { expect, it, vi } from "vitest";
import { Dashboard } from "../../../src/components/Dashboard";
import { render, screen, waitFor, within } from "../../../test/test-utils";
import { findSidebarBranchElement } from "../../../test/utils";
import { captureDocument } from "../capture";
import {
  MARKETING_BRANCH,
  README_SCREENSHOTS_DIR,
  seedReadmeMarketingRepo,
} from "../readme-fixture";
import {
  MARKETING_REMOTE,
  marketingCiByBranch,
  marketingPrByBranch,
} from "../readme-github";
import {
  expandMarketingFileTree,
  expandMarketingTerminalPane,
  injectMarketingTuiOverlays,
  openMarketingAgentTerminals,
} from "../readme-terminals";

vi.mock("../../../src/lib/features", () => ({
  FEATURES: {
    pro: true,
    stripePayments: false,
    emailSignup: false,
    mergeQueue: false,
  },
}));

const {
  mockListCachedPrStatuses,
  mockListCachedPrCiStatuses,
  mockGetGitRemoteUrl,
} = vi.hoisted(() => ({
  mockListCachedPrStatuses: vi.fn(),
  mockListCachedPrCiStatuses: vi.fn(),
  mockGetGitRemoteUrl: vi.fn(),
}));

vi.mock("../../../src/lib/api", async () => {
  const actual = await vi.importActual<typeof import("../../../src/lib/api")>(
    "../../../src/lib/api",
  );
  return {
    ...actual,
    listCachedPrStatuses: mockListCachedPrStatuses,
    listCachedPrCiStatuses: mockListCachedPrCiStatuses,
    getCachedPrInfo: async (repoPath: string, branchName: string) => {
      const map = (await mockListCachedPrStatuses(repoPath)) as Record<
        string,
        { number: number } | null
      >;
      return map[branchName] ?? null;
    },
    getCachedPrCiStatus: async (repoPath: string, branchName: string) => {
      const map = (await mockListCachedPrCiStatuses(repoPath)) as Record<
        string,
        unknown
      >;
      return map[branchName] ?? null;
    },
    startPrStatusPolling: vi.fn(async () => undefined),
    stopPrStatusPolling: vi.fn(async () => undefined),
    refreshPrStatuses: vi.fn(async () => undefined),
    refreshPrBranchStatus: vi.fn(async () => undefined),
    getGitRemoteUrl: mockGetGitRemoteUrl,
  };
});

function stubGithub() {
  mockGetGitRemoteUrl.mockResolvedValue(MARKETING_REMOTE);
  mockListCachedPrStatuses.mockResolvedValue(marketingPrByBranch());
  mockListCachedPrCiStatuses.mockResolvedValue(marketingCiByBranch());
}

async function prepareMarketingView() {
  stubGithub();
  const { repoPath } = await seedReadmeMarketingRepo();
  const user = userEvent.setup();
  render(<Dashboard />);

  await user.click(await findSidebarBranchElement(MARKETING_BRANCH));
  await screen.findByTestId("show-workspace-header");
  await screen.findByRole("tab", { name: /^Code/, selected: true });

  await openMarketingAgentTerminals(user, repoPath);
  expandMarketingTerminalPane();
  injectMarketingTuiOverlays();

  await expandMarketingFileTree(user);
  await screen.findByText("Home.tsx");
  await waitFor(() => {
    expect(screen.getByTestId("marketing-tui-claude")).toBeTruthy();
    expect(screen.getByTestId("marketing-tui-codex")).toBeTruthy();
    expect(screen.getByTestId("marketing-tui-cursor")).toBeTruthy();
  });

  document.documentElement.classList.add("dark");
  await new Promise((resolve) => setTimeout(resolve, 400));
  return user;
}

it("captures the Code Overview for the README", async () => {
  await prepareMarketingView();

  await screen.findByRole("button", { name: /view pr/i });
  await screen.findByRole("button", { name: /ci /i });

  await captureDocument(document, {
    name: "readme-code",
    deviceScaleFactor: 2,
    publishTo: path.join(README_SCREENSHOTS_DIR, "code.png"),
    expectations: [
      "The Code tab shows a nested packages/ file tree, a stack panel for feat/empty-event-message on feat/event-ingest, and GitHub View PR plus CI pills in the header.",
      "The terminal pane shows three agent TUIs: Claude Code, Codex, and Cursor Agent, with visible prompt/diff text (not empty black panels).",
      "The sidebar lists stacked workspaces with GitHub PR icons; packages/web looks conflicted or changed.",
    ],
  });
}, 120000);

it("captures the Code Review tab for the README", async () => {
  const user = await prepareMarketingView();

  await user.click(await screen.findByRole("tab", { name: /^Review/ }));
  await screen.findByRole("tab", { name: /^Review/, selected: true });

  const conflictsToggle = await screen.findByRole("button", {
    name: "Conflicts",
  });
  const conflictsSection = conflictsToggle.closest("div")?.parentElement;
  if (!conflictsSection) throw new Error("Conflicts section not found");
  await user.click(await within(conflictsSection).findByTitle(/Home\.tsx/));
  await screen.findByText(/Conflict 1 of/);

  expandMarketingTerminalPane();
  injectMarketingTuiOverlays();
  await new Promise((resolve) => setTimeout(resolve, 300));

  await captureDocument(document, {
    name: "readme-review",
    deviceScaleFactor: 2,
    publishTo: path.join(README_SCREENSHOTS_DIR, "review.png"),
    expectations: [
      "The Review tab is open on a conflicted packages/web/src/pages/Home.tsx with an inline conflict card (Side #1 / Base / Side #2).",
      "Committed files such as client.ts are listed; GitHub View PR and CI remain in the header.",
      "The terminal pane still shows Claude, Codex, and Cursor TUI content.",
    ],
  });
}, 120000);

it("captures the Commits tab for the README", async () => {
  const user = await prepareMarketingView();

  await user.click(await screen.findByRole("tab", { name: "Commits" }));
  await screen.findByRole("tab", { name: "Commits", selected: true });

  const commitTitle = await screen.findByText(
    "feat: handle empty event messages",
  );
  await user.click(commitTitle);
  await screen.findAllByText(/event_message/);

  expandMarketingTerminalPane();
  injectMarketingTuiOverlays();
  await new Promise((resolve) => setTimeout(resolve, 300));

  await captureDocument(document, {
    name: "readme-commits",
    deviceScaleFactor: 2,
    publishTo: path.join(README_SCREENSHOTS_DIR, "commits.png"),
    expectations: [
      "The Commits tab is active with 'feat: handle empty event messages' expanded, showing a client.ts diff.",
      "The stack and GitHub PR/CI chrome are visible; the workspace is feat/empty-event-message.",
      "The terminal pane still shows Claude, Codex, and Cursor TUI content.",
    ],
  });
}, 120000);
