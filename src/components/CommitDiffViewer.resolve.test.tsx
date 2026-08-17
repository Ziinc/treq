import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "../../test/test-utils";
import { CommitDiffViewer } from "./CommitDiffViewer";
import * as api from "../lib/api";
import { createMockCommit } from "../../test/factories/commit.factory";

vi.mock("../lib/api", async () => {
  const actual = await vi.importActual("../lib/api");
  return {
    ...actual,
    getCommitDiff: vi.fn(),
    abandonCommit: vi.fn(),
    listCommits: vi.fn(),
  };
});

describe("CommitDiffViewer resolve conflicts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.getCommitDiff).mockResolvedValue({
      committed_files: [],
      hunks_by_file: [],
      too_large_to_render: false,
      render_block_reason: null,
    });
  });

  it("shows resolve for immutable workspace-only conflicted commits", async () => {
    const commit = createMockCommit({
      change_id: "chg_ws_imm",
      description: "Workspace conflict",
      has_conflicts: true,
      is_immutable: true,
      on_target_only: false,
    });
    vi.mocked(api.listCommits).mockResolvedValue({
      commits: [commit],
      target_branch: "main",
      workspace_branch: "feat/test",
    });

    render(
      <CommitDiffViewer
        repoPath="/test/repo"
        workspaceId={1}
        onSessionCreated={vi.fn()}
      />,
    );

    expect(
      await screen.findByTestId("resolve-conflicts-banner"),
    ).toBeInTheDocument();
  });

  it("hides resolve for immutable commits when a target-only conflict exists", async () => {
    const workspaceImmutable = createMockCommit({
      change_id: "chg_ws_imm",
      description: "Workspace conflict",
      has_conflicts: true,
      is_immutable: true,
      on_target_only: false,
    });
    const targetConflict = createMockCommit({
      change_id: "chg_tgt",
      description: "Target conflict",
      has_conflicts: true,
      is_immutable: true,
      on_target_only: true,
    });
    vi.mocked(api.listCommits).mockResolvedValue({
      commits: [workspaceImmutable, targetConflict],
      target_branch: "main",
      workspace_branch: "feat/test",
    });

    render(
      <CommitDiffViewer
        repoPath="/test/repo"
        workspaceId={1}
        onSessionCreated={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("Workspace conflict")).toBeInTheDocument();
    });
    expect(
      screen.queryByTestId("resolve-conflicts-banner"),
    ).not.toBeInTheDocument();
  });

  it("hides resolve for immutable home-repo conflicts", async () => {
    const commit = createMockCommit({
      change_id: "chg_home",
      description: "Home conflict",
      has_conflicts: true,
      is_immutable: true,
      on_target_only: false,
    });
    vi.mocked(api.listCommits).mockResolvedValue({
      commits: [commit],
      target_branch: "main",
      workspace_branch: "main",
    });

    render(
      <CommitDiffViewer
        repoPath="/test/repo"
        workspaceId={null}
        onSessionCreated={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("Home conflict")).toBeInTheDocument();
    });
    expect(
      screen.queryByTestId("resolve-conflicts-banner"),
    ).not.toBeInTheDocument();
  });
});
