/**
 * README / web-home marketing screenshots → assets/screenshots/*.png
 *
 * Real Jujutsu repo via NAPI, real Dashboard, GitHub/CI cache stubbed (no gh CLI).
 * Terminal TUI pixels are injected because xterm canvas does not serialize.
 */

import fs from "node:fs";
import path from "node:path";
import userEvent from "@testing-library/user-event";
import * as React from "react";
import { expect, it, vi } from "vitest";
import { Dashboard } from "../../../src/components/Dashboard";
import { render, screen, waitFor, within } from "../../../test/test-utils";
import { getWorkspaces, createWorkspace } from "../../../src/lib/api";
import { listen } from "@tauri-apps/api/event";
import { TREQ_SEND_EVENT } from "../../../src/lib/treqSend";
import { getFullWorkspacePath } from "../../../src/lib/utils";
import {
  findSidebarBranchElement,
  resolveWorkspacePath,
  writeWorkspaceFile,
} from "../../../test/utils";
import {
  MARKETING_BRANCH,
  README_SCREENSHOTS_DIR,
  SIBLING_BRANCHES,
  STACK_PARENT_BRANCH,
  seedReadmeMarketingRepo,
} from "../readme-fixture";
import { captureDocument, stitchPngsSideBySide } from "../capture";
import {
  MARKETING_REMOTE,
  marketingCiByBranch,
  marketingGhIssues,
  marketingGhPullRequests,
  marketingPrByBranch,
} from "../readme-github";
import {
  expandMarketingFileTree,
  expandMarketingTerminalPane,
  hideMarketingTerminalPane,
  showMarketingTerminalPane,
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
  mockGhListPrs,
  mockGhListIssues,
  mockGhViewPr,
} = vi.hoisted(() => ({
  mockListCachedPrStatuses: vi.fn(),
  mockListCachedPrCiStatuses: vi.fn(),
  mockGetGitRemoteUrl: vi.fn(),
  mockGhListPrs: vi.fn(),
  mockGhListIssues: vi.fn(),
  mockGhViewPr: vi.fn(),
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
    ghListPrs: mockGhListPrs,
    ghListIssues: mockGhListIssues,
    ghViewPr: mockGhViewPr,
  };
});

function stubGithub() {
  mockGetGitRemoteUrl.mockResolvedValue(MARKETING_REMOTE);
  mockListCachedPrStatuses.mockResolvedValue(marketingPrByBranch());
  mockListCachedPrCiStatuses.mockResolvedValue(marketingCiByBranch());
  mockGhListPrs.mockResolvedValue({
    items: marketingGhPullRequests(),
    hasMore: false,
  });
  mockGhListIssues.mockResolvedValue({
    items: marketingGhIssues(),
    hasMore: false,
  });
  mockGhViewPr.mockImplementation(async (_repo: string, number: number) => {
    return (
      marketingGhPullRequests().find((item) => item.number === number) ?? null
    );
  });
}

async function prepareWorkspace(branch = MARKETING_BRANCH) {
  stubGithub();
  const fixture = await seedReadmeMarketingRepo();
  const user = userEvent.setup();
  render(<Dashboard />);
  await user.click(await findSidebarBranchElement(branch));
  await screen.findByTestId("show-workspace-header");
  hideMarketingTerminalPane();
  document.documentElement.classList.add("dark");
  await new Promise((resolve) => setTimeout(resolve, 300));
  return { user, ...fixture };
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
      "The terminal pane shows Claude Code as a peach/orange dashed welcome TUI (v2.0.0, Sonnet, prompt), plus Codex and Cursor Agent panes with visible text.",
      "The sidebar lists stacked workspaces with GitHub PR icons; packages/web looks conflicted or changed.",
    ],
  });
}, 120000);

