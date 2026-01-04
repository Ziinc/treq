import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "./test-utils";
import { ChangesDiffViewer } from "../src/components/ChangesDiffViewer";
import type { JjFileChange, JjDiffHunk } from "../src/lib/api";

// Mock the API
vi.mock("../src/lib/api", async () => {
  const actual = await vi.importActual<typeof import("../src/lib/api")>(
    "../src/lib/api"
  );
  return {
    ...actual,
    jjGetChangedFiles: vi.fn().mockResolvedValue([]),
    jjGetConflictedFiles: vi.fn().mockResolvedValue([]),
    jjGetMergeDiff: vi.fn(),
  };
});

describe("Committed Changes Conflict Detection", () => {
  const mockCommittedFilesWithConflict: JjFileChange[] = [
    { path: "src/conflicted.ts", status: "M" },
  ];

  const mockCommittedFilesNoConflict: JjFileChange[] = [
    { path: "src/normal.ts", status: "M" },
  ];

  const mockHunksWithConflict: JjDiffHunk[] = [
    {
      header: "@@ -1,5 +1,11 @@",
      old_start: 1,
      old_lines: 5,
      new_start: 1,
      new_lines: 11,
      lines: [
        " export const foo = () => {",
        "+<<<<<<< Conflict 1 of 1",
        "++++++++ Contents of side #1",
        "+  return 'old';",
        "+------- Contents of side #1",
        "+%%%%%%%",
        "++++++++ Contents of side #2",
        "+  return 'new';",
        "+------- Contents of side #2",
        "+>>>>>>> Conflict 1 of 1 ends",
        " };",
      ],
    },
  ];

  const mockHunksNoConflict: JjDiffHunk[] = [
    {
      header: "@@ -1,3 +1,3 @@",
      old_start: 1,
      old_lines: 3,
      new_start: 1,
      new_lines: 3,
      lines: [
        " export const foo = () => {",
        "+  return 'new';",
        " };",
      ],
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should detect conflict regions in committed file hunks", async () => {
    const { jjGetMergeDiff } = await import("../src/lib/api");
    (jjGetMergeDiff as any).mockResolvedValue({
      files: mockCommittedFilesWithConflict,
      hunks_by_file: [
        {
          path: "src/conflicted.ts",
          hunks: mockHunksWithConflict,
        },
      ],
    });

    render(
      <ChangesDiffViewer
        workingDirectory="/test/workspace"
        workspacePath="/test/workspace"
        showCommittedChanges={true}
        targetBranch="main"
      />
    );

    // Wait for the committed file to be rendered (appears in both Conflicts and Committed sections)
    await waitFor(() => {
      const matches = screen.getAllByText("conflicted.ts");
      expect(matches.length).toBeGreaterThan(0);
    }, { timeout: 3000 });

    // Should show conflict UI (look for "Conflict" text in various forms)
    await waitFor(() => {
      const text = document.body.textContent || "";
      expect(text).toContain("Conflict");
    }, { timeout: 3000 });
  });

  it("should include committed conflicts in conflictRegionsByFile map", async () => {
    const { jjGetMergeDiff } = await import("../src/lib/api");
    (jjGetMergeDiff as any).mockResolvedValue({
      files: mockCommittedFilesWithConflict,
      hunks_by_file: [
        {
          path: "src/conflicted.ts",
          hunks: mockHunksWithConflict,
        },
      ],
    });

    render(
      <ChangesDiffViewer
        workingDirectory="/test/workspace"
        workspacePath="/test/workspace"
        showCommittedChanges={true}
        targetBranch="main"
      />
    );

    // Wait for the committed file to be rendered
    await waitFor(() => {
      const matches = screen.getAllByText("conflicted.ts");
      expect(matches.length).toBeGreaterThan(0);
    });

    // Conflict regions should be detected and rendered
    // The conflict card should have the destructive border styling
    const conflictCards = document.querySelectorAll('[class*="border-destructive"]');
    expect(conflictCards.length).toBeGreaterThan(0);
  });

  it("should show committed conflicted files in ConflictsSection", async () => {
    const { jjGetMergeDiff } = await import("../src/lib/api");
    (jjGetMergeDiff as any).mockResolvedValue({
      files: mockCommittedFilesWithConflict,
      hunks_by_file: [
        {
          path: "src/conflicted.ts",
          hunks: mockHunksWithConflict,
        },
      ],
    });

    render(
      <ChangesDiffViewer
        workingDirectory="/test/workspace"
        workspacePath="/test/workspace"
        showCommittedChanges={true}
        targetBranch="main"
      />
    );

    // Wait for the file to render first
    await waitFor(() => {
      const matches = screen.getAllByText("conflicted.ts");
      expect(matches.length).toBeGreaterThan(0);
    }, { timeout: 3000 });

    // Wait for conflicts section to appear (uppercase CONFLICTS in the sidebar)
    await waitFor(() => {
      const text = document.body.textContent || "";
      expect(text.toUpperCase()).toContain("CONFLICT");
    }, { timeout: 3000 });
  });

  it("should render conflict UI for committed files with conflicts", async () => {
    const { jjGetMergeDiff } = await import("../src/lib/api");
    (jjGetMergeDiff as any).mockResolvedValue({
      files: mockCommittedFilesWithConflict,
      hunks_by_file: [
        {
          path: "src/conflicted.ts",
          hunks: mockHunksWithConflict,
        },
      ],
    });

    render(
      <ChangesDiffViewer
        workingDirectory="/test/workspace"
        workspacePath="/test/workspace"
        showCommittedChanges={true}
        targetBranch="main"
      />
    );

    // Wait for the file to render
    await waitFor(() => {
      const matches = screen.getAllByText("conflicted.ts");
      expect(matches.length).toBeGreaterThan(0);
    });

    // Should show conflict markers (both start and end markers)
    await waitFor(() => {
      const conflictMarkers = screen.getAllByText(/Conflict 1 of 1/);
      expect(conflictMarkers.length).toBeGreaterThanOrEqual(2); // Start and end markers
    }, { timeout: 3000 });

    // Should have "Add comment" button (part of conflict UI)
    expect(screen.getByText(/Add comment/i)).toBeInTheDocument();
  });

  it("should not show conflict UI for committed files without conflicts", async () => {
    const { jjGetMergeDiff } = await import("../src/lib/api");
    (jjGetMergeDiff as any).mockResolvedValue({
      files: mockCommittedFilesNoConflict,
      hunks_by_file: [
        {
          path: "src/normal.ts",
          hunks: mockHunksNoConflict,
        },
      ],
    });

    render(
      <ChangesDiffViewer
        workingDirectory="/test/workspace"
        workspacePath="/test/workspace"
        showCommittedChanges={true}
        targetBranch="main"
      />
    );

    // Wait for the file to render
    await waitFor(() => {
      expect(screen.getByText("normal.ts")).toBeInTheDocument();
    });

    // Should NOT show conflict markers
    expect(screen.queryByText(/Conflict 1 of 1/)).not.toBeInTheDocument();

    // Should NOT have "Add comment" button
    expect(screen.queryByText(/Add comment/i)).not.toBeInTheDocument();

    // Should NOT have conflict card styling
    const conflictCards = document.querySelectorAll('[class*="border-destructive"]');
    expect(conflictCards.length).toBe(0);
  });
});
