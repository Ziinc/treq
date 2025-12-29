import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "./test-utils";
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

describe("Context menu copy functionality", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.getDiffCache).mockResolvedValue([]);
    vi.mocked(api.clearPendingReview).mockResolvedValue();
  });

  it("should have clipboard API mocked", async () => {
    expect(navigator.clipboard.writeText).toBeDefined();
    await navigator.clipboard.writeText("test");
    expect(vi.mocked(navigator.clipboard.writeText)).toHaveBeenCalledWith("test");
  });

  const setupMockData = () => {
    vi.mocked(api.jjGetChangedFiles).mockResolvedValue([
      { path: "test.txt", status: "M", previous_path: null },
    ]);

    vi.mocked(api.jjGetFileHunks).mockResolvedValue([
      {
        id: "hunk-1",
        header: "@@ -1,6 +1,7 @@",
        lines: [
          " context line 1",
          "+added line 2",
          "+added line 3",
          "+added line 4",
          " context line 5",
          " context line 6",
        ],
        patch: "...",
      },
    ]);
  };

  it("should show context menu with copy options when right-clicking selected line", async () => {
    setupMockData();
    const user = userEvent.setup();

    render(
      <ChangesDiffViewer
        workspacePath="/test/workspace"
        repoPath="/test/repo"
        workspaceId={1}
        initialSelectedFile={null}
      />
    );

    // Wait for file to load and expand it
    await waitFor(() => {
      expect(screen.getAllByText(/test\.txt/).length).toBeGreaterThan(0);
    });
    await user.click(screen.getAllByText(/test\.txt/)[0]);

    // Wait for lines to render
    await waitFor(() => {
      expect(screen.getByText(/added line 2/)).toBeInTheDocument();
    });

    // Get diff lines and select one line
    const diffLines = document.querySelectorAll("[data-diff-line]");
    const line2 = diffLines[1]; // "+added line 2"
    const line2Clickable = line2.querySelector("[class*='cursor-pointer']");

    // Select the line with a click
    fireEvent.mouseDown(line2Clickable!, { button: 0 });
    fireEvent.mouseUp(line2Clickable!);

    // Wait for selection
    await waitFor(() => {
      expect(line2.className).toContain("bg-blue-500/30");
    });

    // Right-click to open context menu
    fireEvent.contextMenu(line2);

    // Assert: Context menu should be visible with all three options
    await waitFor(() => {
      expect(screen.getByText("Add comment")).toBeInTheDocument();
      expect(screen.getByText("Copy line location")).toBeInTheDocument();
      expect(screen.getByText("Copy lines")).toBeInTheDocument();
    });
  });

  it("should copy single line location to clipboard", async () => {
    setupMockData();
    const user = userEvent.setup();

    render(
      <ChangesDiffViewer
        workspacePath="/test/workspace"
        repoPath="/test/repo"
        workspaceId={1}
        initialSelectedFile={null}
      />
    );

    // Wait for file to load and expand it
    await waitFor(() => {
      expect(screen.getAllByText(/test\.txt/).length).toBeGreaterThan(0);
    });
    await user.click(screen.getAllByText(/test\.txt/)[0]);

    // Wait for lines to render
    await waitFor(() => {
      expect(screen.getByText(/added line 2/)).toBeInTheDocument();
    });

    // Select single line (line 2, which is file line 2)
    const diffLines = document.querySelectorAll("[data-diff-line]");
    const line2 = diffLines[1];
    const line2Clickable = line2.querySelector("[class*='cursor-pointer']");

    fireEvent.mouseDown(line2Clickable!, { button: 0 });
    fireEvent.mouseUp(line2Clickable!);

    await waitFor(() => {
      expect(line2.className).toContain("bg-blue-500/30");
    });

    // Right-click and click "Copy line location"
    fireEvent.contextMenu(line2);

    await waitFor(() => {
      expect(screen.getByText("Copy line location")).toBeInTheDocument();
    });

    const copyLocationButton = screen.getByTestId("copy-line-location");
    fireEvent.click(copyLocationButton);

    // Wait for async clipboard operation
    await waitFor(() => {
      expect(vi.mocked(navigator.clipboard.writeText)).toHaveBeenCalledWith("test.txt:2");
    });
  });

  it("should copy multi-line location to clipboard", async () => {
    setupMockData();
    const user = userEvent.setup();

    render(
      <ChangesDiffViewer
        workspacePath="/test/workspace"
        repoPath="/test/repo"
        workspaceId={1}
        initialSelectedFile={null}
      />
    );

    // Wait for file to load and expand it
    await waitFor(() => {
      expect(screen.getAllByText(/test\.txt/).length).toBeGreaterThan(0);
    });
    await user.click(screen.getAllByText(/test\.txt/)[0]);

    // Wait for lines to render
    await waitFor(() => {
      expect(screen.getByText(/added line 2/)).toBeInTheDocument();
    });

    // Select lines 2-4 (file lines 2-4)
    const diffLines = document.querySelectorAll("[data-diff-line]");
    const line2 = diffLines[1];
    const line4 = diffLines[3];
    const line2Clickable = line2.querySelector("[class*='cursor-pointer']");

    fireEvent.mouseDown(line2Clickable!, { button: 0 });
    fireEvent.mouseEnter(line4);
    fireEvent.mouseUp(line4);

    await waitFor(() => {
      expect(line2.className).toContain("bg-blue-500/30");
      expect(line4.className).toContain("bg-blue-500/30");
    });

    // Right-click and click "Copy line location"
    fireEvent.contextMenu(line2);

    await waitFor(() => {
      expect(screen.getByText("Copy line location")).toBeInTheDocument();
    });

    const copyLocationButton = screen.getByTestId("copy-line-location");
    fireEvent.click(copyLocationButton);

    // Wait for async clipboard operation
    await waitFor(() => {
      expect(vi.mocked(navigator.clipboard.writeText)).toHaveBeenCalledWith("test.txt:2-4");
    });
  });

  it("should copy single line content to clipboard", async () => {
    setupMockData();
    const user = userEvent.setup();

    render(
      <ChangesDiffViewer
        workspacePath="/test/workspace"
        repoPath="/test/repo"
        workspaceId={1}
        initialSelectedFile={null}
      />
    );

    // Wait for file to load and expand it
    await waitFor(() => {
      expect(screen.getAllByText(/test\.txt/).length).toBeGreaterThan(0);
    });
    await user.click(screen.getAllByText(/test\.txt/)[0]);

    // Wait for lines to render
    await waitFor(() => {
      expect(screen.getByText(/added line 2/)).toBeInTheDocument();
    });

    // Select single line
    const diffLines = document.querySelectorAll("[data-diff-line]");
    const line2 = diffLines[1];
    const line2Clickable = line2.querySelector("[class*='cursor-pointer']");

    fireEvent.mouseDown(line2Clickable!, { button: 0 });
    fireEvent.mouseUp(line2Clickable!);

    await waitFor(() => {
      expect(line2.className).toContain("bg-blue-500/30");
    });

    // Right-click and click "Copy lines"
    fireEvent.contextMenu(line2);

    await waitFor(() => {
      expect(screen.getByText("Copy lines")).toBeInTheDocument();
    });

    const copyLinesButton = screen.getByTestId("copy-lines");
    fireEvent.click(copyLinesButton);

    // Wait for async clipboard operation
    await waitFor(() => {
      expect(vi.mocked(navigator.clipboard.writeText)).toHaveBeenCalledWith("+added line 2");
    });
  });

  it("should copy multi-line content to clipboard", async () => {
    setupMockData();
    const user = userEvent.setup();

    render(
      <ChangesDiffViewer
        workspacePath="/test/workspace"
        repoPath="/test/repo"
        workspaceId={1}
        initialSelectedFile={null}
      />
    );

    // Wait for file to load and expand it
    await waitFor(() => {
      expect(screen.getAllByText(/test\.txt/).length).toBeGreaterThan(0);
    });
    await user.click(screen.getAllByText(/test\.txt/)[0]);

    // Wait for lines to render
    await waitFor(() => {
      expect(screen.getByText(/added line 2/)).toBeInTheDocument();
    });

    // Select lines 2-4
    const diffLines = document.querySelectorAll("[data-diff-line]");
    const line2 = diffLines[1];
    const line4 = diffLines[3];
    const line2Clickable = line2.querySelector("[class*='cursor-pointer']");

    fireEvent.mouseDown(line2Clickable!, { button: 0 });
    fireEvent.mouseEnter(line4);
    fireEvent.mouseUp(line4);

    await waitFor(() => {
      expect(line2.className).toContain("bg-blue-500/30");
      expect(line4.className).toContain("bg-blue-500/30");
    });

    // Right-click and click "Copy lines"
    fireEvent.contextMenu(line2);

    await waitFor(() => {
      expect(screen.getByText("Copy lines")).toBeInTheDocument();
    });

    const copyLinesButton = screen.getByTestId("copy-lines");
    fireEvent.click(copyLinesButton);

    // Wait for async clipboard operation
    await waitFor(() => {
      expect(vi.mocked(navigator.clipboard.writeText)).toHaveBeenCalledWith(
        "+added line 2\n+added line 3\n+added line 4"
      );
    });
  });

  it("should close context menu after copying", async () => {
    setupMockData();
    const user = userEvent.setup();

    render(
      <ChangesDiffViewer
        workspacePath="/test/workspace"
        repoPath="/test/repo"
        workspaceId={1}
        initialSelectedFile={null}
      />
    );

    // Wait for file to load and expand it
    await waitFor(() => {
      expect(screen.getAllByText(/test\.txt/).length).toBeGreaterThan(0);
    });
    await user.click(screen.getAllByText(/test\.txt/)[0]);

    // Wait for lines to render
    await waitFor(() => {
      expect(screen.getByText(/added line 2/)).toBeInTheDocument();
    });

    // Select line
    const diffLines = document.querySelectorAll("[data-diff-line]");
    const line2 = diffLines[1];
    const line2Clickable = line2.querySelector("[class*='cursor-pointer']");

    fireEvent.mouseDown(line2Clickable!, { button: 0 });
    fireEvent.mouseUp(line2Clickable!);

    await waitFor(() => {
      expect(line2.className).toContain("bg-blue-500/30");
    });

    // Right-click and click "Copy line location"
    fireEvent.contextMenu(line2);

    await waitFor(() => {
      expect(screen.getByText("Copy line location")).toBeInTheDocument();
    });

    const copyLocationButton = screen.getByTestId("copy-line-location");
    fireEvent.click(copyLocationButton);

    // Assert: Context menu should be closed
    await waitFor(() => {
      expect(screen.queryByText("Copy line location")).not.toBeInTheDocument();
    });
  });
});
