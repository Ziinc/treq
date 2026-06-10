import * as React from "react";
import { beforeEach, describe, expect, it } from "vitest";
import { createTestRepo, findSidebarBranchElement, openRepo } from "../utils";
import {
	createWorkspace,
	getSetting,
	getRepoSetting,
	getSessions,
	setSetting,
} from "../../src/lib/api";
import { render, screen, waitFor } from "../test-utils";
import { Dashboard } from "../../src/components/Dashboard";
import userEvent from "@testing-library/user-event";

describe("default agent configuration", () => {
	let user: ReturnType<typeof userEvent.setup>;
	let repoPath: string;

	beforeEach(() => {
		({ repoPath } = createTestRepo(false));
		openRepo(repoPath);
		user = userEvent.setup();
	});

	it("saves app-level default_agent via Application settings tab", async () => {
		render(<Dashboard />);

		await user.click(await screen.findByLabelText("Settings"));
		await screen.findByText("Settings");

		const applicationTab = await screen.findByRole("tab", {
			name: /application/i,
		});
		await user.click(applicationTab);

		const agentSelect = await screen.findByLabelText(/default agent/i);
		await user.selectOptions(agentSelect, "codex");

		await user.click(
			await screen.findByRole("button", { name: /save settings/i }),
		);
		await screen.findByText("Settings Saved");

		const saved = await getSetting("default_agent");
		expect(saved).toBe("codex");
	});

	it("saves repo-level default_agent via Repository settings tab and it overrides app-level in TaskInput", async () => {
		await setSetting("default_agent", "codex");

		await createWorkspace(repoPath, "feat/agent-settings-test");

		render(<Dashboard />);

		await user.click(await screen.findByLabelText("Settings"));
		await screen.findByText("Settings");

		const repositoryTab = await screen.findByRole("tab", {
			name: /repository/i,
		});
		expect(repositoryTab).toHaveAttribute("data-state", "active");

		const agentSelect = await screen.findByLabelText(/default agent/i);
		await user.selectOptions(agentSelect, "claude");

		await user.click(
			await screen.findByRole("button", { name: /save settings/i }),
		);
		await screen.findByText("Settings saved");

		const savedRepo = await getRepoSetting(repoPath, "default_agent");
		expect(savedRepo).toBe("claude");

		await user.click(await screen.findByRole("button", { name: /cancel/i }));

		await user.click(
			await findSidebarBranchElement("feat/agent-settings-test"),
		);

		const agentPicker = await screen.findByLabelText("Agent");
		await waitFor(() => expect(agentPicker).toHaveValue("claude"));
	});

	it("creates sessions with the selected agent and switching the dropdown changes the agent used", async () => {
		await setSetting("default_agent", "codex");

		await createWorkspace(repoPath, "feat/agent-switch-test");

		render(<Dashboard />);

		await user.click(await findSidebarBranchElement("feat/agent-switch-test"));

		const agentPicker = await screen.findByLabelText("Agent");
		await waitFor(() => expect(agentPicker).toHaveValue("codex"));

		const textarea = await screen.findByPlaceholderText(/describe a task/i);
		await user.click(textarea);
		await user.type(textarea, "codex task one");
		await user.keyboard("{Shift>}{Enter}{/Shift}");

		await waitFor(async () => {
			const sessions = await getSessions(repoPath);
			expect(sessions.some((s) => s.name === "codex task one")).toBe(true);
		});

		await user.selectOptions(agentPicker, "claude");
		expect(agentPicker).toHaveValue("claude");

		const textarea2 = await screen.findByPlaceholderText(/describe a task/i);
		await user.click(textarea2);
		await user.type(textarea2, "claude task two");
		await user.keyboard("{Shift>}{Enter}{/Shift}");

		await waitFor(async () => {
			const sessions = await getSessions(repoPath);
			expect(sessions.some((s) => s.name === "claude task two")).toBe(true);
		});

		await user.selectOptions(agentPicker, "codex");
		expect(agentPicker).toHaveValue("codex");
	});

	it("saves app-level default_agent as cursor and TaskInput picks it up", async () => {
		await setSetting("default_agent", "cursor");

		await createWorkspace(repoPath, "feat/agent-cursor-test");

		render(<Dashboard />);

		await user.click(await findSidebarBranchElement("feat/agent-cursor-test"));

		const agentPicker = await screen.findByLabelText("Agent");
		await waitFor(() => expect(agentPicker).toHaveValue("cursor"));
	});

	it("New Agent Terminal command palette entry uses the configured default_agent, not hardcoded claude", async () => {
		await setSetting("default_agent", "codex");

		await createWorkspace(repoPath, "feat/agent-terminal-default-test");

		render(<Dashboard />);

		await user.click(
			await findSidebarBranchElement("feat/agent-terminal-default-test"),
		);

		// Open command palette and trigger "New Agent Terminal"
		await user.keyboard("{Meta>}k{/Meta}");
		const newAgentTerminal = await screen.findByText("New Agent Terminal");
		await user.click(newAgentTerminal);

		// The session name is derived from the agent label: "Codex 1" when default_agent=codex
		await waitFor(async () => {
			const sessions = await getSessions(repoPath);
			expect(sessions.some((s) => s.name === "Codex 1")).toBe(true);
		});
	});

	it("terminal pane Agent button uses the configured default_agent, not hardcoded claude", async () => {
		await setSetting("default_agent", "codex");

		await createWorkspace(repoPath, "feat/agent-pane-button-test");

		render(<Dashboard />);

		await user.click(
			await findSidebarBranchElement("feat/agent-pane-button-test"),
		);

		// Click the "Agent" button in the terminal pane header
		const agentButton = await screen.findByRole("button", {
			name: /new agent/i,
		});
		await user.click(agentButton);

		// Session name should be "Codex 1" (not "Claude 1") when default_agent=codex
		await waitFor(async () => {
			const sessions = await getSessions(repoPath);
			expect(sessions.some((s) => s.name === "Codex 1")).toBe(true);
		});
	});
});
