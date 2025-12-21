import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "./test-utils";
import userEvent from "@testing-library/user-event";
import { Dashboard } from "../src/components/Dashboard";
import * as api from "../src/lib/api";
import React from "react";

// Mock Tauri APIs
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
  emit: vi.fn(),
}));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: vi.fn().mockReturnValue({
    setTitle: vi.fn(),
    onFocusChanged: vi.fn().mockResolvedValue(() => {}),
  }),
  WebviewWindow: vi.fn(),
}));

// Mock the API module and set default return values
vi.mock("../src/lib/api", async () => {
  const actual = await vi.importActual("../src/lib/api");
  return {
    ...actual,
    getSetting: vi.fn().mockResolvedValue("/Users/test/repo"),
    getRepoSetting: vi.fn().mockResolvedValue(null),
    setRepoSetting: vi.fn().mockResolvedValue(undefined),
    isGitRepository: vi.fn().mockResolvedValue(true),
    gitGetCurrentBranch: vi.fn().mockResolvedValue("main"),
    gitGetStatus: vi.fn().mockResolvedValue({
      modified: 0,
      added: 0,
      deleted: 0,
      untracked: 0,
      conflicted: 0,
    }),
    gitGetBranchInfo: vi.fn().mockResolvedValue({
      name: "main",
      ahead: 0,
      behind: 0,
      upstream: undefined,
    }),
    gitGetLineDiffStats: vi.fn().mockResolvedValue({
      lines_added: 0,
      lines_deleted: 0,
    }),
    gitGetChangedFiles: vi.fn().mockResolvedValue([]),
    gitGetBranchDivergence: vi.fn().mockResolvedValue({
      ahead: 0,
      behind: 0,
    }),
    getWorkspaces: vi.fn().mockResolvedValue([]),
    getSessions: vi.fn().mockResolvedValue([]),
    rebuildWorkspaces: vi.fn().mockResolvedValue([]),
    createSession: vi.fn().mockResolvedValue(99),
    updateSessionAccess: vi.fn().mockResolvedValue(undefined),
    setSessionModel: vi.fn().mockResolvedValue(undefined),
    listDirectory: vi.fn().mockResolvedValue([]),
    readFile: vi.fn().mockRejectedValue(new Error("README.md not found")),
    preloadWorkspaceGitData: vi.fn().mockResolvedValue(undefined),
    invalidateGitCache: vi.fn().mockResolvedValue(undefined),
    jjGetDefaultBranch: vi.fn().mockResolvedValue("main"),
    jjGetBranches: vi.fn().mockResolvedValue([
      { name: "main", is_current: true },
      { name: "develop", is_current: false },
    ]),
    jjGetChangedFiles: vi.fn().mockResolvedValue([]),
    jjGetConflictedFiles: vi.fn().mockResolvedValue([]),
    jjGetFileHunks: vi.fn().mockResolvedValue([]),
    jjSetWorkspaceTarget: vi.fn().mockResolvedValue(undefined),
    setWorkspaceTargetBranch: vi.fn().mockResolvedValue({ success: true }),
    jjResolveConflict: vi.fn().mockResolvedValue(undefined),
    setSetting: vi.fn().mockResolvedValue(undefined),
    getDiffCache: vi.fn().mockResolvedValue(null),
    setDiffCache: vi.fn().mockResolvedValue(undefined),
    markFileViewed: vi.fn().mockResolvedValue(undefined),
    unmarkFileViewed: vi.fn().mockResolvedValue(undefined),
    getViewedFiles: vi.fn().mockResolvedValue([]),
    ptyCreateSession: vi.fn().mockResolvedValue(undefined),
    ptyWrite: vi.fn().mockResolvedValue(undefined),
  };
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Header Bar", () => {
  describe("Workspace target", () => {
    beforeEach(() => {
      vi.mocked(api.listDirectory).mockResolvedValue([
        { name: "README.md", path: "/Users/test/repo/README.md", is_directory: false },
      ]);
      vi.mocked(api.readFile).mockResolvedValue("# Test Repo");
    });

    it("homerepo should not show workspace target", async () => {
      vi.mocked(api.getWorkspaces).mockResolvedValue([]);

      render(<Dashboard />);

      await screen.findByText("Overview");

      // Should not show workspace target input in main repo view
      expect(screen.queryByLabelText(/workspace target/i)).not.toBeInTheDocument();
      expect(screen.queryByLabelText(/target/i)).not.toBeInTheDocument();
    });

    it("workspace repo should show workspace target", async () => {
      const mockWorkspace = {
        id: 1,
        workspace_name: "feature-workspace",
        branch_name: "feature-workspace",
        workspace_path: "/Users/test/repo/.treq/workspaces/feature-workspace",
        repo_path: "/Users/test/repo",
        target_branch: "main",
        created_at: new Date().toISOString(),
      };

      vi.mocked(api.getWorkspaces).mockResolvedValue([mockWorkspace]);
      vi.mocked(api.jjGetDefaultBranch).mockResolvedValue("main");

      const user = userEvent.setup();
      render(<Dashboard />);

      await screen.findByText("Overview");

      // Click on the workspace in the sidebar to open it
      const workspaceButton = await screen.findByText("feature-workspace");
      await user.click(workspaceButton);

      // Workspace target should be visible
      await screen.findByLabelText(/workspace target/i);
      const targetSelect = await screen.findByLabelText(/workspace target/i);
      expect(targetSelect).toHaveTextContent("main");
    });

    it("clicking on workspace target shows branch selector", async () => {
      const mockWorkspace = {
        id: 1,
        workspace_name: "feature-workspace",
        branch_name: "feature-workspace",
        workspace_path: "/Users/test/repo/.treq/workspaces/feature-workspace",
        repo_path: "/Users/test/repo",
        target_branch: "main",
        created_at: new Date().toISOString(),
      };

      vi.mocked(api.getWorkspaces).mockResolvedValue([mockWorkspace]);
      vi.mocked(api.jjGetDefaultBranch).mockResolvedValue("main");

      const user = userEvent.setup();
      render(<Dashboard />);

      await screen.findByText("Overview");

      const workspaceButton = await screen.findByText("feature-workspace");
      await user.click(workspaceButton);

      const targetSelect = await screen.findByLabelText(/workspace target/i);
      await user.click(targetSelect);

      // Should show list of available branches
      await screen.findByRole("menuitem", { name: /main/i });
    });

    it("selecting a different branch sets workspace target", async () => {
      const mockWorkspace = {
        id: 1,
        workspace_name: "feature-workspace",
        branch_name: "feature-workspace",
        workspace_path: "/Users/test/repo/.treq/workspaces/feature-workspace",
        repo_path: "/Users/test/repo",
        target_branch: "main",
        created_at: new Date().toISOString(),
      };

      vi.mocked(api.getWorkspaces).mockResolvedValue([mockWorkspace]);
      vi.mocked(api.jjGetDefaultBranch).mockResolvedValue("main");

      const user = userEvent.setup();
      render(<Dashboard />);

      await screen.findByText("Overview");

      const workspaceButton = await screen.findByText("feature-workspace");
      await user.click(workspaceButton);

      const targetSelect = await screen.findByLabelText(/workspace target/i);
      await user.click(targetSelect);

      const developBranch = await screen.findByRole("menuitem", { name: /develop/i });
      await user.click(developBranch);

      // Should call the API to set workspace target
      await waitFor(() => {
        expect(api.setWorkspaceTargetBranch).toHaveBeenCalledWith(
          mockWorkspace.repo_path,
          mockWorkspace.workspace_path,
          mockWorkspace.id,
          "develop"
        );
      });
    });
  });
});

