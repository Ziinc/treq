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

describe("Standardized conflict comment form", () => {
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

  it("should show file path and line range in label", async () => {
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
      expect(screen.getAllByText(/Conflict 1 of 1/).length).toBeGreaterThan(0);
    });

    // Click add comment
    const addCommentButtons = screen.getAllByRole("button", { name: /add comment/i });
    const conflictButton = addCommentButtons.find(btn => btn.textContent === "Add comment");
    await userEvent.click(conflictButton!);

    // Should show "src/file.ts:L{start}-{end}"
    await waitFor(() => {
      const label = screen.getByText(/src\/file\.ts:L\d+/);
      expect(label).toBeInTheDocument();
    });
  });

  it("should use Cancel button text (not Clear)", async () => {
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
      expect(screen.getAllByText(/Conflict 1 of 1/).length).toBeGreaterThan(0);
    });

    // Click add comment
    const addCommentButtons = screen.getAllByRole("button", { name: /add comment/i });
    const conflictButton = addCommentButtons.find(btn => btn.textContent === "Add comment");
    await userEvent.click(conflictButton!);

    // Should have Cancel button
    await waitFor(() => {
      const cancelButton = screen.getByRole("button", { name: /^cancel$/i });
      expect(cancelButton).toBeInTheDocument();
      expect(cancelButton.textContent).toBe("Cancel");
    });

    // Should NOT have Clear button
    expect(screen.queryByRole("button", { name: /clear/i })).not.toBeInTheDocument();
  });

  it("should use 'Add Comment' button text (not Save)", async () => {
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
      expect(screen.getAllByText(/Conflict 1 of 1/).length).toBeGreaterThan(0);
    });

    // Click add comment
    const addCommentButtons = screen.getAllByRole("button", { name: /add comment/i });
    const conflictButton = addCommentButtons.find(btn => btn.textContent === "Add comment");
    await userEvent.click(conflictButton!);

    // Type some text to enable the button
    const textarea = await screen.findByPlaceholderText(/add a comment/i);
    await userEvent.type(textarea, "Test");

    // Should have "Add Comment" button (not "Save")
    await waitFor(() => {
      const submitButtons = screen.getAllByRole("button", { name: /add comment/i });
      const submitButton = submitButtons.find(btn => btn.textContent === "Add Comment");
      expect(submitButton).toBeInTheDocument();
    });

    // Should NOT have Save button
    expect(screen.queryByRole("button", { name: /^save$/i })).not.toBeInTheDocument();
  });

  it("should use placeholder 'Add a comment...' (not conflict-specific text)", async () => {
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
      expect(screen.getAllByText(/Conflict 1 of 1/).length).toBeGreaterThan(0);
    });

    // Click add comment
    const addCommentButtons = screen.getAllByRole("button", { name: /add comment/i });
    const conflictButton = addCommentButtons.find(btn => btn.textContent === "Add comment");
    await userEvent.click(conflictButton!);

    // Should have placeholder "Add a comment..."
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/add a comment/i)).toBeInTheDocument();
    });

    // Should NOT have old placeholder
    expect(screen.queryByPlaceholderText(/keep the changes/i)).not.toBeInTheDocument();
  });

  it("should have label with text-md class", async () => {
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

    // Click add comment
    const addCommentButtons = screen.getAllByRole("button", { name: /add comment/i });
    const conflictButton = addCommentButtons.find(btn => btn.textContent === "Add comment");
    await userEvent.click(conflictButton!);

    // Find label
    await waitFor(() => {
      const label = screen.getByText(/src\/file\.ts:L\d+/);
      expect(label.className).toMatch(/text-md/);
    });
  });
});
