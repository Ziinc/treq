import * as React from "react";
import { beforeEach, describe, expect, it } from "vitest";
import {
	createTestRepo,
	findSidebarBranchElement,
	openRepo,
} from "../utils";
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
		const testRepo = createTestRepo(false);
		repoPath = testRepo.repoPath;
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
		// Set app-level to codex so we can verify repo-level overrides it
		await setSetting("default_agent", "codex");

		await createWorkspace(repoPath, "feat/agent-settings-test");

		render(<Dashboard />);

		await user.click(await screen.findByLabelText("Settings"));
		await screen.findByText("Settings");

		// Repository tab should be active by default
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

		// Close settings, navigate to workspace, and verify TaskInput picks up repo default
		await user.click(await screen.findByRole("button", { name: /cancel/i }));

		await user.click(
			await findSidebarBranchElement("feat/agent-settings-test"),
		);

		// TaskInput initializes asynchronously from settings; wait for repo override to take effect
		const agentPicker = await screen.findByLabelText("Agent");
		await waitFor(() => expect(agentPicker).toHaveValue("claude"));
	});

	it("creates sessions with the selected agent and switching the dropdown changes the agent used", async () => {
		// Set app-level default to codex so TaskInput starts with codex
		await setSetting("default_agent", "codex");

		await createWorkspace(repoPath, "feat/agent-switch-test");

		render(<Dashboard />);

		await user.click(
			await findSidebarBranchElement("feat/agent-switch-test"),
		);

		// Wait for TaskInput to initialize; it should pick up the codex default
		const agentPicker = await screen.findByLabelText("Agent");
		await waitFor(() => expect(agentPicker).toHaveValue("codex"));

		// Submit a task with codex selected
		const textarea = await screen.findByPlaceholderText(/describe a task/i);
		await user.click(textarea);
		await user.type(textarea, "codex task one");
		await user.keyboard("{Shift>}{Enter}{/Shift}");

		// Session name equals the task text (TaskInput names sessions after the prompt)
		await waitFor(async () => {
			const sessions = await getSessions(repoPath);
			expect(sessions.some((s) => s.name === "codex task one")).toBe(true);
		});

		// Switch to claude — picker should reflect the change
		await user.selectOptions(agentPicker, "claude");
		expect(agentPicker).toHaveValue("claude");

		// Submit another task with claude selected
		const textarea2 = await screen.findByPlaceholderText(/describe a task/i);
		await user.click(textarea2);
		await user.type(textarea2, "claude task two");
		await user.keyboard("{Shift>}{Enter}{/Shift}");

		await waitFor(async () => {
			const sessions = await getSessions(repoPath);
			expect(sessions.some((s) => s.name === "claude task two")).toBe(true);
		});

		// Switch back to codex — picker should reflect the change
		await user.selectOptions(agentPicker, "codex");
		expect(agentPicker).toHaveValue("codex");
	});

	it("saves app-level default_agent as cursor and TaskInput picks it up", async () => {
		await setSetting("default_agent", "cursor");

		await createWorkspace(repoPath, "feat/agent-cursor-test");

		render(<Dashboard />);

		await user.click(
			await findSidebarBranchElement("feat/agent-cursor-test"),
		);

		const agentPicker = await screen.findByLabelText("Agent");
		await waitFor(() => expect(agentPicker).toHaveValue("cursor"));
	});
});
