import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "./test-utils";
import userEvent from "@testing-library/user-event";
import * as api from "../src/lib/api";
import { FileBrowser } from "../src/components/FileBrowser";

vi.mock("../src/lib/api", async () => {
  const actual = await vi.importActual("../src/lib/api");
  return {
    ...actual,
    listDirectory: vi.fn(),
    getFileContent: vi.fn(),
  };
});

vi.mock("@tauri-apps/plugin-opener", () => ({
  revealItemInDir: vi.fn(),
  openUrl: vi.fn(),
}));

describe("FileBrowser - Context Menu", () => {
  const mockTree = [
    { name: "src", path: "/repo/src", is_directory: true },
    { name: "test.txt", path: "/repo/test.txt", is_directory: false }
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.listDirectory).mockResolvedValue(mockTree);
  });

  it("should show context menu on right-click for files and directories", async () => {
    render(<FileBrowser basePath="/repo" repoPath="/repo" workspace={{} as any} onCreateAgentWithComment={() => {}} />);

    // Test file context menu
    const file = await screen.findByText("test.txt");
    fireEvent.contextMenu(file);
    await waitFor(() => {
      expect(screen.getAllByTestId("copy-relative-path").length).toBeGreaterThan(0);
      expect(screen.getAllByTestId("copy-full-path").length).toBeGreaterThan(0);
      expect(screen.getByText("Open in...")).toBeInTheDocument();
    });

    // Test directory context menu
    const dir = await screen.findByText("src");
    fireEvent.contextMenu(dir);
    await waitFor(() => {
      expect(screen.getAllByTestId("copy-relative-path").length).toBeGreaterThan(0);
      expect(screen.getAllByTestId("copy-full-path").length).toBeGreaterThan(0);
    });
  });

  it("should copy relative and full paths to clipboard", async () => {
    render(<FileBrowser basePath="/repo" repoPath="/repo" workspace={{} as any} onCreateAgentWithComment={() => {}} />);

    const file = await screen.findByText("test.txt");
    fireEvent.contextMenu(file);

    // Copy relative path
    const relativeBtn = await screen.findByTestId("copy-relative-path");
    fireEvent.click(relativeBtn);
    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith("test.txt");
    });

    // Open menu again and copy full path
    fireEvent.contextMenu(file);
    const fullBtn = await screen.findByTestId("copy-full-path");
    fireEvent.click(fullBtn);
    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith("/repo/test.txt");
    });
  });

  it("should open file in external apps via submenu", async () => {
    const { revealItemInDir } = await import("@tauri-apps/plugin-opener");
    const user = userEvent.setup();

    render(<FileBrowser basePath="/repo" repoPath="/repo" workspace={{} as any} onCreateAgentWithComment={() => {}} />);

    const file = await screen.findByText("test.txt");
    fireEvent.contextMenu(file);

    // Hover to open submenu
    await user.hover(screen.getByText("Open in..."));

    // Click "Open in Finder"
    const openBtn = await screen.findByText("Open in Finder");
    fireEvent.click(openBtn);

    await waitFor(() => {
      expect(revealItemInDir).toHaveBeenCalledWith("/repo/test.txt");
    });
  });
});
