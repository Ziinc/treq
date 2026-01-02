import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "./test-utils";
import userEvent from "@testing-library/user-event";
import * as api from "../src/lib/api";
import { MergePreviewPage } from "../src/components/MergePreviewPage";

vi.mock("../src/lib/api", async () => {
  const actual = await vi.importActual("../src/lib/api");
  return {
    ...actual,
    jjGetCommitsAhead: vi.fn(),
    jjGetMergeDiff: vi.fn(),
    jjCreateMerge: vi.fn(),
    deleteWorkspace: vi.fn(),
  };
});

describe("MergePreviewPage", () => {
  const mockWorkspace: api.Workspace = {
    id: 1,
    repo_path: "/repo",
    workspace_name: "feature",
    workspace_path: "/repo/.jj/workspaces/feature",
    branch_name: "feature-branch",
    target_branch: "main",
    created_at: "2024-01-01T00:00:00Z",
    has_conflicts: false,
  };

  const mockCommit: api.JjLogCommit = {
    commit_id: "abc123def456",
    short_id: "abc123",
    change_id: "xyz789",
    description: "Add feature",
    author_name: "Test Author",
    timestamp: "2024-01-01 10:00:00",
    parent_ids: ["parent123"],
    is_working_copy: false,
    bookmarks: [],
  };

  const mockCommitsAhead: api.JjCommitsAhead = {
    commits: [mockCommit],
    total_count: 1,
  };

  const mockDiff: api.JjRevisionDiff = {
    files: [{ path: "src/file.ts", status: "M", previous_path: null }],
    hunks_by_file: [
      {
        path: "src/file.ts",
        hunks: [
          {
            id: "hunk1",
            header: "@@ -1,1 +1,2 @@",
            lines: [" unchanged", "+ added line"],
            patch: "@@ -1,1 +1,2 @@\n unchanged\n+ added line",
          },
        ],
      },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.jjGetCommitsAhead).mockResolvedValue(mockCommitsAhead);
    vi.mocked(api.jjGetMergeDiff).mockResolvedValue(mockDiff);
  });

  it("loads and displays commits ahead of target branch", async () => {
    const onCancel = vi.fn();
    const onMergeComplete = vi.fn();

    render(
      <MergePreviewPage
        workspace={mockWorkspace}
        repoPath="/repo"
        onCancel={onCancel}
        onMergeComplete={onMergeComplete}
      />
    );

    await waitFor(() => {
      expect(api.jjGetCommitsAhead).toHaveBeenCalledWith(
        mockWorkspace.workspace_path,
        "main"
      );
    });

    expect(await screen.findByText("abc123")).toBeInTheDocument();
    expect(screen.getByText("Add feature")).toBeInTheDocument();
    expect(screen.getByText(/Test Author/i)).toBeInTheDocument();
  });

  it("displays combined diff of changed files", async () => {
    const onCancel = vi.fn();
    const onMergeComplete = vi.fn();

    render(
      <MergePreviewPage
        workspace={mockWorkspace}
        repoPath="/repo"
        onCancel={onCancel}
        onMergeComplete={onMergeComplete}
      />
    );

    expect(await screen.findByText("src/file.ts")).toBeInTheDocument();
    expect(screen.getByText(/Changed Files \(1\)/i)).toBeInTheDocument();
  });

  it("allows editing commit message", async () => {
    const onCancel = vi.fn();
    const onMergeComplete = vi.fn();

    render(
      <MergePreviewPage
        workspace={mockWorkspace}
        repoPath="/repo"
        onCancel={onCancel}
        onMergeComplete={onMergeComplete}
      />
    );

    const user = userEvent.setup();
    const textarea = await screen.findByPlaceholderText(/commit message/i);

    await user.clear(textarea);
    await user.type(textarea, "Custom merge message");

    expect(textarea).toHaveValue("Custom merge message");
  });

  it("creates merge commit and calls onMergeComplete on success", async () => {
    vi.mocked(api.jjCreateMerge).mockResolvedValue({
      success: true,
      message: "Merged successfully",
      has_conflicts: false,
      conflicted_files: [],
      merge_commit_id: "def456",
    });

    const onCancel = vi.fn();
    const onMergeComplete = vi.fn();

    render(
      <MergePreviewPage
        workspace={mockWorkspace}
        repoPath="/repo"
        onCancel={onCancel}
        onMergeComplete={onMergeComplete}
      />
    );

    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /^merge$/i }));

    await waitFor(() => {
      expect(api.jjCreateMerge).toHaveBeenCalledWith(
        mockWorkspace.workspace_path,
        "main",
        expect.stringContaining("Merge")
      );
    });

    expect(onMergeComplete).toHaveBeenCalled();
  });

  it("shows warning and calls onCancel if merge has conflicts", async () => {
    vi.mocked(api.jjCreateMerge).mockResolvedValue({
      success: true,
      message: "Merged with conflicts",
      has_conflicts: true,
      conflicted_files: ["src/file.ts"],
      merge_commit_id: "def456",
    });

    const onCancel = vi.fn();
    const onMergeComplete = vi.fn();

    render(
      <MergePreviewPage
        workspace={mockWorkspace}
        repoPath="/repo"
        onCancel={onCancel}
        onMergeComplete={onMergeComplete}
      />
    );

    await userEvent.setup().click(await screen.findByRole("button", { name: /^merge$/i }));

    await waitFor(() => {
      expect(onCancel).toHaveBeenCalled();
    });
    expect(onMergeComplete).not.toHaveBeenCalled();
  });

  it("disables merge button when no commits ahead", async () => {
    vi.mocked(api.jjGetCommitsAhead).mockResolvedValue({
      commits: [],
      total_count: 0,
    });

    const onCancel = vi.fn();
    const onMergeComplete = vi.fn();

    render(
      <MergePreviewPage
        workspace={mockWorkspace}
        repoPath="/repo"
        onCancel={onCancel}
        onMergeComplete={onMergeComplete}
      />
    );

    const mergeButton = await screen.findByRole("button", { name: /^merge$/i });
    expect(mergeButton).toBeDisabled();
  });

  it("calls onCancel when cancel button clicked", async () => {
    const onCancel = vi.fn();
    const onMergeComplete = vi.fn();

    render(
      <MergePreviewPage
        workspace={mockWorkspace}
        repoPath="/repo"
        onCancel={onCancel}
        onMergeComplete={onMergeComplete}
      />
    );

    await userEvent.setup().click(await screen.findByRole("button", { name: /cancel/i }));

    expect(onCancel).toHaveBeenCalled();
  });

  it("displays loading state while fetching data", async () => {
    vi.mocked(api.jjGetCommitsAhead).mockImplementation(
      () => new Promise(() => {}) // Never resolves
    );

    const onCancel = vi.fn();
    const onMergeComplete = vi.fn();

    render(
      <MergePreviewPage
        workspace={mockWorkspace}
        repoPath="/repo"
        onCancel={onCancel}
        onMergeComplete={onMergeComplete}
      />
    );

    // Should show loading indicator
    expect(screen.getByRole("status", { hidden: true }) || screen.getByText(/loading/i)).toBeTruthy();
  });

  it("displays commit count in header", async () => {
    const onCancel = vi.fn();
    const onMergeComplete = vi.fn();

    render(
      <MergePreviewPage
        workspace={mockWorkspace}
        repoPath="/repo"
        onCancel={onCancel}
        onMergeComplete={onMergeComplete}
      />
    );

    expect(await screen.findByText(/Commits to be merged \(1\)/i)).toBeInTheDocument();
  });

  it("disables merge button when commit message is empty for explicit merge", async () => {
    const onCancel = vi.fn();
    const onMergeComplete = vi.fn();

    render(
      <MergePreviewPage
        workspace={mockWorkspace}
        repoPath="/repo"
        onCancel={onCancel}
        onMergeComplete={onMergeComplete}
      />
    );

    const user = userEvent.setup();
    const textarea = await screen.findByPlaceholderText(/commit message/i);

    await user.clear(textarea);

    const mergeButton = screen.getByRole("button", { name: /^merge$/i });
    expect(mergeButton).toBeDisabled();
  });
});