it("captures the Changes tab for the README", async () => {
  const user = await prepareMarketingView();

  await user.click(await screen.findByRole("tab", { name: /^Changes/ }));
  await screen.findByRole("tab", { name: /^Changes/, selected: true });

  const conflictsToggle = await screen.findByRole("button", {
    name: "Conflicts",
  });
  const conflictsSection = conflictsToggle.closest("div")?.parentElement;
  if (!conflictsSection) throw new Error("Conflicts section not found");
  await user.click(await within(conflictsSection).findByTitle(/Home\.tsx/));
  await screen.findByText(/Conflict 1 of/);

  hideMarketingTerminalPane();
  await new Promise((resolve) => setTimeout(resolve, 300));

  await captureDocument(document, {
    name: "readme-review",
    deviceScaleFactor: 2,
    scrollIntoView: '[data-conflict-section-label="Side #1"]',
    clipSelector: '[data-testid="changes-diff-viewer"]',
    publishTo: path.join(README_SCREENSHOTS_DIR, "review.png"),
    expectations: [
      "The Changes tab is cropped to the diff viewer. The terminal pane is not visible.",
      "A conflicted packages/web/src/pages/Home.tsx shows an inline conflict card (Side #1 / Base / Side #2).",
      "Committed files such as client.ts are listed in the Changes sidebar.",
    ],
  });
}, 120000);

