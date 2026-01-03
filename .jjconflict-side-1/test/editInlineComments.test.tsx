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
    clearPendingReview: vi.fn(),
  };
});

describe("Edit inline comments", () => {
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

  const addCommentToLine = async () => {
    await waitFor(() => {
      expect(screen.getAllByText(/test\.txt/).length).toBeGreaterThan(0);
    });

    const fileElements = screen.getAllByText(/test\.txt/);
    await userEvent.click(fileElements[0]);

    await waitFor(() => {
      const buttons = screen.queryAllByRole("button", { name: /add comment/i });
      expect(buttons.length).toBeGreaterThan(0);
    });

    const addCommentButtons = screen.getAllByRole("button", {
      name: /add comment/i,
    });
    await userEvent.click(addCommentButtons[0]);

    const textarea = screen.getByPlaceholderText(/add a comment/i);
    await userEvent.type(textarea, "Original comment text");

    const submitButtons = screen.getAllByRole("button", {
      name: /add comment/i,
    });
    const submitButton = submitButtons.find(
      (btn) => btn.textContent === "Add Comment"
    );
    if (submitButton) await userEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getAllByText("Original comment text").length).toBeGreaterThan(0);
    });
  };

  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(api.jjGetChangedFiles).mockResolvedValue([
      { path: "test.txt", status: "M", previous_path: null },
    ]);

    vi.mocked(api.jjGetFileHunks).mockResolvedValue([
      {
        id: "hunk-1",
        header: "@@ -1,3 +1,4 @@",
        lines: [
          " context line 1",
          " context line 2",
          "+new line",
          " context line 3",
        ],
        patch: "...",
      },
    ]);

    vi.mocked(api.getDiffCache).mockResolvedValue([]);
    vi.mocked(api.clearPendingReview).mockResolvedValue();
  });

  describe("Edit trigger", () => {
    it("should show comment card as clickable", async () => {
      renderComponent();
      await addCommentToLine();

      const commentText = screen.getByText("Original comment text");
      const commentContainer = commentText.closest(".cursor-pointer");
      expect(commentContainer).toBeInTheDocument();
    });

    it("should enter edit mode when clicking comment card", async () => {
      renderComponent();
      await addCommentToLine();

      const commentText = screen.getByText("Original comment text");
      const commentCard = commentText.closest(".cursor-pointer");
      if (commentCard) await userEvent.click(commentCard as HTMLElement);

      await waitFor(() => {
        const textarea = screen.getByDisplayValue("Original comment text");
        expect(textarea).toBeInTheDocument();
      });
    });
  });

  describe("Edit mode UI", () => {
    it("should show Save, Cancel, and Discard buttons in edit mode", async () => {
      renderComponent();
      await addCommentToLine();

      const commentText = screen.getByText("Original comment text");
      const commentCard = commentText.closest(".cursor-pointer");
      if (commentCard) await userEvent.click(commentCard as HTMLElement);

      await waitFor(() => {
        const saveButtons = screen.getAllByRole("button", { name: /^save$/i });
        expect(saveButtons.length).toBeGreaterThan(0);
        const cancelButtons = screen.getAllByRole("button", { name: /^cancel$/i });
        expect(cancelButtons.length).toBeGreaterThan(0);
        const discardButtons = screen.getAllByRole("button", { name: /^discard$/i });
        expect(discardButtons.length).toBeGreaterThan(0);
      });
    });

    it("should hide delete button while in edit mode", async () => {
      renderComponent();
      await addCommentToLine();

      const commentText = screen.getByText("Original comment text");
      const commentContainer = commentText.closest(".group");
      const deleteButton = commentContainer?.querySelector("button");
      expect(deleteButton).toBeInTheDocument();

      const commentCard = commentText.closest(".cursor-pointer");
      if (commentCard) await userEvent.click(commentCard as HTMLElement);

      await waitFor(() => {
        const textarea = screen.getByDisplayValue("Original comment text");
        expect(textarea).toBeInTheDocument();
        const deleteButtons = screen.queryAllByRole("button");
        const deleteButtonStillExists = deleteButtons.some(
          (btn) => btn.querySelector(".lucide-x")
        );
        expect(deleteButtonStillExists).toBe(false);
      });
    });
  });

  describe("Save functionality", () => {
    it("should update comment text when saving", async () => {
      renderComponent();
      await addCommentToLine();

      const commentText = screen.getByText("Original comment text");
      const commentCard = commentText.closest(".cursor-pointer");
      if (commentCard) await userEvent.click(commentCard as HTMLElement);

      const textarea = screen.getByDisplayValue("Original comment text");
      await userEvent.clear(textarea);
      await userEvent.type(textarea, "Updated comment text");

      const saveButton = screen.getByRole("button", { name: /^save$/i });
      await userEvent.click(saveButton);

      await waitFor(() => {
        expect(screen.getByText("Updated comment text")).toBeInTheDocument();
        expect(
          screen.queryByText("Original comment text")
        ).not.toBeInTheDocument();
      });
    });

    it("should exit edit mode after saving", async () => {
      renderComponent();
      await addCommentToLine();

      const commentText = screen.getByText("Original comment text");
      const commentCard = commentText.closest(".cursor-pointer");
      if (commentCard) await userEvent.click(commentCard as HTMLElement);

      const textarea = screen.getByDisplayValue("Original comment text");
      await userEvent.clear(textarea);
      await userEvent.type(textarea, "Updated text");
      const saveButton = screen.getByRole("button", { name: /^save$/i });
      await userEvent.click(saveButton);

      await waitFor(() => {
        expect(screen.queryByDisplayValue("Updated text")).not.toBeInTheDocument();
        expect(screen.getByText("Updated text")).toBeInTheDocument();
      });
    });

    it("should save with Cmd+Enter keyboard shortcut", async () => {
      renderComponent();
      await addCommentToLine();

      const commentText = screen.getByText("Original comment text");
      const commentCard = commentText.closest(".cursor-pointer");
      if (commentCard) await userEvent.click(commentCard as HTMLElement);

      const textarea = screen.getByDisplayValue("Original comment text");
      await userEvent.clear(textarea);
      await userEvent.type(textarea, "Keyboard saved text");
      await userEvent.keyboard("{Meta>}{Enter}{/Meta}");

      await waitFor(() => {
        expect(screen.getByText("Keyboard saved text")).toBeInTheDocument();
      });
    });
  });

  describe("Cancel functionality", () => {
    it("should revert to original text when canceling", async () => {
      renderComponent();
      await addCommentToLine();

      const commentText = screen.getByText("Original comment text");
      const commentCard = commentText.closest(".cursor-pointer");
      if (commentCard) await userEvent.click(commentCard as HTMLElement);

      const textarea = screen.getByDisplayValue("Original comment text");
      await userEvent.clear(textarea);
      await userEvent.type(textarea, "Modified but not saved");

      const cancelButtons = screen.getAllByRole("button", { name: /^cancel$/i });
      await userEvent.click(cancelButtons[cancelButtons.length - 1]);

      await waitFor(() => {
        expect(screen.getByText("Original comment text")).toBeInTheDocument();
        expect(
          screen.queryByText("Modified but not saved")
        ).not.toBeInTheDocument();
      });
    });

    it("should cancel with Escape key", async () => {
      renderComponent();
      await addCommentToLine();

      const commentText = screen.getByText("Original comment text");
      const commentCard = commentText.closest(".cursor-pointer");
      if (commentCard) await userEvent.click(commentCard as HTMLElement);

      const textarea = screen.getByDisplayValue("Original comment text");
      await userEvent.clear(textarea);
      await userEvent.type(textarea, "Will be discarded");
      await userEvent.keyboard("{Escape}");

      await waitFor(() => {
        expect(screen.getByText("Original comment text")).toBeInTheDocument();
      });
    });
  });

  describe("Edge cases", () => {
    it("should not allow saving empty comment", async () => {
      renderComponent();
      await addCommentToLine();

      const commentText = screen.getByText("Original comment text");
      const commentCard = commentText.closest(".cursor-pointer");
      if (commentCard) await userEvent.click(commentCard as HTMLElement);

      const textarea = screen.getByDisplayValue("Original comment text");
      await userEvent.clear(textarea);

      const saveButton = screen.getByRole("button", { name: /^save$/i });
      expect(saveButton).toBeDisabled();
    });
  });

  describe("Discard functionality", () => {
    it("should delete comment when clicking Discard button", async () => {
      renderComponent();
      await addCommentToLine();

      const commentText = screen.getByText("Original comment text");
      const commentCard = commentText.closest(".cursor-pointer");
      if (commentCard) await userEvent.click(commentCard as HTMLElement);

      const discardButton = screen.getByRole("button", { name: /^discard$/i });
      await userEvent.click(discardButton);

      await waitFor(() => {
        expect(
          screen.queryByText("Original comment text")
        ).not.toBeInTheDocument();
      });
    });
  });
});
