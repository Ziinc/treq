import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, waitFor } from "./test-utils";
import { LinearCommitHistory } from "../src/components/LinearCommitHistory";
import * as api from "../src/lib/api";
import { createMockCommit } from "./factories/commit.factory";

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
    jjGetLog: vi.fn(),
  };
});

const mockCommits = [
  createMockCommit({
    commit_id: "def456",
    short_id: "def456",
    change_id: "change2",
    description: "Second commit",
    author_name: "Bob",
    timestamp: "2024-01-02 10:00:00",
    parent_ids: ["abc123"],
    insertions: 20,
    deletions: 5,
  }),
  createMockCommit({
    commit_id: "abc123",
    short_id: "abc123",
    change_id: "change1",
    description: "First commit",
    author_name: "Alice",
    timestamp: "2024-01-01 10:00:00",
    parent_ids: [],
    insertions: 10,
    deletions: 0,
  }),
];

beforeEach(() => {
  vi.clearAllMocks();
});

describe("LinearCommitHistory", () => {
  it("should display commits with correct ordering based on context", async () => {
    const jjGetLogMock = vi.mocked(api.jjGetLog);

    // Test both home repo and workspace ordering
    // Happy path 1: Home repo with isHomeRepo=true should show newest first
    jjGetLogMock.mockResolvedValueOnce({
      commits: mockCommits,
      target_branch: "main",
      workspace_branch: "main",
    });

    const { rerender } = render(
      <LinearCommitHistory
        workspacePath="/test/repo"
        targetBranch="main"
        isHomeRepo={true}
      />
    );

    // Wait for commits to load and verify newest is first (no reverse)
    await waitFor(() => {
      const listItems = document.querySelectorAll("ul > li");
      expect(listItems.length).toBe(2);
      // For home repo (isHomeRepo=true), first commit should be newest (def456)
      expect(listItems[0].textContent).toContain("Second commit");
    });

    // Happy path 2: Workspace with isHomeRepo=false should show oldest first
    jjGetLogMock.mockResolvedValueOnce({
      commits: mockCommits,
      target_branch: "main",
      workspace_branch: "feature",
    });

    rerender(
      <LinearCommitHistory
        workspacePath="/test/repo"
        targetBranch="main"
        isHomeRepo={false}
      />
    );

    // Wait for new commits to load and verify oldest is first (reversed)
    await waitFor(() => {
      const listItems = document.querySelectorAll("ul > li");
      expect(listItems.length).toBe(2);
      // For workspace (isHomeRepo=false), first commit should be oldest (abc123)
      expect(listItems[0].textContent).toContain("First commit");
    });
  });
});
