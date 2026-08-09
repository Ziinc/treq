import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "./test-utils";
import userEvent from "@testing-library/user-event";
import { ShowWorkspace } from "../src/components/ShowWorkspace";
import type { Workspace } from "../src/lib/api";

// Mock child components
vi.mock("../src/components/FileBrowser", () => ({
  FileBrowser: () => <div data-testid="file-browser" />,
}));

vi.mock("../src/components/LinearCommitHistory", () => ({
  LinearCommitHistory: () => <div data-testid="linear-commit-history" />,
}));

// Capture props passed to ChangesDiffViewer
let capturedChangesDiffViewerProps: any = null;

vi.mock("../src/components/ChangesDiffViewer", () => ({
  ChangesDiffViewer: (props: any) => {
    capturedChangesDiffViewerProps = props;
    return (
      <div data-testid="changes-viewer">
        {props.onShowCommittedChangesChange && (
          <button
            type="button"
            onClick={() =>
              props.onShowCommittedChangesChange(!props.showCommittedChanges)
            }
          >
            Show
          </button>
        )}
      </div>
    );
  },
}));

vi.mock("../src/components/TargetBranchSelector", () => ({
  TargetBranchSelector: () => <div data-testid="target-branch-selector" />,
}));

// Mock API calls
vi.mock("../src/lib/api", async () => {
  const actual =
    await vi.importActual<typeof import("../src/lib/api")>("../src/lib/api");
  return {
    ...actual,
    getSetting: vi.fn().mockResolvedValue(null),
    lsWorkspace: vi.fn().mockResolvedValue([]),
    getWorkspaceReadme: vi.fn().mockResolvedValue(null),
    listConflictedFiles: vi.fn().mockResolvedValue([]),
    jjGetBranches: vi.fn().mockResolvedValue([]),
    setWorkspaceTargetBranch: vi.fn().mockResolvedValue(undefined),
    jjGetChangedFiles: vi.fn().mockResolvedValue([]),
    jjGetMergeDiff: vi.fn().mockResolvedValue({
      committed_files: [],
      hunks_by_file: [],
      too_large_to_render: false,
      render_block_reason: null,
    }),
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

const workspaceWithTarget: Workspace = {
  id: 1,
  repo_path: "/Users/test/repo",
  workspace_name: "test-workspace",
  workspace_path: "/Users/test/repo/.treq/workspaces/test-workspace",
  branch_name: "feature-branch",
  created_at: "2024-01-01T00:00:00Z",
  target_branch: "main",
  has_conflicts: false,
};

const workspaceWithoutTarget: Workspace = {
  ...workspaceWithTarget,
  target_branch: null,
};

describe("Committed Changes Toggle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedChangesDiffViewerProps = null;
  });

  it("should pass show/toggle props in Review tab when workspace has target_branch", async () => {
    render(
      <ShowWorkspace
        workspace={workspaceWithTarget}
        repositoryPath="/Users/test/repo"
        sessionId={1}
        onWorkspaceChange={vi.fn()}
        onRequestClose={vi.fn()}
      />,
    );

    const reviewTab = await screen.findByText("Review");
    await userEvent.click(reviewTab);

    await waitFor(() => {
      expect(capturedChangesDiffViewerProps?.showCommittedChanges).toBe(true);
      expect(
        typeof capturedChangesDiffViewerProps?.onShowCommittedChangesChange,
      ).toBe("function");
    });
  });

  it("should not pass toggle callback when workspace is null (home repo)", async () => {
    render(
      <ShowWorkspace
        workspace={null}
        repositoryPath="/Users/test/repo"
        sessionId={1}
        onWorkspaceChange={vi.fn()}
        onRequestClose={vi.fn()}
      />,
    );

    const reviewTab = await screen.findByText("Review");
    await userEvent.click(reviewTab);

    await waitFor(() => {
      expect(screen.getByTestId("changes-viewer")).toBeInTheDocument();
    });

    expect(capturedChangesDiffViewerProps?.showCommittedChanges).toBe(false);
    expect(
      capturedChangesDiffViewerProps?.onShowCommittedChangesChange,
    ).toBeUndefined();
  });

  it("should pass toggle props when target_branch is null (defaults to default branch)", async () => {
    render(
      <ShowWorkspace
        workspace={workspaceWithoutTarget}
        repositoryPath="/Users/test/repo"
        sessionId={1}
        onWorkspaceChange={vi.fn()}
        onRequestClose={vi.fn()}
      />,
    );

    const reviewTab = await screen.findByText("Review");
    await userEvent.click(reviewTab);

    await waitFor(() => {
      expect(capturedChangesDiffViewerProps?.showCommittedChanges).toBe(true);
      expect(
        typeof capturedChangesDiffViewerProps?.onShowCommittedChangesChange,
      ).toBe("function");
    });
  });

  it("should not render ChangesDiffViewer toggle surface in Code tab", async () => {
    render(
      <ShowWorkspace
        workspace={workspaceWithTarget}
        repositoryPath="/Users/test/repo"
        sessionId={1}
        onWorkspaceChange={vi.fn()}
        onRequestClose={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("Code")).toBeInTheDocument();
    });

    expect(screen.queryByTestId("changes-viewer")).not.toBeInTheDocument();
  });

  it("should toggle showCommittedChanges via onShowCommittedChangesChange", async () => {
    const user = userEvent.setup();

    render(
      <ShowWorkspace
        workspace={workspaceWithTarget}
        repositoryPath="/Users/test/repo"
        sessionId={1}
        onWorkspaceChange={vi.fn()}
        onRequestClose={vi.fn()}
      />,
    );

    const reviewTab = await screen.findByText("Review");
    await user.click(reviewTab);

    await waitFor(() => {
      expect(capturedChangesDiffViewerProps?.showCommittedChanges).toBe(true);
    });

    await user.click(screen.getByRole("button", { name: /^Show$/ }));

    await waitFor(() => {
      expect(capturedChangesDiffViewerProps?.showCommittedChanges).toBe(false);
    });

    await user.click(screen.getByRole("button", { name: /^Show$/ }));

    await waitFor(() => {
      expect(capturedChangesDiffViewerProps?.showCommittedChanges).toBe(true);
    });
  });

  it("should pass targetBranch prop to ChangesDiffViewer when workspace has target", async () => {
    render(
      <ShowWorkspace
        workspace={workspaceWithTarget}
        repositoryPath="/Users/test/repo"
        sessionId={1}
        onWorkspaceChange={vi.fn()}
        onRequestClose={vi.fn()}
      />,
    );

    const reviewTab = await screen.findByText("Review");
    await userEvent.click(reviewTab);

    await waitFor(() => {
      expect(screen.getByTestId("changes-viewer")).toBeInTheDocument();
    });

    expect(capturedChangesDiffViewerProps?.targetBranch).toBe("main");
  });
});
