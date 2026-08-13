import { describe, expect, it } from "vitest";
import {
  appendAgentPrompt,
  buildClaudeSandboxSettings,
  buildTreqAgentSystemPrompt,
} from "./agentCommand";

describe("appendAgentPrompt", () => {
  it("separates a prompt beginning with hyphens from CLI options", () => {
    expect(
      appendAgentPrompt(
        "codex -c 'instructions=treq'",
        "---- test failure ----",
      ),
    ).toBe("codex -c 'instructions=treq' -- '---- test failure ----'");
  });

  it("quotes shell metacharacters in the prompt", () => {
    expect(appendAgentPrompt("codex", "it's $HOME `pwd`!")).toBe(
      "codex -- 'it'\\''s $HOME `pwd`!'",
    );
  });
});

describe("buildTreqAgentSystemPrompt", () => {
  it("describes a workspace and limits direct file access to it", () => {
    const prompt = buildTreqAgentSystemPrompt({
      repoPath: "/repos/treq",
      workspacePath: "/repos/treq/.treq/workspaces/fix-parser",
    });

    expect(prompt).toContain("You are operating inside a Treq workspace.");
    expect(prompt).toContain(
      "Your current working directory and direct filesystem scope is /repos/treq/.treq/workspaces/fix-parser.",
    );
    expect(prompt).toContain("The Treq home repository is /repos/treq.");
    expect(prompt).toContain(
      "The home repository and sibling workspaces are outside your direct filesystem scope.",
    );
    expect(prompt).toContain(
      "You may run treq CLI commands even when they create or manage workspaces outside the current working directory.",
    );
    expect(prompt).not.toMatch(/[\r\n]/);
    expect(prompt).not.toContain("\\n");
  });

  it("describes a home repository without workspace-only exclusions", () => {
    const prompt = buildTreqAgentSystemPrompt({
      repoPath: "/repos/treq",
      workspacePath: null,
    });

    expect(prompt).toContain("You are operating in the Treq home repository.");
    expect(prompt).toContain(
      "Your current working directory and direct filesystem scope is /repos/treq.",
    );
    expect(prompt).toContain(
      "You may freely read and write files within this directory and its descendants.",
    );
    expect(prompt).toContain(
      "Do not directly read, write, edit, or delete files outside this directory.",
    );
    expect(prompt).not.toContain("sibling workspaces");
    expect(prompt).not.toContain("outside your direct filesystem scope");
    expect(prompt).not.toMatch(/[\r\n]/);
  });
});

describe("buildClaudeSandboxSettings", () => {
  it("allows workspace reads and writes while denying the home repository", () => {
    expect(
      buildClaudeSandboxSettings({
        repoPath: "/repos/treq",
        workspacePath: "/repos/treq/.treq/workspaces/fix-parser",
      }),
    ).toEqual({
      sandbox: {
        enabled: true,
        failIfUnavailable: true,
        allowUnsandboxedCommands: false,
        filesystem: {
          denyRead: ["/repos/treq"],
          allowRead: ["/repos/treq/.treq/workspaces/fix-parser"],
          allowWrite: ["/repos/treq/.treq/workspaces/fix-parser"],
        },
      },
    });
  });

  it("allows home repository reads and writes without workspace exclusions", () => {
    expect(
      buildClaudeSandboxSettings({
        repoPath: "/repos/treq",
        workspacePath: null,
      }),
    ).toEqual({
      sandbox: {
        enabled: true,
        failIfUnavailable: true,
        allowUnsandboxedCommands: false,
        filesystem: {
          allowRead: ["/repos/treq"],
          allowWrite: ["/repos/treq"],
        },
      },
    });
  });
});
