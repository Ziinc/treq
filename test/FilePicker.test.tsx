import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, waitFor, screen } from "./test-utils";
import { FilePicker } from "../src/components/FilePicker";
import * as api from "../src/lib/api";
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

// Mock the API module
vi.mock("../src/lib/api", async () => {
  const actual = await vi.importActual("../src/lib/api");
  return {
    ...actual,
    searchWorkspaceFiles: vi.fn().mockResolvedValue([]),
  };
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("FilePicker", () => {
  const defaultProps = {
    open: true,
    onOpenChange: vi.fn(),
    repoPath: "/test/repo",
    workspaceId: null,
    onFileSelect: vi.fn(),
  };

  it("should render dialog when open=true", () => {
    render(<FilePicker {...defaultProps} />);

    expect(screen.getByPlaceholderText("Search files...")).toBeInTheDocument();
  });

  it("should not render when open=false", () => {
    render(<FilePicker {...defaultProps} open={false} />);

    expect(screen.queryByPlaceholderText("Search files...")).not.toBeInTheDocument();
  });

  it("should call searchWorkspaceFiles when typing", async () => {
    const user = userEvent.setup();

    vi.mocked(api.searchWorkspaceFiles).mockResolvedValue([
      { file_path: "/test/repo/file.ts", relative_path: "file.ts" },
    ]);

    render(<FilePicker {...defaultProps} />);

    const input = screen.getByPlaceholderText("Search files...");
    await user.type(input, "file");

    // Wait for debounce
    await waitFor(
      () => {
        expect(api.searchWorkspaceFiles).toHaveBeenCalledWith(
          "/test/repo",
          null,
          "file",
          50
        );
      },
      { timeout: 300 }
    );
  });

  it("should display search results", async () => {
    const user = userEvent.setup();

    vi.mocked(api.searchWorkspaceFiles).mockResolvedValue([
      { file_path: "/test/repo/file1.ts", relative_path: "file1.ts" },
      { file_path: "/test/repo/file2.ts", relative_path: "file2.ts" },
    ]);

    render(<FilePicker {...defaultProps} />);

    const input = screen.getByPlaceholderText("Search files...");
    await user.type(input, "file");

    await waitFor(() => {
      expect(screen.getByText("file1.ts")).toBeInTheDocument();
      expect(screen.getByText("file2.ts")).toBeInTheDocument();
    });
  });

  it("should show 'No files found' when results empty", async () => {
    const user = userEvent.setup();

    vi.mocked(api.searchWorkspaceFiles).mockResolvedValue([]);

    render(<FilePicker {...defaultProps} />);

    const input = screen.getByPlaceholderText("Search files...");
    await user.type(input, "nonexistent");

    await waitFor(() => {
      expect(screen.getByText("No files found")).toBeInTheDocument();
    });
  });

  it("should call onFileSelect when clicking a result", async () => {
    const user = userEvent.setup();
    const onFileSelect = vi.fn();

    vi.mocked(api.searchWorkspaceFiles).mockResolvedValue([
      { file_path: "/test/repo/file.ts", relative_path: "file.ts" },
    ]);

    render(<FilePicker {...defaultProps} onFileSelect={onFileSelect} />);

    const input = screen.getByPlaceholderText("Search files...");
    await user.type(input, "file");

    await waitFor(() => {
      expect(screen.getByText("file.ts")).toBeInTheDocument();
    });

    const fileItem = screen.getByText("file.ts");
    await user.click(fileItem);

    expect(onFileSelect).toHaveBeenCalledWith("/test/repo/file.ts");
  });

  it("should close dialog after file selection", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();

    vi.mocked(api.searchWorkspaceFiles).mockResolvedValue([
      { file_path: "/test/repo/file.ts", relative_path: "file.ts" },
    ]);

    render(<FilePicker {...defaultProps} onOpenChange={onOpenChange} />);

    const input = screen.getByPlaceholderText("Search files...");
    await user.type(input, "file");

    await waitFor(() => {
      expect(screen.getByText("file.ts")).toBeInTheDocument();
    });

    const fileItem = screen.getByText("file.ts");
    await user.click(fileItem);

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("should show initial state when no query entered", () => {
    render(<FilePicker {...defaultProps} />);

    expect(screen.getByText("Type to search files...")).toBeInTheDocument();
  });
});
