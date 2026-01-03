import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "./test-utils";
import { WorkspaceDeletion } from "../src/components/WorkspaceDeletion";
import { userEvent } from "@testing-library/user-event";
import { Workspace } from "../src/lib/api";

// Mock Tauri APIs
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
  emit: vi.fn(),
}));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: vi.fn().mockReturnValue({
    setTitle: vi.fn(),
    onFocusChanged: vi.fn().mockResolvedValue(() => {}),
  }),
  WebviewWindow: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("WorkspaceDeletion - Search by Branch Name", () => {
  const mockWorkspaces: Workspace[] = [
    {
      id: 1,
      workspace_name: "test-branch",
      branch_name: "test-branch",
      workspace_path: "/repo/workspaces/test-branch",
      repo_path: "/repo",
      created_at: "",
      has_conflicts: false,
    },
    {
      id: 2,
      workspace_name: "other-branch",
      branch_name: "other-branch",
      workspace_path: "/repo/workspaces/other-branch",
      repo_path: "/repo",
      created_at: "",
      has_conflicts: false,
    },
    {
      id: 3,
      workspace_name: "test-feature",
      branch_name: "test-feature",
      workspace_path: "/repo/workspaces/test-feature",
      repo_path: "/repo",
      created_at: "",
      has_conflicts: false,
    },
  ];

  const defaultProps = {
    open: true,
    onOpenChange: vi.fn(),
    workspaces: mockWorkspaces,
    repoPath: "/repo",
    currentWorkspace: null,
    onDeleteWorkspace: vi.fn(),
  };

  it("should filter workspaces by branch name when searching", async () => {
    const user = userEvent.setup();

    render(<WorkspaceDeletion {...defaultProps} />);

    // Initially all workspaces should be visible
    expect(screen.getByText("test-branch")).toBeInTheDocument();
    expect(screen.getByText("other-branch")).toBeInTheDocument();
    expect(screen.getByText("test-feature")).toBeInTheDocument();

    // Type "test" in search input
    const input = screen.getByPlaceholderText("Search workspaces to delete...");
    await user.type(input, "test");

    // Wait for filtering to occur
    await waitFor(() => {
      // Only workspaces with "test" in their name should be visible
      expect(screen.getByText("test-branch")).toBeInTheDocument();
      expect(screen.getByText("test-feature")).toBeInTheDocument();
      expect(screen.queryByText("other-branch")).not.toBeInTheDocument();
    });
  });

  it("should be case-insensitive when searching", async () => {
    const user = userEvent.setup();

    render(<WorkspaceDeletion {...defaultProps} />);

    const input = screen.getByPlaceholderText("Search workspaces to delete...");
    await user.type(input, "TEST");

    await waitFor(() => {
      // Should still find "test-branch" and "test-feature"
      expect(screen.getByText("test-branch")).toBeInTheDocument();
      expect(screen.getByText("test-feature")).toBeInTheDocument();
      expect(screen.queryByText("other-branch")).not.toBeInTheDocument();
    });
  });

  it("should filter current workspace by branch name", async () => {
    const user = userEvent.setup();

    const currentWorkspace: Workspace = {
      id: 4,
      workspace_name: "test-current",
      branch_name: "test-current",
      workspace_path: "/repo/workspaces/test-current",
      repo_path: "/repo",
      created_at: "",
      has_conflicts: false,
    };

    render(
      <WorkspaceDeletion
        {...defaultProps}
        currentWorkspace={currentWorkspace}
        workspaces={[...mockWorkspaces, currentWorkspace]}
      />
    );

    // Should see the current workspace label
    expect(screen.getAllByText("test-current")).toHaveLength(2); // Once in default, once in list
    expect(screen.getByText("Current workspace (default)")).toBeInTheDocument();

    const input = screen.getByPlaceholderText("Search workspaces to delete...");
    await user.type(input, "test");

    await waitFor(() => {
      // Current workspace should still be visible when searching for "test"
      expect(screen.getAllByText("test-current").length).toBeGreaterThan(0);
      expect(screen.getByText("Current workspace (default)")).toBeInTheDocument();
      expect(screen.queryByText("other-branch")).not.toBeInTheDocument();
    });
  });

  it("should show empty state when no matches found", async () => {
    const user = userEvent.setup();

    render(<WorkspaceDeletion {...defaultProps} />);

    const input = screen.getByPlaceholderText("Search workspaces to delete...");
    await user.type(input, "nonexistent");

    await waitFor(() => {
      expect(screen.getByText("No deletable workspaces found")).toBeInTheDocument();
      expect(screen.queryByText("test-branch")).not.toBeInTheDocument();
      expect(screen.queryByText("other-branch")).not.toBeInTheDocument();
    });
  });

  it("should call onDeleteWorkspace with correct workspace when selected", async () => {
    const user = userEvent.setup();
    const onDeleteWorkspace = vi.fn();

    render(<WorkspaceDeletion {...defaultProps} onDeleteWorkspace={onDeleteWorkspace} />);

    const input = screen.getByPlaceholderText("Search workspaces to delete...");
    await user.type(input, "test");

    await waitFor(() => {
      expect(screen.getByText("test-branch")).toBeInTheDocument();
    });

    const workspaceItem = screen.getByText("test-branch");
    await user.click(workspaceItem);

    expect(onDeleteWorkspace).toHaveBeenCalledWith(mockWorkspaces[0]);
  });
});
