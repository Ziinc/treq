import { describe, expect, it } from "vitest";
import { agentChatToLogRecords } from "./agentChatLogs";
import type { AgentChat } from "./api-types";

const chat: AgentChat = {
  session_id: 4,
  pty_session_id: "pty-4",
  name: "Claude",
  agent: "claude",
  workspace_id: null,
  created_at: "t0",
  screen_before_last_user_message: "",
  messages: [
    { id: 0, role: "agent", message: "", time: "t0" },
    { id: 1, role: "user", message: "fix the tests", time: "t1" },
    { id: 2, role: "agent", message: "I'll run them.", time: "t2" },
  ],
};

describe("agentChatToLogRecords", () => {
  it("drops empty intro messages and maps role onto job_id", () => {
    const records = agentChatToLogRecords(chat);
    expect(records).toHaveLength(2);
    expect(records[0].job_id).toBe("user");
    expect(records[0].body).toBe("fix the tests");
    expect(records[1].job_id).toBe("agent");
    expect(records[1].body).toBe("I'll run them.");
  });
});
