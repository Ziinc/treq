import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ClaudeSessionData } from "./types";
import { useAgentAutoCommand } from "./useAgentAutoCommand";

vi.mock("../../lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/api")>();
  return {
    ...actual,
    getSessionModel: vi.fn().mockResolvedValue(null),
    getTreqBinDir: vi.fn().mockResolvedValue(null),
  };
});

vi.mock("../../lib/prepareAgentAutoCommand", () => ({
  prepareAgentAutoCommand: vi.fn(),
  discardAgentCliFiles: vi.fn().mockResolvedValue(undefined),
}));

const addToast = vi.fn();
vi.mock("../ui/toast", () => ({
  useToast: () => ({ addToast, removeToast: vi.fn(), toasts: [] }),
}));

import { prepareAgentAutoCommand } from "../../lib/prepareAgentAutoCommand";

const session: ClaudeSessionData = {
  sessionId: 1,
  sessionName: "agent",
  ptySessionId: "pty-1",
  workspacePath: "/ws",
  repoPath: "/repo",
};

describe("useAgentAutoCommand", () => {
  beforeEach(() => {
    vi.mocked(prepareAgentAutoCommand).mockReset();
    addToast.mockReset();
  });

  it("exposes prepareError instead of leaving autoCommand unset", async () => {
    vi.mocked(prepareAgentAutoCommand).mockRejectedValue(
      new Error(
        "Failed to create .agents/skills/treq: Read-only file system (os error 30)",
      ),
    );

    const { result } = renderHook(() => useAgentAutoCommand(session));

    await waitFor(() => {
      expect(result.current.isModelLoaded).toBe(true);
      expect(result.current.prepareError).toMatch(/Read-only file system/);
    });
    expect(result.current.autoCommand).toBeNull();
  });

  it("toasts when project skills could not be written", async () => {
    vi.mocked(prepareAgentAutoCommand).mockResolvedValue({
      command: "claude --permission-mode acceptEdits",
      filePaths: ["/tmp/prompt"],
      skillWriteWarning:
        "Failed to create .agents/skills/treq: Read-only file system",
    });

    const { result } = renderHook(() => useAgentAutoCommand(session));

    await waitFor(() => {
      expect(result.current.autoCommand).toBe(
        "claude --permission-mode acceptEdits",
      );
    });
    expect(addToast).toHaveBeenCalledWith({
      type: "warning",
      title: "Could not write Treq skills",
      description:
        "Failed to create .agents/skills/treq: Read-only file system",
    });
  });
});
