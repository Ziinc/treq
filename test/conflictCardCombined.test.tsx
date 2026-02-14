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

describe("Combined conflict card", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Mock a file with 2 conflicts
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
        header: "@@ -1,14 +1,14 @@",
        lines: [
          "+<<<<<<< Conflict 1 of 2",
          "+%%%%%%%",
          "+-old line 1",
          "++++++++",
          "+new line 1",
          "+>>>>>>> Conflict 1 of 2 ends",
          " ",
          "+<<<<<<< Conflict 2 of 2",
          "+%%%%%%%",
          "+-old line 2",
          "++++++++",
          "+new line 2",
          "+>>>>>>> Conflict 2 of 2 ends",
        ],
        patch: "...",
      },
    ]);

    vi.mocked(api.getDiffCache).mockResolvedValue([]);
  });

  it("should render a single card for file with 2 conflicts", async () => {
    const { container } = render(
      <ChangesDiffViewer
        workspacePath="/test/workspace"
        repoPath="/test/repo"
        workspaceId={1}
        initialSelectedFile={null}
        conflictedFiles={["src/file.ts"]}
      />
    );

    // Wait for conflicts to load
    await waitFor(() => {
      expect(screen.getAllByText(/src\/file\.ts/).length).toBeGreaterThan(0);
    });

    // Should have only ONE conflict card border (not two separate cards)
    const conflictCards = container.querySelectorAll(".border.border-destructive\\/30");
    expect(conflictCards.length).toBe(1);
  });

  it("should show file path once in card header", async () => {
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
      expect(screen.getAllByText(/src\/file\.ts/).length).toBeGreaterThan(0);
    });

    // File path should appear in the single card header, plus in the sidebar
    // We can't easily count exact occurrences, but we can verify it's in a header
    const filePathElements = screen.getAllByText("src/file.ts");

    // At least one should be in a conflict card header with destructive background
    const inHeader = filePathElements.some(el => {
      const parent = el.closest(".bg-destructive\\/10");
      return parent !== null;
    });

    expect(inHeader).toBe(true);
  });

  it("should show divider between conflict sections", async () => {
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
      expect(screen.getAllByText(/Conflict 1 of 2/).length).toBeGreaterThan(0);
    });

    // Should have a divider between conflicts (border-t)
    const conflictCard = container.querySelector(".border.border-destructive\\/30");
    const dividers = conflictCard?.querySelectorAll(".border-t.border-border");

    // Should have at least 1 divider between 2 conflicts
    expect(dividers && dividers.length).toBeGreaterThan(0);
  });

  it("should have separate 'Add comment' button for each conflict section", async () => {
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
      expect(screen.getAllByText(/Conflict 1 of 2/).length).toBeGreaterThan(0);
    });

    // Should have 2 "Add comment" buttons (one per conflict)
    const addCommentButtons = screen.getAllByRole("button", { name: /add comment/i });

    // Filter to only conflict comment buttons (exclude any from regular diff view)
    const conflictButtons = addCommentButtons.filter(btn => {
      // Conflict buttons should be near conflict markers
      const card = btn.closest(".border.border-destructive\\/30");
      return card !== null;
    });

    expect(conflictButtons.length).toBe(2);
  });

  it("should NOT show 'Conflict X of Y' text in card header", async () => {
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
      expect(screen.getAllByText(/Conflict 1 of 2/).length).toBeGreaterThan(0);
    });

    // Get the card header (bg-destructive/10)
    const cardHeader = container.querySelector(".bg-destructive\\/10");

    // Header should NOT contain "Conflict 1 of 2" text
    // (it should appear in the conflict content, but not in the header)
    expect(cardHeader?.textContent).not.toMatch(/Conflict\s+\d+\s+of\s+\d+/);
  });
});
