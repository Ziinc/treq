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
    clearPendingReview: vi.fn(),
  };
});

describe("Cancel/Discard review feature", () => {
  const renderComponent = () => {
    return render(
      <ChangesDiffViewer
        workspacePath="/test/workspace"
        repoPath="/test/repo"
        workspaceId={1}
        initialSelectedFile={null}
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

    // Click add comment
    const addCommentButtons = screen.getAllByRole("button", { name: /add comment/i });
    await userEvent.click(addCommentButtons[0]);

    // Type comment
    const textarea = screen.getByPlaceholderText(/add a comment/i);
    await userEvent.type(textarea, "Test comment");

    // Submit comment
    const submitButtons = screen.getAllByRole("button", { name: /add comment/i });
    const submitButton = submitButtons.find((btn) => btn.textContent === "Add Comment");
    if (submitButton) await userEvent.click(submitButton);

    // Wait for comment to appear (will be in multiple places: inline + review panel)
    await waitFor(() => {
      expect(screen.getAllByText("Test comment").length).toBeGreaterThan(0);
    });
  };

  const clickDiscardButton = async () => {
    const discardButtons = await screen.findAllByRole("button", { name: /discard/i });
    const discardButton = discardButtons.find(btn => btn.textContent === "Discard");
    if (discardButton) await userEvent.click(discardButton);
  };

  beforeEach(() => {
    vi.clearAllMocks();

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
    vi.mocked(api.clearPendingReview).mockResolvedValue();
  });

  it("should show cancel button when in review mode", async () => {
    renderComponent();
    await setupReviewMode();

    // Should show cancel button
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /^cancel$/i })).toBeInTheDocument();
    });
  });

  it("should show confirmation dialog on cancel click", async () => {
    renderComponent();
    await setupReviewMode();

    // Click cancel button
    const cancelButton = screen.getByRole("button", { name: /^cancel$/i });
    await userEvent.click(cancelButton);

    // Should show confirmation dialog
    await waitFor(() => {
      expect(screen.getByText(/discard review\?/i)).toBeInTheDocument();
      expect(screen.getByText(/this will discard/i)).toBeInTheDocument();
    });
  });

  it("should clear all comments when confirmed", async () => {
    renderComponent();
    await setupReviewMode();

    // Click cancel button
    const cancelButton = await screen.findByRole("button", { name: /^cancel$/i });
    await userEvent.click(cancelButton);

    // Click discard in dialog
    await clickDiscardButton();

    // Comment should be gone
    await waitFor(() => {
      expect(screen.queryByText("Test comment")).not.toBeInTheDocument();
    });
  });

  it("should not clear anything when dialog is dismissed", async () => {
    renderComponent();
    await setupReviewMode();

    // Click cancel button
    const cancelButton = await screen.findByRole("button", { name: /^cancel$/i });
    await userEvent.click(cancelButton);

    // Click "Keep reviewing" button
    const keepButton = await screen.findByRole("button", { name: /keep reviewing/i });
    await userEvent.click(keepButton);

    // Comment should still exist
    await waitFor(() => {
      expect(screen.getAllByText("Test comment").length).toBeGreaterThan(0);
    });
  });

  it("should close dialog when 'Keep Reviewing' is clicked", async () => {
    renderComponent();
    await setupReviewMode();

    // Click cancel button
    const cancelButton = await screen.findByRole("button", { name: /^cancel$/i });
    await userEvent.click(cancelButton);

    // Verify dialog is shown
    await waitFor(() => {
      expect(screen.getByText(/discard review\?/i)).toBeInTheDocument();
    });

    // Click "Keep reviewing" button
    const keepButton = await screen.findByRole("button", { name: /keep reviewing/i });
    await userEvent.click(keepButton);

    // Verify dialog is closed
    await waitFor(() => {
      expect(screen.queryByText(/discard review\?/i)).not.toBeInTheDocument();
    });

    // Verify comment is still present
    expect(screen.getAllByText("Test comment").length).toBeGreaterThan(0);
  });

  it("should clear persisted review from database on confirm", async () => {
    renderComponent();
    await setupReviewMode();

    // Clear mock calls
    vi.mocked(api.clearPendingReview).mockClear();

    // Click cancel and confirm
    const cancelButton = await screen.findByRole("button", { name: /^cancel$/i });
    await userEvent.click(cancelButton);

    await clickDiscardButton();

    // Verify clearPendingReview was called
    await waitFor(() => {
      expect(api.clearPendingReview).toHaveBeenCalledWith("/test/repo", 1);
    });
  });
});
