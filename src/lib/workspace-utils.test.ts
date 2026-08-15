import { describe, expect, it } from "vitest";
import type { Workspace } from "./api-types";
import {
  addHours,
  followingMondayAtNine,
  getWorkspaceDisplayTitle,
  isWorkspaceHidden,
  nextWeekdayAt,
} from "./workspace-utils";

function makeWorkspace(overrides: Partial<Workspace> = {}): Workspace {
  return {
    id: 1,
    repo_path: "/tmp/repo",
    workspace_name: "feature/a",
    workspace_path: "ws/feature-a",
    branch_name: "feature/a",
    created_at: "2026-01-01T00:00:00.000Z",
    title: "",
    not_on_remote: false,
    ...overrides,
  };
}

describe("getWorkspaceDisplayTitle", () => {
  it("returns the workspace title when set", () => {
    const workspace = makeWorkspace({ title: "Add usage guidelines" });
    expect(getWorkspaceDisplayTitle(workspace)).toBe("Add usage guidelines");
  });

  it("falls back to metadata.title when title is empty", () => {
    const workspace = makeWorkspace({
      title: "",
      metadata: JSON.stringify({ title: "From metadata" }),
    });
    expect(getWorkspaceDisplayTitle(workspace)).toBe("From metadata");
  });

  it("falls back to branch_name when neither title nor metadata title exist", () => {
    const workspace = makeWorkspace({ title: "", branch_name: "docs/ai" });
    expect(getWorkspaceDisplayTitle(workspace)).toBe("docs/ai");
  });

  it("falls back to branch_name when metadata is malformed JSON", () => {
    const workspace = makeWorkspace({
      title: "",
      metadata: "{not valid json",
      branch_name: "docs/ai",
    });
    expect(getWorkspaceDisplayTitle(workspace)).toBe("docs/ai");
  });
});

describe("isWorkspaceHidden", () => {
  const now = Date.parse("2026-08-14T12:00:00.000Z");

  it("is hidden when hidden_until is in the future", () => {
    expect(
      isWorkspaceHidden({ hidden_until: "2026-08-15T09:00:00.000Z" }, now),
    ).toBe(true);
  });

  it("is visible when hidden_until has passed or is missing", () => {
    expect(
      isWorkspaceHidden({ hidden_until: "2026-08-14T11:00:00.000Z" }, now),
    ).toBe(false);
    expect(isWorkspaceHidden({}, now)).toBe(false);
    expect(isWorkspaceHidden({ hidden_until: null }, now)).toBe(false);
  });
});

describe("schedule date helpers", () => {
  it("adds hours to a local timestamp", () => {
    const from = new Date("2026-08-14T12:00:00");
    expect(addHours(from, 4).getHours()).toBe(16);
  });

  it("picks the next weekday at the given hour, including today when upcoming", () => {
    const fridayMorning = new Date(2026, 7, 14, 8, 0, 0); // Friday
    const friday = nextWeekdayAt(fridayMorning, 5, 17);
    expect(friday.getDay()).toBe(5);
    expect(friday.getDate()).toBe(14);
    expect(friday.getHours()).toBe(17);

    const fridayEvening = new Date(2026, 7, 14, 18, 0, 0);
    const nextFriday = nextWeekdayAt(fridayEvening, 5, 17);
    expect(nextFriday.getDate()).toBe(21);
  });

  it("following Monday is never today", () => {
    const monday = new Date(2026, 7, 10, 8, 0, 0);
    const next = followingMondayAtNine(monday);
    expect(next.getDay()).toBe(1);
    expect(next.getDate()).toBe(17);
  });
});
