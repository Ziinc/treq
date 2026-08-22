import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "../../../test/test-utils";
import { ChangesDiffViewer } from "./ChangesDiffViewerMain";

vi.mock("../../lib/api", async () => {
  const actual =
    await vi.importActual<typeof import("../../lib/api")>("../../lib/api");
  return {
    ...actual,
    getWorkspaceDiff: vi.fn(),
    getWorkspaceChangedFiles: vi.fn().mockResolvedValue([]),
    getWorkspaceFileHunks: vi.fn().mockResolvedValue([]),
    getDiffCache: vi.fn().mockResolvedValue(null),
  };
});

describe("ChangesDiffViewer workspace diff contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders committed hunks from getWorkspaceDiff alongside uncommitted files", async () => {
    const api = await import("../../lib/api");
    vi.mocked(api.getWorkspaceDiff).mockResolvedValue({
      committed_files: [
        {
          path: "src/committed.ts",
          status: "M",
          changed_line_count: 1,
          diff_deferred: false,
        },
      ],
      hunks_by_file: [
        {
          path: "src/committed.ts",
          hunks: [
            {
              id: "committed-hunk",
              header: "@@ -1,3 +1,4 @@",
              lines: [
                " export const committed = true;",
                "+export const added = true;",
              ],
              patch: "...",
            },
          ],
        },
      ],
      uncommitted_files: [
        {
          path: "src/local.ts",
          status: "M",
          changed_line_count: 1,
          diff_deferred: false,
        },
      ],
      conflicted_files: ["src/committed.ts"],
      too_large_to_render: false,
      render_block_reason: null,
    });

    render(
      <ChangesDiffViewer
        workspacePath="/tmp/workspace"
        repoPath="/tmp/repo"
        workspaceId={1}
        initialSelectedFile={null}
        showCommittedChanges={true}
      />,
    );

    await waitFor(() => {
      // Conflicted committed paths surface in Conflicts and Committed.
      expect(screen.getAllByText("committed.ts").length).toBeGreaterThanOrEqual(
        2,
      );
    });
    expect(screen.getByRole("button", { name: "Conflicts" })).toBeTruthy();
    await waitFor(() => {
      expect(document.body.textContent).toContain("added = true");
    });
    await waitFor(() => {
      expect(screen.getByText("local.ts")).toBeInTheDocument();
    });
    expect(api.getWorkspaceChangedFiles).not.toHaveBeenCalled();
  });

  it("keeps committed and uncommitted sections separate when paths overlap", async () => {
    const api = await import("../../lib/api");
    vi.mocked(api.getWorkspaceDiff).mockResolvedValue({
      committed_files: [
        {
          path: "src/shared.ts",
          status: "M",
          changed_line_count: 1,
          diff_deferred: false,
        },
      ],
      hunks_by_file: [
        {
          path: "src/shared.ts",
          hunks: [
            {
              id: "shared-committed",
              header: "@@ -1,2 +1,3 @@",
              lines: [
                " export const shared = 'committed';",
                "+export const extra = true;",
              ],
              patch: "...",
            },
          ],
        },
      ],
      uncommitted_files: [
        {
          path: "src/shared.ts",
          status: "M",
          changed_line_count: 1,
          diff_deferred: false,
        },
      ],
      conflicted_files: [],
      too_large_to_render: false,
      render_block_reason: null,
    });

    render(
      <ChangesDiffViewer
        workspacePath="/tmp/workspace"
        repoPath="/tmp/repo"
        workspaceId={1}
        initialSelectedFile={null}
        showCommittedChanges={true}
      />,
    );

    await waitFor(() => {
      expect(screen.getAllByText("shared.ts").length).toBe(2);
    });

    expect(
      screen.getAllByText(
        (_, element) => element?.textContent?.includes("extra = true") ?? false,
      ).length,
    ).toBeGreaterThan(0);
    expect(api.getWorkspaceChangedFiles).not.toHaveBeenCalled();
  });

  it("keeps overlapping committed files visible when Show is off", async () => {
    const api = await import("../../lib/api");
    vi.mocked(api.getWorkspaceDiff).mockResolvedValue({
      committed_files: [
        {
          path: "src/shared.ts",
          status: "M",
          changed_line_count: 1,
          diff_deferred: false,
        },
        {
          path: "src/committed-only.ts",
          status: "A",
          changed_line_count: 1,
          diff_deferred: false,
        },
      ],
      hunks_by_file: [
        {
          path: "src/shared.ts",
          hunks: [
            {
              id: "shared-committed",
              header: "@@ -1,2 +1,3 @@",
              lines: [
                " export const shared = 'committed';",
                "+export const extra = true;",
              ],
              patch: "...",
            },
          ],
        },
        {
          path: "src/committed-only.ts",
          hunks: [
            {
              id: "committed-only",
              header: "@@ -0,0 +1,1 @@",
              lines: ["+export const only = true;"],
              patch: "...",
            },
          ],
        },
      ],
      uncommitted_files: [
        {
          path: "src/shared.ts",
          status: "M",
          changed_line_count: 1,
          diff_deferred: false,
        },
      ],
      conflicted_files: [],
      too_large_to_render: false,
      render_block_reason: null,
    });
    vi.mocked(api.getWorkspaceFileHunks).mockResolvedValue([
      {
        id: "shared-wc",
        header: "@@ -1,3 +1,3 @@",
        lines: [
          "-export const shared = 'committed';",
          "+export const shared = 'dirty';",
        ],
        patch: "...",
      },
    ]);

    const { rerender } = render(
      <ChangesDiffViewer
        workspacePath="/tmp/workspace"
        repoPath="/tmp/repo"
        workspaceId={1}
        initialSelectedFile={null}
        showCommittedChanges={true}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("committed-only.ts")).toBeInTheDocument();
      expect(screen.getAllByText("shared.ts").length).toBeGreaterThanOrEqual(2);
    });

    rerender(
      <ChangesDiffViewer
        workspacePath="/tmp/workspace"
        repoPath="/tmp/repo"
        workspaceId={1}
        initialSelectedFile={null}
        showCommittedChanges={false}
      />,
    );

    await waitFor(() => {
      expect(screen.queryByText("committed-only.ts")).not.toBeInTheDocument();
    });
    expect(screen.getAllByText("shared.ts").length).toBeGreaterThanOrEqual(2);
    expect(
      screen.getAllByText(
        (_, element) => element?.textContent?.includes("extra = true") ?? false,
      ).length,
    ).toBeGreaterThan(0);
  });

  it("does not fetch diffs until workspaceId is defined", async () => {
    const api = await import("../../lib/api");
    vi.mocked(api.getWorkspaceDiff).mockResolvedValue({
      committed_files: [],
      hunks_by_file: [],
      uncommitted_files: [
        {
          path: "src/local.ts",
          status: "M",
          changed_line_count: 1,
          diff_deferred: false,
        },
      ],
      conflicted_files: [],
      too_large_to_render: false,
      render_block_reason: null,
    });

    const { rerender } = render(
      <ChangesDiffViewer
        workspacePath="/tmp/workspace"
        repoPath="/tmp/repo"
        initialSelectedFile={null}
        showCommittedChanges={false}
      />,
    );

    await Promise.resolve();
    expect(api.getWorkspaceChangedFiles).not.toHaveBeenCalled();
    expect(api.getWorkspaceDiff).not.toHaveBeenCalled();

    rerender(
      <ChangesDiffViewer
        workspacePath="/tmp/workspace"
        repoPath="/tmp/repo"
        workspaceId={1}
        initialSelectedFile={null}
        showCommittedChanges={false}
      />,
    );

    await waitFor(() => {
      expect(api.getWorkspaceDiff).toHaveBeenCalled();
    });
    expect(api.getWorkspaceChangedFiles).not.toHaveBeenCalled();
  });
});
