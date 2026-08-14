import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  AgentIcon,
  ClaudeIcon,
  CodexIcon,
  CursorIcon,
  agentIconComponent,
} from "./AgentIcons";

describe("AgentIcons", () => {
  it("renders distinct brand marks for each agent", () => {
    const { container: claude } = render(<ClaudeIcon className="w-4 h-4" />);
    const { container: codex } = render(<CodexIcon className="w-4 h-4" />);
    const { container: cursor } = render(<CursorIcon className="w-4 h-4" />);

    expect(claude.querySelector('[data-agent-icon="claude"]')).toBeTruthy();
    expect(codex.querySelector('[data-agent-icon="codex"]')).toBeTruthy();
    expect(cursor.querySelector('[data-agent-icon="cursor"]')).toBeTruthy();
  });

  it("AgentIcon and agentIconComponent pick the matching brand", () => {
    expect(agentIconComponent("claude")).toBe(ClaudeIcon);
    expect(agentIconComponent("codex")).toBe(CodexIcon);
    expect(agentIconComponent("cursor")).toBe(CursorIcon);
    expect(agentIconComponent(undefined)).toBe(ClaudeIcon);

    const { container } = render(<AgentIcon agent="codex" className="w-3" />);
    expect(container.querySelector('[data-agent-icon="codex"]')).toBeTruthy();
  });
});
