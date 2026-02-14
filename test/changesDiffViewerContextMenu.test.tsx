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
  };
});

vi.mock("@tauri-apps/plugin-opener", () => ({
  revealItemInDir: vi.fn(),
  openUrl: vi.fn(),
}));

describe("ChangesDiffViewer - Context Menu", () => {
  const mockFiles = [
    { path: "src/test.txt", status: "M", previous_path: null }
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.jjGetChangedFiles).mockResolvedValue(mockFiles);
    vi.mocked(api.jjGetFileHunks).mockResolvedValue([]);
  });

  it("should show context menu on right-click in changes section", async () => {
    render(
      <ChangesDiffViewer
        workspacePath="/repo"
        initialSelectedFile={null}
      />
    );

    const file = await screen.findByText("test.txt", { exact: false });
    fireEvent.contextMenu(file);

    await waitFor(() => {
      expect(screen.getAllByTestId("copy-relative-path").length).toBeGreaterThan(0);
      expect(screen.getAllByTestId("copy-full-path").length).toBeGreaterThan(0);
      expect(screen.getByText("Open in...")).toBeInTheDocument();
    });
  });

  it("should copy relative and full paths", async () => {
    render(
      <ChangesDiffViewer
        workspacePath="/repo"
        initialSelectedFile={null}
      />
    );

    const file = await screen.findByText("test.txt", { exact: false });
    fireEvent.contextMenu(file);

    const relativeBtn = await screen.findByTestId("copy-relative-path");
    fireEvent.click(relativeBtn);

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith("src/test.txt");
    });
  });

  it("should open in Finder via submenu", async () => {
    const { revealItemInDir } = await import("@tauri-apps/plugin-opener");
    const user = userEvent.setup();

    render(
      <ChangesDiffViewer
        workspacePath="/repo"
        initialSelectedFile={null}
      />
    );

    const file = await screen.findByText("test.txt", { exact: false });
    fireEvent.contextMenu(file);

    await user.hover(screen.getByText("Open in..."));
    const openBtn = await screen.findByText("Open in Finder");
    fireEvent.click(openBtn);

    await waitFor(() => {
      expect(revealItemInDir).toHaveBeenCalledWith("/repo/src/test.txt");
    });
  });
});
