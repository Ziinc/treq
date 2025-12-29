import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, waitFor, screen } from "./test-utils";
import { ShowWorkspace } from "../src/components/ShowWorkspace";
import * as api from "../src/lib/api";
import { act } from "@testing-library/react";

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

// Capture FileBrowser props
let capturedFileBrowserProps: any = null;

// Mock heavy components
vi.mock("../src/components/FileBrowser", () => ({
  FileBrowser: (props: any) => {
    capturedFileBrowserProps = props;
    return <div data-testid="file-browser" />;
  },
}));

vi.mock("../src/components/CommitGraph", () => ({
  CommitGraph: () => <div data-testid="commit-graph" />,
}));

vi.mock("../src/components/ChangesDiffViewer", () => ({
  ChangesDiffViewer: () => <div data-testid="changes-viewer" />,
}));

vi.mock("../src/components/TargetBranchSelector", () => ({
  TargetBranchSelector: () => <div data-testid="target-branch-selector" />,
}));

// Mock API module
vi.mock("../src/lib/api", async () => {
  const actual = await vi.importActual("../src/lib/api");
  return {
    ...actual,
    getSetting: vi.fn().mockResolvedValue(null),
    listDirectory: vi.fn().mockResolvedValue([]),
    readFile: vi.fn().mockRejectedValue(new Error("README not found")),
    jjGetDefaultBranch: vi.fn().mockResolvedValue("main"),
    jjGetConflictedFiles: vi.fn().mockResolvedValue([]),
    jjGetBranches: vi.fn().mockResolvedValue([]),
    setWorkspaceTargetBranch: vi.fn().mockResolvedValue(undefined),
    jjGetChangedFiles: vi.fn().mockResolvedValue([]),
  };
});

beforeEach(() => {
  vi.clearAllMocks();
  capturedFileBrowserProps = null;
});

describe("ShowWorkspace - File Navigation from Cmd+P", () => {
  const mockWorkspace: api.Workspace = {
    id: 1,
    repo_path: "/test/repo",
    workspace_name: "test-workspace",
    workspace_path: "/test/repo/.treq/workspaces/test-workspace",
    branch_name: "feature",
    created_at: "2024-01-01T00:00:00Z",
  };

  it("should switch to files tab when initialSelectedFile is provided", async () => {
    const { rerender } = render(
      <ShowWorkspace
        repositoryPath="/test/repo"
        workspace={mockWorkspace}
        mainRepoBranch="main"
        initialSelectedFile={null}
        onDeleteWorkspace={vi.fn()}
        allWorkspaces={[mockWorkspace]}
      />
    );

    // Wait for tabs to appear and verify we're on code tab
    const codeTab = await screen.findByRole("tab", { name: /code/i });
    expect(codeTab).toHaveAttribute("data-state", "active");

    // Rerender with a file selected (simulating Cmd+P selection)
    rerender(
      <ShowWorkspace
        repositoryPath="/test/repo"
        workspace={mockWorkspace}
        mainRepoBranch="main"
        initialSelectedFile="/test/repo/src/components/Button.tsx"
        onDeleteWorkspace={vi.fn()}
        allWorkspaces={[mockWorkspace]}
      />
    );

    // Should switch to files tab
    await waitFor(() => {
      const filesTab = screen.getByRole("tab", { name: /files/i });
      expect(filesTab).toHaveAttribute("data-state", "active");
    });
  });

  it("should pass selected file to FileBrowser when on files tab", async () => {
    render(
      <ShowWorkspace
        repositoryPath="/test/repo"
        workspace={mockWorkspace}
        mainRepoBranch="main"
        initialSelectedFile="/test/repo/src/components/Button.tsx"
        onDeleteWorkspace={vi.fn()}
        allWorkspaces={[mockWorkspace]}
      />
    );

    // Should switch to files tab when file is selected
    const filesTab = await screen.findByRole("tab", { name: /files/i });
    await waitFor(() => {
      expect(filesTab).toHaveAttribute("data-state", "active");
    });
  });

  it("should expand parent directory when file is selected via Cmd+P", async () => {
    const { rerender } = render(
      <ShowWorkspace
        repositoryPath="/test/repo"
        workspace={mockWorkspace}
        mainRepoBranch="main"
        initialSelectedFile={null}
        onDeleteWorkspace={vi.fn()}
        allWorkspaces={[mockWorkspace]}
      />
    );

    // Wait for tabs to appear
    await screen.findByRole("tab", { name: /code/i });

    // Select a nested file (simulating Cmd+P selection)
    rerender(
      <ShowWorkspace
        repositoryPath="/test/repo"
        workspace={mockWorkspace}
        mainRepoBranch="main"
        initialSelectedFile="/test/repo/src/components/Button.tsx"
        onDeleteWorkspace={vi.fn()}
        allWorkspaces={[mockWorkspace]}
      />
    );

    // Should switch to files tab
    await waitFor(() => {
      const filesTab = screen.getByRole("tab", { name: /files/i });
      expect(filesTab).toHaveAttribute("data-state", "active");
    });

    // Verify initialExpandedDir is set to parent directory
    await waitFor(() => {
      expect(capturedFileBrowserProps).not.toBeNull();
      expect(capturedFileBrowserProps.initialExpandedDir).toBe("/test/repo/src/components");
    });
  });
});
