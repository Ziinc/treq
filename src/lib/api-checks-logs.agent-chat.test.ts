import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentChat } from "./api-types";

const { invoke, invalidateQueries, setQueryData } = vi.hoisted(() => ({
  invoke: vi.fn(),
  invalidateQueries: vi.fn(),
  setQueryData: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({ invoke }));
vi.mock("./swr-cache", () => ({ invalidateQueries, setQueryData }));

import { recordAgentChatScreen, registerAgentChat } from "./api-checks-logs";

const chat: AgentChat = {
  session_id: 12,
  pty_session_id: "pty-12",
  name: "Codex",
  agent: "codex",
  workspace_id: null,
  created_at: "2026-01-01T00:00:00Z",
  screen_before_last_user_message: "",
  messages: [],
};

describe("agent chat API cache updates", () => {
  beforeEach(() => vi.clearAllMocks());

  it("forwards the initial prompt and refreshes chat caches after registration", async () => {
    invoke.mockResolvedValue(chat);

    await registerAgentChat(
      "/repo",
      12,
      "pty-12",
      "Codex",
      "codex",
      null,
      "initial task",
    );

    expect(invoke).toHaveBeenCalledWith("register_agent_chat", {
      repoPath: "/repo",
      sessionId: 12,
      ptySessionId: "pty-12",
      name: "Codex",
      agent: "codex",
      workspaceId: null,
      initialPrompt: "initial task",
    });
    expect(setQueryData).toHaveBeenCalledWith(
      ["agent-chat", "/repo", 12],
      chat,
    );
    expect(invalidateQueries).toHaveBeenCalledWith(["agent-chats", "/repo"]);
  });

  it("updates an open chat after a partial screen is recorded", async () => {
    invoke.mockResolvedValue(chat);

    await recordAgentChatScreen("/repo", 12, "partial answer");

    expect(setQueryData).toHaveBeenCalledWith(
      ["agent-chat", "/repo", 12],
      chat,
    );
    expect(invalidateQueries).toHaveBeenCalledWith(["agent-chats", "/repo"]);
  });
});
