import * as React from "react";
import { expect, it, vi } from "vitest";
import { WorkspaceStackPanel } from "../../../src/components/WorkspaceStackPanel";
import type {
  JjLogResult,
  Workspace,
  WorkspaceSidebarStatus,
} from "../../../src/lib/api";
import * as api from "../../../src/lib/api";
import { createMockWorkspace } from "../../../test/factories/workspace.factory";
import { render, screen } from "../../../test/test-utils";
import { captureDocument } from "../capture";

vi.mock("../../../src/lib/api", async () => {
  const actual = await vi.importActual<typeof import("../../../src/lib/api")>(
    "../../../src/lib/api",
  );
  return {
    ...actual,
    listWorkspaceStatuses: vi.fn(),
    listCommits: vi.fn(),
  };
});

function asStatuses(workspaces: Workspace[]): WorkspaceSidebarStatus[] {
  return workspaces.map((current) => ({ current, has_conflicts: false }));
}

function makeLogResult(insertions: number, deletions: number): JjLogResult {
  return {
    commits: [
      {
        commit_id: "c1",
        short_id: "c1",
        change_id: "chg1",
        description: "Some change",
        author_name: "Test User",
        timestamp: new Date().toISOString(),
        parent_ids: [],
        is_working_copy: false,
        bookmarks: [],
        is_immutable: false,
        insertions,
        deletions,
        on_target_only: false,
      },
    ],
    target_branch: "main",
    workspace_branch: "ws",
  };
}

const rootWorkspace = createMockWorkspace({
  id: 1,
  branch_name: "chore/refactor",
  workspace_name: "chore/refactor",
  title: "chore: refactor review components",
  target_branch: "main",
  created_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
});

const middleWorkspace = createMockWorkspace({
  id: 2,
  branch_name: "feat/context-prompts",
  workspace_name: "feat/context-prompts",
  title: "feat: add context-aware refactoring prompts",
  target_branch: "chore/refactor",
  created_at: new Date(Date.now() - 28 * 60 * 1000).toISOString(),
});

const tipWorkspace = createMockWorkspace({
  id: 3,
  branch_name: "feat/ai-summaries",
  workspace_name: "feat/ai-summaries",
  title: "feat: introduce AI-powered review summaries",
  target_branch: "feat/context-prompts",
  created_at: new Date(Date.now() - 11 * 60 * 1000).toISOString(),
});

it("captures stack LOC bars with a shared middle axis across digit lengths", async () => {
  vi.mocked(api.listWorkspaceStatuses).mockResolvedValue(
    asStatuses([rootWorkspace, middleWorkspace, tipWorkspace]),
  );
  vi.mocked(api.listCommits).mockImplementation(
    async (_repoPath, workspaceId) => {
      if (workspaceId === tipWorkspace.id) return makeLogResult(253, 18277);
      if (workspaceId === middleWorkspace.id) return makeLogResult(61, 61);
      return makeLogResult(18724, 477);
    },
  );

  render(
    <div className="p-8 bg-background max-w-xl">
      <WorkspaceStackPanel
        repoPath={middleWorkspace.repo_path}
        workspace={middleWorkspace}
        defaultBranch="main"
      />
    </div>,
  );

  const indicators = await screen.findAllByTestId("workspace-loc-indicator");
  expect(indicators).toHaveLength(3);
  expect(screen.getByText("+18724")).toBeTruthy();
  expect(screen.getByText("-18277")).toBeTruthy();
  expect(screen.getByText("+61")).toBeTruthy();

  await captureDocument(document, {
    name: "stack-loc-bar-align-01-code-tab-card",
    viewport: { width: 560, height: 420 },
    clipSelector: "[data-testid='workspace-stack-panel']",
    expectations: [
      "The Stack card lists three workspaces with +N / bar / -N LOC on each row.",
      "The thin vertical axis in the middle of each LOC bar lines up vertically across all three rows, including +253 vs +18724 and -61 vs -18277.",
      "The current (middle) workspace row is highlighted with a darker selected background.",
    ],
  });
}, 60000);
