import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "./test-utils";
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

describe("Conflict 'Add comment' button", () => {
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

  it("should show 'Add comment' text in button", async () => {
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

    // Should find button with text "Add comment"
    const addCommentButtons = screen.getAllByRole("button", { name: /add comment/i });
    // Filter to conflict button (has text content "Add comment", not just aria-label or title)
    const conflictButton = addCommentButtons.find(btn => btn.textContent === "Add comment");

    expect(conflictButton).toBeInTheDocument();
    expect(conflictButton?.textContent).toContain("Add comment");
  });

  it("should have variant='secondary' styling", async () => {
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

    const addCommentButtons = screen.getAllByRole("button", { name: /add comment/i });
    const conflictButton = addCommentButtons.find(btn => btn.textContent === "Add comment");

    // Secondary variant has specific classes (bg-secondary, text-secondary-foreground)
    expect(conflictButton?.className).toMatch(/bg-secondary/);
  });

  it("should be positioned within conflict section", async () => {
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

    const addCommentButtons = screen.getAllByRole("button", { name: /add comment/i });
    const conflictButton = addCommentButtons.find(btn => btn.textContent === "Add comment");

    // Button should be inside the conflict card
    const conflictCard = container.querySelector(".border.border-destructive\\/30");
    expect(conflictCard?.contains(conflictButton!)).toBe(true);
  });

  it("should have size='sm'", async () => {
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

    const addCommentButtons = screen.getAllByRole("button", { name: /add comment/i });
    const conflictButton = addCommentButtons.find(btn => btn.textContent === "Add comment");

    // Small size button should have h-9 class (or similar small size class)
    expect(conflictButton?.className).toMatch(/h-9|h-8/);
  });
});
