import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "./api";
import { prepareAgentAutoCommand } from "./prepareAgentAutoCommand";

vi.mock("./api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./api")>();
  return {
    ...actual,
    writeAgentCliFiles: vi.fn(),
    cleanupAgentCliFiles: vi.fn(),
    readFile: vi.fn(),
  };
});

const writtenFiles = {
  promptPath: "/tmp/treq-agent-prompt-1.txt",
  skillDir: "/tmp/treq-agent-skills-1",
};

describe("prepareAgentAutoCommand", () => {
  beforeEach(() => {
    vi.mocked(api.writeAgentCliFiles).mockReset();
    vi.mocked(api.readFile).mockReset();
  });

  it("does not write Claude sandbox settings or read local settings", async () => {
    vi.mocked(api.writeAgentCliFiles).mockResolvedValueOnce(writtenFiles);

    const { command } = await prepareAgentAutoCommand({
      agent: "claude",
      workspacePath: "/ws",
      repoPath: "/repo",
      sessionModel: null,
      treqBinDir: null,
    });

    expect(api.readFile).not.toHaveBeenCalled();
    expect(api.writeAgentCliFiles).toHaveBeenCalledWith(
      expect.any(String),
      undefined,
      "/ws",
    );
    expect(command).not.toContain("--settings");
  });

  it("retries without cwd when writing project skills fails", async () => {
    vi.mocked(api.writeAgentCliFiles)
      .mockRejectedValueOnce(
        new Error(
          "Failed to create .agents/skills/treq: Read-only file system (os error 30)",
        ),
      )
      .mockResolvedValueOnce(writtenFiles);

    const { command, skillWriteWarning } = await prepareAgentAutoCommand({
      agent: "claude",
      workspacePath: "/ws",
      repoPath: "/repo",
      sessionModel: null,
      treqBinDir: null,
    });

    expect(api.writeAgentCliFiles).toHaveBeenCalledTimes(2);
    expect(vi.mocked(api.writeAgentCliFiles).mock.calls[0]?.[2]).toBe("/ws");
    expect(vi.mocked(api.writeAgentCliFiles).mock.calls[1]?.[2]).toBeNull();
    expect(command).toContain("--append-system-prompt-file");
    expect(skillWriteWarning).toMatch(/Could not write Treq skills/);
  });

  it("forwards a skill write warning from a successful write", async () => {
    vi.mocked(api.writeAgentCliFiles).mockResolvedValueOnce({
      ...writtenFiles,
      skillWriteWarning:
        "Failed to create .agents/skills/treq: Read-only file system",
    });

    const { skillWriteWarning } = await prepareAgentAutoCommand({
      agent: "claude",
      workspacePath: "/ws",
      repoPath: "/repo",
      sessionModel: null,
      treqBinDir: null,
    });

    expect(api.writeAgentCliFiles).toHaveBeenCalledTimes(1);
    expect(skillWriteWarning).toMatch(/Read-only file system/);
  });
});
