import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "./test-utils";
import { CommandPalette } from "../src/components/CommandPalette";
import { userEvent } from "@testing-library/user-event";

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

describe("CommandPalette - File Search", () => {
  const defaultProps = {
    open: true,
    onOpenChange: vi.fn(),
    workspaces: [],
    sessions: [],
    onNavigateToDashboard: vi.fn(),
    onNavigateToSettings: vi.fn(),
    onOpenWorkspaceSession: vi.fn(),
    onOpenSession: vi.fn(),
    repoPath: "/test/repo",
  };

  it("should show 'Search Files' command when repoPath is provided", async () => {
    render(<CommandPalette {...defaultProps} onOpenFilePicker={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText("Search Files")).toBeInTheDocument();
    });
  });

  it("should not show 'Search Files' command when repoPath is null", async () => {
    render(<CommandPalette {...defaultProps} repoPath={undefined} />);

    await waitFor(() => {
      expect(screen.queryByText("Search Files")).not.toBeInTheDocument();
    });
  });

  it("should call onOpenFilePicker when selecting 'Search Files'", async () => {
    const user = userEvent.setup();
    const onOpenFilePicker = vi.fn();

    render(<CommandPalette {...defaultProps} onOpenFilePicker={onOpenFilePicker} />);

    const searchFilesCommand = await screen.findByText("Search Files");
    await user.click(searchFilesCommand);

    expect(onOpenFilePicker).toHaveBeenCalledTimes(1);
  });

  it("should close palette after selecting 'Search Files'", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();

    render(
      <CommandPalette
        {...defaultProps}
        onOpenChange={onOpenChange}
        onOpenFilePicker={vi.fn()}
      />
    );

    const searchFilesCommand = await screen.findByText("Search Files");
    await user.click(searchFilesCommand);

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("should show description for Search Files command", async () => {
    render(<CommandPalette {...defaultProps} onOpenFilePicker={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText("Jump to a file in the repository")).toBeInTheDocument();
    });
  });
});