describe("Overview section", () => {
  describe("conflicts warning", () => {
    beforeEach(() => {
      vi.mocked(api.listDirectory).mockResolvedValue([
        { name: "src", path: "/Users/test/repo/.treq/workspaces/conflict-workspace/src", is_directory: true },
      ]);
    });

    it("if there are conflicts, show warning alert", async () => {
      const mockWorkspace = {
        id: 1,
        workspace_name: "conflict-workspace",
        branch_name: "conflict-workspace",
        workspace_path: "/Users/test/repo/.treq/workspaces/conflict-workspace",
        repo_path: "/Users/test/repo",
        target_branch: "main",
        created_at: new Date().toISOString(),
      };

      vi.mocked(api.getWorkspaces).mockResolvedValue([mockWorkspace]);
      vi.mocked(api.jjGetConflictedFiles).mockResolvedValue([
        "src/app.ts",
      ]);

      const user = userEvent.setup();
      render(<Dashboard />);

      await screen.findByText("Overview");

      const workspaceButton = await screen.findByText("conflict-workspace");
      await user.click(workspaceButton);

      // Should show conflicts warning alert in Overview tab
      await screen.findByRole("alert");
      const conflictAlert = await screen.findByRole("alert");
      expect(conflictAlert).toHaveTextContent(/conflict/i);
    });

    it("clicking conflict alert CTA navigates to Changes section", async () => {
      const mockWorkspace = {
        id: 1,
        workspace_name: "conflict-workspace",
        branch_name: "conflict-workspace",
        workspace_path: "/Users/test/repo/.treq/workspaces/conflict-workspace",
        repo_path: "/Users/test/repo",
        target_branch: "main",
        created_at: new Date().toISOString(),
      };

      vi.mocked(api.getWorkspaces).mockResolvedValue([mockWorkspace]);
      vi.mocked(api.jjGetConflictedFiles).mockResolvedValue([
        "src/app.ts",
      ]);

      const user = userEvent.setup();
      render(<Dashboard />);

      await screen.findByText("Overview");

      const workspaceButton = await screen.findByText("conflict-workspace");
      await user.click(workspaceButton);

      const ctaButton = await screen.findByRole("button", { name: /view conflicts|resolve conflicts/i });
      await user.click(ctaButton);

      // Should navigate to Changes tab
      const changesTab = await screen.findByRole("tab", { name: /changes/i });
      expect(changesTab).toHaveAttribute("aria-selected", "true");
    });
  });

  describe("files list limit", () => {
    const mockWorkspace = {
      id: 1,
      workspace_name: "test-workspace",
      branch_name: "test-workspace",
      workspace_path: "/Users/test/repo/.treq/workspaces/test-workspace",
      repo_path: "/Users/test/repo",
      target_branch: "main",
      created_at: new Date().toISOString(),
    };

    it("shows at most 10 entries with 'Show more' row when there are more than 10", async () => {
      // Generate 15 mock entries
      const manyEntries = Array.from({ length: 15 }, (_, i) => ({
        name: `file-${i + 1}.ts`,
        path: `/Users/test/repo/.treq/workspaces/test-workspace/file-${i + 1}.ts`,
        is_directory: i < 3, // First 3 are directories
      }));

      vi.mocked(api.getWorkspaces).mockResolvedValue([mockWorkspace]);
      vi.mocked(api.listDirectory).mockResolvedValue(manyEntries);
      vi.mocked(api.readFile).mockResolvedValue("# Test");

      const user = userEvent.setup();
      render(<Dashboard />);

      await screen.findByText("Overview");

      const workspaceButton = await screen.findByText("test-workspace");
      await user.click(workspaceButton);

      // Wait for files to load
      await screen.findByText("file-1.ts");

      // Should show first 10 entries
      expect(screen.getByText("file-1.ts")).toBeInTheDocument();
      expect(screen.getByText("file-10.ts")).toBeInTheDocument();

      // Should NOT show 11th-15th entries
      expect(screen.queryByText("file-11.ts")).not.toBeInTheDocument();
      expect(screen.queryByText("file-15.ts")).not.toBeInTheDocument();

      // Should show "Show more" row with count
      const showMoreButton = await screen.findByText(/Show 5 more/i);
      expect(showMoreButton).toBeInTheDocument();
    });

    it("clicking 'Show more' expands to show all entries", async () => {
      // Generate 15 mock entries
      const manyEntries = Array.from({ length: 15 }, (_, i) => ({
        name: `file-${i + 1}.ts`,
        path: `/Users/test/repo/.treq/workspaces/test-workspace/file-${i + 1}.ts`,
        is_directory: i < 3,
      }));

      vi.mocked(api.getWorkspaces).mockResolvedValue([mockWorkspace]);
      vi.mocked(api.listDirectory).mockResolvedValue(manyEntries);
      vi.mocked(api.readFile).mockResolvedValue("# Test");

      const user = userEvent.setup();
      render(<Dashboard />);

      await screen.findByText("Overview");

      const workspaceButton = await screen.findByText("test-workspace");
      await user.click(workspaceButton);

      // Wait for files to load
      await screen.findByText("file-1.ts");

      // Click "Show more"
      const showMoreButton = await screen.findByText(/Show 5 more/i);
      await user.click(showMoreButton);

      // Now all 15 entries should be visible
      await waitFor(() => {
        expect(screen.getByText("file-11.ts")).toBeInTheDocument();
        expect(screen.getByText("file-15.ts")).toBeInTheDocument();
      });

      // "Show more" button should no longer be visible
      expect(screen.queryByText(/Show 5 more/i)).not.toBeInTheDocument();
    });

    it("does not show 'Show more' row when entries <= 10", async () => {
      // Generate 8 mock entries
      const fewEntries = Array.from({ length: 8 }, (_, i) => ({
        name: `file-${i + 1}.ts`,
        path: `/Users/test/repo/.treq/workspaces/test-workspace/file-${i + 1}.ts`,
        is_directory: i < 2,
      }));

      vi.mocked(api.getWorkspaces).mockResolvedValue([mockWorkspace]);
      vi.mocked(api.listDirectory).mockResolvedValue(fewEntries);
      vi.mocked(api.readFile).mockResolvedValue("# Test");

      const user = userEvent.setup();
      render(<Dashboard />);

      await screen.findByText("Overview");

      const workspaceButton = await screen.findByText("test-workspace");
      await user.click(workspaceButton);

      // Wait for files to load
      await screen.findByText("file-1.ts");

      // All 8 entries should be visible
      expect(screen.getByText("file-1.ts")).toBeInTheDocument();
      expect(screen.getByText("file-8.ts")).toBeInTheDocument();

      // Should NOT show "Show more" button
      expect(screen.queryByText(/more/i)).not.toBeInTheDocument();
    });
  });
});

