import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "./test-utils";
import userEvent from "@testing-library/user-event";
import * as api from "../src/lib/api";
import { ChangesDiffViewer } from "../src/components/ChangesDiffViewer";

vi.mock("../src/lib/api", async () => {
  const actual = await vi.importActual<typeof import("../src/lib/api")>(
    "../src/lib/api"
  );
  return {
    ...actual,
    jjGetChangedFiles: vi.fn(),
    jjGetFileHunks: vi.fn(),
    getDiffCache: vi.fn(),
    loadPendingReview: vi.fn(),
    savePendingReview: vi.fn(),
    clearPendingReview: vi.fn(),
    setDiffCache: vi.fn(),
  };
});

describe("Tab switching and refresh - basic functionality", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.getDiffCache).mockResolvedValue([]);
    vi.mocked(api.savePendingReview).mockResolvedValue();
    vi.mocked(api.clearPendingReview).mockResolvedValue();
    vi.mocked(api.setDiffCache).mockResolvedValue();
  });

  it("should load and display multiple files when component mounts", async () => {
    vi.mocked(api.jjGetChangedFiles).mockResolvedValue([
      { path: "file1.txt", status: "M", previous_path: null },
      { path: "file2.txt", status: "M", previous_path: null },
      { path: "file3.txt", status: "A", previous_path: null },
    ]);

    vi.mocked(api.jjGetFileHunks).mockImplementation(async (_, filePath) => {
      return [
        {
          id: `${filePath}-hunk-1`,
          header: "@@ -1,2 +1,3 @@",
          lines: [" line 1", `+content from ${filePath}`, " line 3"],
          patch: "...",
        },
      ];
    });

    vi.mocked(api.loadPendingReview).mockResolvedValue([]);

    render(
      <ChangesDiffViewer
        workspacePath="/test/workspace"
        repoPath="/test/repo"
        workspaceId={1}
        initialSelectedFile={null}
      />
    );

    // Wait for all files to appear
    await waitFor(() => {
      const file1 = screen.queryAllByText(/file1\.txt/);
      const file2 = screen.queryAllByText(/file2\.txt/);
      const file3 = screen.queryAllByText(/file3\.txt/);
      expect(file1.length).toBeGreaterThan(0);
      expect(file2.length).toBeGreaterThan(0);
      expect(file3.length).toBeGreaterThan(0);
    });

    // Verify all files are displayed
    expect(screen.getAllByText(/file1\.txt/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/file2\.txt/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/file3\.txt/).length).toBeGreaterThan(0);

    // Verify jjGetChangedFiles was called on mount
    expect(api.jjGetChangedFiles).toHaveBeenCalledWith("/test/workspace");
  });

  it("should display file content when expanded", async () => {
    vi.mocked(api.jjGetChangedFiles).mockResolvedValue([
      { path: "test.txt", status: "M", previous_path: null },
    ]);

    vi.mocked(api.jjGetFileHunks).mockResolvedValue([
      {
        id: "hunk-1",
        header: "@@ -1,2 +1,3 @@",
        lines: [" line 1", "+new line", " line 3"],
        patch: "...",
      },
    ]);

    vi.mocked(api.loadPendingReview).mockResolvedValue([]);

    render(
      <ChangesDiffViewer
        workspacePath="/test/workspace"
        repoPath="/test/repo"
        workspaceId={1}
        initialSelectedFile={null}
      />
    );

    // Wait for file to appear
    await waitFor(() => {
      expect(screen.getByText(/test\.txt/)).toBeInTheDocument();
    });

    // Expand the file
    const fileElement = screen.getAllByText(/test\.txt/)[0];
    await userEvent.click(fileElement);

    // Wait for content to be visible
    await waitFor(() => {
      expect(screen.getByText(/new line/)).toBeInTheDocument();
    });

    // Verify hunk is displayed
    expect(screen.getByText(/line 1/)).toBeInTheDocument();
    expect(screen.getByText(/line 3/)).toBeInTheDocument();
  });
});
