import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "./test-utils";
import userEvent from "@testing-library/user-event";
import * as api from "../src/lib/api";
import { ChangesDiffViewer } from "../src/components/ChangesDiffViewer";
import { listen } from "@tauri-apps/api/event";

vi.mock("../src/lib/api", async () => {
  const actual = await vi.importActual("../src/lib/api");
  return {
    ...actual,
    jjGetChangedFiles: vi.fn(),
    jjGetFileHunks: vi.fn(),
    getDiffCache: vi.fn(),
    loadPendingReview: vi.fn(),
    savePendingReview: vi.fn(),
    clearPendingReview: vi.fn(),
    setDiffCache: vi.fn(),
  };
});

vi.mock("@tauri-apps/api/event", async () => {
  const actual = await vi.importActual("@tauri-apps/api/event");
  return {
    ...actual,
    listen: vi.fn(),
  };
});

describe("File change watcher - stale file detection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.getDiffCache).mockResolvedValue([]);
    vi.mocked(api.loadPendingReview).mockResolvedValue([]);
    vi.mocked(api.savePendingReview).mockResolvedValue();
    vi.mocked(api.clearPendingReview).mockResolvedValue();
    vi.mocked(api.setDiffCache).mockResolvedValue();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("should register listener for workspace-files-changed event on mount", async () => {
    const unlistenMock = vi.fn();
    vi.mocked(listen).mockResolvedValue(unlistenMock);

    vi.mocked(api.jjGetChangedFiles).mockResolvedValue([
      { path: "test.txt", status: "M", previous_path: null },
    ]);
    vi.mocked(api.jjGetFileHunks).mockResolvedValue([]);

    render(
      <ChangesDiffViewer
        workspacePath="/test/workspace"
        repoPath="/test/repo"
        workspaceId={1}
        initialSelectedFile={null}
      />
    );

    // Wait for component to mount and register event listener
    await waitFor(() => {
      expect(listen).toHaveBeenCalledWith(
        "workspace-files-changed",
        expect.any(Function)
      );
    });
  });

  it("should cleanup event listener on unmount", async () => {
    const unlistenMock = vi.fn();
    vi.mocked(listen).mockResolvedValue(unlistenMock);

    vi.mocked(api.jjGetChangedFiles).mockResolvedValue([
      { path: "test.txt", status: "M", previous_path: null },
    ]);
    vi.mocked(api.jjGetFileHunks).mockResolvedValue([]);

    const { unmount } = render(
      <ChangesDiffViewer
        workspacePath="/test/workspace"
        repoPath="/test/repo"
        workspaceId={1}
        initialSelectedFile={null}
      />
    );

    await waitFor(() => {
      expect(listen).toHaveBeenCalled();
    });

    unmount();

    await waitFor(() => {
      expect(unlistenMock).toHaveBeenCalled();
    });
  });

  it("should show stale files banner when files change during review mode", async () => {
    let eventCallback: ((event: any) => void) | null = null;

    vi.mocked(listen).mockImplementation(async (event, callback) => {
      if (event === "workspace-files-changed") {
        eventCallback = callback as (event: any) => void;
      }
      return vi.fn();
    });

    // Initial file state
    vi.mocked(api.jjGetChangedFiles).mockResolvedValue([
      { path: "test.txt", status: "M", previous_path: null },
    ]);
    vi.mocked(api.jjGetFileHunks).mockResolvedValue([
      {
        id: "hunk-1",
        header: "@@ -1,2 +1,3 @@",
        lines: [" line 1", "+new line", " line 3"],
        patch: "...",
      },
    ]);

    const user = userEvent.setup();

    render(
      <ChangesDiffViewer
        workspacePath="/test/workspace"
        repoPath="/test/repo"
        workspaceId={1}
        initialSelectedFile={null}
      />
    );

    // Wait for initial load
    await waitFor(() => {
      expect(screen.getAllByText(/test\.txt/).length).toBeGreaterThan(0);
    });

    // Expand file and add a comment to enter review mode
    const fileElements = screen.getAllByText(/test\.txt/);
    await user.click(fileElements[0]);

    // Wait for add comment buttons to appear
    await waitFor(() => {
      const buttons = screen.queryAllByRole("button", { name: /add comment/i });
      expect(buttons.length).toBeGreaterThan(0);
    });

    // Add a comment to enter review mode
    const addCommentButtons = screen.getAllByRole("button", {
      name: /add comment/i,
    });
    if (addCommentButtons[0]) {
      await user.click(addCommentButtons[0]);
      const textarea = screen.getByPlaceholderText(/add a comment/i);
      await user.type(textarea, "Review comment");
    }

    // Simulate file change event from backend
    if (eventCallback) {
      // Update the mock to return different content (simulating file change)
      vi.mocked(api.jjGetChangedFiles).mockResolvedValue([
        { path: "test.txt", status: "M", previous_path: null },
        { path: "new-file.txt", status: "A", previous_path: null },
      ]);

      eventCallback({
        payload: {
          workspace_id: 1,
          changed_paths: ["/test/workspace/test.txt", "/test/workspace/new-file.txt"],
        },
      });

      // The stale banner should appear
      await waitFor(
        () => {
          expect(
            screen.getByText(/changed since you started reviewing/i)
          ).toBeInTheDocument();
        },
        { timeout: 3000 }
      );
    }
  });

  it("should not show stale banner when not in review mode", async () => {
    let eventCallback: ((event: any) => void) | null = null;

    vi.mocked(listen).mockImplementation(async (event, callback) => {
      if (event === "workspace-files-changed") {
        eventCallback = callback as (event: any) => void;
      }
      return vi.fn();
    });

    // Initial file state
    vi.mocked(api.jjGetChangedFiles).mockResolvedValue([
      { path: "test.txt", status: "M", previous_path: null },
    ]);
    vi.mocked(api.jjGetFileHunks).mockResolvedValue([
      {
        id: "hunk-1",
        header: "@@ -1,2 +1,3 @@",
        lines: [" line 1", "+new line", " line 3"],
        patch: "...",
      },
    ]);

    render(
      <ChangesDiffViewer
        workspacePath="/test/workspace"
        repoPath="/test/repo"
        workspaceId={1}
        initialSelectedFile={null}
      />
    );

    // Wait for initial load
    await waitFor(() => {
      expect(screen.getAllByText(/test\.txt/).length).toBeGreaterThan(0);
    });

    // Simulate file change event (without entering review mode)
    if (eventCallback) {
      vi.mocked(api.jjGetChangedFiles).mockResolvedValue([
        { path: "test.txt", status: "M", previous_path: null },
        { path: "new-file.txt", status: "A", previous_path: null },
      ]);

      eventCallback({
        payload: {
          workspace_id: 1,
          changed_paths: ["/test/workspace/new-file.txt"],
        },
      });

      // The stale banner should NOT appear (not in review mode)
      await new Promise((resolve) => setTimeout(resolve, 500));

      expect(
        screen.queryByText(/changed since you started reviewing/i)
      ).not.toBeInTheDocument();
    }
  });
});
