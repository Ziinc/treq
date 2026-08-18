import { describe, expect, it } from "vitest";
import {
  appendAgentPrompt,
  buildAgentAutoCommand,
  buildTreqAgentSystemPrompt,
  cursorPromptFileContents,
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
    expect(prompt).toContain(
      "A Treq skill named treq is loaded automatically for this session.",
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

describe("cursorPromptFileContents", () => {
  it("combines system prompt with an optional pending prompt", () => {
    expect(cursorPromptFileContents("sys", "do the thing")).toBe(
      "sys do the thing",
    );
    expect(cursorPromptFileContents("sys")).toBe("sys");
  });
});

describe("buildAgentAutoCommand", () => {
  const files = {
    promptPath: "/tmp/treq-agent-prompt-1.txt",
    skillDir: "/tmp/treq-agent-skills-1",
  };

  it("points Claude at the prompt file without injecting sandbox settings", () => {
    const command = buildAgentAutoCommand({
      agent: "claude",
      files: { ...files, claudeSkillPath: "/ws/.claude/skills/treq" },
      pendingPrompt: "fix the bug",
    });

    expect(command).not.toContain("--settings");
    expect(command).toContain(
      "--append-system-prompt-file '/tmp/treq-agent-prompt-1.txt'",
    );
    expect(command).not.toContain("--add-dir");
    expect(command).not.toContain("--append-system-prompt ");
    expect(command).not.toContain("You are operating");
    expect(command).toContain(
      `trap "rm -rf '/tmp/treq-agent-prompt-1.txt' '/tmp/treq-agent-skills-1' '/ws/.claude/skills/treq'" EXIT`,
    );
    expect(command).toContain("-- 'fix the bug'");
  });

  it("loads Codex developer instructions from a file via cat", () => {
    const command = buildAgentAutoCommand({
      agent: "codex",
      files: {
        promptPath: files.promptPath,
        skillDir: files.skillDir,
        agentsSkillPath: "/ws/.agents/skills/treq",
      },
    });

    expect(command).toContain(
      `codex -c "developer_instructions=$(cat -- '/tmp/treq-agent-prompt-1.txt')"`,
    );
    expect(command).not.toContain("--append-system-prompt");
    expect(command).toContain(
      `trap "rm -rf '/tmp/treq-agent-prompt-1.txt' '/tmp/treq-agent-skills-1' '/ws/.agents/skills/treq'" EXIT`,
    );
  });

  it("loads the Cursor prompt from a file; skills come from .agents/skills", () => {
    const command = buildAgentAutoCommand({
      agent: "cursor",
      permissionMode: "plan",
      files: {
        promptPath: files.promptPath,
        skillDir: files.skillDir,
        agentsSkillPath: "/ws/.agents/skills/treq",
      },
    });

    expect(command).toContain("cursor-agent --plan -- ");
    expect(command).not.toContain("--plugin-dir");
    expect(command).toContain(`"$(cat -- '/tmp/treq-agent-prompt-1.txt')"`);
    expect(command).toContain(
      `trap "rm -rf '/tmp/treq-agent-prompt-1.txt' '/tmp/treq-agent-skills-1' '/ws/.agents/skills/treq'" EXIT`,
    );
  });
});
