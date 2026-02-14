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

describe("Conflict comment toggle", () => {
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

  it("should NOT show comment form by default", async () => {
    render(
      <ChangesDiffViewer
        workspacePath="/test/workspace"
        repoPath="/test/repo"
        workspaceId={1}
        initialSelectedFile={null}
        conflictedFiles={["src/file.ts"]}
      />
    );

    await waitFor(() => {
      expect(screen.getAllByText(/Conflict 1 of 1/i).length).toBeGreaterThan(0);
    });

    // Comment textarea should NOT be visible initially
    expect(screen.queryByPlaceholderText(/add a comment/i)).not.toBeInTheDocument();
  });

  it("should show comment form when MessageSquare icon is clicked", async () => {
    render(
      <ChangesDiffViewer
        workspacePath="/test/workspace"
        repoPath="/test/repo"
        workspaceId={1}
        initialSelectedFile={null}
        conflictedFiles={["src/file.ts"]}
      />
    );

    await waitFor(() => {
      expect(screen.getAllByText(/Conflict 1 of 1/i).length).toBeGreaterThan(0);
    });

    // Find the MessageSquare button (has aria-label "Add comment")
    const addCommentButton = screen.getByLabelText(/add comment/i);
    await userEvent.click(addCommentButton);

    // Form should now be visible
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/add a comment/i)).toBeInTheDocument();
    });
  });

  it("should hide form when clicking button again (toggle off)", async () => {
    render(
      <ChangesDiffViewer
        workspacePath="/test/workspace"
        repoPath="/test/repo"
        workspaceId={1}
        initialSelectedFile={null}
        conflictedFiles={["src/file.ts"]}
      />
    );

    await waitFor(() => {
      expect(screen.getAllByText(/Conflict 1 of 1/i).length).toBeGreaterThan(0);
    });

    const addCommentButton = screen.getByLabelText(/add comment/i);

    // Open
    await userEvent.click(addCommentButton);
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/add a comment/i)).toBeInTheDocument();
    });

    // Close
    await userEvent.click(addCommentButton);
    await waitFor(() => {
      expect(screen.queryByPlaceholderText(/add a comment/i)).not.toBeInTheDocument();
    });
  });

  it("should close form after saving comment", async () => {
    render(
      <ChangesDiffViewer
        workspacePath="/test/workspace"
        repoPath="/test/repo"
        workspaceId={1}
        initialSelectedFile={null}
        conflictedFiles={["src/file.ts"]}
      />
    );

    await waitFor(() => {
      expect(screen.getAllByText(/Conflict 1 of 1/i).length).toBeGreaterThan(0);
    });

    // Open form
    const addCommentButton = screen.getByLabelText(/add comment/i);
    await userEvent.click(addCommentButton);

    // Type and save
    const textarea = await screen.findByPlaceholderText(/add a comment/i);
    await userEvent.type(textarea, "Keep side 2");

    const saveButton = screen.getAllByRole("button", { name: /add comment/i }).find(btn => btn.textContent === "Add Comment")!;
    await userEvent.click(saveButton);

    // Form should close
    await waitFor(() => {
      expect(screen.queryByPlaceholderText(/add a comment/i)).not.toBeInTheDocument();
    });
  });

  it("should auto-focus the input when form opens", async () => {
    render(
      <ChangesDiffViewer
        workspacePath="/test/workspace"
        repoPath="/test/repo"
        workspaceId={1}
        initialSelectedFile={null}
        conflictedFiles={["src/file.ts"]}
      />
    );

    await waitFor(() => {
      expect(screen.getAllByText(/Conflict 1 of 1/i).length).toBeGreaterThan(0);
    });

    // Find and click the add comment button
    const addCommentButtons = screen.getAllByRole("button", { name: /add comment/i });
    const conflictButton = addCommentButtons.find(btn => btn.textContent === "Add comment");
    await userEvent.click(conflictButton!);

    // Input should be focused
    const textarea = await screen.findByPlaceholderText(/add a comment/i);
    await waitFor(() => {
      expect(textarea).toHaveFocus();
    });
  });
});
