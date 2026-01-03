import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "./test-utils";
import userEvent from "@testing-library/user-event";
import * as api from "../src/lib/api";
import { ChangesDiffViewer } from "../src/components/ChangesDiffViewer";

vi.mock("../src/lib/api", async () => {
  const actual = await vi.importActual("../src/lib/api");
  return {
    ...actual,
    jjGetChangedFiles: vi.fn(),
    jjGetFileHunks: vi.fn(),
    getDiffCache: vi.fn(),
    loadPendingReview: vi.fn(),
    clearPendingReview: vi.fn(),
  };
});

describe("Outdated comments display", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.getDiffCache).mockResolvedValue([]);
    vi.mocked(api.loadPendingReview).mockResolvedValue([]);
    vi.mocked(api.clearPendingReview).mockResolvedValue();
  });

  it("should display outdated comments at top of file when hunk no longer exists", async () => {
    // Scenario: User had previously added a comment on hunk-1
    // After page reload, the file has changed and now only has hunk-2
    // The comment should be displayed as outdated at the top of the file

    vi.mocked(api.jjGetChangedFiles).mockResolvedValue([
      { path: "test.txt", status: "M", previous_path: null },
    ]);

    // Mock loadPendingReview to return a comment that references hunk-1
    vi.mocked(api.loadPendingReview).mockResolvedValue([
      {
        id: "comment-1",
        filePath: "test.txt",
        hunkId: "hunk-1", // This hunk no longer exists
        startLine: 102,
        endLine: 102,
        lineContent: ["+new line at 102"],
        text: "This line needs work",
        createdAt: new Date().toISOString(),
      },
    ]);

    // File only has hunk-2 (hunk-1 was removed due to file changes)
    vi.mocked(api.jjGetFileHunks).mockResolvedValue([
      {
        id: "hunk-2",
        header: "@@ -100,2 +100,2 @@",
        lines: [
          " context line 1",
          " different content now",
        ],
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

    // Wait for file list to load
    await waitFor(() => {
      expect(screen.getAllByText(/test\.txt/).length).toBeGreaterThan(0);
    });

    // Click to expand the file
    const fileElements = screen.getAllByText(/test\.txt/);
    await userEvent.click(fileElements[0]);

    // Wait for either hunk content or outdated comment to appear
    await waitFor(
      () => {
        const hunkContent = screen.queryByText(/different content now/);
        const outdatedLabel = screen.queryByText(/outdated/i);
        expect(hunkContent || outdatedLabel).toBeTruthy();
      },
      { timeout: 5000 }
    );

    // Verify outdated comment appears at top of file
    expect(screen.getByText(/outdated/i)).toBeInTheDocument();
    expect(screen.getByText("This line needs work")).toBeInTheDocument();
    expect(screen.getByText(/new line at 102/)).toBeInTheDocument();
    expect(screen.getByText("Line 102")).toBeInTheDocument();

    // Verify hunk content is also present
    expect(screen.getByText(/different content now/)).toBeInTheDocument();
  });
});
