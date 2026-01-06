import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "./test-utils";
import userEvent from "@testing-library/user-event";
import * as api from "../src/lib/api";
import { ChangesDiffViewer } from "../src/components/ChangesDiffViewer";
import { createMockFiles } from "./factories/file.factory";

// Mock API and Tauri modules
vi.mock("../src/lib/api", async () => {
  const actual = await vi.importActual("../src/lib/api");
  return {
    ...actual,
    jjGetChangedFiles: vi.fn(),
    jjGetFileHunks: vi.fn(),
    jjCommit: vi.fn(),
    jjSplit: vi.fn(),
    getDiffCache: vi.fn(),
    clearPendingReview: vi.fn(),
    invalidateCache: vi.fn(),
  };
});

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
  emit: vi.fn(),
}));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: vi.fn().mockReturnValue({
    setTitle: vi.fn(),
    onFocusChanged: vi.fn().mockResolvedValue(() => {}),
  }),
}));

describe("Staging area - file selection and commit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.getDiffCache).mockResolvedValue([]);
    vi.mocked(api.clearPendingReview).mockResolvedValue();
    vi.mocked(api.invalidateCache).mockResolvedValue();
  });

  const setupMockDataWithFiles = (count: number = 3) => {
    const mockFiles = createMockFiles(count, { status: "M" });
    vi.mocked(api.jjGetChangedFiles).mockResolvedValue(mockFiles);
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

  it("should stage a single file when clicking + button", async () => {
    setupMockDataWithFiles(3);
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
      expect(screen.getAllByText("file1.ts").length).toBeGreaterThan(0);
    });

    // TODO: Click + button on first file
    // TODO: Verify file appears in "Selected" section
    // TODO: Verify file removed from "Changes" section
  });

  it("should unstage a file when clicking - button", async () => {
    setupMockDataWithFiles(1);
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
      expect(screen.getAllByText("file1.ts").length).toBeGreaterThan(0);
    });

    // TODO: Click + button to stage file
    // TODO: Click - button to unstage file
    // TODO: Verify file back in "Changes" section
  });

  it("should not stage files when using UI selection (shift+click)", async () => {
    setupMockDataWithFiles(3);
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
      expect(screen.getAllByText("file1.ts").length).toBeGreaterThan(0);
    });

    // TODO: Shift+click to select files
    // TODO: Verify files are highlighted
    // TODO: Verify "Selected" section does NOT appear
  });

  it("should commit only staged files via jjSplit", async () => {
    setupMockDataWithFiles(3);
    vi.mocked(api.jjSplit).mockResolvedValue("Commit created: abc1234");
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
      expect(screen.getAllByText("file1.ts").length).toBeGreaterThan(0);
    });

    // TODO: Stage 2 out of 3 files
    // TODO: Enter commit message
    // TODO: Click commit button
    // TODO: Verify jjSplit called with only 2 file paths
    // TODO: Verify jjCommit NOT called
  });

  it("should commit all files via jjCommit when no files are staged", async () => {
    setupMockDataWithFiles(3);
    vi.mocked(api.jjCommit).mockResolvedValue("Commit created: abc1234");
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
      expect(screen.getAllByText("file1.ts").length).toBeGreaterThan(0);
    });

    // TODO: Do NOT stage any files
    // TODO: Enter commit message
    // TODO: Click commit button
    // TODO: Verify jjCommit called
    // TODO: Verify jjSplit NOT called
  });

  it("should stage all selected files when clicking + with multi-select", async () => {
    setupMockDataWithFiles(5);
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
      expect(screen.getAllByText("file1.ts").length).toBeGreaterThan(0);
    });

    // TODO: Shift+click to select 3 files
    // TODO: Click + button on one of the selected files
    // TODO: Verify all 3 selected files appear in "Selected" section
  });

  it("should clear staging area after successful commit", async () => {
    setupMockDataWithFiles(2);
    vi.mocked(api.jjSplit).mockResolvedValue("Commit created: abc1234");
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
      expect(screen.getAllByText("file1.ts").length).toBeGreaterThan(0);
    });

    // TODO: Stage 1 file
    // TODO: Verify "Selected" section shows 1 file
    // TODO: Commit successfully
    // TODO: Verify "Selected" section disappears
  });
});
