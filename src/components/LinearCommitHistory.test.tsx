import { beforeEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { render, screen, waitFor } from "../../test/test-utils";
import { LinearCommitHistory } from "./LinearCommitHistory";
import * as api from "../lib/api";
import { createMockCommit } from "../../test/factories/commit.factory";

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

vi.mock("../lib/api", async () => {
  const actual = await vi.importActual("../lib/api");
  return {
    ...actual,
    listCommits: vi.fn(),
  };
});

const mockCommits = [
  createMockCommit({
    commit_id: "def456",
    short_id: "def456",
    change_id: "change2",
    description: "Second commit",
    timestamp: "2024-01-02 10:00:00",
  }),
];

beforeEach(() => {
  vi.clearAllMocks();
});

describe("LinearCommitHistory tentative click", () => {
  it("calls onCommitClick when the tentative working copy row is clicked", async () => {
    const user = userEvent.setup();
    const onCommitClick = vi.fn();
    const listCommitsMock = vi.mocked(api.listCommits);
    const tentativeCommit = createMockCommit({
      commit_id: "wc000",
      short_id: "wc000",
      change_id: "wc_change",
      description: "(no description)",
      is_working_copy: true,
      timestamp: "2024-01-03 10:00:00",
    });

    listCommitsMock.mockResolvedValueOnce({
      commits: mockCommits,
      tentative_working_copy: {
        workspace_label: "feat/test",
        commit: tentativeCommit,
      },
      target_branch: "main",
      workspace_branch: "feat/test",
    });

    render(
      <LinearCommitHistory
        repoPath="/test/repo"
        workspaceId={1}
        onCommitClick={onCommitClick}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("Working copy")).toBeTruthy();
    });

    await user.click(screen.getByText("Working copy"));

    expect(onCommitClick).toHaveBeenCalledWith("wc_change");
  });
});