it("captures the Commits tab for the README", async () => {
  const user = await prepareMarketingView();

  await user.click(await screen.findByRole("tab", { name: /^Commits/ }));
  await screen.findByRole("tab", { name: /^Commits/, selected: true });

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

it("captures the workspace list for landing isolation copy", async () => {
  stubGithub();
  await seedReadmeMarketingRepo();
  render(<Dashboard />);

  await findSidebarBranchElement(MARKETING_BRANCH);
  await findSidebarBranchElement(STACK_PARENT_BRANCH);
  document.documentElement.classList.add("dark");
  await new Promise((resolve) => setTimeout(resolve, 400));

  await captureDocument(document, {
    name: "readme-sidebar",
    deviceScaleFactor: 2,
    clipSelector: '[data-testid="workspace-sidebar"]',
    publishTo: path.join(README_SCREENSHOTS_DIR, "sidebar.png"),
    expectations: [
      "The sidebar is cropped and lists stacked workspaces, including feat/empty-event-message under feat/event-ingest.",
      "Sibling workspaces feat/keyvalues-cache and feat/alerting-logs are visible.",
    ],
  });
}, 120000);

it("captures two working copies side by side for isolation copy", async () => {
  const { user, repoPath } = await prepareWorkspace();

  const workspaces = await getWorkspaces(repoPath);
  const left = workspaces.find((ws) => ws.branch_name === SIBLING_BRANCHES[0]);
  const right = workspaces.find((ws) => ws.branch_name === MARKETING_BRANCH);
  if (!left || !right) throw new Error("Expected isolation workspaces");

  writeWorkspaceFile(
    resolveWorkspacePath(repoPath, getFullWorkspacePath(left)),
    "packages/api/src/cache.ts",
    "export const CACHE_TTL = 30;\n",
  );
  writeWorkspaceFile(
    resolveWorkspacePath(repoPath, getFullWorkspacePath(right)),
    "packages/web/src/pages/Home.tsx",
    "export default function Home() { return <h1>Local feed</h1>; }\n",
  );

  await user.click(await findSidebarBranchElement(SIBLING_BRANCHES[0]));
  await user.click(await screen.findByRole("tab", { name: /^Changes/ }));
  hideMarketingTerminalPane();
  await screen.findByTestId("changes-diff-viewer");
  await new Promise((resolve) => setTimeout(resolve, 400));
  const leftClip = path.join(
    "scripts",
    "screenshot",
    ".generated",
    "isolation-left.png",
  );
  await captureDocument(document, {
    name: "readme-isolation-left",
    deviceScaleFactor: 2,
    clipSelector: '[data-testid="changes-diff-viewer"]',
    publishTo: leftClip,
    expectations: [
      "The Changes view for feat/keyvalues-cache shows an uncommitted cache.ts change.",
      "The terminal pane is not visible.",
    ],
  });

  await user.click(await findSidebarBranchElement(MARKETING_BRANCH));
  await user.click(await screen.findByRole("tab", { name: /^Changes/ }));
  hideMarketingTerminalPane();
  await screen.findByTestId("changes-diff-viewer");
  await new Promise((resolve) => setTimeout(resolve, 400));
  const rightClip = path.join(
    "scripts",
    "screenshot",
    ".generated",
    "isolation-right.png",
  );
  await captureDocument(document, {
    name: "readme-isolation-right",
    deviceScaleFactor: 2,
    clipSelector: '[data-testid="changes-diff-viewer"]',
    publishTo: rightClip,
    expectations: [
      "The Changes view for feat/empty-event-message shows a different uncommitted Home.tsx change.",
      "The terminal pane is not visible.",
    ],
  });

  await stitchPngsSideBySide(
    leftClip,
    rightClip,
    path.join(README_SCREENSHOTS_DIR, "isolation.png"),
    [SIBLING_BRANCHES[0], MARKETING_BRANCH],
  );
}, 120000);

it("captures agent prompt input for CLI delegation copy", async () => {
  const { user } = await prepareWorkspace();

  const input = await screen.findByPlaceholderText("Describe a task...");
  await user.click(input);
  await user.clear(input);
  await user.type(input, "create a workspace for this fix");
  await screen.findByTestId("agent-task-input");

  await captureDocument(document, {
    name: "readme-prompt",
    deviceScaleFactor: 2,
    clipSelector: '[data-testid="agent-task-input"]',
    publishTo: path.join(README_SCREENSHOTS_DIR, "prompt.png"),
    expectations: [
      "The agent prompt box contains the text 'create a workspace for this fix'.",
      "The prompt sits on the Code tab, not in a mock terminal.",
    ],
  });
}, 120000);

it("captures an agent splitting work across three workspaces", async () => {
  const { user, repoPath } = await prepareWorkspace();

  const input = await screen.findByPlaceholderText("Describe a task...");
  await user.click(input);
  await user.clear(input);
  await user.type(
    input,
    "Split the work across 3 agents in 3 different workspaces",
  );

  await captureDocument(document, {
    name: "readme-spawn-before",
    deviceScaleFactor: 2,
    clipSelector: '[data-testid="agent-task-input"]',
    publishTo: path.join(README_SCREENSHOTS_DIR, "spawn-before.png"),
    expectations: [
      "The agent prompt asks to split the work across 3 agents in 3 different workspaces.",
    ],
  });

  await createWorkspace(repoPath, "feat/agent-one");
  await createWorkspace(repoPath, "feat/agent-two");
  await createWorkspace(repoPath, "feat/agent-three");
  await findSidebarBranchElement("feat/agent-one");
  await findSidebarBranchElement("feat/agent-two");
  await findSidebarBranchElement("feat/agent-three");
  document.documentElement.classList.add("dark");
  await new Promise((resolve) => setTimeout(resolve, 400));

  await captureDocument(document, {
    name: "readme-spawn-after",
    deviceScaleFactor: 2,
    clipSelector: '[data-testid="workspace-sidebar"]',
    publishTo: path.join(README_SCREENSHOTS_DIR, "spawn-after.png"),
    expectations: [
      "The sidebar lists feat/agent-one, feat/agent-two, and feat/agent-three after the split.",
    ],
  });
}, 120000);

it("captures treq send thumbnail and lightbox for landing copy", async () => {
  const { user, repoPath } = await prepareWorkspace();

  const imagePath = path.join(repoPath, "research-draft.svg");
  fs.writeFileSync(
    imagePath,
    `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128">
  <rect width="128" height="128" fill="#2563eb"/>
  <circle cx="64" cy="64" r="36" fill="#f8fafc"/>
</svg>
`,
  );

  await user.click(await screen.findByRole("button", { name: "New Shell" }));
  showMarketingTerminalPane();
  expandMarketingTerminalPane();
  await waitFor(() => {
    expect(document.querySelector('[data-terminal-id^="shell-"]')).not.toBeNull();
  });
  expandMarketingTerminalPane();

  const terminalEl = document.querySelector(
    '[data-terminal-id^="shell-"]',
  ) as HTMLElement;
  const ptySessionId = terminalEl.getAttribute("data-terminal-id");
  expect(ptySessionId).toBeTruthy();

  await waitFor(() => {
    expect(
      vi.mocked(listen).mock.calls.some((args) => args[0] === TREQ_SEND_EVENT),
    ).toBe(true);
  });

  const sendCallback = vi
    .mocked(listen)
    .mock.calls.find((args) => args[0] === TREQ_SEND_EVENT)?.[1] as (event: {
    payload: {
      kind: string;
      request_id: string;
      repo: string;
      pty_session_id: string;
      media_type: string;
      path: string;
      title: string;
    };
  }) => void;

  sendCallback({
    payload: {
      kind: "send",
      request_id: "landing-send-image",
      repo: repoPath,
      pty_session_id: ptySessionId!,
      media_type: "image",
      path: imagePath,
      title: "research-draft.svg",
    },
  });

  const imageThumb = await screen.findByTestId(
    "terminal-send-preview-landing-send-image",
  );

  await captureDocument(document, {
    name: "readme-send-thumb",
    deviceScaleFactor: 2,
    clipSelector: '[data-testid="workspace-terminal-pane"]',
    publishTo: path.join(README_SCREENSHOTS_DIR, "send-thumb.png"),
    expectations: [
      "The terminal pane shows an asset thumbnail for research-draft.svg.",
      "The lightbox is not open.",
    ],
  });

  await user.click(imageThumb);
  await screen.findByTestId("treq-send-preview-lightbox");

  await captureDocument(document, {
    name: "readme-send-lightbox",
    deviceScaleFactor: 2,
    publishTo: path.join(README_SCREENSHOTS_DIR, "send-lightbox.png"),
    expectations: [
      "The asset lightbox is open over the workspace, showing research-draft.svg.",
    ],
  });
}, 120000);

it("captures the schedule dialog for landing schedule copy", async () => {
  const { user } = await prepareWorkspace();

  await user.click(await screen.findByTestId("schedule-workspace-button"));
  await screen.findByTestId("schedule-workspace-dialog");

  await captureDocument(document, {
    name: "readme-schedule",
    deviceScaleFactor: 2,
    clipSelector: '[data-testid="schedule-workspace-dialog"]',
    publishTo: path.join(README_SCREENSHOTS_DIR, "schedule.png"),
    expectations: [
      "A Schedule workspace dialog is open with hide-until presets.",
      "The dialog is cropped; the rest of the app chrome is out of frame.",
    ],
  });
}, 120000);

it("captures commit timestamp editing for landing schedule copy", async () => {
  const { user } = await prepareWorkspace();

  await user.click(await screen.findByRole("tab", { name: /^Commits/ }));
  const commitTitle = await screen.findByText(
    "feat: handle empty event messages",
  );
  await user.click(commitTitle);
  await user.click(await screen.findByRole("button", { name: "Edit timestamp" }));
  const editDialog = await screen.findByTestId("modal");
  await within(editDialog).findByText("Edit commit timestamp");

  await captureDocument(document, {
    name: "readme-timestamp",
    deviceScaleFactor: 2,
    clipSelector: '[data-testid="modal"]',
    publishTo: path.join(README_SCREENSHOTS_DIR, "timestamp.png"),
    expectations: [
      "A dialog titled Edit commit timestamp is open with shift-by-duration fields.",
      "A control exists to shift the stack to now.",
    ],
  });
}, 120000);

it("captures GitHub pull requests for landing GitHub copy", async () => {
  stubGithub();
  await seedReadmeMarketingRepo();
  const user = userEvent.setup();
  render(<Dashboard />);

  await user.click(await screen.findByRole("button", { name: "GitHub" }));
  await user.click(await screen.findByRole("tab", { name: /pull requests/i }));
  await screen.findByText("feat: handle empty event messages");
  document.documentElement.classList.add("dark");
  await new Promise((resolve) => setTimeout(resolve, 400));

  await captureDocument(document, {
    name: "readme-github-prs",
    deviceScaleFactor: 2,
    clipSelector: '[data-testid="github-panel"]',
    publishTo: path.join(README_SCREENSHOTS_DIR, "github.png"),
    expectations: [
      "The GitHub panel lists pull requests including feat: handle empty event messages.",
      "Issues and Pull Requests tabs are visible.",
    ],
  });
}, 120000);

it("captures GitHub issues for landing GitHub copy", async () => {
  stubGithub();
  await seedReadmeMarketingRepo();
  const user = userEvent.setup();
  render(<Dashboard />);

  await user.click(await screen.findByRole("button", { name: "GitHub" }));
  await user.click(await screen.findByRole("tab", { name: /issues/i }));
  await screen.findByText("Empty event payloads drop the Discord body");
  document.documentElement.classList.add("dark");
  await new Promise((resolve) => setTimeout(resolve, 400));

  await captureDocument(document, {
    name: "readme-github-issues",
    deviceScaleFactor: 2,
    clipSelector: '[data-testid="github-panel"]',
    publishTo: path.join(README_SCREENSHOTS_DIR, "github-issues.png"),
    expectations: [
      "The GitHub Issues tab lists Empty event payloads drop the Discord body.",
      "The panel is cropped to the GitHub integration, not the workspace header.",
    ],
  });
}, 120000);
