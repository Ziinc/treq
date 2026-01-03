import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "./test-utils";
import { userEvent } from "@testing-library/user-event";
import { FileBrowser } from "../src/components/FileBrowser";
import * as api from "../src/lib/api";

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

vi.mock("../src/lib/api", async () => {
  const actual = await vi.importActual("../src/lib/api");
  return {
    ...actual,
    listDirectory: vi.fn().mockResolvedValue([
      {
        name: "test.txt",
        path: "/test/repo/test.txt",
        is_dir: false,
        size: 100,
      },
    ]),
    listDirectoryCached: vi.fn().mockResolvedValue([
      {
        name: "test.txt",
        path: "/test/repo/test.txt",
        is_dir: false,
        size: 100,
      },
    ]),
    readFile: vi.fn().mockResolvedValue("function test() {\n  return 'hello';\n}\nfunction test2() {\n  return 'world';\n}"),
    jjGetFileHunks: vi.fn().mockResolvedValue([]),
    jjGetChangedFiles: vi.fn().mockResolvedValue([]),
    ensureWorkspaceIndexed: vi.fn().mockResolvedValue(true),
    getSetting: vi.fn().mockResolvedValue(null),
    getSettingsBatch: vi.fn().mockResolvedValue({}),
  };
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("FileBrowser search functionality", () => {
  const defaultProps = {
    workspace: null,
    repoPath: "/test/repo",
    initialSelectedFile: null,
    initialExpandedDir: null,
  };

  describe("keyboard shortcuts", () => {
    it("opens search overlay on Ctrl+F", async () => {
      const user = userEvent.setup();
      render(<FileBrowser {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText("test.txt")).toBeInTheDocument();
      });

      const fileNode = screen.getByText("test.txt");
      await user.click(fileNode);

      await waitFor(() => {
        const content = screen.getAllByText(/function test/);
        expect(content.length).toBeGreaterThan(0);
      });

      await user.keyboard("{Control>}f");

      await waitFor(() => {
        expect(screen.getByPlaceholderText("Find")).toBeInTheDocument();
      });
    });

    it("closes search overlay on Escape", async () => {
      const user = userEvent.setup();
      render(<FileBrowser {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText("test.txt")).toBeInTheDocument();
      });

      const fileNode = screen.getByText("test.txt");
      await user.click(fileNode);

      await waitFor(() => {
        const content = screen.getAllByText(/function test/);
        expect(content.length).toBeGreaterThan(0);
      });

      await user.keyboard("{Control>}f");

      await waitFor(() => {
        expect(screen.getByPlaceholderText("Find")).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText("Find");
      searchInput.focus();
      await user.keyboard("{Escape}");

      await waitFor(() => {
        expect(screen.queryByPlaceholderText("Find")).not.toBeInTheDocument();
      });
    });
  });

  describe("search and highlight", () => {
    it("shows match count when searching", async () => {
      const user = userEvent.setup();
      render(<FileBrowser {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText("test.txt")).toBeInTheDocument();
      });

      const fileNode = screen.getByText("test.txt");
      await user.click(fileNode);

      await waitFor(() => {
        const content = screen.getAllByText(/function test/);
        expect(content.length).toBeGreaterThan(0);
      });

      await user.keyboard("{Control>}f");

      await waitFor(() => {
        expect(screen.getByPlaceholderText("Find")).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText("Find");
      await user.type(searchInput, "function");

      await waitFor(() => {
        expect(screen.getByText(/of \d+/)).toBeInTheDocument();
      });
    });

    it("highlights matches in file content", async () => {
      const user = userEvent.setup();
      render(<FileBrowser {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText("test.txt")).toBeInTheDocument();
      });

      const fileNode = screen.getByText("test.txt");
      await user.click(fileNode);

      await waitFor(() => {
        const content = screen.getAllByText(/function test/);
        expect(content.length).toBeGreaterThan(0);
      });

      await user.keyboard("{Control>}f");

      await waitFor(() => {
        expect(screen.getByPlaceholderText("Find")).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText("Find");
      await user.type(searchInput, "function");

      await waitFor(() => {
        const marks = document.querySelectorAll("mark.search-match");
        expect(marks.length).toBeGreaterThan(0);
      });
    });

    it("clears highlights when search is closed", async () => {
      const user = userEvent.setup();
      render(<FileBrowser {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText("test.txt")).toBeInTheDocument();
      });

      const fileNode = screen.getByText("test.txt");
      await user.click(fileNode);

      await waitFor(() => {
        const content = screen.getAllByText(/function test/);
        expect(content.length).toBeGreaterThan(0);
      });

      await user.keyboard("{Control>}f");

      await waitFor(() => {
        expect(screen.getByPlaceholderText("Find")).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText("Find");
      await user.type(searchInput, "function");

      await waitFor(() => {
        const marks = document.querySelectorAll("mark.search-match");
        expect(marks.length).toBeGreaterThan(0);
      });

      searchInput.focus();
      await user.keyboard("{Escape}");

      await waitFor(() => {
        const marks = document.querySelectorAll("mark.search-match");
        expect(marks.length).toBe(0);
      });
    });
  });

  describe("navigation", () => {
    it("navigates to next match on Enter", async () => {
      const user = userEvent.setup();
      render(<FileBrowser {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText("test.txt")).toBeInTheDocument();
      });

      const fileNode = screen.getByText("test.txt");
      await user.click(fileNode);

      await waitFor(() => {
        const content = screen.getAllByText(/function test/);
        expect(content.length).toBeGreaterThan(0);
      });

      await user.keyboard("{Control>}f");

      await waitFor(() => {
        expect(screen.getByPlaceholderText("Find")).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText("Find");
      await user.type(searchInput, "function");

      await waitFor(() => {
        expect(screen.getByText(/of \d+/)).toBeInTheDocument();
      });

      await user.keyboard("{Enter}");

      await waitFor(() => {
        const matchText = screen.getByText(/\d+ of \d+/);
        expect(matchText).toBeInTheDocument();
      });
    });

    it("navigates to previous match on Shift+Enter", async () => {
      const user = userEvent.setup();
      render(<FileBrowser {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText("test.txt")).toBeInTheDocument();
      });

      const fileNode = screen.getByText("test.txt");
      await user.click(fileNode);

      await waitFor(() => {
        const content = screen.getAllByText(/function test/);
        expect(content.length).toBeGreaterThan(0);
      });

      await user.keyboard("{Control>}f");

      await waitFor(() => {
        expect(screen.getByPlaceholderText("Find")).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText("Find");
      await user.type(searchInput, "function");

      await waitFor(() => {
        expect(screen.getByText(/of \d+/)).toBeInTheDocument();
      });

      await user.keyboard("{Shift>}{Enter}");

      await waitFor(() => {
        const matchText = screen.getByText(/\d+ of \d+/);
        expect(matchText).toBeInTheDocument();
      });
    });
  });

  describe("match count display", () => {
    it("displays correct match count", async () => {
      const user = userEvent.setup();
      render(<FileBrowser {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText("test.txt")).toBeInTheDocument();
      });

      const fileNode = screen.getByText("test.txt");
      await user.click(fileNode);

      await waitFor(() => {
        const content = screen.getAllByText(/function test/);
        expect(content.length).toBeGreaterThan(0);
      });

      await user.keyboard("{Control>}f");

      await waitFor(() => {
        expect(screen.getByPlaceholderText("Find")).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText("Find");
      await user.type(searchInput, "function");

      await waitFor(() => {
        expect(screen.getByText(/1 of 2/)).toBeInTheDocument();
      });
    });

    it("displays 0 of 0 when no matches", async () => {
      const user = userEvent.setup();
      render(<FileBrowser {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText("test.txt")).toBeInTheDocument();
      });

      const fileNode = screen.getByText("test.txt");
      await user.click(fileNode);

      await waitFor(() => {
        const content = screen.getAllByText(/function test/);
        expect(content.length).toBeGreaterThan(0);
      });

      await user.keyboard("{Control>}f");

      await waitFor(() => {
        expect(screen.getByPlaceholderText("Find")).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText("Find");
      await user.type(searchInput, "nonexistent");

      await waitFor(() => {
        expect(screen.getByText("0 of 0")).toBeInTheDocument();
      });
    });
  });
});
