import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "./test-utils";
import userEvent from "@testing-library/user-event";
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

describe("Conflict Detection", () => {
  let jjGetConflictedFilesMock: ReturnType<typeof vi.fn>;
  let jjGetChangedFilesMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();

    // Set up mocks
    jjGetConflictedFilesMock = vi.fn().mockResolvedValue([]);
    jjGetChangedFilesMock = vi.fn().mockResolvedValue([]);

    vi.spyOn(api, "getSetting").mockResolvedValue(null);
    vi.spyOn(api, "listDirectory").mockResolvedValue([]);
    vi.spyOn(api, "readFile").mockRejectedValue(new Error("README not found"));
    vi.spyOn(api, "jjGetDefaultBranch").mockResolvedValue("main");
    vi.spyOn(api, "jjGetConflictedFiles").mockImplementation(jjGetConflictedFilesMock);
    vi.spyOn(api, "jjGetBranches").mockResolvedValue([]);
    vi.spyOn(api, "setWorkspaceTargetBranch").mockResolvedValue(undefined);
    vi.spyOn(api, "jjGetChangedFiles").mockImplementation(jjGetChangedFilesMock);
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

  describe("Stale Conflict Alert Bug", () => {
    it("should show conflict alert when conflicts exist", async () => {
      // Setup: Mock API to return conflicted files
      jjGetConflictedFilesMock.mockResolvedValue([
        "src/components/ChangesDiffViewer.tsx",
      ]);

      const workspace: Workspace = {
        id: 1,
        repo_path: "/Users/test/repo",
        workspace_path: "/Users/test/repo/.treq/workspaces/test-workspace",
        workspace_name: "test-workspace",
        branch_name: "feature-branch",
        target_branch: "main",
        created_at: new Date().toISOString(),
        has_conflicts: true,
      };

      render(
        <ShowWorkspace
          workspace={workspace}
          repositoryPath="/Users/test/repo"
          mainRepoBranch="main"
          initialSelectedFile={null}
        />
      );

      // Wait for the conflict alert to appear
      await waitFor(() => {
        expect(screen.getByText(/conflict detected/i)).toBeInTheDocument();
      });

      expect(screen.getByText(/Some files have conflicts that need to be resolved/i)).toBeInTheDocument();
    });

    it("should clear conflict alert when switching to Code tab after conflicts are resolved", async () => {
      // Setup: Initially return conflicted files
      jjGetConflictedFilesMock.mockResolvedValueOnce([
        "src/components/ChangesDiffViewer.tsx",
      ]);

      const workspace: Workspace = {
        id: 1,
        repo_path: "/Users/test/repo",
        workspace_path: "/Users/test/repo/.treq/workspaces/test-workspace",
        workspace_name: "test-workspace",
        branch_name: "feature-branch",
        target_branch: "main",
        created_at: new Date().toISOString(),
        has_conflicts: true,
      };

      render(
        <ShowWorkspace
          workspace={workspace}
          repositoryPath="/Users/test/repo"
          mainRepoBranch="main"
          initialSelectedFile={null}
        />
      );

      // Wait for initial conflict alert to appear
      await waitFor(() => {
        expect(screen.getByText(/conflict detected/i)).toBeInTheDocument();
      });

      // Simulate conflicts being resolved - mock returns empty array now
      jjGetConflictedFilesMock.mockResolvedValue([]);

      // Switch to Review tab
      const user = userEvent.setup();
      const reviewTab = screen.getByRole("tab", { name: /review/i });
      await user.click(reviewTab);

      // Switch back to Code tab - this should trigger a refresh
      const codeTab = screen.getByRole("tab", { name: /code/i });
      await user.click(codeTab);

      // Wait for the conflict alert to disappear
      await waitFor(() => {
        expect(screen.queryByText(/conflict detected/i)).not.toBeInTheDocument();
      }, { timeout: 3000 });
    });

    it("should refresh conflicts when switching to Code tab", async () => {
      // Start with no conflicts
      jjGetConflictedFilesMock.mockResolvedValue([]);

      const workspace: Workspace = {
        id: 1,
        repo_path: "/Users/test/repo",
        workspace_path: "/Users/test/repo/.treq/workspaces/test-workspace",
        workspace_name: "test-workspace",
        branch_name: "feature-branch",
        target_branch: "main",
        created_at: new Date().toISOString(),
        has_conflicts: false,
      };

      render(
        <ShowWorkspace
          workspace={workspace}
          repositoryPath="/Users/test/repo"
          mainRepoBranch="main"
          initialSelectedFile={null}
        />
      );

      // Verify no conflict alert initially
      await waitFor(() => {
        expect(screen.queryByText(/conflict detected/i)).not.toBeInTheDocument();
      });

      // Switch to Review tab
      const user = userEvent.setup();
      const reviewTab = screen.getByRole("tab", { name: /review/i });
      await user.click(reviewTab);

      // New conflicts appear while in Review tab
      jjGetConflictedFilesMock.mockResolvedValue([
        "src/components/NewFile.tsx",
      ]);

      // Switch back to Code tab - should detect new conflicts
      const codeTab = screen.getByRole("tab", { name: /code/i });
      await user.click(codeTab);

      // Verify jjGetConflictedFiles was called again
      await waitFor(() => {
        // Should be called at least twice: initial load + tab switch
        expect(jjGetConflictedFilesMock).toHaveBeenCalledTimes(2);
      });

      // Conflict alert should now appear
      await waitFor(() => {
        expect(screen.getByText(/conflict detected/i)).toBeInTheDocument();
      });
    });
  });

  describe("Workspace Conflict Indicator Bug", () => {
    it("should call jjGetConflictedFiles on mount with workspace path", async () => {
      const workspace: Workspace = {
        id: 1,
        repo_path: "/Users/test/repo",
        workspace_path: "/Users/test/repo/.treq/workspaces/test-workspace",
        workspace_name: "test-workspace",
        branch_name: "feature-branch",
        target_branch: "main",
        created_at: new Date().toISOString(),
        has_conflicts: false,
      };

      jjGetConflictedFilesMock.mockResolvedValue([]);

      render(
        <ShowWorkspace
          workspace={workspace}
          repositoryPath="/Users/test/repo"
          mainRepoBranch="main"
          initialSelectedFile={null}
        />
      );

      // Wait for API call
      await waitFor(() => {
        expect(jjGetConflictedFilesMock).toHaveBeenCalledWith(
          "/Users/test/repo/.treq/workspaces/test-workspace"
        );
      });
    });

    it("should show conflict indicator in workspace with has_conflicts=true", async () => {
      // Setup: Mock API to return conflicted files
      jjGetConflictedFilesMock.mockResolvedValue([
        "src/components/ChangesDiffViewer.tsx",
      ]);

      const workspace: Workspace = {
        id: 1,
        repo_path: "/Users/test/repo",
        workspace_path: "/Users/test/repo/.treq/workspaces/test-workspace",
        workspace_name: "test-workspace",
        branch_name: "feature-branch",
        target_branch: "main",
        created_at: new Date().toISOString(),
        has_conflicts: true,
      };

      render(
        <ShowWorkspace
          workspace={workspace}
          repositoryPath="/Users/test/repo"
          mainRepoBranch="main"
          initialSelectedFile={null}
        />
      );

      // Wait for the conflict alert to appear
      await waitFor(() => {
        expect(screen.getByText(/conflict detected/i)).toBeInTheDocument();
      });

      expect(screen.getByText(/Some files have conflicts that need to be resolved/i)).toBeInTheDocument();
    });

    it("should update conflict indicator when conflicts are resolved", async () => {
      // Start with conflicts
      const workspace: Workspace = {
        id: 1,
        repo_path: "/Users/test/repo",
        workspace_path: "/Users/test/repo/.treq/workspaces/test-workspace",
        workspace_name: "test-workspace",
        branch_name: "feature-branch",
        target_branch: "main",
        created_at: new Date().toISOString(),
        has_conflicts: true,
      };

      jjGetConflictedFilesMock.mockResolvedValueOnce(["src/file1.tsx"]);

      const { rerender } = render(
        <ShowWorkspace
          workspace={workspace}
          repositoryPath="/Users/test/repo"
          mainRepoBranch="main"
          initialSelectedFile={null}
        />
      );

      // Verify conflict alert shows
      await waitFor(() => {
        expect(screen.getByText(/conflict detected/i)).toBeInTheDocument();
      });

      // Conflicts resolved
      jjGetConflictedFilesMock.mockResolvedValue([]);
      const updatedWorkspace = { ...workspace, has_conflicts: false };

      // Re-render with updated workspace
      rerender(
        <ShowWorkspace
          workspace={updatedWorkspace}
          repositoryPath="/Users/test/repo"
          mainRepoBranch="main"
          initialSelectedFile={null}
        />
      );

      // Switch tabs to trigger refresh
      const user = userEvent.setup();
      const reviewTab = screen.getByRole("tab", { name: /review/i });
      await user.click(reviewTab);

      const codeTab = screen.getByRole("tab", { name: /code/i });
      await user.click(codeTab);

      // Alert should be gone
      await waitFor(() => {
        expect(screen.queryByText(/conflict detected/i)).not.toBeInTheDocument();
      });
    });
  });
});
