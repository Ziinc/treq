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
  };
});

describe("Conflict comment edit flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(api.jjGetChangedFiles).mockResolvedValue([
      {
        path: "src/file.ts",
        status: "M",
        previous_path: null,
      },
    ]);

    vi.mocked(api.jjGetFileHunks).mockResolvedValue([
      {
        id: "hunk-1",
        header: "@@ -1,7 +1,7 @@",
        lines: [
          "+<<<<<<< Conflict 1 of 1",
          "+%%%%%%%",
          "+-old line",
          "++++++++",
          "+new line",
          "+>>>>>>> Conflict 1 of 1 ends",
        ],
        patch: "...",
      },
    ]);

    vi.mocked(api.getDiffCache).mockResolvedValue([]);
  });

  const setupSavedComment = async () => {
    const { container } = render(
      <ChangesDiffViewer
        workspacePath="/test/workspace"
        repoPath="/test/repo"
        workspaceId={1}
        initialSelectedFile={null}
        conflictedFiles={["src/file.ts"]}
      />
    );

    await waitFor(() => {
      expect(screen.getAllByText(/Conflict 1 of 1/).length).toBeGreaterThan(0);
    });

    // Add a comment
    const addCommentButtons = screen.getAllByRole("button", { name: /add comment/i });
    const conflictButton = addCommentButtons.find(btn => btn.textContent === "Add comment");
    await userEvent.click(conflictButton!);

    const textarea = await screen.findByPlaceholderText(/add a comment/i);
    await userEvent.type(textarea, "Test resolution comment");

    const submitButtons = screen.getAllByRole("button", { name: /add comment/i });
    const submitButton = submitButtons.find(btn => btn.textContent === "Add Comment");
    await userEvent.click(submitButton!);

    // Wait for comment to be saved and displayed
    await waitFor(() => {
      expect(screen.getByText("Test resolution comment")).toBeInTheDocument();
    });

    return { container };
  };

  it("should show pencil icon on hover over saved comment", async () => {
    const { container } = await setupSavedComment();

    // Find the comment display card
    const commentCard = screen.getByText("Test resolution comment").closest("div[class*='cursor-pointer']");
    expect(commentCard).toBeInTheDocument();

    // Pencil icon should exist but be initially hidden (opacity-0)
    const pencilIcon = container.querySelector(".lucide-pencil");
    expect(pencilIcon).toBeInTheDocument();
    expect(pencilIcon?.getAttribute('class')).toMatch(/opacity-0/);
  });

  it("should show 'Click to edit' tooltip on hover", async () => {
    await setupSavedComment();

    const commentCard = screen.getByText("Test resolution comment").closest("div[class*='cursor-pointer']");

    // Hover over comment
    await userEvent.hover(commentCard!);

    // Tooltip should appear (using getAllByText since tooltips may render multiple instances)
    await waitFor(() => {
      const tooltips = screen.getAllByText(/click to edit/i);
      expect(tooltips.length).toBeGreaterThan(0);
    });
  });

  it("should enter edit mode when comment card is clicked", async () => {
    await setupSavedComment();

    const commentCard = screen.getByText("Test resolution comment").closest("div[class*='cursor-pointer']");
    await userEvent.click(commentCard!);

    // Edit form should appear with the comment text
    await waitFor(() => {
      const editTextarea = screen.getByDisplayValue("Test resolution comment");
      expect(editTextarea).toBeInTheDocument();
    });

    // Should have Discard, Cancel, and Save buttons
    expect(screen.getByRole("button", { name: /^discard$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^cancel$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^save$/i })).toBeInTheDocument();
  });

  it("should auto-focus textarea when entering edit mode", async () => {
    await setupSavedComment();

    const commentCard = screen.getByText("Test resolution comment").closest("div[class*='cursor-pointer']");
    await userEvent.click(commentCard!);

    // Textarea should be focused
    await waitFor(() => {
      const editTextarea = screen.getByDisplayValue("Test resolution comment");
      expect(editTextarea).toHaveFocus();
    });
  });

  it("should save edited comment text", async () => {
    await setupSavedComment();

    // Enter edit mode
    const commentCard = screen.getByText("Test resolution comment").closest("div[class*='cursor-pointer']");
    await userEvent.click(commentCard!);

    // Edit the text
    const editTextarea = await screen.findByDisplayValue("Test resolution comment");
    await userEvent.clear(editTextarea);
    await userEvent.type(editTextarea, "Updated resolution comment");

    // Save
    const saveButton = screen.getByRole("button", { name: /^save$/i });
    await userEvent.click(saveButton);

    // Should show updated text in display mode
    await waitFor(() => {
      expect(screen.getByText("Updated resolution comment")).toBeInTheDocument();
      expect(screen.queryByDisplayValue("Updated resolution comment")).not.toBeInTheDocument(); // Not in edit mode
    });
  });

  it("should cancel edit without saving changes", async () => {
    await setupSavedComment();

    // Enter edit mode
    const commentCard = screen.getByText("Test resolution comment").closest("div[class*='cursor-pointer']");
    await userEvent.click(commentCard!);

    // Edit the text
    const editTextarea = await screen.findByDisplayValue("Test resolution comment");
    await userEvent.clear(editTextarea);
    await userEvent.type(editTextarea, "This should not be saved");

    // Cancel
    const cancelButton = screen.getByRole("button", { name: /^cancel$/i });
    await userEvent.click(cancelButton);

    // Should show original text
    await waitFor(() => {
      expect(screen.getByText("Test resolution comment")).toBeInTheDocument();
      expect(screen.queryByText("This should not be saved")).not.toBeInTheDocument();
    });
  });

  it("should delete comment when Discard is clicked", async () => {
    await setupSavedComment();

    // Enter edit mode
    const commentCard = screen.getByText("Test resolution comment").closest("div[class*='cursor-pointer']");
    await userEvent.click(commentCard!);

    // Click Discard
    const discardButton = screen.getByRole("button", { name: /^discard$/i });
    await userEvent.click(discardButton);

    // Comment should be removed
    await waitFor(() => {
      expect(screen.queryByText("Test resolution comment")).not.toBeInTheDocument();
    });
  });

  it("should have Discard button with destructive styling", async () => {
    await setupSavedComment();

    // Enter edit mode
    const commentCard = screen.getByText("Test resolution comment").closest("div[class*='cursor-pointer']");
    await userEvent.click(commentCard!);

    const discardButton = screen.getByRole("button", { name: /^discard$/i });

    // Should have destructive styling
    expect(discardButton.className).toMatch(/text-destructive/);
  });

  it("should support Escape key to cancel edit", async () => {
    await setupSavedComment();

    // Enter edit mode
    const commentCard = screen.getByText("Test resolution comment").closest("div[class*='cursor-pointer']");
    await userEvent.click(commentCard!);

    // Edit the text
    const editTextarea = await screen.findByDisplayValue("Test resolution comment");
    await userEvent.clear(editTextarea);
    await userEvent.type(editTextarea, "This should not be saved");

    // Press Escape
    await userEvent.keyboard("{Escape}");

    // Should exit edit mode with original text
    await waitFor(() => {
      expect(screen.getByText("Test resolution comment")).toBeInTheDocument();
      expect(screen.queryByDisplayValue("This should not be saved")).not.toBeInTheDocument();
    });
  });

  it("should support Cmd+Enter to save edit", async () => {
    await setupSavedComment();

    // Enter edit mode
    const commentCard = screen.getByText("Test resolution comment").closest("div[class*='cursor-pointer']");
    await userEvent.click(commentCard!);

    // Edit the text
    const editTextarea = await screen.findByDisplayValue("Test resolution comment");
    await userEvent.clear(editTextarea);
    await userEvent.type(editTextarea, "Quick save edit");

    // Press Cmd+Enter
    await userEvent.keyboard("{Meta>}{Enter}{/Meta}");

    // Should save and exit edit mode
    await waitFor(() => {
      expect(screen.getByText("Quick save edit")).toBeInTheDocument();
      expect(screen.queryByDisplayValue("Quick save edit")).not.toBeInTheDocument();
    });
  });

  it("should show delete button (X) in display mode", async () => {
    const { container } = await setupSavedComment();

    // Find X delete button
    const commentCard = screen.getByText("Test resolution comment").closest("div[class*='cursor-pointer']");
    const xButtons = commentCard?.querySelectorAll("button");
    const deleteButton = Array.from(xButtons || []).find(btn => {
      const svg = btn.querySelector(".lucide-x");
      return svg !== null;
    });

    expect(deleteButton).toBeInTheDocument();
  });

  it("should delete comment when X button is clicked in display mode", async () => {
    await setupSavedComment();

    // Find and click X button
    const commentCard = screen.getByText("Test resolution comment").closest("div[class*='cursor-pointer']");
    const xButtons = commentCard?.querySelectorAll("button");

    // The X button should be one of the buttons in the card
    const xButton = Array.from(xButtons || []).find(btn => {
      const svg = btn.querySelector(".lucide-x");
      return svg !== null;
    });

    expect(xButton).toBeInTheDocument();

    await userEvent.click(xButton!);

    // Comment should be removed
    await waitFor(() => {
      expect(screen.queryByText("Test resolution comment")).not.toBeInTheDocument();
    });
  });
});
