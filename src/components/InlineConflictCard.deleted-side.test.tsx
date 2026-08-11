import { describe, expect, it, vi } from "vitest";
import { render, screen } from "../../test/test-utils";
import { InlineConflictCard } from "./InlineConflictCard";
import type { ConflictRegion } from "../lib/api-types";

vi.mock("./ConflictCommentCard", () => ({
  ConflictCommentCard: () => null,
}));

function buildDeletedSideRegion(): ConflictRegion {
  return {
    id: "shared.txt-conflict-1",
    file_path: "shared.txt",
    conflict_number: 1,
    total_conflicts: 1,
    start_line: 1,
    end_line: 6,
    marker_style: "jj_git_diff3",
    content: "",
    line_map: [1, 2, 3, 4, 5, 6],
    comparison: {
      left_line_indexes: [1],
      base_line_indexes: [3],
      right_line_indexes: [],
    },
    lines: [
      {
        raw: "<<<<<<< Side #1 (Conflict 1 of 1)",
        kind: "marker",
        role: "start",
        file_line: 1,
      },
      {
        raw: "workspace side",
        kind: "content",
        role: "left",
        file_line: 2,
      },
      {
        raw: "||||||| Base",
        kind: "marker",
        role: "base",
        file_line: 3,
      },
      { raw: "base", kind: "content", role: "base", file_line: 4 },
      {
        raw: "=======",
        kind: "marker",
        role: "separator",
        file_line: 5,
      },
      {
        raw: ">>>>>>> Side #2 (Conflict 1 of 1)",
        kind: "marker",
        role: "end",
        file_line: 6,
      },
    ],
  };
}

const noopHandlers = {
  conflictComments: new Map(),
  openConflictComments: new Set<string>(),
  editingConflictCommentId: null,
  saveConflictComment: () => {},
  clearConflictComment: () => {},
  toggleConflictComment: () => {},
  setOpenConflictComments: () => {},
  startEditConflictComment: () => {},
  cancelEditConflictComment: () => {},
  saveEditConflictComment: () => {},
  searchData: { matches: [], matchesByKey: new Map() },
  debouncedSearchQuery: "",
  currentMatchIndex: -1,
};

describe("InlineConflictCard deleted side", () => {
  it("renders a deleted-side card for the empty side", () => {
    render(
      <InlineConflictCard
        region={buildDeletedSideRegion()}
        {...noopHandlers}
      />,
    );

    expect(screen.getByText("Conflict 1 of 1")).toBeInTheDocument();
    expect(screen.getByText("workspace side")).toBeInTheDocument();
    const deletedCard = screen.getByTestId("conflict-deleted-side");
    expect(deletedCard).toHaveAttribute("data-side", "Side #2");
    expect(deletedCard).toHaveTextContent("Side #2 deleted this file");
  });
});
