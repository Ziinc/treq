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

vi.mock("../src/components/LinearCommitHistory", () => ({
  LinearCommitHistory: () => <div data-testid="linear-commit-history" />,
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
    checkAndRebaseWorkspaces: vi.fn().mockResolvedValue({
      rebased: false,
      success: true,
      has_conflicts: false,
      conflicted_files: [],
      message: "No rebase needed",
    }),
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
    const changesTab = await screen.findByRole("tab", { name: /review/i });
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

describe("ShowWorkspace rebasing indicator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("displays rebasing indicator during auto-rebase on mount", async () => {
    // Mock a slow rebase operation
    vi.mocked(api.checkAndRebaseWorkspaces).mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(
            () =>
              resolve({
                rebased: true,
                success: true,
                has_conflicts: false,
                conflicted_files: [],
                message: "Rebased successfully",
              }),
            100
          );
        })
    );

    render(
      <ShowWorkspace
        repositoryPath={workspace.repo_path}
        workspace={workspace}
        mainRepoBranch="main"
        initialSelectedFile={null}
        onDeleteWorkspace={vi.fn()}
        allWorkspaces={[workspace]}
      />
    );

    // Rebasing indicator should appear while rebase is in progress
    await waitFor(() => {
      expect(screen.getByText("Rebasing...")).toBeInTheDocument();
    });

    // Verify checkAndRebaseWorkspaces was called with force=true
    expect(api.checkAndRebaseWorkspaces).toHaveBeenCalledWith(
      workspace.repo_path,
      workspace.id,
      "main",
      true
    );

    // Wait for rebase to complete - indicator should disappear (min 500ms)
    await waitFor(
      () => {
        expect(screen.queryByText("Rebasing...")).not.toBeInTheDocument();
      },
      { timeout: 700 }
    );
  });

  it("hides rebasing indicator after successful rebase (min 500ms)", async () => {
    vi.mocked(api.checkAndRebaseWorkspaces).mockResolvedValue({
      rebased: true,
      success: true,
      has_conflicts: false,
      conflicted_files: [],
      message: "Rebased successfully",
    });

    render(
      <ShowWorkspace
        repositoryPath={workspace.repo_path}
        workspace={workspace}
        mainRepoBranch="main"
        initialSelectedFile={null}
        onDeleteWorkspace={vi.fn()}
        allWorkspaces={[workspace]}
      />
    );

    // Wait for rebase to complete
    await waitFor(() => {
      expect(api.checkAndRebaseWorkspaces).toHaveBeenCalled();
    });

    // Indicator should remain visible for at least 500ms
    expect(screen.getByText("Rebasing...")).toBeInTheDocument();

    // Wait for minimum visibility duration
    await waitFor(
      () => {
        expect(screen.queryByText("Rebasing...")).not.toBeInTheDocument();
      },
      { timeout: 700 }
    );

    // No success toast should be shown (only status indicator was displayed)
    expect(screen.queryByText("Workspace rebased")).not.toBeInTheDocument();
  });

  it("hides rebasing indicator after rebase with conflicts (min 500ms)", async () => {
    vi.mocked(api.checkAndRebaseWorkspaces).mockResolvedValue({
      rebased: true,
      success: true,
      has_conflicts: true,
      conflicted_files: ["src/App.tsx", "src/utils.ts"],
      message: "Rebased with conflicts",
    });

    render(
      <ShowWorkspace
        repositoryPath={workspace.repo_path}
        workspace={workspace}
        mainRepoBranch="main"
        initialSelectedFile={null}
        onDeleteWorkspace={vi.fn()}
        allWorkspaces={[workspace]}
      />
    );

    // Wait for rebase to complete
    await waitFor(() => {
      expect(api.checkAndRebaseWorkspaces).toHaveBeenCalled();
    });

    // Indicator should remain visible for at least 500ms
    expect(screen.getByText("Rebasing...")).toBeInTheDocument();

    // Wait for minimum visibility duration
    await waitFor(
      () => {
        expect(screen.queryByText("Rebasing...")).not.toBeInTheDocument();
      },
      { timeout: 700 }
    );

    // Conflict toast should be shown
    await waitFor(() => {
      expect(
        screen.getByText("Workspace rebased with conflicts")
      ).toBeInTheDocument();
    });
  });

  it("hides rebasing indicator after rebase error (min 500ms)", async () => {
    vi.mocked(api.checkAndRebaseWorkspaces).mockRejectedValue(
      new Error("Rebase command failed")
    );

    render(
      <ShowWorkspace
        repositoryPath={workspace.repo_path}
        workspace={workspace}
        mainRepoBranch="main"
        initialSelectedFile={null}
        onDeleteWorkspace={vi.fn()}
        allWorkspaces={[workspace]}
      />
    );

    // Wait for rebase to fail
    await waitFor(() => {
      expect(api.checkAndRebaseWorkspaces).toHaveBeenCalled();
    });

    // Indicator should remain visible for at least 500ms even on error
    expect(screen.getByText("Rebasing...")).toBeInTheDocument();

    // Wait for minimum visibility duration
    await waitFor(
      () => {
        expect(screen.queryByText("Rebasing...")).not.toBeInTheDocument();
      },
      { timeout: 700 }
    );

    // No error toast should be shown (silent failure for auto-rebase)
    expect(screen.queryByText("Rebase failed")).not.toBeInTheDocument();
  });

  it("does not show success toast on successful rebase", async () => {
    vi.mocked(api.checkAndRebaseWorkspaces).mockResolvedValue({
      rebased: true,
      success: true,
      has_conflicts: false,
      conflicted_files: [],
      message: "Rebased successfully",
    });

    render(
      <ShowWorkspace
        repositoryPath={workspace.repo_path}
        workspace={workspace}
        mainRepoBranch="main"
        initialSelectedFile={null}
        onDeleteWorkspace={vi.fn()}
        allWorkspaces={[workspace]}
      />
    );

    await waitFor(() => {
      expect(api.checkAndRebaseWorkspaces).toHaveBeenCalled();
    });

    // Wait a bit to ensure no toast appears
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Verify no success toast is displayed
    expect(screen.queryByText("Workspace rebased")).not.toBeInTheDocument();
  });
});
