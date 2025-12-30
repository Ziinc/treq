import { describe, it, expect, vi, beforeEach } from "vitest";
import { invoke } from "@tauri-apps/api/core";

// Mock invoke to capture calls
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

describe("File watcher API integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should call start_file_watcher with workspaceId and workspacePath", async () => {
    const { startFileWatcher } = await import("../src/lib/api");

    await startFileWatcher(123, "/path/to/workspace");

    expect(invoke).toHaveBeenCalledWith("start_file_watcher", {
      workspaceId: 123,
      workspacePath: "/path/to/workspace",  // NOT repoPath!
    });
  });

  it("should call stop_file_watcher with workspaceId and workspacePath", async () => {
    const { stopFileWatcher } = await import("../src/lib/api");

    await stopFileWatcher(123, "/path/to/workspace");

    expect(invoke).toHaveBeenCalledWith("stop_file_watcher", {
      workspaceId: 123,
      workspacePath: "/path/to/workspace",
    });
  });
});
