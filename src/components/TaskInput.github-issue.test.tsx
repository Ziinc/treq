import { beforeEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { render, screen, waitFor } from "../../test/test-utils";
import { TaskInput } from "./TaskInput";

const api = vi.hoisted(() => ({
  createSession: vi.fn(),
  getSetting: vi.fn(),
  getRepoSetting: vi.fn(),
  setRepoSetting: vi.fn(),
  searchWorkspaceFiles: vi.fn(),
}));

vi.mock("../lib/api", async (importOriginal) => {
  const original = await importOriginal<typeof import("../lib/api")>();
  return {
    ...original,
    createSession: api.createSession,
    getSetting: api.getSetting,
    getRepoSetting: api.getRepoSetting,
    setRepoSetting: api.setRepoSetting,
    searchWorkspaceFiles: api.searchWorkspaceFiles,
  };
});

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(),
}));

describe("TaskInput GitHub issue chip", () => {
  let user: ReturnType<typeof userEvent.setup>;

  beforeEach(() => {
    user = userEvent.setup();
    api.createSession.mockReset();
    api.createSession.mockResolvedValue(99);
    api.getSetting.mockResolvedValue("claude");
    api.getRepoSetting.mockResolvedValue(null);
    api.setRepoSetting.mockResolvedValue(undefined);
    api.searchWorkspaceFiles.mockResolvedValue([]);
  });

  it("renders a dismissible GitHub issue chip from initialGitHubIssue", async () => {
    render(
      <TaskInput
        repoPath="/repo"
        workspaceId={null}
        workspacePath={null}
        workingDirectory="/repo"
        initialGitHubIssue={{
          number: 42,
          url: "https://github.com/acme/treq/issues/42",
          title: "Fix the login bug",
        }}
      />,
    );

    const chip = await screen.findByTestId("github-issue-chip");
    expect(chip).toHaveTextContent("#42");

    await user.click(
      screen.getByRole("button", { name: /remove github issue/i }),
    );
    expect(screen.queryByTestId("github-issue-chip")).not.toBeInTheDocument();
  });

  it("includes the issue number in the pending prompt on submit", async () => {
    const onSessionCreated = vi.fn();
    render(
      <TaskInput
        repoPath="/repo"
        workspaceId={1}
        workspacePath="/repo/.treq/feat"
        workingDirectory="/repo/.treq/feat"
        onSessionCreated={onSessionCreated}
        initialGitHubIssue={{
          number: 42,
          url: "https://github.com/acme/treq/issues/42",
          title: "Fix the login bug",
        }}
      />,
    );

    await screen.findByTestId("github-issue-chip");
    await user.type(
      screen.getByPlaceholderText("Describe a task..."),
      "fix auth",
    );
    await user.click(screen.getByRole("button", { name: /^edit$/i }));

    await waitFor(() => {
      expect(onSessionCreated).toHaveBeenCalled();
    });
    expect(onSessionCreated.mock.calls[0][0].pendingPrompt).toContain(
      "GitHub issue #42:",
    );
    expect(onSessionCreated.mock.calls[0][0].pendingPrompt).toContain(
      "fix auth",
    );
  });
});
