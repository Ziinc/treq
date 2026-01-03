import { describe, it, expect, vi, beforeEach } from "vitest";
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
    return <div data-testid="changes-viewer" />;
  },
}));

vi.mock("../src/components/TargetBranchSelector", () => ({
  TargetBranchSelector: () => <div data-testid="target-branch-selector" />,
}));

// Mock API calls
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
    jjGetMergeDiff: vi.fn().mockResolvedValue({ files: [], hunks_by_file: [] }),
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

  it("should render button in Review tab when workspace has target_branch", async () => {
    render(
      <ShowWorkspace
        workspace={workspaceWithTarget}
        repositoryPath="/Users/test/repo"
        sessionId={1}
        onWorkspaceChange={vi.fn()}
        onRequestClose={vi.fn()}
      />
    );

    // Switch to Review tab
    const reviewTab = await screen.findByText("Review");
    await userEvent.click(reviewTab);

    // Button should be visible
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /committed/i })).toBeInTheDocument();
    });
  });

  it("should hide button when workspace is null (home repo)", async () => {
    render(
      <ShowWorkspace
        workspace={null}
        repositoryPath="/Users/test/repo"
        sessionId={1}
        onWorkspaceChange={vi.fn()}
        onRequestClose={vi.fn()}
      />
    );

    // Switch to Review tab
    const reviewTab = await screen.findByText("Review");
    await userEvent.click(reviewTab);

    // Button should not be visible
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /committed/i })).not.toBeInTheDocument();
    });
  });

  it("should show button when target_branch is null (defaults to default branch)", async () => {
    render(
      <ShowWorkspace
        workspace={workspaceWithoutTarget}
        repositoryPath="/Users/test/repo"
        sessionId={1}
        onWorkspaceChange={vi.fn()}
        onRequestClose={vi.fn()}
      />
    );

    // Switch to Review tab
    const reviewTab = await screen.findByText("Review");
    await userEvent.click(reviewTab);

    // Button should be visible (uses default branch)
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /committed/i })).toBeInTheDocument();
    });
  });

  it("should not render button in Code tab", async () => {
    render(
      <ShowWorkspace
        workspace={workspaceWithTarget}
        repositoryPath="/Users/test/repo"
        sessionId={1}
        onWorkspaceChange={vi.fn()}
        onRequestClose={vi.fn()}
      />
    );

    // Wait for component to render
    await waitFor(() => {
      expect(screen.getByText("Code")).toBeInTheDocument();
    });

    // Button should not be visible in Code tab
    expect(screen.queryByRole("button", { name: /committed/i })).not.toBeInTheDocument();
  });

  it("should toggle state when button is clicked", async () => {
    const user = userEvent.setup();

    render(
      <ShowWorkspace
        workspace={workspaceWithTarget}
        repositoryPath="/Users/test/repo"
        sessionId={1}
        onWorkspaceChange={vi.fn()}
        onRequestClose={vi.fn()}
      />
    );

    // Switch to Review tab
    const reviewTab = await screen.findByText("Review");
    await user.click(reviewTab);

    // Find the button
    const committedButton = await screen.findByRole("button", {
      name: /committed/i,
    });

    // Initial state should be true (defaults to showing committed changes)
    await waitFor(() => {
      expect(capturedChangesDiffViewerProps?.showCommittedChanges).toBe(true);
    });

    // Click to toggle off
    await user.click(committedButton);

    // Should now pass false
    await waitFor(() => {
      expect(capturedChangesDiffViewerProps?.showCommittedChanges).toBe(false);
    });

    // Click to toggle back on
    await user.click(committedButton);

    // Should be true again
    await waitFor(() => {
      expect(capturedChangesDiffViewerProps?.showCommittedChanges).toBe(true);
    });
  });

  it("should pass showCommittedChanges prop to ChangesDiffViewer", async () => {
    const user = userEvent.setup();

    render(
      <ShowWorkspace
        workspace={workspaceWithTarget}
        repositoryPath="/Users/test/repo"
        sessionId={1}
        onWorkspaceChange={vi.fn()}
        onRequestClose={vi.fn()}
      />
    );

    // Switch to Review tab
    const reviewTab = await screen.findByText("Review");
    await user.click(reviewTab);

    // Wait for ChangesDiffViewer to be rendered
    await waitFor(() => {
      expect(screen.getByTestId("changes-viewer")).toBeInTheDocument();
    });

    // Initial state - should pass true (defaults to showing committed changes)
    expect(capturedChangesDiffViewerProps?.showCommittedChanges).toBe(true);

    // Toggle off
    const committedButton = await screen.findByRole("button", {
      name: /committed/i,
    });
    await user.click(committedButton);

    // Should now pass false
    await waitFor(() => {
      expect(capturedChangesDiffViewerProps?.showCommittedChanges).toBe(false);
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
      />
    );

    // Switch to Review tab
    const reviewTab = await screen.findByText("Review");
    await userEvent.click(reviewTab);

    // Wait for ChangesDiffViewer to be rendered
    await waitFor(() => {
      expect(screen.getByTestId("changes-viewer")).toBeInTheDocument();
    });

    // Should pass target branch
    expect(capturedChangesDiffViewerProps?.targetBranch).toBe("main");
  });
});
