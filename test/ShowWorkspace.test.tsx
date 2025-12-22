import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "./test-utils";
import userEvent from "@testing-library/user-event";
import { act } from "@testing-library/react";
import { ShowWorkspace } from "../src/components/ShowWorkspace";
import * as api from "../src/lib/api";
import type { Workspace } from "../src/lib/api";

// Capture onCreateAgentWithComment handler from the FileBrowser mock
let fileBrowserCommentHandler:
  | ((
      filePath: string,
      startLine: number,
      endLine: number,
      lines: string[],
      comment: string
    ) => Promise<void> | void)
  | null = null;

// Capture onCreateAgentWithReview handler from the ChangesDiffViewer mock
let changesDiffReviewHandler:
  | ((reviewMarkdown: string) => Promise<void>)
  | null = null;

vi.mock("../src/components/FileBrowser", () => ({
  FileBrowser: (props: {
    onCreateAgentWithComment?: typeof fileBrowserCommentHandler;
  }) => {
    fileBrowserCommentHandler = props.onCreateAgentWithComment || null;
    return <div data-testid="file-browser" />;
  },
}));

vi.mock("../src/components/CommitGraph", () => ({
  CommitGraph: () => <div data-testid="commit-graph" />,
}));

vi.mock("../src/components/ChangesDiffViewer", () => ({
  ChangesDiffViewer: (props: {
    onCreateAgentWithReview?: typeof changesDiffReviewHandler;
  }) => {
    changesDiffReviewHandler = props.onCreateAgentWithReview || null;
    return <div data-testid="changes-viewer" />;
  },
}));

vi.mock("../src/components/TargetBranchSelector", () => ({
  TargetBranchSelector: () => <div data-testid="target-branch-selector" />,
}));

vi.mock("../src/lib/api", async () => {
  const actual = await vi.importActual<typeof import("../src/lib/api")>(
    "../src/lib/api"
  );
  return {
    ...actual,
    getSetting: vi.fn().mockResolvedValue(null),
    listDirectory: vi.fn().mockResolvedValue([]),
    readFile: vi.fn().mockRejectedValue(new Error("README not found")),
    jjGetDefaultBranch: vi.fn().mockResolvedValue("main"),
    jjGetConflictedFiles: vi.fn().mockResolvedValue([]),
    jjGetBranches: vi.fn().mockResolvedValue([]),
    setWorkspaceTargetBranch: vi.fn().mockResolvedValue(undefined),
    jjGetChangedFiles: vi.fn().mockResolvedValue([]),
    createSession: vi.fn().mockResolvedValue(42),
    ptyCreateSession: vi.fn().mockResolvedValue(undefined),
    ptyWrite: vi.fn().mockResolvedValue(undefined),
  };
});

const workspace: Workspace = {
  id: 7,
  repo_path: "/Users/test/repo",
  workspace_name: "feature-one",
  workspace_path: "/Users/test/repo/.treq/workspaces/feature-one",
  branch_name: "feature-one",
  created_at: new Date().toISOString(),
};

describe("ShowWorkspace agent comments", () => {
  beforeEach(() => {
    fileBrowserCommentHandler = null;
    changesDiffReviewHandler = null;
    vi.clearAllMocks();
  });

  it("notifies parent when submitting a file comment", async () => {
    const onSessionCreated = vi.fn();

    render(
      <ShowWorkspace
        repositoryPath={workspace.repo_path}
        workspace={workspace}
        mainRepoBranch="main"
        initialSelectedFile={null}
        onDeleteWorkspace={vi.fn()}
        allWorkspaces={[workspace]}
        {...({ onSessionCreated } as Record<string, unknown>)}
      />
    );

    const user = userEvent.setup();
    const filesTab = await screen.findByRole("tab", { name: /files/i });
    await user.click(filesTab);

    await waitFor(() => expect(fileBrowserCommentHandler).toBeTruthy());

    await act(async () => {
      await fileBrowserCommentHandler?.(
        `${workspace.workspace_path}/src/components/App.tsx`,
        10,
        12,
        ["line 1", "line 2", "line 3"],
        "Please update these lines"
      );
    });

    expect(api.createSession).toHaveBeenCalledWith(
      workspace.repo_path,
      workspace.id,
      "Code Comment"
    );

    // PTY session should NOT be created by the handler - ConsolidatedTerminal will create it
    expect(api.ptyCreateSession).not.toHaveBeenCalled();

    // Verify pending prompt is passed through onSessionCreated
    const expectedComment = "src/components/App.tsx:10-12\n```\nline 1\nline 2\nline 3\n```\n> Please update these lines\n";

    expect(onSessionCreated).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 42,
        workspacePath: workspace.workspace_path,
        pendingPrompt: expectedComment,
      })
    );
  });

  it("creates agent session with pre-filled review when submitting code review", async () => {
    const onSessionCreated = vi.fn();

    render(
      <ShowWorkspace
        repositoryPath={workspace.repo_path}
        workspace={workspace}
        mainRepoBranch="main"
        initialSelectedFile={null}
        onDeleteWorkspace={vi.fn()}
        allWorkspaces={[workspace]}
        {...({ onSessionCreated } as Record<string, unknown>)}
      />
    );

    const user = userEvent.setup();
    const changesTab = await screen.findByRole("tab", { name: /changes/i });
    await user.click(changesTab);

    await waitFor(() => expect(changesDiffReviewHandler).toBeTruthy());

    const reviewMarkdown = "## Code Review\n\n### Summary\nPlease fix these issues\n";

    await act(async () => {
      await changesDiffReviewHandler?.(reviewMarkdown);
    });

    // Verify session creation with correct name
    expect(api.createSession).toHaveBeenCalledWith(
      workspace.repo_path,
      workspace.id,
      "Code Review"
    );

    // PTY session should NOT be created by the handler - ConsolidatedTerminal will create it
    expect(api.ptyCreateSession).not.toHaveBeenCalled();

    // Verify parent was notified with pending prompt
    expect(onSessionCreated).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 42,
        sessionName: "Code Review",
        workspaceId: workspace.id,
        workspacePath: workspace.workspace_path,
        repoPath: workspace.repo_path,
        pendingPrompt: reviewMarkdown,
      })
    );
  });
});
