import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StashModal } from "./StashModal";
import type { StashEntry, JjRevisionDiff } from "../lib/api";
import * as api from "../lib/api";

vi.mock("../lib/api", async () => {
  const actual = await vi.importActual<typeof api>("../lib/api");
  return {
    ...actual,
    listStashes: vi.fn(),
    getStashDiff: vi.fn(),
    exportStashGitPatch: vi.fn(),
    deleteStash: vi.fn(),
    applyStash: vi.fn(),
  };
});

vi.mock("./ui/toast", () => ({
  useToast: () => ({ addToast: vi.fn() }),
}));

const entries: StashEntry[] = [
  {
    id: 1,
    workspace_id: 10,
    workspace_label: "feat/alpha",
    commit_id: "abcdef0123456789",
    change_id: "changeabc123",
    short_commit_id: "abcdef012345",
    bookmark_name: "treq/stash/uuid-1",
    created_at: "2026-08-01T12:00:00.000Z",
    additions: 5,
    deletions: 2,
    files_changed: ["README.md", "extra.txt"],
  },
  {
    id: 2,
    workspace_id: null,
    workspace_label: "Home repo",
    commit_id: "fedcba9876543210",
    change_id: "changedef456",
    short_commit_id: "fedcba987654",
    bookmark_name: "treq/stash/uuid-2",
    created_at: "2026-08-02T12:00:00.000Z",
    additions: 1,
    deletions: 0,
    files_changed: ["a.ts"],
  },
];

const emptyDiff: JjRevisionDiff = {
  committed_files: [
    {
      path: "README.md",
      status: "M",
      previous_path: null,
      changed_line_count: 2,
      diff_deferred: false,
    },
  ],
  hunks_by_file: [
    {
      path: "README.md",
      hunks: [
        {
          id: "h1",
          header: "@@ -1,1 +1,1 @@",
          lines: ["-old", "+new"],
          patch: "@@ -1,1 +1,1 @@\n-old\n+new\n",
        },
      ],
    },
  ],
  too_large_to_render: false,
};

function renderModal(
  props: Partial<React.ComponentProps<typeof StashModal>> = {},
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <StashModal
        open
        onOpenChange={vi.fn()}
        repoPath="/repo"
        workspaces={[
          {
            id: 10,
            repo_path: "/repo",
            workspace_name: "feat-alpha",
            workspace_path: "feat-alpha",
            branch_name: "feat/alpha",
            created_at: "2026-01-01T00:00:00Z",
            title: "feat/alpha",
            not_on_remote: false,
          },
        ]}
        {...props}
      />
    </QueryClientProvider>,
  );
}

describe("StashModal", () => {
  beforeEach(() => {
    vi.mocked(api.listStashes).mockResolvedValue(entries);
    vi.mocked(api.getStashDiff).mockResolvedValue(emptyDiff);
    vi.mocked(api.exportStashGitPatch).mockResolvedValue(
      "diff --git a/README.md b/README.md\n",
    );
    vi.mocked(api.deleteStash).mockResolvedValue(undefined);
    vi.mocked(api.applyStash).mockResolvedValue(undefined);
  });

  it("lists stashes with workspace, hash, and loc stats", async () => {
    renderModal();
    const list = await screen.findByTestId("stash-list");
    expect(within(list).getByText("feat/alpha")).toBeTruthy();
    expect(within(list).getByText("abcdef012345")).toBeTruthy();
    expect(within(list).getByText("+5")).toBeTruthy();
    expect(api.listStashes).toHaveBeenCalledWith("/repo");
  });

  it("loads isolated diff for the selected stash", async () => {
    renderModal();
    await screen.findByTestId("stash-list");
    await waitFor(() => {
      expect(api.getStashDiff).toHaveBeenCalled();
    });
    expect(await screen.findByTestId("stash-diff-pane")).toBeTruthy();
    expect(screen.getByText("README.md")).toBeTruthy();
  });

  it("shows empty state when there are no stashes", async () => {
    vi.mocked(api.listStashes).mockResolvedValue([]);
    renderModal();
    expect(await screen.findByTestId("stash-empty")).toBeTruthy();
  });

  it("copies git patch from the more menu", async () => {
    const user = userEvent.setup();
    // userEvent.setup() installs its own clipboard stub, so the spy must be
    // attached after setup().
    const writeText = vi
      .spyOn(navigator.clipboard, "writeText")
      .mockResolvedValue(undefined);
    renderModal();
    await screen.findByTestId("stash-list");
    await user.click(await screen.findByTestId("stash-more-menu"));
    await user.click(await screen.findByTestId("stash-copy-patch"));
    await waitFor(() => {
      expect(api.exportStashGitPatch).toHaveBeenCalledWith("/repo", 1);
    });
    await waitFor(() => {
      expect(writeText).toHaveBeenCalled();
    });
  });
});
