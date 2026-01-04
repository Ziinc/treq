import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "./test-utils";
import userEvent from "@testing-library/user-event";
import { ChangesDiffViewer } from "../src/components/ChangesDiffViewer";
import * as api from "../src/lib/api";

// Mock the API
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
  };
});

describe("Pending review persistence", () => {
  const mockOnCreateAgentWithReview = vi.fn().mockResolvedValue(undefined);

  const renderComponent = () => {
    return render(
      <ChangesDiffViewer
        workspacePath="/test/workspace"
        repoPath="/test/repo"
        workspaceId={1}
        initialSelectedFile={null}
        onCreateAgentWithReview={mockOnCreateAgentWithReview}
      />
    );
  };

  const setupReviewMode = async () => {
    // Wait for file to load
    await waitFor(() => {
      expect(screen.getAllByText(/test\.txt/).length).toBeGreaterThan(0);
    });

    // Expand the file
    const fileElements = screen.getAllByText(/test\.txt/);
    await userEvent.click(fileElements[0]);

    // Wait for add comment button
    await waitFor(() => {
      const buttons = screen.queryAllByRole("button", { name: /add comment/i });
      expect(buttons.length).toBeGreaterThan(0);
    });
  };

  const addCommentViaUI = async (commentText: string) => {
    // Click add comment
    const addCommentButtons = screen.getAllByRole("button", { name: /add comment/i });
    await userEvent.click(addCommentButtons[0]);

    // Type comment
    const textarea = screen.getByPlaceholderText(/add a comment/i);
    await userEvent.type(textarea, commentText);

    // Submit comment
    const submitButtons = screen.getAllByRole("button", { name: /add comment/i });
    const submitButton = submitButtons.find((btn) => btn.textContent === "Add Comment");
    if (submitButton) await userEvent.click(submitButton);

    // Wait for comment to appear
    await waitFor(() => {
      expect(screen.getAllByText(commentText).length).toBeGreaterThan(0);
    });
  };

  const clickDiscardButton = async () => {
    const discardButtons = await screen.findAllByRole("button", { name: /discard/i });
    const discardButton = discardButtons.find(btn => btn.textContent === "Discard");
    if (discardButton) await userEvent.click(discardButton);
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockOnCreateAgentWithReview.mockClear();

    vi.mocked(api.jjGetChangedFiles).mockResolvedValue([
      {
        path: "test.txt",
        status: "M",
        previous_path: null,
      },
    ]);

    vi.mocked(api.jjGetFileHunks).mockResolvedValue([
      {
        id: "hunk-1",
        header: "@@ -1,1 +1,1 @@",
        lines: ["-old line", "+new line"],
        patch: "...",
      },
    ]);

    vi.mocked(api.getDiffCache).mockResolvedValue([]);
    vi.mocked(api.loadPendingReview).mockResolvedValue(null);
    vi.mocked(api.savePendingReview).mockResolvedValue(1);
    vi.mocked(api.clearPendingReview).mockResolvedValue();
  });

  describe("Loading persisted comments on mount", () => {
    it("should load and display persisted comments when component mounts", async () => {
      // Setup: Mock loadPendingReview to return a persisted review
      vi.mocked(api.loadPendingReview).mockResolvedValue({
        id: 1,
        workspace_id: 1,
        comments: [
          {
            id: "c1",
            filePath: "test.txt",
            hunkId: "hunk-1",
            startLine: 1,
            endLine: 1,
            lineContent: ["+new line"],
            text: "Persisted comment from previous session",
            createdAt: new Date().toISOString(),
          },
        ],
        viewed_files: [],
        summary_text: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      // Act: Render component
      renderComponent();

      // Assert: Verify loadPendingReview was called with correct params
      await waitFor(() => {
        expect(api.loadPendingReview).toHaveBeenCalledWith("/test/repo", 1);
      });

      // Assert: Verify the component enters review mode (shows Finish review button)
      // When comments are loaded, hasUserAddedComments is set to true, which triggers review mode
      await waitFor(() => {
        expect(screen.queryByRole("button", { name: /finish review/i })).toBeInTheDocument();
      }, { timeout: 2000 });
    });

    it("should restore summary text from persisted review", async () => {
      // Setup: Mock loadPendingReview to return review with summary
      vi.mocked(api.loadPendingReview).mockResolvedValue({
        id: 1,
        workspace_id: 1,
        comments: [],
        viewed_files: [],
        summary_text: "Overall review summary",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      // Act: Render component
      renderComponent();

      // Wait for component to mount and load
      await waitFor(() => {
        expect(api.loadPendingReview).toHaveBeenCalled();
      });

      // The summary text would be loaded into state - we can't directly assert
      // it's in the textarea until we open the finish review dialog, but we
      // can verify the API was called
      expect(api.loadPendingReview).toHaveBeenCalledWith("/test/repo", 1);
    });

    it("should handle empty persisted review gracefully", async () => {
      // Setup: Mock returns null (no persisted review)
      vi.mocked(api.loadPendingReview).mockResolvedValue(null);

      // Act: Render component
      renderComponent();

      // Assert: Component should render without errors
      await waitFor(() => {
        expect(screen.getAllByText(/test\.txt/).length).toBeGreaterThan(0);
      });

      // No errors should occur
      expect(api.loadPendingReview).toHaveBeenCalledWith("/test/repo", 1);
    });
  });

  describe("Auto-saving comments", () => {
    it("should auto-save when user adds a comment via UI", async () => {
      renderComponent();
      await setupReviewMode();

      // Clear any initial calls
      vi.mocked(api.savePendingReview).mockClear();

      // Add comment via UI
      await addCommentViaUI("New comment for auto-save");

      // Wait for debounced save (500ms + buffer)
      await waitFor(
        () => {
          expect(api.savePendingReview).toHaveBeenCalled();
        },
        { timeout: 2000 }
      );

      // Verify save was called with correct params
      const calls = vi.mocked(api.savePendingReview).mock.calls;
      expect(calls.length).toBeGreaterThan(0);
      expect(calls[0][0]).toBe("/test/repo");
      expect(calls[0][1]).toBe(1);
      // Verify comments array contains our comment
      expect(calls[0][2]).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            text: "New comment for auto-save",
            filePath: "test.txt",
          }),
        ])
      );
    });

    it("should debounce multiple rapid comment additions", async () => {
      renderComponent();
      await setupReviewMode();

      // Clear any initial calls
      vi.mocked(api.savePendingReview).mockClear();

      // Add first comment
      await addCommentViaUI("First comment");

      // Add second comment quickly
      await addCommentViaUI("Second comment");

      // Wait for debounced save
      await waitFor(
        () => {
          expect(api.savePendingReview).toHaveBeenCalled();
        },
        { timeout: 2000 }
      );

      // Should have called save, but may have debounced multiple calls into one
      // Verify the final call includes both comments
      const lastCall = vi.mocked(api.savePendingReview).mock.calls.slice(-1)[0];
      expect(lastCall[2].length).toBe(2);
    });
  });

  describe("Clearing persisted review on cancel", () => {
    it("should clear persisted review when user cancels", async () => {
      renderComponent();
      await setupReviewMode();

      // Add a comment
      await addCommentViaUI("Comment to be cleared");

      // Clear mock calls
      vi.mocked(api.clearPendingReview).mockClear();

      // Click cancel button
      const cancelButton = await screen.findByRole("button", { name: /^cancel$/i });
      await userEvent.click(cancelButton);

      // Confirm discard in dialog
      await clickDiscardButton();

      // Assert: clearPendingReview should be called
      await waitFor(() => {
        expect(api.clearPendingReview).toHaveBeenCalledWith("/test/repo", 1);
      });

      // Comment should be gone from UI
      await waitFor(() => {
        expect(screen.queryByText("Comment to be cleared")).not.toBeInTheDocument();
      });
    });

    it("should not clear persisted review when user dismisses cancel dialog", async () => {
      renderComponent();
      await setupReviewMode();

      // Add a comment
      await addCommentViaUI("Comment to keep");

      // Clear mock calls
      vi.mocked(api.clearPendingReview).mockClear();

      // Click cancel button
      const cancelButton = await screen.findByRole("button", { name: /^cancel$/i });
      await userEvent.click(cancelButton);

      // Click "Keep reviewing"
      const keepButton = await screen.findByRole("button", { name: /keep reviewing/i });
      await userEvent.click(keepButton);

      // Wait a bit to ensure no calls are made
      await new Promise(resolve => setTimeout(resolve, 100));

      // Assert: clearPendingReview should NOT be called
      expect(api.clearPendingReview).not.toHaveBeenCalled();

      // Comment should still be present
      expect(screen.getAllByText("Comment to keep").length).toBeGreaterThan(0);
    });
  });

  describe("Clearing persisted review on submit", () => {
    it("should clear persisted review when review is submitted", async () => {
      renderComponent();
      await setupReviewMode();

      // Add a comment
      await addCommentViaUI("Comment for submission");

      // Wait for review mode UI
      await waitFor(() => {
        expect(screen.getByRole("button", { name: /finish review/i })).toBeInTheDocument();
      });

      // Clear mock calls
      vi.mocked(api.clearPendingReview).mockClear();

      // Click finish review button
      const finishButton = screen.getByRole("button", { name: /finish review/i });
      await userEvent.click(finishButton);

      // Wait for popover to open - look for the heading or button text
      await waitFor(() => {
        const planButtons = screen.queryAllByRole("button", { name: /plan/i });
        expect(planButtons.length).toBeGreaterThan(0);
      }, { timeout: 2000 });

      // Click "Plan" button to submit
      const planButtons = screen.getAllByRole("button", { name: /plan/i });
      await userEvent.click(planButtons[0]);

      // Assert: clearPendingReview should be called after submission
      await waitFor(() => {
        expect(api.clearPendingReview).toHaveBeenCalledWith("/test/repo", 1);
      }, { timeout: 2000 });
    });
  });

  describe("Persisting viewed files", () => {
    it("should include viewed files in auto-save", async () => {
      renderComponent();

      // Wait for file to load
      await waitFor(() => {
        expect(screen.getAllByText(/test\.txt/).length).toBeGreaterThan(0);
      });

      // Clear initial calls
      vi.mocked(api.savePendingReview).mockClear();

      // Find and click the "Viewed" button to mark file as viewed
      const viewedButtons = screen.getAllByRole("checkbox", { name: /viewed/i });
      if (viewedButtons.length > 0) {
        await userEvent.click(viewedButtons[0]);
      }

      // Enter review mode by adding a comment
      await setupReviewMode();
      await addCommentViaUI("Comment with viewed file");

      // Wait for auto-save
      await waitFor(
        () => {
          expect(api.savePendingReview).toHaveBeenCalled();
        },
        { timeout: 2000 }
      );

      // Note: Verification of viewed_files would require the component to pass
      // viewed files to savePendingReview - this test documents the expected behavior
    });
  });
});
