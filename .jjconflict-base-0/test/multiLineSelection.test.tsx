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

describe("Multi-line selection in diff viewer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.getDiffCache).mockResolvedValue([]);
    vi.mocked(api.clearPendingReview).mockResolvedValue();
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

  it("should show + button only on the last selected line after drag selection", async () => {
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

    // Get all diff lines (they have data-diff-line attribute)
    const diffLines = document.querySelectorAll("[data-diff-line]");
    expect(diffLines.length).toBeGreaterThanOrEqual(4);

    const line2 = diffLines[1]; // "+added line 2"
    const line3 = diffLines[2]; // "+added line 3"
    const line4 = diffLines[3]; // "+added line 4"

    // Get the clickable area within the line (the line number section)
    const line2Clickable = line2.querySelector("[class*='cursor-pointer']");
    const line4Clickable = line4.querySelector("[class*='cursor-pointer']");

    expect(line2Clickable).not.toBeNull();
    expect(line4Clickable).not.toBeNull();

    // Simulate drag selection from line 2 to line 4
    fireEvent.mouseDown(line2Clickable!, { button: 0 });
    fireEvent.mouseEnter(line3);
    fireEvent.mouseEnter(line4);
    fireEvent.mouseUp(line4);

    // Assert: Lines 2, 3, 4 should be highlighted (have blue background class)
    await waitFor(() => {
      const line2Classes = line2.className;
      const line3Classes = line3.className;
      const line4Classes = line4.className;

      expect(line2Classes).toContain("bg-blue-500/30");
      expect(line3Classes).toContain("bg-blue-500/30");
      expect(line4Classes).toContain("bg-blue-500/30");
    });

    // Assert: + button should be visible ONLY on line 4 (the last line)
    await waitFor(() => {
      const addButtons = document.querySelectorAll("[data-comment-button]");

      // Count visible buttons (those without 'invisible' class)
      const visibleButtons = Array.from(addButtons).filter((btn) => {
        const classes = btn.className;
        // Button is visible if it has 'visible' class or doesn't have 'invisible' class
        return classes.includes("visible") && !classes.includes("invisible");
      });

      // Should have exactly 1 visible button
      expect(visibleButtons.length).toBe(1);

      // That button should be in line 4's container
      expect(line4.contains(visibleButtons[0])).toBe(true);
    });
  });

  it("should show + button only on cursor line during drag selection", async () => {
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

    // Get all diff lines
    const diffLines = document.querySelectorAll("[data-diff-line]");
    const line2 = diffLines[1];
    const line3 = diffLines[2];

    const line2Clickable = line2.querySelector("[class*='cursor-pointer']");
    expect(line2Clickable).not.toBeNull();

    // Start drag from line 2
    fireEvent.mouseDown(line2Clickable!, { button: 0 });

    // Move to line 3 (without releasing mouse)
    fireEvent.mouseEnter(line3);

    // During drag: + button should be visible ONLY on line 3 (cursor position)
    await waitFor(() => {
      const addButtons = document.querySelectorAll("[data-comment-button]");
      const visibleButtons = Array.from(addButtons).filter((btn) => {
        const classes = btn.className;
        return classes.includes("visible") && !classes.includes("invisible");
      });

      // Should have exactly 1 visible button during drag
      expect(visibleButtons.length).toBe(1);

      // That button should be in line 3's container (the cursor line)
      expect(line3.contains(visibleButtons[0])).toBe(true);
    });
  });

  it("should show + button on ending line for backward selection", async () => {
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

    const diffLines = document.querySelectorAll("[data-diff-line]");
    const line2 = diffLines[1];
    const line4 = diffLines[3];

    const line4Clickable = line4.querySelector("[class*='cursor-pointer']");
    expect(line4Clickable).not.toBeNull();

    // Backward selection: Start from line 4, drag to line 2
    fireEvent.mouseDown(line4Clickable!, { button: 0 });
    fireEvent.mouseEnter(line2);
    fireEvent.mouseUp(line2);

    // All lines should be highlighted
    await waitFor(() => {
      expect(line2.className).toContain("bg-blue-500/30");
      expect(line4.className).toContain("bg-blue-500/30");
    });

    // + button should be visible ONLY on line 2 (where mouse ended)
    await waitFor(() => {
      const addButtons = document.querySelectorAll("[data-comment-button]");
      const visibleButtons = Array.from(addButtons).filter((btn) => {
        const classes = btn.className;
        return classes.includes("visible") && !classes.includes("invisible");
      });

      expect(visibleButtons.length).toBe(1);
      expect(line2.contains(visibleButtons[0])).toBe(true);
    });
  });

  it("should keep lines selected after mouseup (selection persists)", async () => {
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

    const diffLines = document.querySelectorAll("[data-diff-line]");
    const line2 = diffLines[1];
    const line3 = diffLines[2];
    const line4 = diffLines[3];

    const line2Clickable = line2.querySelector("[class*='cursor-pointer']");
    const line4Clickable = line4.querySelector("[class*='cursor-pointer']");
    expect(line2Clickable).not.toBeNull();
    expect(line4Clickable).not.toBeNull();

    // Perform drag selection with full event sequence
    fireEvent.mouseDown(line2Clickable!, { button: 0 });
    fireEvent.mouseEnter(line3);
    fireEvent.mouseEnter(line4);
    fireEvent.mouseUp(line4Clickable!);

    // After mouseUp, a click may fire on the element where mouse was released
    fireEvent.click(line4Clickable!);

    // Wait for selection to be established
    await waitFor(() => {
      expect(line2.className).toContain("bg-blue-500/30");
      expect(line3.className).toContain("bg-blue-500/30");
      expect(line4.className).toContain("bg-blue-500/30");
    });

    // Wait a bit to ensure no delayed clearing happens
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Assert: Lines should STILL be highlighted after mouseUp and click
    expect(line2.className).toContain("bg-blue-500/30");
    expect(line3.className).toContain("bg-blue-500/30");
    expect(line4.className).toContain("bg-blue-500/30");
  });

  it("should open comment input for entire selection when clicking + on last line", async () => {
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

    const diffLines = document.querySelectorAll("[data-diff-line]");
    const line2 = diffLines[1];
    const line4 = diffLines[3];

    const line2Clickable = line2.querySelector("[class*='cursor-pointer']");
    expect(line2Clickable).not.toBeNull();

    // Select lines 2-4
    fireEvent.mouseDown(line2Clickable!, { button: 0 });
    fireEvent.mouseEnter(line4);
    fireEvent.mouseUp(line4);

    // Wait for selection to complete
    await waitFor(() => {
      expect(line2.className).toContain("bg-blue-500/30");
    });

    // Find the visible + button on line 4
    await waitFor(() => {
      const addButtons = document.querySelectorAll("[data-comment-button]");
      const visibleButtons = Array.from(addButtons).filter((btn) => {
        const classes = btn.className;
        return classes.includes("visible") && !classes.includes("invisible");
      });
      expect(visibleButtons.length).toBe(1);
    });

    // Click the + button
    const addButtons = document.querySelectorAll("[data-comment-button]");
    const visibleButton = Array.from(addButtons).find((btn) => {
      const classes = btn.className;
      return classes.includes("visible") && !classes.includes("invisible");
    });

    expect(visibleButton).toBeDefined();
    await user.click(visibleButton as HTMLElement);

    // Comment input should appear
    await waitFor(() => {
      const textarea = screen.getByPlaceholderText(/add a comment/i);
      expect(textarea).toBeInTheDocument();
    });
  });
});
