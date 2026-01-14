import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "./test-utils";
import { ShowWorkspace } from "../src/components/ShowWorkspace";
import * as api from "../src/lib/api";
import type { Workspace } from "../src/lib/api";

// Mock child components
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

describe("Bug #1: Automatic Conflict State Refresh", () => {
  let jjGetConflictedFilesMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    jjGetConflictedFilesMock = vi.fn().mockResolvedValue([]);

    vi.spyOn(api, "getSetting").mockResolvedValue(null);
    vi.spyOn(api, "listDirectory").mockResolvedValue([]);
    vi.spyOn(api, "readFile").mockRejectedValue(new Error("README not found"));
    vi.spyOn(api, "jjGetDefaultBranch").mockResolvedValue("main");
    vi.spyOn(api, "jjGetConflictedFiles").mockImplementation(jjGetConflictedFilesMock);
    vi.spyOn(api, "jjGetBranches").mockResolvedValue([]);
    vi.spyOn(api, "setWorkspaceTargetBranch").mockResolvedValue(undefined);
    vi.spyOn(api, "jjGetChangedFiles").mockResolvedValue([]);
    vi.spyOn(api, "createSession").mockResolvedValue(42);
    vi.spyOn(api, "ptyCreateSession").mockResolvedValue(undefined);
    vi.spyOn(api, "ptyWrite").mockResolvedValue(undefined);
    vi.spyOn(api, "checkAndRebaseWorkspaces").mockResolvedValue({
      rebased: false,
      success: true,
      has_conflicts: false,
      conflicted_files: [],
      message: "No rebase needed",
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("should automatically detect when conflicts are resolved without tab switching", async () => {
    // Start with conflicts
    jjGetConflictedFilesMock.mockResolvedValue(["src/file1.tsx"]);

    const workspace: Workspace = {
      id: 1,
      repo_path: "/test/repo",
      workspace_path: "/test/repo/.treq/workspaces/test",
      workspace_name: "test",
      branch_name: "feature",
      target_branch: "main",
      created_at: new Date().toISOString(),
      has_conflicts: true,
    };

    render(
      <ShowWorkspace
        workspace={workspace}
        repositoryPath="/test/repo"
        mainRepoBranch="main"
        initialSelectedFile={null}
      />
    );

    // Verify conflict alert appears
    await waitFor(() => {
      expect(screen.getByText(/conflict detected/i)).toBeInTheDocument();
    });

    // Simulate conflicts being resolved externally
    jjGetConflictedFilesMock.mockResolvedValue([]);

    // Advance timers by 2+ seconds to trigger polling
    vi.advanceTimersByTime(2500);

    // Wait for conflict alert to disappear (no tab switching required)
    await waitFor(
      () => {
        expect(screen.queryByText(/conflict detected/i)).not.toBeInTheDocument();
      },
      { timeout: 3000 }
    );
  });

  it("should enable merge button automatically when conflicts are resolved", async () => {
    // Start with conflicts
    jjGetConflictedFilesMock.mockResolvedValue(["src/file1.tsx"]);

    const workspace: Workspace = {
      id: 1,
      repo_path: "/test/repo",
      workspace_path: "/test/repo/.treq/workspaces/test",
      workspace_name: "test",
      branch_name: "feature",
      target_branch: "main",
      created_at: new Date().toISOString(),
      has_conflicts: true,
    };

    render(
      <ShowWorkspace
        workspace={workspace}
        repositoryPath="/test/repo"
        mainRepoBranch="main"
        initialSelectedFile={null}
      />
    );

    // Find merge button
    const mergeButton = await waitFor(() => screen.getByRole("button", { name: /merge/i }));

    // Verify button is disabled due to conflicts
    expect(mergeButton).toBeDisabled();

    // Resolve conflicts
    jjGetConflictedFilesMock.mockResolvedValue([]);

    // Advance timers to trigger polling
    vi.advanceTimersByTime(2500);

    // Merge button should become enabled
    await waitFor(
      () => {
        expect(mergeButton).not.toBeDisabled();
      },
      { timeout: 3000 }
    );
  });

  it("should poll for conflicts every 2 seconds when workspace is active", async () => {
    jjGetConflictedFilesMock.mockResolvedValue([]);

    const workspace: Workspace = {
      id: 1,
      repo_path: "/test/repo",
      workspace_path: "/test/repo/.treq/workspaces/test",
      workspace_name: "test",
      branch_name: "feature",
      target_branch: "main",
      created_at: new Date().toISOString(),
      has_conflicts: false,
    };

    render(
      <ShowWorkspace
        workspace={workspace}
        repositoryPath="/test/repo"
        mainRepoBranch="main"
        initialSelectedFile={null}
      />
    );

    // Wait for initial load
    await waitFor(() => {
      expect(jjGetConflictedFilesMock).toHaveBeenCalledTimes(1);
    });

    // Advance 2 seconds - should trigger second poll
    vi.advanceTimersByTime(2000);
    await waitFor(() => {
      expect(jjGetConflictedFilesMock).toHaveBeenCalledTimes(2);
    });

    // Advance another 2 seconds - should trigger third poll
    vi.advanceTimersByTime(2000);
    await waitFor(() => {
      expect(jjGetConflictedFilesMock).toHaveBeenCalledTimes(3);
    });
  });
});
