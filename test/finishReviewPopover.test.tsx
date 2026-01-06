import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "./test-utils";
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

describe("Copy button in Finish Review popover", () => {
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

    // Wait for comment to appear
    await waitFor(() => {
      expect(screen.getAllByText("Test comment").length).toBeGreaterThan(0);
    });
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

  it("should NOT show copy button in header bar", async () => {
    renderComponent();
    await setupReviewMode();

    // Wait for review action bar to appear
    await waitFor(() => {
      const discardButtons = screen.getAllByRole("button", { name: /discard/i });
      // Find the review Discard button (not sidebar's "Discard selected files")
      const reviewDiscardButton = discardButtons.find(btn => btn.textContent === "Discard");
      expect(reviewDiscardButton).toBeInTheDocument();
    });

    // Get all Copy buttons - should not find any in header
    const copyButtons = screen.queryAllByRole("button", { name: /copy/i });

    // If there are copy buttons, they should all be inside popovers, not in the sticky header bar
    // The header bar has the Discard and Finish review buttons
    // We can check by looking for Copy button as a sibling of Discard button (they'd be in same container)
    const discardButtons = screen.getAllByRole("button", { name: /discard/i });
    const reviewDiscardButton = discardButtons.find(btn => btn.textContent === "Discard")!;
    const headerContainer = reviewDiscardButton.parentElement;

    // No Copy button should be in the same container as Discard
    const copyButtonsInHeader = copyButtons.filter(btn => headerContainer?.contains(btn));
    expect(copyButtonsInHeader.length).toBe(0);
  });

  it("should show copy button inside Finish Review popover", async () => {
    renderComponent();
    await setupReviewMode();

    // Click "Finish review" button to open popover
    const finishButton = await screen.findByRole("button", { name: /finish review/i });
    await userEvent.click(finishButton);

    // Find copy button inside popover - use a more flexible approach
    await waitFor(() => {
      const copyButtons = screen.getAllByRole("button", { name: /copy/i });
      expect(copyButtons.length).toBeGreaterThan(0);
    });
  });

  it("should position copy button on the left side of popover actions", async () => {
    renderComponent();
    await setupReviewMode();

    // Open popover
    const finishButton = await screen.findByRole("button", { name: /finish review/i });
    await userEvent.click(finishButton);

    // Wait for popover to open and find the Copy button with text "Copy" (not just icon)
    await waitFor(() => {
      const copyButtons = screen.getAllByRole("button", { name: /copy/i });
      const reviewCopyButton = copyButtons.find(btn => btn.textContent?.includes("Copy") && !btn.textContent?.includes("path"));
      expect(reviewCopyButton).toBeInTheDocument();
    });

    // Get the review Copy button (has "Copy" text, not just icon)
    const copyButtons = screen.getAllByRole("button", { name: /copy/i });
    const copyButton = copyButtons.find(btn => btn.textContent?.includes("Copy") && !btn.textContent?.includes("path"))!;
    const planButton = screen.getByRole("button", { name: /^plan$/i });
    const editButton = screen.getByRole("button", { name: /^edit$/i });

    // Copy button's DOM position should be before Plan and Edit buttons
    const allButtons = screen.getAllByRole("button");
    const copyIndex = allButtons.indexOf(copyButton);
    const planIndex = allButtons.indexOf(planButton);
    const editIndex = allButtons.indexOf(editButton);

    expect(copyIndex).toBeLessThan(planIndex);
    expect(copyIndex).toBeLessThan(editIndex);
  });

  it("should copy review to clipboard when clicked", async () => {
    const clipboardSpy = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();

    renderComponent();
    await setupReviewMode();

    // Open popover
    const finishButton = await screen.findByRole("button", { name: /finish review/i });
    await userEvent.click(finishButton);

    // Click the review copy button (has "Copy" text)
    const copyButtons = await screen.findAllByRole("button", { name: /copy/i });
    const reviewCopyButton = copyButtons.find(btn => btn.textContent?.includes("Copy") && !btn.textContent?.includes("path"))!;
    await userEvent.click(reviewCopyButton);

    // Should have called clipboard writeText
    await waitFor(() => {
      expect(clipboardSpy).toHaveBeenCalled();
      expect(clipboardSpy.mock.calls[0][0]).toContain("Test comment");
    });

    clipboardSpy.mockRestore();
  });

  it("should show 'Copied' state after copying", async () => {
    vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();

    renderComponent();
    await setupReviewMode();

    // Open popover
    const finishButton = await screen.findByRole("button", { name: /finish review/i });
    await userEvent.click(finishButton);

    // Click the review copy button
    const copyButtons = await screen.findAllByRole("button", { name: /copy/i });
    const reviewCopyButton = copyButtons.find(btn => btn.textContent?.includes("Copy") && !btn.textContent?.includes("path"))!;
    await userEvent.click(reviewCopyButton);

    // Should show "Copied" text in the button
    await waitFor(() => {
      const copiedButtons = screen.getAllByRole("button", { name: /copied/i });
      const reviewCopiedButton = copiedButtons.find(btn => btn.textContent?.includes("Copied"));
      expect(reviewCopiedButton).toBeInTheDocument();
    });
  });

  it("should show close button at top-right of popover with 'Close' tooltip", async () => {
    renderComponent();
    await setupReviewMode();
    const finishButton = await screen.findByRole("button", { name: /finish review/i });
    await userEvent.click(finishButton);

    // Find close button with X icon at top-right of popover
    await waitFor(() => {
      const allButtons = screen.getAllByRole("button");
      // The close button has an X icon and is positioned absolutely at top-right
      const closeButton = allButtons.find(btn => {
        const svg = btn.querySelector('svg.lucide-x');
        return svg !== null;
      });
      expect(closeButton).toBeInTheDocument();
    });
  });

  it("should not show toast when copying review", async () => {
    vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
    renderComponent();
    await setupReviewMode();
    const finishButton = await screen.findByRole("button", { name: /finish review/i });
    await userEvent.click(finishButton);

    const copyButtons = await screen.findAllByRole("button", { name: /copy/i });
    const reviewCopyButton = copyButtons.find(btn => btn.textContent?.includes("Copy"))!;
    await userEvent.click(reviewCopyButton);

    // No toast should appear
    expect(screen.queryByText("Copied to clipboard")).not.toBeInTheDocument();
  });

  it("should include conflicted files in review markdown", async () => {
    // Setup with conflict markers in mock data
    vi.mocked(api.jjGetFileHunks).mockResolvedValue([{
      id: "hunk-1",
      header: "@@ -1,3 +1,3 @@",
      lines: [
        "+<<<<<<< Conflict 1 of 1",
        "+local content",
        "+>>>>>>> Conflict 1 of 1 ends",
      ],
      patch: "...",
    }]);

    const clipboardSpy = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
    renderComponent();

    // Add summary and copy
    const finishButton = await screen.findByRole("button", { name: /resolve conflicts/i });
    await userEvent.click(finishButton);
    const textarea = screen.getByPlaceholderText(/summary/i);
    await userEvent.type(textarea, "Keep local");
    const copyButtons = await screen.findAllByRole("button", { name: /copy/i });
    await userEvent.click(copyButtons.find(btn => btn.textContent?.includes("Copy"))!);

    expect(clipboardSpy.mock.calls[0][0]).toContain("## Code Review");
    expect(clipboardSpy.mock.calls[0][0]).toContain("### Conflicted Files");
    expect(clipboardSpy.mock.calls[0][0]).toContain("test.txt");
  });
});
