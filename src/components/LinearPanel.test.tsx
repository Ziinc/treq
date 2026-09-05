import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "../../test/test-utils";
import type { LinearIssue } from "../lib/api-linear";
import { LinearPanel } from "./LinearPanel";

const api = vi.hoisted(() => ({
  linearListIssues: vi.fn(),
  linearListTeams: vi.fn(),
  linearOpenOrCreateWorkspaceFromIssue: vi.fn(),
}));

vi.mock("../lib/api-linear", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/api-linear")>()),
  ...api,
}));

const issue: LinearIssue = {
  id: "issue-id",
  identifier: "TREQ-281",
  title: "Linear integration should CRUD issues",
  description: "Implement the issue workflow",
  state: { name: "Todo", type: "unstarted" },
  labels: [],
  branch_name: "ty/treq-281-linear-integration",
  parent_id: null,
  sub_issue_ids: [],
  url: "https://linear.app/treq/issue/TREQ-281",
};

describe("LinearPanel issue kickoff", () => {
  beforeEach(() => {
    api.linearListTeams.mockResolvedValue([]);
    api.linearListIssues.mockResolvedValue([issue]);
    api.linearOpenOrCreateWorkspaceFromIssue.mockReset();
  });

  it("opens the agent prompt with the Linear issue instead of creating immediately", async () => {
    const user = userEvent.setup();
    const onStartPromptFromIssue = vi.fn();
    render(
      <LinearPanel
        repoPath="/repo"
        onStartPromptFromIssue={onStartPromptFromIssue}
      />,
    );

    await user.click(await screen.findByRole("button", { name: "Kick off" }));

    expect(onStartPromptFromIssue).toHaveBeenCalledWith({
      ...issue,
      includeSubissues: false,
    });
    expect(api.linearOpenOrCreateWorkspaceFromIssue).not.toHaveBeenCalled();
  });
});
