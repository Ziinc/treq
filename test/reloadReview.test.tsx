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
    savePendingReview: vi.fn(),
    clearPendingReview: vi.fn(),
    setDiffCache: vi.fn(),
  };
});

describe("Reload review - basic functionality", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.getDiffCache).mockResolvedValue([]);
    vi.mocked(api.savePendingReview).mockResolvedValue();
    vi.mocked(api.clearPendingReview).mockResolvedValue();
    vi.mocked(api.setDiffCache).mockResolvedValue();
  });

  it("should display inline comments on correct lines", async () => {
    // Test that comments are displayed correctly with the hunks
    vi.mocked(api.jjGetChangedFiles).mockResolvedValue([
      { path: "test.txt", status: "M", previous_path: null },
    ]);

    vi.mocked(api.jjGetFileHunks).mockResolvedValue([
      {
        id: "hunk-1",
        header: "@@ -100,3 +100,4 @@",
        lines: [
          " context line 1",
          " context line 2",
          "+new line at 102",
          " context line 3",
        ],
        patch: "...",
      },
    ]);

    // Load with a pre-existing comment
    vi.mocked(api.loadPendingReview).mockResolvedValue([
      {
        id: "comment-1",
        filePath: "test.txt",
        hunkId: "hunk-1",
        startLine: 102,
        endLine: 102,
        lineContent: ["+new line at 102"],
        text: "This needs review",
        createdAt: new Date().toISOString(),
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

    // Wait for file to load
    await waitFor(() => {
      expect(screen.getAllByText(/test\.txt/).length).toBeGreaterThan(0);
    });

    // Expand the file
    const fileElements = screen.getAllByText(/test\.txt/);
    await userEvent.click(fileElements[0]);

    // Wait for comment to appear
    await waitFor(() => {
      expect(screen.getByText("This needs review")).toBeInTheDocument();
    });

    // Verify hunk content is also visible
    expect(screen.getByText(/new line at 102/)).toBeInTheDocument();
  });

  it("should allow adding comments to lines", async () => {
    vi.mocked(api.jjGetChangedFiles).mockResolvedValue([
      { path: "test.txt", status: "M", previous_path: null },
    ]);

    vi.mocked(api.jjGetFileHunks).mockResolvedValue([
      {
        id: "hunk-1",
        header: "@@ -100,3 +100,4 @@",
        lines: [
          " context line 1",
          " context line 2",
          "+new line at 102",
          " context line 3",
        ],
        patch: "...",
      },
    ]);

    vi.mocked(api.loadPendingReview).mockResolvedValue([]);

    render(
      <ChangesDiffViewer
        workspacePath="/test/workspace"
        repoPath="/test/repo"
        workspaceId={1}
        initialSelectedFile={null}
      />
    );

    // Wait for file to load
    await waitFor(() => {
      expect(screen.getAllByText(/test\.txt/).length).toBeGreaterThan(0);
    });

    // Expand the file
    const fileElements = screen.getAllByText(/test\.txt/);
    await userEvent.click(fileElements[0]);

    // Wait for add comment buttons
    await waitFor(() => {
      const buttons = screen.queryAllByRole("button", { name: /add comment/i });
      expect(buttons.length).toBeGreaterThan(0);
    });

    // Click add comment
    const addCommentButtons = screen.getAllByRole("button", { name: /add comment/i });
    await userEvent.click(addCommentButtons[0]);

    // Type comment
    const textarea = screen.getByPlaceholderText(/add a comment/i);
    await userEvent.type(textarea, "New review comment");

    // Submit comment
    const submitButtons = screen.getAllByRole("button", { name: /add comment/i });
    const submitButton = submitButtons.find((btn) => btn.textContent === "Add Comment");
    if (submitButton) await userEvent.click(submitButton);

    // Verify comment appears
    await waitFor(() => {
      expect(screen.getByText("New review comment")).toBeInTheDocument();
    });
  });
});
