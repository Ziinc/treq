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

describe("File selection in review", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.getDiffCache).mockResolvedValue([]);
    vi.mocked(api.clearPendingReview).mockResolvedValue();
  });

  const setupMockDataWithMultipleFiles = () => {
    vi.mocked(api.jjGetChangedFiles).mockResolvedValue([
      { path: "file1.txt", status: "M", previous_path: null },
      { path: "file2.txt", status: "M", previous_path: null },
      { path: "file3.txt", status: "A", previous_path: null },
    ]);

    vi.mocked(api.jjGetFileHunks).mockResolvedValue([
      {
        id: "hunk-1",
        header: "@@ -1,3 +1,3 @@",
        lines: [
          " context line 1",
          "+modified line 2",
          " context line 3",
        ],
        patch: "...",
      },
    ]);
  };

  it("should deselect files when clicking away on non-file area", async () => {
    setupMockDataWithMultipleFiles();
    const user = userEvent.setup();

    render(
      <ChangesDiffViewer
        workspacePath="/test/workspace"
        repoPath="/test/repo"
        workspaceId={1}
        initialSelectedFile={null}
      />
    );

    // Wait for files to load
    await waitFor(() => {
      expect(screen.getAllByText("file1.txt").length).toBeGreaterThan(0);
    });

    // Get file rows from the sidebar (they have specific classes from GitFileRow)
    const file1Elements = screen.getAllByText("file1.txt");
    const file1Row = file1Elements[0].closest(".group\\/row")!;
    const file2Elements = screen.getAllByText("file2.txt");
    const file2Row = file2Elements[0].closest(".group\\/row")!;

    // Cmd+click to select file1
    await user.keyboard("{Meta>}");
    await user.click(file1Row);
    await user.keyboard("{/Meta}");

    // Verify file1 is selected
    expect(file1Row).toHaveClass("bg-accent/40");

    // Cmd+click to select file2
    await user.keyboard("{Meta>}");
    await user.click(file2Row);
    await user.keyboard("{/Meta}");

    // Verify both files are selected
    expect(file1Row).toHaveClass("bg-accent/40");
    expect(file2Row).toHaveClass("bg-accent/40");

    // Click away on a non-file area (the right side diff panel)
    // The diff container should have the class "h-full overflow-y-auto"
    const diffContainer = document.querySelector(".h-full.overflow-y-auto");

    expect(diffContainer).toBeTruthy(); // Make sure it exists

    if (diffContainer) {
      await user.click(diffContainer as HTMLElement);
    } else {
      throw new Error("Could not find diff container");
    }

    // Verify both files are deselected
    await waitFor(() => {
      expect(file1Row).not.toHaveClass("bg-accent/40");
      expect(file2Row).not.toHaveClass("bg-accent/40");
    });
  });

  it("should deselect single file when clicking away on non-file area", async () => {
    setupMockDataWithMultipleFiles();
    const user = userEvent.setup();

    render(
      <ChangesDiffViewer
        workspacePath="/test/workspace"
        repoPath="/test/repo"
        workspaceId={1}
        initialSelectedFile={null}
      />
    );

    // Wait for files to load
    await waitFor(() => {
      expect(screen.getAllByText("file1.txt").length).toBeGreaterThan(0);
    });

    // Get file row from the sidebar
    const file1Elements = screen.getAllByText("file1.txt");
    const file1Row = file1Elements[0].closest(".group\\/row")!;

    // Regular click to select file1
    await user.click(file1Row);

    // Verify file1 is selected
    expect(file1Row).toHaveClass("bg-accent/40");

    // Click away on a non-file area (the right side diff panel)
    const diffContainer = document.querySelector(".h-full.overflow-y-auto");

    expect(diffContainer).toBeTruthy(); // Make sure it exists

    if (diffContainer) {
      await user.click(diffContainer as HTMLElement);
    } else {
      throw new Error("Could not find diff container");
    }

    // Verify file is deselected
    await waitFor(() => {
      expect(file1Row).not.toHaveClass("bg-accent/40");
    });
  });

  it("should deselect files when clicking on a diff line", async () => {
    setupMockDataWithMultipleFiles();
    const user = userEvent.setup();

    render(
      <ChangesDiffViewer
        workspacePath="/test/workspace"
        repoPath="/test/repo"
        workspaceId={1}
        initialSelectedFile={null}
      />
    );

    // Wait for files to load
    await waitFor(() => {
      expect(screen.getAllByText("file1.txt").length).toBeGreaterThan(0);
    });

    // Get file row from the sidebar and expand the file to see diff lines
    const file1Elements = screen.getAllByText("file1.txt");
    const file1Row = file1Elements[0].closest(".group\\/row")!;

    // Click to select and expand file1
    await user.click(file1Row);

    // Verify file1 is selected
    expect(file1Row).toHaveClass("bg-accent/40");

    // Wait for diff lines to load
    await waitFor(() => {
      const diffLines = document.querySelectorAll("[data-diff-line]");
      expect(diffLines.length).toBeGreaterThan(0);
    });

    // Click on a diff line
    const diffLines = document.querySelectorAll("[data-diff-line]");
    if (diffLines.length > 0) {
      await user.click(diffLines[0] as HTMLElement);
    }

    // Verify file is deselected
    await waitFor(() => {
      expect(file1Row).not.toHaveClass("bg-accent/40");
    });
  });

  it("should deselect files when clicking on file header area", async () => {
    setupMockDataWithMultipleFiles();
    const user = userEvent.setup();

    render(
      <ChangesDiffViewer
        workspacePath="/test/workspace"
        repoPath="/test/repo"
        workspaceId={1}
        initialSelectedFile={null}
      />
    );

    // Wait for files to load
    await waitFor(() => {
      expect(screen.getAllByText("file1.txt").length).toBeGreaterThan(0);
    });

    // Get file row from the sidebar and select it
    const file1Elements = screen.getAllByText("file1.txt");
    const file1Row = file1Elements[0].closest(".group\\/row")!;

    // Select file1
    await user.click(file1Row);

    // Verify file1 is selected
    expect(file1Row).toHaveClass("bg-accent/40");

    // Wait for file to expand and find the file header in the diff panel
    await waitFor(() => {
      const fileHeaders = document.querySelectorAll(".sticky.top-0");
      expect(fileHeaders.length).toBeGreaterThan(0);
    });

    // Click on the file header area (not on a button)
    const fileHeader = document.querySelector(".sticky.top-0");
    if (fileHeader) {
      // Click on an empty part of the header (not on buttons)
      const headerRect = fileHeader.getBoundingClientRect();
      await user.pointer({
        keys: '[MouseLeft]',
        target: fileHeader as HTMLElement,
        coords: { x: headerRect.left + 10, y: headerRect.top + 10 }
      });
    }

    // Verify file is deselected
    await waitFor(() => {
      expect(file1Row).not.toHaveClass("bg-accent/40");
    });
  });

  it("should deselect files when clicking on sidebar empty space", async () => {
    setupMockDataWithMultipleFiles();
    const user = userEvent.setup();

    render(
      <ChangesDiffViewer
        workspacePath="/test/workspace"
        repoPath="/test/repo"
        workspaceId={1}
        initialSelectedFile={null}
      />
    );

    // Wait for files to load
    await waitFor(() => {
      expect(screen.getAllByText("file1.txt").length).toBeGreaterThan(0);
    });

    // Get file row and select it
    const file1Elements = screen.getAllByText("file1.txt");
    const file1Row = file1Elements[0].closest(".group\\/row")!;

    await user.click(file1Row);

    // Verify file1 is selected
    expect(file1Row).toHaveClass("bg-accent/40");

    // Click on sidebar container (the w-72 sidebar div)
    const sidebar = document.querySelector(".w-72.border-r.border-border.bg-sidebar");
    expect(sidebar).toBeTruthy();

    if (sidebar) {
      await user.click(sidebar as HTMLElement);
    }

    // Verify file is deselected
    await waitFor(() => {
      expect(file1Row).not.toHaveClass("bg-accent/40");
    });
  });

  it("should NOT deselect files when clicking on a button", async () => {
    setupMockDataWithMultipleFiles();
    const user = userEvent.setup();

    render(
      <ChangesDiffViewer
        workspacePath="/test/workspace"
        repoPath="/test/repo"
        workspaceId={1}
        initialSelectedFile={null}
      />
    );

    // Wait for files to load
    await waitFor(() => {
      expect(screen.getAllByText("file1.txt").length).toBeGreaterThan(0);
    });

    // Get file row and select it
    const file1Elements = screen.getAllByText("file1.txt");
    const file1Row = file1Elements[0].closest(".group\\/row")!;

    await user.click(file1Row);

    // Verify file1 is selected
    expect(file1Row).toHaveClass("bg-accent/40");

    // Find and click the commit button (or any button)
    const commitButton = screen.queryByText(/commit/i);
    if (commitButton) {
      await user.click(commitButton);
    }

    // Verify file is still selected (should NOT deselect)
    expect(file1Row).toHaveClass("bg-accent/40");
  });
});
