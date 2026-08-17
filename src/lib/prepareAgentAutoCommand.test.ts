import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "./api";
import {
  parseJsonObject,
  prepareAgentAutoCommand,
} from "./prepareAgentAutoCommand";

vi.mock("./api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./api")>();
  return {
    ...actual,
    writeAgentCliFiles: vi.fn(),
    cleanupAgentCliFiles: vi.fn(),
    readFile: vi.fn(),
  };
});

describe("parseJsonObject", () => {
  it("returns a plain object from JSON", () => {
    expect(parseJsonObject('{"permissions":{"allow":["Bash"]}}')).toEqual({
      permissions: { allow: ["Bash"] },
    });
  });

  it("returns null for invalid JSON, arrays, and primitives", () => {
    expect(parseJsonObject("not json")).toBeNull();
    expect(parseJsonObject("[1]")).toBeNull();
    expect(parseJsonObject('"x"')).toBeNull();
  });
});

const writtenFiles = {
  promptPath: "/tmp/treq-agent-prompt-1.txt",
  settingsPath: "/tmp/treq-agent-settings-1.json",
  skillDir: "/tmp/treq-agent-skills-1",
};

describe("prepareAgentAutoCommand", () => {
  beforeEach(() => {
    vi.mocked(api.readFile).mockRejectedValue(new Error("missing"));
    vi.mocked(api.writeAgentCliFiles).mockReset();
  });

  it("retries without cwd when writing project skills fails", async () => {
    vi.mocked(api.writeAgentCliFiles)
      .mockRejectedValueOnce(
        new Error(
          "Failed to create .agents/skills/treq: Read-only file system (os error 30)",
        ),
      )
      .mockResolvedValueOnce(writtenFiles);

    const { command } = await prepareAgentAutoCommand({
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
  });
});
