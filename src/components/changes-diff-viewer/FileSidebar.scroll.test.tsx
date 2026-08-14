import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "../../../test/test-utils";
import userEvent from "@testing-library/user-event";
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

function hunk(path: string, id: string) {
  return {
    path,
    hunks: [
      {
        id,
        header: "@@ -1,1 +1,1 @@",
        lines: ["-old", "+new"],
        patch: "...",
      },
    ],
  };
}

function fileChange(path: string, status = "M") {
  return {
    path,
    status,
    changed_line_count: 1,
    diff_deferred: false,
  };
}

async function clickFileInSection(
  user: ReturnType<typeof userEvent.setup>,
  sectionName: "Conflicts" | "Changes" | "Selected" | "Committed",
  filePath: string,
) {
  const sectionToggle = await screen.findByRole("button", {
    name: new RegExp(`^${sectionName}`),
  });
  const sectionHeader = sectionToggle.closest("div");
  if (!sectionHeader?.parentElement) {
    throw new Error(`Could not locate ${sectionName} section container`);
  }
  const fileRow = await within(sectionHeader.parentElement).findByTitle(
    filePath,
  );
  await user.click(fileRow);
}

function fileSectionId(path: string) {
  return `file-section-${path.replace(/[^a-zA-Z0-9]/g, "-")}`;
}

describe("Review sidebar click scrolls to file collapsible", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const api = await import("../../lib/api");
    vi.mocked(api.getWorkspaceDiff).mockResolvedValue({
      committed_files: [fileChange("src/committed.ts")],
      hunks_by_file: [
        hunk("src/local.ts", "hunk-local"),
        hunk("src/staged.ts", "hunk-staged"),
        hunk("src/committed.ts", "hunk-committed"),
        hunk("src/conflict.ts", "hunk-conflict"),
      ],
      uncommitted_files: [
        fileChange("src/local.ts"),
        fileChange("src/staged.ts"),
      ],
      conflicted_files: ["src/conflict.ts"],
      too_large_to_render: false,
      render_block_reason: null,
    });
  });

  it("scrolls Changes, Selected, Committed, and Conflicts clicks to the file collapsible", async () => {
    const user = userEvent.setup();
    const scrolledIds: string[] = [];
    vi.spyOn(Element.prototype, "scrollIntoView").mockImplementation(
      function scrollIntoViewMock(this: Element) {
        scrolledIds.push((this as HTMLElement).id);
      },
    );

    render(
      <ChangesDiffViewer
        workspacePath="/tmp/workspace"
        repoPath="/tmp/repo"
        workspaceId={1}
        initialSelectedFile={null}
        showCommittedChanges={true}
      />,
    );

    await screen.findByText("local.ts");
    await screen.findByRole("button", { name: /^Changes/ });
    await screen.findByRole("button", { name: /^Committed/ });
    await screen.findByRole("button", { name: /^Conflicts/ });

    scrolledIds.length = 0;
    await clickFileInSection(user, "Changes", "src/local.ts");
    await waitFor(() => {
      expect(scrolledIds).toContain(fileSectionId("src/local.ts"));
    });

    scrolledIds.length = 0;
    await clickFileInSection(user, "Changes", "src/local.ts");
    await waitFor(() => {
      expect(scrolledIds).toContain(fileSectionId("src/local.ts"));
    });

    await clickFileInSection(user, "Changes", "src/staged.ts");
    const stageButton = await screen.findByTitle("Stage file(s) for commit");
    await user.click(stageButton);
    await screen.findByRole("button", { name: /^Selected/ });

    scrolledIds.length = 0;
    await clickFileInSection(user, "Selected", "src/staged.ts");
    await waitFor(() => {
      expect(scrolledIds).toContain(fileSectionId("src/staged.ts"));
    });

    scrolledIds.length = 0;
    await clickFileInSection(user, "Selected", "src/staged.ts");
    await waitFor(() => {
      expect(scrolledIds).toContain(fileSectionId("src/staged.ts"));
    });

    scrolledIds.length = 0;
    await clickFileInSection(user, "Committed", "src/committed.ts");
    await waitFor(() => {
      expect(scrolledIds).toContain(fileSectionId("src/committed.ts"));
    });

    scrolledIds.length = 0;
    await clickFileInSection(user, "Conflicts", "src/conflict.ts");
    await waitFor(() => {
      expect(scrolledIds).toContain(fileSectionId("src/conflict.ts"));
    });
  });
});
