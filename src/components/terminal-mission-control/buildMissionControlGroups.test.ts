import { describe, expect, it } from "vitest";
import type { TerminalSessionSummary } from "../terminal/types";
import { buildMissionControlGroups } from "./buildMissionControlGroups";

const session = (
  overrides: Partial<TerminalSessionSummary> &
    Pick<TerminalSessionSummary, "id">,
): TerminalSessionSummary => ({
  kind: "shell",
  name: overrides.id,
  branchName: "main",
  isMainRepo: true,
  lastActivityAt: 0,
  lastUserInputAt: 0,
  isStreaming: false,
  previewOutput: "",
  ...overrides,
});

describe("buildMissionControlGroups", () => {
  it("groups terminals by workspace and sorts groups and terminals by activity", () => {
    const sessions = [
      session({
        id: "shell-old-main",
        branchName: "main",
        isMainRepo: true,
        lastActivityAt: 100,
      }),
      session({
        id: "agent-feat",
        kind: "agent",
        name: "Agent",
        branchName: "feat/thing",
        isMainRepo: false,
        lastActivityAt: 300,
        lastUserInputAt: 50,
      }),
      session({
        id: "shell-feat-recent",
        branchName: "feat/thing",
        isMainRepo: false,
        lastActivityAt: 200,
        lastUserInputAt: 400,
      }),
      session({
        id: "shell-main-recent",
        branchName: "main",
        isMainRepo: true,
        lastActivityAt: 350,
      }),
    ];

    const groups = buildMissionControlGroups(sessions);

    expect(groups.map((g) => g.workspaceKey)).toEqual([
      "feat/thing",
      "__main__",
    ]);
    expect(groups[0].terminals.map((t) => t.id)).toEqual([
      "shell-feat-recent",
      "agent-feat",
    ]);
    expect(groups[1].terminals.map((t) => t.id)).toEqual([
      "shell-main-recent",
      "shell-old-main",
    ]);
  });

  it("labels main-repo groups from the branch name when present", () => {
    const groups = buildMissionControlGroups([
      session({ id: "a", branchName: "develop", isMainRepo: true }),
    ]);
    expect(groups).toEqual([
      expect.objectContaining({
        workspaceKey: "__main__",
        workspaceName: "develop",
        isMainRepo: true,
      }),
    ]);
  });

  it("returns an empty list when there are no sessions", () => {
    expect(buildMissionControlGroups([])).toEqual([]);
  });
});
