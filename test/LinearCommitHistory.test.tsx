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

// Mock the API module — LinearCommitHistory uses listCommits
vi.mock("../src/lib/api", async () => {
  const actual = await vi.importActual("../src/lib/api");
  return {
    ...actual,
    listCommits: vi.fn(),
  };
});

const mockCommits = [
  createMockCommit({
    commit_id: "wc000",
    short_id: "wc000",
    change_id: "wc_change",
    description: "(no description)",
    is_working_copy: true,
    timestamp: "2024-01-03 10:00:00",
  }),
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
  it("should display commits (skipping working copy)", async () => {
    const listCommitsMock = vi.mocked(api.listCommits);

    listCommitsMock.mockResolvedValueOnce({
      commits: mockCommits,
      target_branch: "main",
      workspace_branch: "main",
    });

    render(
      <LinearCommitHistory
        repoPath="/test/repo"
        workspaceId={null}
      />
    );

    // Wait for commits to load — working copy is skipped, so 2 commits
    await waitFor(() => {
      const listItems = document.querySelectorAll("ul > li");
      expect(listItems.length).toBe(2);
      expect(listItems[0].textContent).toContain("Second commit");
      expect(listItems[1].textContent).toContain("First commit");
    });
  });

  it("should display commits for a workspace", async () => {
    const listCommitsMock = vi.mocked(api.listCommits);

    listCommitsMock.mockResolvedValueOnce({
      commits: mockCommits,
      target_branch: "main",
      workspace_branch: "feature",
    });

    render(
      <LinearCommitHistory
        repoPath="/test/repo"
        workspaceId={1}
      />
    );

    await waitFor(() => {
      const listItems = document.querySelectorAll("ul > li");
      expect(listItems.length).toBe(2);
      expect(listItems[0].textContent).toContain("Second commit");
      expect(listItems[1].textContent).toContain("First commit");
    });
  });

  it("should show load more button for home repo when at limit", async () => {
    const listCommitsMock = vi.mocked(api.listCommits);

    // Create 15 commits (limit) + 1 working copy = 16 total
    // After slicing WC, 15 commits remain which equals the limit
    const manyCommits = [
      createMockCommit({ commit_id: "wc", is_working_copy: true, timestamp: "2024-01-20 10:00:00" }),
      ...Array.from({ length: 15 }, (_, i) =>
        createMockCommit({
          commit_id: `commit${i}`,
          short_id: `commit${i}`,
          description: `Commit ${i}`,
          timestamp: `2024-01-${String(15 - i).padStart(2, "0")} 10:00:00`,
        })
      ),
    ];

    listCommitsMock.mockResolvedValueOnce({
      commits: manyCommits,
      target_branch: "main",
      workspace_branch: "main",
    });

    render(
      <LinearCommitHistory
        repoPath="/test/repo"
        workspaceId={null}
      />
    );

    await waitFor(() => {
      expect(document.querySelectorAll("ul > li").length).toBe(15);
    });

    const loadMoreButton = document.querySelector("button");
    expect(loadMoreButton).not.toBeNull();
    expect(loadMoreButton!.textContent).toContain("Load more commits");
  });

  it("should not show load more button for workspace", async () => {
    const listCommitsMock = vi.mocked(api.listCommits);

    listCommitsMock.mockResolvedValueOnce({
      commits: mockCommits,
      target_branch: "main",
      workspace_branch: "feature",
    });

    render(
      <LinearCommitHistory
        repoPath="/test/repo"
        workspaceId={1}
      />
    );

    await waitFor(() => {
      const listItems = document.querySelectorAll("ul > li");
      expect(listItems.length).toBe(2);
    });

    // No "Load more commits" button for workspaces
    const buttons = document.querySelectorAll("button");
    const loadMore = Array.from(buttons).find(b => b.textContent?.includes("Load more commits"));
    expect(loadMore).toBeUndefined();
  });
});
