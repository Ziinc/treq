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

describe("Cancel review feature", () => {
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

    // Expand the file to show hunks
    const fileElements = screen.getAllByText(/test\.txt/);
    await userEvent.click(fileElements[0]);

    // Add a comment to enter review mode
    await waitFor(() => {
      expect(screen.getByText(/new line/)).toBeInTheDocument();
    });

    const addCommentButtons = screen.getAllByRole("button", { name: /add comment/i });
    await userEvent.click(addCommentButtons[0]);

    const textarea = screen.getByPlaceholderText(/add a comment/i);
    await userEvent.type(textarea, "Test comment");

    const submitButtons = screen.getAllByRole("button", { name: /add comment/i });
    const submitButton = submitButtons.find((btn) => btn.textContent === "Add Comment");
    if (submitButton) await userEvent.click(submitButton);

    // Should show cancel button
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /cancel review/i })).toBeInTheDocument();
    });
  });

  it("should show confirmation dialog on cancel click", async () => {
    // This test needs the component to be in review mode
    render(
      <ChangesDiffViewer
        workspacePath="/test/workspace"
        repoPath="/test/repo"
        workspaceId={1}
        initialSelectedFile={null}
      />
    );

    // Setup review mode with a comment (abbreviated for brevity)
    await waitFor(() => {
      expect(screen.getAllByText(/test\.txt/).length).toBeGreaterThan(0);
    });

    const fileElements = screen.getAllByText(/test\.txt/);
    await userEvent.click(fileElements[0]);

    await waitFor(() => {
      const buttons = screen.queryAllByRole("button", { name: /add comment/i });
      expect(buttons.length).toBeGreaterThan(0);
    });

    const addCommentButtons = screen.getAllByRole("button", { name: /add comment/i });
    await userEvent.click(addCommentButtons[0]);

    const textarea = screen.getByPlaceholderText(/add a comment/i);
    await userEvent.type(textarea, "Test comment");

    const submitButtons = screen.getAllByRole("button", { name: /add comment/i });
    const submitButton = submitButtons.find(
      (btn) => btn.textContent === "Add Comment"
    );
    if (submitButton) {
      await userEvent.click(submitButton);
    }

    // Click cancel review button
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /cancel review/i })).toBeInTheDocument();
    });

    const cancelButton = screen.getByRole("button", { name: /cancel review/i });
    await userEvent.click(cancelButton);

    // Should show confirmation dialog
    await waitFor(() => {
      expect(screen.getByText(/cancel review\?/i)).toBeInTheDocument();
      expect(screen.getByText(/this will discard/i)).toBeInTheDocument();
    });
  });

  it("should clear all comments when confirmed", async () => {
    render(
      <ChangesDiffViewer
        workspacePath="/test/workspace"
        repoPath="/test/repo"
        workspaceId={1}
        initialSelectedFile={null}
      />
    );

    // Setup: Add a comment
    await waitFor(() => {
      expect(screen.getAllByText(/test\.txt/).length).toBeGreaterThan(0);
    });

    const fileElements = screen.getAllByText(/test\.txt/);
    await userEvent.click(fileElements[0]);

    await waitFor(() => {
      const buttons = screen.queryAllByRole("button", { name: /add comment/i });
      expect(buttons.length).toBeGreaterThan(0);
    });

    const addCommentButtons = screen.getAllByRole("button", { name: /add comment/i });
    await userEvent.click(addCommentButtons[0]);

    const textarea = screen.getByPlaceholderText(/add a comment/i);
    await userEvent.type(textarea, "Test comment");

    const submitButtons = screen.getAllByRole("button", { name: /add comment/i });
    const submitButton = submitButtons.find((btn) => btn.textContent === "Add Comment");
    if (submitButton) await userEvent.click(submitButton);

    // Verify comment exists
    await waitFor(() => {
      expect(screen.getByText("Test comment")).toBeInTheDocument();
    });

    // Click cancel review
    const cancelButton = await screen.findByRole("button", { name: /cancel review/i });
    await userEvent.click(cancelButton);

    // Click discard in dialog
    const discardButton = await screen.findByRole("button", { name: /discard/i });
    await userEvent.click(discardButton);

    // Comment should be gone
    await waitFor(() => {
      expect(screen.queryByText("Test comment")).not.toBeInTheDocument();
    });
  });

  it("should not clear anything when dialog is dismissed", async () => {
    render(
      <ChangesDiffViewer
        workspacePath="/test/workspace"
        repoPath="/test/repo"
        workspaceId={1}
        initialSelectedFile={null}
      />
    );

    // Add a comment
    await waitFor(() => {
      expect(screen.getAllByText(/test\.txt/).length).toBeGreaterThan(0);
    });

    const fileElements = screen.getAllByText(/test\.txt/);
    await userEvent.click(fileElements[0]);

    await waitFor(() => {
      const buttons = screen.queryAllByRole("button", { name: /add comment/i });
      expect(buttons.length).toBeGreaterThan(0);
    });

    const addCommentButtons = screen.getAllByRole("button", { name: /add comment/i });
    await userEvent.click(addCommentButtons[0]);

    const textarea = screen.getByPlaceholderText(/add a comment/i);
    await userEvent.type(textarea, "Test comment");

    const submitButtons = screen.getAllByRole("button", { name: /add comment/i });
    const submitButton = submitButtons.find((btn) => btn.textContent === "Add Comment");
    if (submitButton) await userEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText("Test comment")).toBeInTheDocument();
    });

    // Click cancel review
    const cancelButton = await screen.findByRole("button", { name: /cancel review/i });
    await userEvent.click(cancelButton);

    // Click "Keep reviewing" button
    const keepButton = await screen.findByRole("button", { name: /keep reviewing/i });
    await userEvent.click(keepButton);

    // Comment should still exist
    await waitFor(() => {
      expect(screen.getByText("Test comment")).toBeInTheDocument();
    });
  });

  it("should close dialog when 'Keep Reviewing' is clicked", async () => {
    render(
      <ChangesDiffViewer
        workspacePath="/test/workspace"
        repoPath="/test/repo"
        workspaceId={1}
        initialSelectedFile={null}
      />
    );

    // Add a comment to enter review mode
    await waitFor(() => {
      expect(screen.getAllByText(/test\.txt/).length).toBeGreaterThan(0);
    });

    const fileElements = screen.getAllByText(/test\.txt/);
    await userEvent.click(fileElements[0]);

    await waitFor(() => {
      const buttons = screen.queryAllByRole("button", { name: /add comment/i });
      expect(buttons.length).toBeGreaterThan(0);
    });

    const addCommentButtons = screen.getAllByRole("button", { name: /add comment/i });
    await userEvent.click(addCommentButtons[0]);

    const textarea = screen.getByPlaceholderText(/add a comment/i);
    await userEvent.type(textarea, "Test comment");

    const submitButtons = screen.getAllByRole("button", { name: /add comment/i });
    const submitButton = submitButtons.find((btn) => btn.textContent === "Add Comment");
    if (submitButton) await userEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText("Test comment")).toBeInTheDocument();
    });

    // Click cancel review button
    const cancelButton = await screen.findByRole("button", { name: /cancel review/i });
    await userEvent.click(cancelButton);

    // Verify dialog is shown
    await waitFor(() => {
      expect(screen.getByText(/cancel review\?/i)).toBeInTheDocument();
    });

    // Click "Keep reviewing" button
    const keepButton = await screen.findByRole("button", { name: /keep reviewing/i });
    await userEvent.click(keepButton);

    // Verify dialog is closed (dialog title should not be in document)
    await waitFor(() => {
      expect(screen.queryByText(/cancel review\?/i)).not.toBeInTheDocument();
    });

    // Verify comment is still present
    expect(screen.getByText("Test comment")).toBeInTheDocument();
  });

  it("should clear persisted review from database on confirm", async () => {
    render(
      <ChangesDiffViewer
        workspacePath="/test/workspace"
        repoPath="/test/repo"
        workspaceId={1}
        initialSelectedFile={null}
      />
    );

    // Add a comment
    await waitFor(() => {
      expect(screen.getAllByText(/test\.txt/).length).toBeGreaterThan(0);
    });

    const fileElements = screen.getAllByText(/test\.txt/);
    await userEvent.click(fileElements[0]);

    await waitFor(() => {
      const buttons = screen.queryAllByRole("button", { name: /add comment/i });
      expect(buttons.length).toBeGreaterThan(0);
    });

    const addCommentButtons = screen.getAllByRole("button", { name: /add comment/i });
    await userEvent.click(addCommentButtons[0]);

    const textarea = screen.getByPlaceholderText(/add a comment/i);
    await userEvent.type(textarea, "Test comment");

    const submitButtons = screen.getAllByRole("button", { name: /add comment/i });
    const submitButton = submitButtons.find((btn) => btn.textContent === "Add Comment");
    if (submitButton) await userEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText("Test comment")).toBeInTheDocument();
    });

    // Clear mock calls
    vi.mocked(api.clearPendingReview).mockClear();

    // Click cancel and confirm
    const cancelButton = await screen.findByRole("button", { name: /cancel review/i });
    await userEvent.click(cancelButton);

    const discardButton = await screen.findByRole("button", { name: /discard/i });
    await userEvent.click(discardButton);

    // Verify clearPendingReview was called
    await waitFor(() => {
      expect(api.clearPendingReview).toHaveBeenCalledWith("/test/repo", 1);
    });
  });
});