describe("Changes section", () => {
  describe("conflicts section", () => {
    beforeEach(() => {
      vi.mocked(api.listDirectory).mockResolvedValue([
        { name: "src", path: "/Users/test/repo/.treq/workspaces/conflict-workspace/src", is_directory: true },
      ]);
    });

    it("when no conflicts, should not show conflicts section", async () => {
      const mockWorkspace = {
        id: 1,
        workspace_name: "conflict-workspace",
        branch_name: "conflict-workspace",
        workspace_path: "/Users/test/repo/.treq/workspaces/conflict-workspace",
        repo_path: "/Users/test/repo",
        target_branch: "main",
        created_at: new Date().toISOString(),
      };

      vi.mocked(api.getWorkspaces).mockResolvedValue([mockWorkspace]);
      vi.mocked(api.jjGetConflictedFiles).mockResolvedValue([]);

      const user = userEvent.setup();
      render(<Dashboard />);

      await screen.findByText("Overview");
      const workspaceButton = await screen.findByText("conflict-workspace");
      await user.click(workspaceButton);

      const changesTab = await screen.findByRole("tab", { name: /changes/i });
      await user.click(changesTab);

      // Should not show conflicts section
      expect(screen.queryByText(/Conflicts/)).not.toBeInTheDocument();
    });

    it("should show conflicts section", async () => {
      const mockWorkspace = {
        id: 1,
        workspace_name: "conflict-workspace",
        branch_name: "conflict-workspace",
        workspace_path: "/Users/test/repo/.treq/workspaces/conflict-workspace",
        repo_path: "/Users/test/repo",
        target_branch: "main",
        created_at: new Date().toISOString(),
      };

      vi.mocked(api.getWorkspaces).mockResolvedValue([mockWorkspace]);
      vi.mocked(api.jjGetConflictedFiles).mockResolvedValue([
        "src/app.ts",
      ]);

      const user = userEvent.setup();
      render(<Dashboard />);

      await screen.findByText("Overview");
      const workspaceButton = await screen.findByText("conflict-workspace");
      await user.click(workspaceButton);

      const changesTab = await screen.findByRole("tab", { name: /changes/i });
      await user.click(changesTab);

      // Should show conflicts section
      await screen.findByText(/Conflicts/);
    });

    it("conflicts section shows conflicting files", async () => {
      const mockWorkspace = {
        id: 1,
        workspace_name: "conflict-workspace",
        branch_name: "conflict-workspace",
        workspace_path: "/Users/test/repo/.treq/workspaces/conflict-workspace",
        repo_path: "/Users/test/repo",
        target_branch: "main",
        created_at: new Date().toISOString(),
      };

      vi.mocked(api.getWorkspaces).mockResolvedValue([mockWorkspace]);
      vi.mocked(api.jjGetConflictedFiles).mockResolvedValue([
        "src/app.ts",
      ]);

      const user = userEvent.setup();
      render(<Dashboard />);

      await screen.findByText("Overview");
      const workspaceButton = await screen.findByText("conflict-workspace");
      await user.click(workspaceButton);

      const changesTab = await screen.findByRole("tab", { name: /changes/i });
      await user.click(changesTab);

      // Should show the conflicting file
      await screen.findByText(/src\/app\.ts/i);
    });

    it("clicking conflicting file opens conflict resolution editor", async () => {
      const mockWorkspace = {
        id: 1,
        workspace_name: "conflict-workspace",
        branch_name: "conflict-workspace",
        workspace_path: "/Users/test/repo/.treq/workspaces/conflict-workspace",
        repo_path: "/Users/test/repo",
        target_branch: "main",
        created_at: new Date().toISOString(),
      };

      const conflictContent = `<<<<<<< Conflict 1 of 1
%%%%%%% Changes from base to side #1
-const value = "base";
+const value = "version1";
+++++++ Contents of side #2
const value = "version2";
>>>>>>> Conflict 1 of 1 ends`;

      vi.mocked(api.getWorkspaces).mockResolvedValue([mockWorkspace]);
      vi.mocked(api.jjGetConflictedFiles).mockResolvedValue([
        "src/app.ts",
      ]);
      vi.mocked(api.readFile).mockResolvedValue(conflictContent);

      const user = userEvent.setup();
      render(<Dashboard />);

      await screen.findByText("Overview");
      const workspaceButton = await screen.findByText("conflict-workspace");
      await user.click(workspaceButton);

      const changesTab = await screen.findByRole("tab", { name: /changes/i });
      await user.click(changesTab);

      const conflictFile = await screen.findByText(/src\/app\.ts/i);
      await user.click(conflictFile);

      // Should show conflict resolution UI with editor
      await screen.findByRole("textbox");
      await screen.findByRole("button", { name: /resolve/i });
    });
  });

  describe("changes section", () => {
    beforeEach(() => {
      vi.mocked(api.listDirectory).mockResolvedValue([
        { name: "src", path: "/Users/test/repo/.treq/workspaces/feature-workspace/src", is_directory: true },
      ]);
    });

    it("should show changes section", async () => {
      const mockWorkspace = {
        id: 1,
        workspace_name: "feature-workspace",
        branch_name: "feature-workspace",
        workspace_path: "/Users/test/repo/.treq/workspaces/feature-workspace",
        repo_path: "/Users/test/repo",
        target_branch: "main",
        created_at: new Date().toISOString(),
      };

      vi.mocked(api.getWorkspaces).mockResolvedValue([mockWorkspace]);
      vi.mocked(api.jjGetChangedFiles).mockResolvedValue([
        { path: "src/components/App.tsx", status: "modified" },
      ]);

      const user = userEvent.setup();
      render(<Dashboard />);

      await screen.findByText("Overview");
      const workspaceButton = await screen.findByText("feature-workspace");
      await user.click(workspaceButton);

      const changesTab = await screen.findByRole("tab", { name: /changes/i });
      await user.click(changesTab);

      // Should show changes section with the file
      await screen.findByText(/src\/components\/App\.tsx/i);
    });

    it("shows changed files with directory path without trailing slash", async () => {
      const mockWorkspace = {
        id: 1,
        workspace_name: "feature-workspace",
        branch_name: "feature-workspace",
        workspace_path: "/Users/test/repo/.treq/workspaces/feature-workspace",
        repo_path: "/Users/test/repo",
        target_branch: "main",
        created_at: new Date().toISOString(),
      };

      vi.mocked(api.getWorkspaces).mockResolvedValue([mockWorkspace]);
      vi.mocked(api.jjGetChangedFiles).mockResolvedValue([
        { path: "src/components/App.tsx", status: "modified" },
      ]);

      const user = userEvent.setup();
      render(<Dashboard />);

      await screen.findByText("Overview");
      const workspaceButton = await screen.findByText("feature-workspace");
      await user.click(workspaceButton);

      const changesTab = await screen.findByRole("tab", { name: /changes/i });
      await user.click(changesTab);

      // File should show with directory path (no trailing slash)
      const fileItem = await screen.findByText(/src\/components\/App\.tsx/i);
      expect(fileItem).toBeInTheDocument();
      expect(fileItem.textContent).not.toMatch(/\/$/);
    });

    it("shows diff with line numbers", async () => {
      const mockWorkspace = {
        id: 1,
        workspace_name: "feature-workspace",
        branch_name: "feature-workspace",
        workspace_path: "/Users/test/repo/.treq/workspaces/feature-workspace",
        repo_path: "/Users/test/repo",
        target_branch: "main",
        created_at: new Date().toISOString(),
      };

      vi.mocked(api.getWorkspaces).mockResolvedValue([mockWorkspace]);
      vi.mocked(api.jjGetChangedFiles).mockResolvedValue([
        { path: "src/App.tsx", status: "modified" },
      ]);
      vi.mocked(api.jjGetFileHunks).mockResolvedValue([
        {
          id: "hunk-1",
          header: "@@ -103,3 +103,3 @@",
          lines: ["-old line 103", "+new line 103"],
          patch: "@@ -103,3 +103,3 @@\n-old line 103\n+new line 103",
        },
      ]);

      const user = userEvent.setup();
      render(<Dashboard />);

      await screen.findByText("Overview");
      const workspaceButton = await screen.findByText("feature-workspace");
      await user.click(workspaceButton);

      const changesTab = await screen.findByRole("tab", { name: /changes/i });
      await user.click(changesTab);

      // Wait for file to appear and diffs to load
      await screen.findByText(/src\/App\.tsx/i);

      // Wait for diff content to appear
      await waitFor(
        () => {
          expect(screen.queryByText(/new line/i)).toBeInTheDocument();
        },
        { timeout: 3000 }
      );

      expect(screen.getByText('103')).toBeInTheDocument();
    });

    it("can collapse file diff by clicking caret", async () => {
      const mockWorkspace = {
        id: 1,
        workspace_name: "feature-workspace",
        branch_name: "feature-workspace",
        workspace_path: "/Users/test/repo/.treq/workspaces/feature-workspace",
        repo_path: "/Users/test/repo",
        target_branch: "main",
        created_at: new Date().toISOString(),
      };

      vi.mocked(api.getWorkspaces).mockResolvedValue([mockWorkspace]);
      vi.mocked(api.jjGetChangedFiles).mockResolvedValue([
        { path: "src/App.tsx", status: "modified" },
      ]);
      vi.mocked(api.jjGetFileHunks).mockResolvedValue([
        {
          id: "hunk-1",
          header: "@@ -1,3 +1,3 @@",
          lines: ["-old line", "+new line"],
          patch: "@@ -1,3 +1,3 @@\n-old line\n+new line",
        },
      ]);

      const user = userEvent.setup();
      render(<Dashboard />);

      await screen.findByText("Overview");
      const workspaceButton = await screen.findByText("feature-workspace");
      await user.click(workspaceButton);

      const changesTab = await screen.findByRole("tab", { name: /changes/i });
      await user.click(changesTab);

      const fileItem = await screen.findByText(/src\/App\.tsx/i);
      await user.click(fileItem);

      // Initially expanded
      const newLine = await screen.findByText(/new line/i);

      const caretButton = await screen.findByRole("button", { name: /collapse file diff/i });
      await user.click(caretButton);

      // Should collapse
      await waitFor(() => {
        expect(newLine).not.toBeVisible();
      });

      await user.click(caretButton);

      // Should expand
      await waitFor(() => {
        expect(newLine).toBeVisible();
      });
    });

    it("can collapse file diff by checking viewed checkbox", async () => {
      const mockWorkspace = {
        id: 1,
        workspace_name: "feature-workspace",
        branch_name: "feature-workspace",
        workspace_path: "/Users/test/repo/.treq/workspaces/feature-workspace",
        repo_path: "/Users/test/repo",
        target_branch: "main",
        created_at: new Date().toISOString(),
      };

      vi.mocked(api.getWorkspaces).mockResolvedValue([mockWorkspace]);
      vi.mocked(api.jjGetChangedFiles).mockResolvedValue([
        { path: "src/App.tsx", status: "modified" },
      ]);
      vi.mocked(api.jjGetFileHunks).mockResolvedValue([
        {
          id: "hunk-1",
          header: "@@ -1,3 +1,3 @@",
          lines: ["-old line", "+new line"],
          patch: "@@ -1,3 +1,3 @@\n-old line\n+new line",
        },
      ]);

      const user = userEvent.setup();
      render(<Dashboard />);

      await screen.findByText("Overview");
      const workspaceButton = await screen.findByText("feature-workspace");
      await user.click(workspaceButton);

      const changesTab = await screen.findByRole("tab", { name: /changes/i });
      await user.click(changesTab);

      // Wait for the file to appear
      await screen.findByText(/src\/App\.tsx/i);

      const line = await screen.findByText(/new line/i);
      const viewedCheckbox = await screen.findByRole("checkbox", { name: /viewed/i });
      expect(viewedCheckbox).not.toBeChecked();

      await user.click(viewedCheckbox);

      // Should collapse
      await waitFor(() => {
        expect(line).not.toBeVisible();
      });
    });
  });
});

