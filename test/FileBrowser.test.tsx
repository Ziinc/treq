import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, waitFor } from "./test-utils";
import { FileBrowser } from "../src/components/FileBrowser";
import * as api from "../src/lib/api";

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

// Mock the API module
vi.mock("../src/lib/api", async () => {
  const actual = await vi.importActual("../src/lib/api");
  return {
    ...actual,
    listDirectory: vi.fn().mockResolvedValue([]),
    listDirectoryCached: vi.fn().mockResolvedValue([]),
    readFile: vi.fn().mockRejectedValue(new Error("File not found")),
    jjGetFileHunks: vi.fn().mockResolvedValue([]),
    jjGetChangedFiles: vi.fn().mockResolvedValue([]),
    ensureWorkspaceIndexed: vi.fn().mockResolvedValue(true),
    getSetting: vi.fn().mockResolvedValue(null),
    getSettingsBatch: vi.fn().mockResolvedValue({}),
  };
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("FileBrowser - Workspace Indexing", () => {
  it("should call ensureWorkspaceIndexed on mount with repoPath", async () => {
    const repoPath = "/Users/test/repo";
    const basePath = "/Users/test/repo";

    render(
      <FileBrowser
        workspace={null}
        repoPath={repoPath}
        initialSelectedFile={null}
        initialExpandedDir={null}
      />
    );

    await waitFor(() => {
      expect(api.ensureWorkspaceIndexed).toHaveBeenCalledWith(
        repoPath,
        null, // workspace_id is null for main repo
        basePath
      );
    });

    expect(api.ensureWorkspaceIndexed).toHaveBeenCalledTimes(1);
  });

  it("should call ensureWorkspaceIndexed with workspace info when workspace is provided", async () => {
    const repoPath = "/Users/test/repo";
    const workspace: api.Workspace = {
      id: 123,
      repo_path: repoPath,
      workspace_name: "test-workspace",
      workspace_path: "/Users/test/repo/.treq/workspaces/test-workspace",
      branch_name: "feature/test",
      created_at: "2024-01-01T00:00:00Z",
    };

    render(
      <FileBrowser
        workspace={workspace}
        repoPath={repoPath}
        initialSelectedFile={null}
        initialExpandedDir={null}
      />
    );

    await waitFor(() => {
      expect(api.ensureWorkspaceIndexed).toHaveBeenCalledWith(
        repoPath,
        123, // workspace_id
        workspace.workspace_path
      );
    });

    expect(api.ensureWorkspaceIndexed).toHaveBeenCalledTimes(1);
  });

  it("should not call ensureWorkspaceIndexed when repoPath is null", async () => {
    render(
      <FileBrowser
        workspace={null}
        repoPath={null}
        initialSelectedFile={null}
        initialExpandedDir={null}
      />
    );

    // Wait a bit to ensure the useEffect runs
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(api.ensureWorkspaceIndexed).not.toHaveBeenCalled();
  });

  it("should call ensureWorkspaceIndexed when repoPath changes", async () => {
    const repoPath1 = "/Users/test/repo1";
    const repoPath2 = "/Users/test/repo2";

    const { rerender } = render(
      <FileBrowser
        workspace={null}
        repoPath={repoPath1}
        initialSelectedFile={null}
        initialExpandedDir={null}
      />
    );

    await waitFor(() => {
      expect(api.ensureWorkspaceIndexed).toHaveBeenCalledWith(
        repoPath1,
        null,
        repoPath1
      );
    });

    // Clear the mock to verify the second call
    vi.mocked(api.ensureWorkspaceIndexed).mockClear();

    // Re-render with new repoPath
    rerender(
      <FileBrowser
        workspace={null}
        repoPath={repoPath2}
        initialSelectedFile={null}
        initialExpandedDir={null}
      />
    );

    await waitFor(() => {
      expect(api.ensureWorkspaceIndexed).toHaveBeenCalledWith(
        repoPath2,
        null,
        repoPath2
      );
    });
  });

  it("should call ensureWorkspaceIndexed when workspace changes", async () => {
    const repoPath = "/Users/test/repo";
    const workspace1: api.Workspace = {
      id: 1,
      repo_path: repoPath,
      workspace_name: "workspace-1",
      workspace_path: "/Users/test/repo/.treq/workspaces/workspace-1",
      branch_name: "feature/1",
      created_at: "2024-01-01T00:00:00Z",
    };
    const workspace2: api.Workspace = {
      id: 2,
      repo_path: repoPath,
      workspace_name: "workspace-2",
      workspace_path: "/Users/test/repo/.treq/workspaces/workspace-2",
      branch_name: "feature/2",
      created_at: "2024-01-02T00:00:00Z",
    };

    const { rerender } = render(
      <FileBrowser
        workspace={workspace1}
        repoPath={repoPath}
        initialSelectedFile={null}
        initialExpandedDir={null}
      />
    );

    await waitFor(() => {
      expect(api.ensureWorkspaceIndexed).toHaveBeenCalledWith(
        repoPath,
        1,
        workspace1.workspace_path
      );
    });

    // Clear the mock to verify the second call
    vi.mocked(api.ensureWorkspaceIndexed).mockClear();

    // Re-render with different workspace
    rerender(
      <FileBrowser
        workspace={workspace2}
        repoPath={repoPath}
        initialSelectedFile={null}
        initialExpandedDir={null}
      />
    );

    await waitFor(() => {
      expect(api.ensureWorkspaceIndexed).toHaveBeenCalledWith(
        repoPath,
        2,
        workspace2.workspace_path
      );
    });
  });

  it("should handle ensureWorkspaceIndexed errors gracefully", async () => {
    const repoPath = "/Users/test/repo";
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    // Mock ensureWorkspaceIndexed to reject
    vi.mocked(api.ensureWorkspaceIndexed).mockRejectedValue(
      new Error("Indexing failed")
    );

    render(
      <FileBrowser
        workspace={null}
        repoPath={repoPath}
        initialSelectedFile={null}
        initialExpandedDir={null}
      />
    );

    await waitFor(() => {
      expect(api.ensureWorkspaceIndexed).toHaveBeenCalled();
    });

    // Should log error to console but not crash
    await waitFor(() => {
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Failed to ensure workspace indexed:",
        expect.any(Error)
      );
    });

    consoleErrorSpy.mockRestore();
  });
});
