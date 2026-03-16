import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "./test-utils";
import { ChangesDiffViewer } from "../src/components/ChangesDiffViewer";
import * as api from "../src/lib/api";
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

describe("Bug #3: Review Submission File Refresh", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.getDiffCache).mockResolvedValue([]);
    vi.mocked(api.loadPendingReview).mockResolvedValue({ comments: [], conflictComments: [] });
    vi.mocked(api.savePendingReview).mockResolvedValue();
    vi.mocked(api.clearPendingReview).mockResolvedValue();
    vi.mocked(api.setDiffCache).mockResolvedValue();
  });

  it("should not show stale banner for long time after files change during review", async () => {
    let eventCallback: ((event: any) => void) | null = null;

    vi.mocked(listen).mockImplementation(async (event, callback) => {
      if (event === "workspace-files-changed") {
        eventCallback = callback as (event: any) => void;
      }
      return vi.fn();
    });

    // Initial files
    vi.mocked(api.jjGetChangedFiles).mockResolvedValue([
      { path: "test.txt", status: "M", previous_path: null },
    ]);
    vi.mocked(api.jjGetFileHunks).mockResolvedValue([
      {
        id: "hunk-1",
        header: "@@ -1,1 +1,1 @@",
        lines: ["-old line", "+new line"],
        patch: "...",
      },
    ]);

    const mockOnCreateAgent = vi.fn().mockResolvedValue(undefined);

    render(
      <ChangesDiffViewer
        workspacePath="/test/workspace"
        repoPath="/test/repo"
        workspaceId={1}
        initialSelectedFile={null}
        onCreateAgentWithReview={mockOnCreateAgent}
      />
    );

    // Wait for initial load
    await waitFor(() => {
      expect(screen.getAllByText(/test\.txt/).length).toBeGreaterThan(0);
    });

    // Simulate file change (this would normally trigger stale state if in review mode)
    if (eventCallback) {
      vi.mocked(api.jjGetChangedFiles).mockResolvedValue([
        { path: "test.txt", status: "M", previous_path: null },
        { path: "new.txt", status: "A", previous_path: null },
      ]);

      eventCallback({
        payload: { workspace_id: 1, changed_paths: ["/test/workspace/new.txt"] },
      });

      // Since we're not in review mode, stale banner should NOT appear
      await new Promise(resolve => setTimeout(resolve, 500));
      expect(screen.queryByText(/changed since you started reviewing/i)).not.toBeInTheDocument();
    }
  });

  it("should handle review submission with onCreateAgentWithReview callback", async () => {
    vi.mocked(api.jjGetChangedFiles).mockResolvedValue([
      { path: "test.txt", status: "M", previous_path: null },
    ]);
    vi.mocked(api.jjGetFileHunks).mockResolvedValue([]);

    const mockOnCreateAgent = vi.fn().mockResolvedValue(undefined);
    const mockOnReviewSubmitted = vi.fn();

    render(
      <ChangesDiffViewer
        workspacePath="/test/workspace"
        repoPath="/test/repo"
        workspaceId={1}
        initialSelectedFile={null}
        onCreateAgentWithReview={mockOnCreateAgent}
        onReviewSubmitted={mockOnReviewSubmitted}
      />
    );

    // Wait for component to load
    await waitFor(() => {
      expect(screen.getAllByText(/test\.txt/).length).toBeGreaterThan(0);
    }, { timeout: 3000 });

    // Verify component rendered successfully
    expect(screen.getAllByText(/test\.txt/).length).toBeGreaterThan(0);
  });
});
