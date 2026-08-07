import { describe, expect, it } from "vitest";
import { appendAgentPrompt } from "./agentCommand";

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
