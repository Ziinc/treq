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

describe("Saved conflict comment display", () => {
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

  it("should display saved comment text below conflict content", async () => {
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

    // Click add comment button
    const addCommentButtons = screen.getAllByRole("button", { name: /add comment/i });
    const conflictButton = addCommentButtons.find(btn => btn.textContent === "Add comment");
    await userEvent.click(conflictButton!);

    // Type comment
    const textarea = await screen.findByPlaceholderText(/add a comment/i);
    await userEvent.type(textarea, "Keep the changes from side 2");

    // Save comment
    const saveButton = screen.getAllByRole("button", { name: /add comment/i }).find(btn => btn.textContent === "Add Comment")!;
    await userEvent.click(saveButton);

    // Comment should be visible below conflict
    await waitFor(() => {
      expect(screen.getByText("Keep the changes from side 2")).toBeInTheDocument();
    });
  });

  it("should keep comment visible even after form closes", async () => {
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

    // Add a comment
    const addCommentButtons = screen.getAllByRole("button", { name: /add comment/i });
    const conflictButton = addCommentButtons.find(btn => btn.textContent === "Add comment");
    await userEvent.click(conflictButton!);

    const textarea = await screen.findByPlaceholderText(/add a comment/i);
    await userEvent.type(textarea, "Test comment");

    const saveButton = screen.getAllByRole("button", { name: /add comment/i }).find(btn => btn.textContent === "Add Comment")!;
    await userEvent.click(saveButton);

    // Wait for form to close
    await waitFor(() => {
      expect(screen.queryByPlaceholderText(/add a comment/i)).not.toBeInTheDocument();
    });

    // Comment should still be visible
    expect(screen.getByText("Test comment")).toBeInTheDocument();
  });

  it("should have distinguishable styling for saved comment", async () => {
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
    await userEvent.type(textarea, "Test comment");

    const saveButton = screen.getAllByRole("button", { name: /add comment/i }).find(btn => btn.textContent === "Add Comment")!;
    await userEvent.click(saveButton);

    // Find the saved comment container
    await waitFor(() => {
      expect(screen.getByText("Test comment")).toBeInTheDocument();
    });

    // Find container with specific classes
    const commentContainers = container.querySelectorAll(".border-t.border-border.bg-muted\\/40");

    // Should have at least one saved comment container
    expect(commentContainers.length).toBeGreaterThan(0);
  });

  it("should show 'Resolution note:' label above saved comment", async () => {
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

    // Add a comment
    const addCommentButtons = screen.getAllByRole("button", { name: /add comment/i });
    const conflictButton = addCommentButtons.find(btn => btn.textContent === "Add comment");
    await userEvent.click(conflictButton!);

    const textarea = await screen.findByPlaceholderText(/add a comment/i);
    await userEvent.type(textarea, "Test comment");

    const saveButton = screen.getAllByRole("button", { name: /add comment/i }).find(btn => btn.textContent === "Add Comment")!;
    await userEvent.click(saveButton);

    // Should show "Resolution note:" label
    await waitFor(() => {
      expect(screen.getByText(/Resolution note:/i)).toBeInTheDocument();
    });
  });
});
