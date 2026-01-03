import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "./test-utils";
import userEvent from "@testing-library/user-event";
import { ShowWorkspace } from "../src/components/ShowWorkspace";
import * as api from "../src/lib/api";
import type { Workspace } from "../src/lib/api";

vi.mock("../src/components/FileBrowser", () => ({
  FileBrowser: () => <div data-testid="file-browser" />,
}));

vi.mock("../src/components/CommitGraph", () => ({
  CommitGraph: () => <div data-testid="commit-graph" />,
}));

vi.mock("../src/components/ChangesDiffViewer", () => ({
  ChangesDiffViewer: () => <div data-testid="changes-viewer" />,
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
    setWorkspaceTargetBranch: vi.fn().mockResolvedValue({
      success: true,
      message: "",
      has_conflicts: false,
      conflicted_files: [],
    }),
    jjGetChangedFiles: vi.fn().mockResolvedValue([]),
    createSession: vi.fn().mockResolvedValue(42),
    checkAndRebaseWorkspaces: vi.fn().mockResolvedValue({
      rebased: false,
      success: true,
      has_conflicts: false,
      conflicted_files: [],
      message: "No rebase needed",
    }),
  };
});

describe("ShowWorkspace - Merge Button", () => {
  const workspaceWithTarget: Workspace = {
    id: 1,
    repo_path: "/Users/test/repo",
    workspace_name: "feature-one",
    workspace_path: "/Users/test/repo/.jj/workspaces/feature-one",
    branch_name: "feature-one",
    target_branch: "main",
    created_at: new Date().toISOString(),
    has_conflicts: false,
  };

  const mainBranchWorkspace: Workspace = {
    id: 2,
    repo_path: "/Users/test/repo",
    workspace_name: "main",
    workspace_path: "/Users/test/repo",
    branch_name: "main",
    target_branch: null,
    created_at: new Date().toISOString(),
    has_conflicts: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.jjGetDefaultBranch).mockResolvedValue("main");
    vi.mocked(api.jjGetConflictedFiles).mockResolvedValue([]);
    vi.mocked(api.jjGetBranches).mockResolvedValue([
      { name: "main", is_current: false },
      { name: "feature-one", is_current: true },
    ]);
  });

  it("shows Merge button when workspace has target branch", async () => {
    const onOpenMergePreview = vi.fn();

    render(
      <ShowWorkspace
        repositoryPath={workspaceWithTarget.repo_path}
        workspace={workspaceWithTarget}
        mainRepoBranch="main"
        initialSelectedFile={null}
        onOpenMergePreview={onOpenMergePreview}
      />
    );

    await waitFor(() => {
      expect(screen.queryByTestId("target-branch-selector")).toBeInTheDocument();
    });

    expect(await screen.findByRole("button", { name: /merge/i })).toBeInTheDocument();
  });

  it("hides Merge button when workspace branch equals default branch", async () => {
    render(
      <ShowWorkspace
        repositoryPath={mainBranchWorkspace.repo_path}
        workspace={mainBranchWorkspace}
        mainRepoBranch="main"
        initialSelectedFile={null}
      />
    );

    await waitFor(() => {
      expect(api.jjGetDefaultBranch).toHaveBeenCalled();
    });

    // Should not show target branch selector or merge button for main branch
    expect(screen.queryByTestId("target-branch-selector")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /merge/i })).not.toBeInTheDocument();
  });

  it("hides Merge button when no workspace is provided", async () => {
    render(
      <ShowWorkspace
        repositoryPath="/Users/test/repo"
        workspace={null}
        mainRepoBranch="main"
        initialSelectedFile={null}
      />
    );

    await waitFor(() => {
      expect(api.jjGetDefaultBranch).toHaveBeenCalled();
    });

    expect(screen.queryByRole("button", { name: /merge/i })).not.toBeInTheDocument();
  });

  it("disables Merge button when there are conflicts", async () => {
    vi.mocked(api.jjGetConflictedFiles).mockResolvedValue(["src/file.ts"]);

    const onOpenMergePreview = vi.fn();

    render(
      <ShowWorkspace
        repositoryPath={workspaceWithTarget.repo_path}
        workspace={workspaceWithTarget}
        mainRepoBranch="main"
        initialSelectedFile={null}
        onOpenMergePreview={onOpenMergePreview}
      />
    );

    const mergeButton = await screen.findByRole("button", { name: /merge/i });
    expect(mergeButton).toBeDisabled();
  });

  it("calls onOpenMergePreview when Merge button clicked", async () => {
    const onOpenMergePreview = vi.fn();

    render(
      <ShowWorkspace
        repositoryPath={workspaceWithTarget.repo_path}
        workspace={workspaceWithTarget}
        mainRepoBranch="main"
        initialSelectedFile={null}
        onOpenMergePreview={onOpenMergePreview}
      />
    );

    // Wait for button to be enabled (rebasing state completes after 500ms)
    const mergeButton = await screen.findByRole("button", { name: /merge/i });
    await waitFor(() => {
      expect(mergeButton).not.toBeDisabled();
    });

    const user = userEvent.setup();
    await user.click(mergeButton);

    expect(onOpenMergePreview).toHaveBeenCalled();
  });

  it("does not call onOpenMergePreview when callback is not provided", async () => {
    render(
      <ShowWorkspace
        repositoryPath={workspaceWithTarget.repo_path}
        workspace={workspaceWithTarget}
        mainRepoBranch="main"
        initialSelectedFile={null}
      />
    );

    // Should still render the button (but it might not do anything)
    const mergeButton = await screen.findByRole("button", { name: /merge/i });
    expect(mergeButton).toBeInTheDocument();

    // Clicking shouldn't throw an error
    const user = userEvent.setup();
    await expect(user.click(mergeButton)).resolves.not.toThrow();
  });

  it("should show tooltip when merge button is disabled due to conflicts", async () => {
    vi.mocked(api.jjGetConflictedFiles).mockResolvedValue(["file1.ts", "file2.ts"]);

    render(
      <ShowWorkspace
        workspace={workspaceWithTarget}
        repositoryPath={workspaceWithTarget.repo_path}
        mainRepoBranch="main"
        initialSelectedFile={null}
        onOpenMergePreview={vi.fn()}
      />
    );

    // Wait for button to appear and be disabled
    const button = await screen.findByRole("button", { name: /merge/i });
    await waitFor(() => {
      expect(button).toBeDisabled();
    });

    // Hover over button to show tooltip
    const user = userEvent.setup();
    await user.hover(button);

    // Check tooltip text (may appear twice for accessibility)
    await waitFor(() => {
      const tooltips = screen.queryAllByText(/Cannot merge: 2 conflicts detected/i);
      expect(tooltips.length).toBeGreaterThan(0);
    });
  });

  it("should enable merge button when switching from conflicted workspace to clean workspace", async () => {
    const workspaceWithConflicts: Workspace = {
      id: 1,
      repo_path: "/Users/test/repo",
      workspace_name: "feature-conflicts",
      workspace_path: "/Users/test/repo/.jj/workspaces/feature-conflicts",
      branch_name: "feature-conflicts",
      target_branch: "main",
      created_at: new Date().toISOString(),
      has_conflicts: false,
    };

    const workspaceClean: Workspace = {
      id: 2,
      repo_path: "/Users/test/repo",
      workspace_name: "feature-clean",
      workspace_path: "/Users/test/repo/.jj/workspaces/feature-clean",
      branch_name: "feature-clean",
      target_branch: "main",
      created_at: new Date().toISOString(),
      has_conflicts: false,
    };

    // Workspace 1 has conflicts
    vi.mocked(api.jjGetConflictedFiles).mockResolvedValue(["file1.ts", "file2.ts"]);

    const { rerender } = render(
      <ShowWorkspace
        workspace={workspaceWithConflicts}
        repositoryPath={workspaceWithConflicts.repo_path}
        mainRepoBranch="main"
        initialSelectedFile={null}
        onOpenMergePreview={vi.fn()}
      />
    );

    // Wait for conflicts to be fetched (happens on overview tab)
    await waitFor(() => {
      const button = screen.queryByRole("button", { name: /merge/i });
      if (button) {
        expect(button).toBeDisabled(); // Disabled due to conflicts
      }
    }, { timeout: 2000 });

    // Now switch to workspace 2 which has NO conflicts
    vi.mocked(api.jjGetConflictedFiles).mockResolvedValue([]);

    rerender(
      <ShowWorkspace
        workspace={workspaceClean}
        repositoryPath={workspaceClean.repo_path}
        mainRepoBranch="main"
        initialSelectedFile={null}
        onOpenMergePreview={vi.fn()}
      />
    );

    // BUG: Button should become enabled since workspace 2 has no conflicts
    // But with the bug, conflictedFiles from workspace 1 persists
    await waitFor(() => {
      const button = screen.getByRole("button", { name: /merge/i });
      expect(button).not.toBeDisabled();
    }, { timeout: 2000 });
  });
});