describe("FileBrowser comments", () => {
  beforeEach(() => {
    vi.mocked(api.listDirectory).mockResolvedValue([
      { name: "app.ts", path: "/Users/test/repo/.treq/workspaces/feature-workspace/app.ts", is_directory: false },
    ]);
    vi.mocked(api.readFile).mockResolvedValue("const x = 1;\nconst y = 2;\nconst z = 3;");
    vi.mocked(api.jjGetFileHunks).mockResolvedValue([]);
  });

  it("should create new agent and send comment when submitting", async () => {
    const mockWorkspace = {
      id: 1,
      workspace_name: "feature-workspace",
      branch_name: "feature-workspace",
      workspace_path: "/Users/test/repo/.treq/workspaces/feature-workspace",
      repo_path: "/Users/test/repo",
      target_branch: "main",
      created_at: new Date().toISOString(),
    };

    vi.mocked(api.getWorkspaces).mockResolvedValue([mockWorkspace]);

    const user = userEvent.setup();
    render(<Dashboard />);

    await screen.findByText("Overview");
    const workspaceButton = await screen.findByText("feature-workspace");
    await user.click(workspaceButton);

    // Navigate to Files tab
    const filesTab = await screen.findByRole("tab", { name: /files/i });
    await user.click(filesTab);

    // Wait for file browser and file to load
    await screen.findByTestId("file-browser");

    // Find and click the + button to add comment (hover over line)
    const addCommentButton = await screen.findByTitle("Add comment");
    await user.click(addCommentButton);

    // Type comment in textarea
    const textarea = await screen.findByPlaceholderText(/describe what you want to change/i);
    await user.type(textarea, "Fix this line please");

    // Submit comment
    const submitButton = await screen.findByRole("button", { name: /add to edit/i });
    await user.click(submitButton);

    // Verify a NEW session was created
    await waitFor(() => {
      expect(api.createSession).toHaveBeenCalled();
    });

    // Verify ptyWrite was called to send the comment
    await waitFor(() => {
      expect(api.ptyWrite).toHaveBeenCalled();
    });
  });
});
