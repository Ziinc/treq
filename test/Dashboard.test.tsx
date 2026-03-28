import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within, act, fireEvent } from "./test-utils";
import userEvent from "@testing-library/user-event";
import { Dashboard } from "../src/components/Dashboard";
import * as api from "../src/lib/api";
import { getCurrentWindow } from "@tauri-apps/api/window";

// Mock Tauri APIs
vi.mock("@tauri-apps/api/event", () => ({
	listen: vi.fn().mockResolvedValue(() => {}),
	emit: vi.fn(),
}));

vi.mock("@tauri-apps/api/window", () => ({
	getCurrentWindow: vi.fn().mockReturnValue({
		setTitle: vi.fn(),
		onFocusChanged: vi.fn().mockResolvedValue(() => {}),
	}),
	WebviewWindow: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
	ask: vi.fn(),
}));

vi.mock("../src/components/ConsolidatedTerminal", async () => {
	const ReactModule = await vi.importActual<typeof import("react")>("react");
	const MockConsolidatedTerminal = ReactModule.forwardRef((_, ref) => {
		ReactModule.useImperativeHandle(ref, () => ({
			findNext: () => false,
			findPrevious: () => false,
			clearSearch: () => {},
			focus: () => {},
		}));
		return <div data-testid="mock-terminal" />;
	});
	return {
		ConsolidatedTerminal: MockConsolidatedTerminal,
	};
});

// Mock the API module and set default return values
vi.mock("../src/lib/api", async () => {
	const actual = await vi.importActual("../src/lib/api");
	return {
		...actual,
		getSetting: vi.fn().mockResolvedValue("/Users/test/repo"),
		getRepoSetting: vi.fn().mockResolvedValue(null),
		setRepoSetting: vi.fn().mockResolvedValue(undefined),
		isGitRepository: vi.fn().mockResolvedValue(true),
		gitGetCurrentBranch: vi.fn().mockResolvedValue("main"),
		gitGetStatus: vi.fn().mockResolvedValue({
			modified: 0,
			added: 0,
			deleted: 0,
			untracked: 0,
			conflicted: 0,
		}),
		gitGetBranchInfo: vi.fn().mockResolvedValue({
			name: "main",
			ahead: 0,
			behind: 0,
			upstream: undefined,
		}),
		gitGetLineDiffStats: vi.fn().mockResolvedValue({
			lines_added: 0,
			lines_deleted: 0,
		}),
		gitGetChangedFiles: vi.fn().mockResolvedValue([]),
		gitGetBranchDivergence: vi.fn().mockResolvedValue({
			ahead: 0,
			behind: 0,
		}),
		getWorkspaces: vi.fn().mockResolvedValue([]),
		getSessions: vi.fn().mockResolvedValue([]),
		createSession: vi.fn().mockResolvedValue(1),
		updateSessionAccess: vi.fn().mockResolvedValue(undefined),
		getSessionModel: vi.fn().mockResolvedValue(null),
		setSessionModel: vi.fn().mockResolvedValue(undefined),
		ptyClose: vi.fn().mockResolvedValue(undefined),
		listDirectory: vi.fn().mockResolvedValue([]),
		readFile: vi.fn().mockRejectedValue(new Error("README.md not found")),
		preloadWorkspaceGitData: vi.fn().mockResolvedValue(undefined),
		invalidateGitCache: vi.fn().mockResolvedValue(undefined),

		jjGetChangedFiles: vi.fn().mockResolvedValue([]),
		jjGetConflictedFiles: vi.fn().mockResolvedValue([]),
		jjCreateWorkspace: vi
			.fn()
			.mockResolvedValue("/Users/test/repo/.treq/workspaces/test"),
		createWorkspace: vi.fn().mockResolvedValue(1),
		setSetting: vi.fn().mockResolvedValue(undefined),
		checkAndRebaseWorkspaces: vi.fn().mockResolvedValue(undefined),
	};
});

beforeEach(() => {
	vi.clearAllMocks();
});

describe("Settings", () => {
	beforeEach(() => {
		vi.mocked(api.getSetting).mockResolvedValue("/Users/test/repo");
		vi.mocked(api.setSetting).mockResolvedValue(undefined);
		vi.mocked(api.listDirectory).mockResolvedValue([
			{
				name: "README.md",
				path: "/Users/test/repo/README.md",
				is_directory: false,
			},
		]);
		vi.mocked(api.readFile).mockResolvedValue("# Test README");
	});

	it("should show settings page when the settings button is clicked", async () => {
		const user = userEvent.setup();
		render(<Dashboard />);

		// Wait for dashboard to load
		await screen.findByText("Code");

		// Click settings button
		const settingsButton = await screen.findByLabelText("Settings");
		await user.click(settingsButton);

		// Should show settings header
		await screen.findByText("Settings");
		await screen.findByRole("button", { name: /save settings/i });

		// Should show repo level settings by default (Repository tab should be active)
		const repositoryTab = await screen.findByRole("tab", {
			name: /repository/i,
		});
		expect(repositoryTab).toHaveAttribute("data-state", "active");

		// Should hide terminal pane from view (don't unmount the component, just hide it)
		const terminalPane = await screen.findByText(/Terminals/i);
		expect(terminalPane).not.toBeVisible();
	});

	it("should be able to switch between application-level and repository-level settings", async () => {
		const user = userEvent.setup();
		render(<Dashboard initialViewMode="settings" />);

		// Repository settings should be active by default
		const repositoryTab = await screen.findByRole("tab", {
			name: /repository/i,
		});

		await screen.findByLabelText(/branch name pattern/i);
		const modelInput = await screen.findByLabelText(/claude code model/i);

		// Should show application-level settings when the application-level settings tab is clicked
		const applicationTab = await screen.findByRole("tab", {
			name: /application/i,
		});
		await user.click(applicationTab);

		// Verify application settings content is visible
		await screen.findByLabelText(/theme/i);
		await screen.findByLabelText(/font size/i);
		expect(modelInput).not.toBeInTheDocument();

		// Should show repository-level settings when the repository-level settings tab is clicked
		await user.click(repositoryTab);

		// Repository settings should be visible again
		await screen.findByLabelText(/branch name pattern/i);
		await screen.findByLabelText(/claude code model/i);

		// Application settings should no longer be visible
		expect(screen.queryByLabelText(/theme/i)).not.toBeInTheDocument();
	});

	it("should be able to save settings", async () => {
		const user = userEvent.setup();
		render(<Dashboard initialViewMode="settings" />);

		// Switch to application settings
		const applicationTab = await screen.findByRole("tab", {
			name: /application/i,
		});
		await user.click(applicationTab);

		// Wait for application settings to be visible
		await screen.findByLabelText(/theme/i);
		const fontSizeInput = await screen.findByLabelText(/font size/i);

		// Change font size to 17pt
		await user.clear(fontSizeInput);
		await user.type(fontSizeInput, "17");

		// Should show save settings button
		const saveButton = await screen.findByRole("button", {
			name: /save settings/i,
		});

		// Should save settings when the save settings button is clicked
		await user.click(saveButton);

		// Should show settings saved confirmation message
		await screen.findByText("Settings Saved");
		await screen.findByText(/application settings updated successfully/i);

		// Verify setSetting was called
		expect(api.setSetting).toHaveBeenCalled();
	});
});

describe("Terminal Pane", () => {
	beforeEach(() => {
		vi.mocked(api.getSetting).mockResolvedValue("/Users/test/repo");
	});

	afterEach(() => {
		vi.mocked(api.getWorkspaces).mockResolvedValue([]);
		vi.mocked(api.getSessions).mockResolvedValue([]);
		vi.mocked(api.createSession).mockResolvedValue(1);
	});

	it("adds a new agent terminal to the right of the existing one", async () => {
		const workspace = {
			id: 1,
			repo_path: "/Users/test/repo",
			workspace_name: "Workspace One",
			workspace_path: "/Users/test/repo/.treq/workspaces/one",
			branch_name: "feature/one",
			created_at: "2024-01-01T00:00:00Z",
		};
		const mockSessions: api.Session[] = [
			{
				id: 1,
				workspace_id: workspace.id,
				name: "Claude Session 1",
				created_at: "2024-01-01T00:00:00Z",
				last_accessed: "2024-01-01T00:00:00Z",
				model: null,
			},
		];

		vi.mocked(api.getWorkspaces).mockImplementation(() =>
			Promise.resolve([workspace]),
		);
		vi.mocked(api.getSessions).mockImplementation(() =>
			Promise.resolve(mockSessions.map((session) => ({ ...session }))),
		);
		vi.mocked(api.createSession).mockImplementation(
			async (_repoPath, workspaceId, name) => {
				const newId = mockSessions.length + 1;
				mockSessions.push({
					id: newId,
					workspace_id: workspaceId,
					name: name ?? `Claude Session ${newId}`,
					created_at: "2024-01-02T00:00:00Z",
					last_accessed: "2024-01-02T00:00:00Z",
					model: null,
				});
				return newId;
			},
		);

		const user = userEvent.setup();
		render(<Dashboard />);

		const workspaceRow = await screen.findByText(workspace.branch_name);
		await user.click(workspaceRow);

		await screen.findByText("Claude Session 1");

		expect(
			document.querySelectorAll('[data-terminal-id^="claude-"]').length,
		).toBe(1);

		const newAgentButton = await screen.findByRole("button", {
			name: /new agent/i,
		});
		await user.click(newAgentButton);

		await waitFor(() => {
			expect(
				document.querySelectorAll('[data-terminal-id^="claude-"]').length,
			).toBe(2);
		});

		const claudePanels = Array.from(
			document.querySelectorAll('[data-terminal-id^="claude-"]'),
		);
		expect(claudePanels[0].textContent).toContain("Claude Session 1");
		expect(claudePanels[1].textContent).toContain("Claude Session 2");
	});

	it("removes the agent terminal when the close button is clicked", async () => {
		const workspace = {
			id: 1,
			repo_path: "/Users/test/repo",
			workspace_name: "Workspace One",
			workspace_path: "/Users/test/repo/.treq/workspaces/one",
			branch_name: "feature/one",
			created_at: "2024-01-01T00:00:00Z",
		};
		const mockSessions: api.Session[] = [
			{
				id: 1,
				workspace_id: workspace.id,
				name: "Claude Session 1",
				created_at: "2024-01-01T00:00:00Z",
				last_accessed: "2024-01-01T00:00:00Z",
				model: null,
			},
		];

		vi.mocked(api.getWorkspaces).mockResolvedValue([workspace]);
		vi.mocked(api.getSessions).mockResolvedValue(
			mockSessions.map((session) => ({ ...session })),
		);

		const user = userEvent.setup();
		render(<Dashboard />);

		const workspaceRow = await screen.findByText(workspace.branch_name);
		await user.click(workspaceRow);

		const terminalPanel = await waitFor(() =>
			document.querySelector('[data-terminal-id="claude-1"]'),
		);
		expect(terminalPanel).not.toBeNull();

		const closeButton = within(terminalPanel as Element).getByLabelText(
			/close session/i,
		);
		await user.click(closeButton);

		await waitFor(() => {
			expect(
				document.querySelector('[data-terminal-id="claude-1"]'),
			).not.toBeInTheDocument();
		});
	});

	it("creates a new agent terminal when Cmd+J is pressed while collapsed and empty", async () => {
		const workspace = {
			id: 1,
			repo_path: "/Users/test/repo",
			workspace_name: "Workspace One",
			workspace_path: "/Users/test/repo/.treq/workspaces/one",
			branch_name: "feature/one",
			created_at: "2024-01-01T00:00:00Z",
		};
		const mockSessions: api.Session[] = [];

		vi.mocked(api.getWorkspaces).mockResolvedValue([workspace]);
		vi.mocked(api.getSessions).mockImplementation(() =>
			Promise.resolve(mockSessions.map((session) => ({ ...session }))),
		);
		vi.mocked(api.createSession).mockImplementation(
			async (_repoPath, workspaceId, name) => {
				const newId = mockSessions.length + 1;
				mockSessions.push({
					id: newId,
					workspace_id: workspaceId,
					name: name ?? `Claude Session ${newId}`,
					created_at: "2024-01-02T00:00:00Z",
					last_accessed: "2024-01-02T00:00:00Z",
					model: null,
				});
				return newId;
			},
		);

		const user = userEvent.setup();
		render(<Dashboard />);

		const workspaceRow = await screen.findByText(workspace.branch_name);
		await user.click(workspaceRow);

		await screen.findByText(/Terminals/i);

		let expandButton = screen.queryByLabelText(/Expand terminal/i);
		if (!expandButton) {
			const collapseButton = await screen.findByLabelText(/Collapse terminal/i);
			await user.click(collapseButton);
			expandButton = await screen.findByLabelText(/Expand terminal/i);
		}

		expect(expandButton).toBeInTheDocument();
		expect(document.querySelector('[data-terminal-id^="claude-"]')).toBeNull();

		await user.keyboard("{Meta>}j{/Meta}");

		await waitFor(() => {
			expect(api.createSession).toHaveBeenCalledTimes(1);
		});

		await waitFor(() => {
			expect(
				document.querySelector('[data-terminal-id^="claude-"]'),
			).not.toBeNull();
		});
	});

	it("maximizes terminal pane when Cmd+Control+J is pressed while collapsed", async () => {
		const workspace = {
			id: 1,
			repo_path: "/Users/test/repo",
			workspace_name: "Workspace One",
			workspace_path: "/Users/test/repo/.treq/workspaces/one",
			branch_name: "feature/one",
			created_at: "2024-01-01T00:00:00Z",
		};
		const mockSessions: api.Session[] = [
			{
				id: 1,
				workspace_id: workspace.id,
				name: "Claude Session 1",
				created_at: "2024-01-01T00:00:00Z",
				last_accessed: "2024-01-01T00:00:00Z",
				model: null,
			},
		];

		vi.mocked(api.getWorkspaces).mockResolvedValue([workspace]);
		vi.mocked(api.getSessions).mockResolvedValue(mockSessions);

		const user = userEvent.setup();
		render(<Dashboard />);

		const workspaceRow = await screen.findByText(workspace.branch_name);
		await user.click(workspaceRow);

		await screen.findByText(/Terminals/i);

		// Ensure terminal pane is collapsed
		let expandButton = screen.queryByLabelText(/Expand terminal/i);
		if (!expandButton) {
			const collapseButton = await screen.findByLabelText(/Collapse terminal/i);
			await user.click(collapseButton);
			expandButton = await screen.findByLabelText(/Expand terminal/i);
		}

		expect(expandButton).toBeInTheDocument();

		// Press Cmd+Control+J to maximize
		// Note: userEvent doesn't support both metaKey and ctrlKey at the same time
		// So we dispatch the event manually
		act(() => {
			const keydownEvent = new KeyboardEvent("keydown", {
				key: "j",
				metaKey: true,
				ctrlKey: true,
				bubbles: true,
				cancelable: true,
			});
			window.dispatchEvent(keydownEvent);
		});

		// Terminal should now be maximized - Restore button should appear
		await waitFor(() => {
			expect(screen.getByLabelText(/Restore terminal/i)).toBeInTheDocument();
		});

		// Expand button should not be visible anymore
		expect(screen.queryByLabelText(/Expand terminal/i)).not.toBeInTheDocument();
	});

	it("maximizes terminal pane when Cmd+Control+J is pressed while expanded", async () => {
		const workspace = {
			id: 1,
			repo_path: "/Users/test/repo",
			workspace_name: "Workspace One",
			workspace_path: "/Users/test/repo/.treq/workspaces/one",
			branch_name: "feature/one",
			created_at: "2024-01-01T00:00:00Z",
		};
		const mockSessions: api.Session[] = [
			{
				id: 1,
				workspace_id: workspace.id,
				name: "Claude Session 1",
				created_at: "2024-01-01T00:00:00Z",
				last_accessed: "2024-01-01T00:00:00Z",
				model: null,
			},
		];

		vi.mocked(api.getWorkspaces).mockResolvedValue([workspace]);
		vi.mocked(api.getSessions).mockResolvedValue(mockSessions);

		const user = userEvent.setup();
		render(<Dashboard />);

		const workspaceRow = await screen.findByText(workspace.branch_name);
		await user.click(workspaceRow);

		await screen.findByText(/Terminals/i);

		// Ensure terminal pane is expanded (not collapsed, not maximized)
		const collapseButton = screen.queryByLabelText(/Collapse terminal/i);
		if (!collapseButton) {
			// Terminal is collapsed, expand it first
			const expandButton = await screen.findByLabelText(/Expand terminal/i);
			await user.click(expandButton);
			await screen.findByLabelText(/Collapse terminal/i);
		}

		// Verify we're in expanded state - Maximize button should be visible
		await waitFor(() => {
			expect(screen.getByLabelText(/Maximize terminal/i)).toBeInTheDocument();
		});

		// Press Cmd+Control+J to maximize
		act(() => {
			const keydownEvent = new KeyboardEvent("keydown", {
				key: "j",
				metaKey: true,
				ctrlKey: true,
				bubbles: true,
				cancelable: true,
			});
			window.dispatchEvent(keydownEvent);
		});

		// Terminal should now be maximized - Restore button should appear
		await waitFor(() => {
			expect(screen.getByLabelText(/Restore terminal/i)).toBeInTheDocument();
		});

		// Maximize button should no longer be visible
		expect(
			screen.queryByLabelText(/Maximize terminal/i),
		).not.toBeInTheDocument();
	});

	it("restores terminal pane when Cmd+Control+J is pressed while already maximized", async () => {
		const workspace = {
			id: 1,
			repo_path: "/Users/test/repo",
			workspace_name: "Workspace One",
			workspace_path: "/Users/test/repo/.treq/workspaces/one",
			branch_name: "feature/one",
			created_at: "2024-01-01T00:00:00Z",
		};
		const mockSessions: api.Session[] = [
			{
				id: 1,
				workspace_id: workspace.id,
				name: "Claude Session 1",
				created_at: "2024-01-01T00:00:00Z",
				last_accessed: "2024-01-01T00:00:00Z",
				model: null,
			},
		];

		vi.mocked(api.getWorkspaces).mockResolvedValue([workspace]);
		vi.mocked(api.getSessions).mockResolvedValue(mockSessions);

		const user = userEvent.setup();
		render(<Dashboard />);

		const workspaceRow = await screen.findByText(workspace.branch_name);
		await user.click(workspaceRow);

		await screen.findByText(/Terminals/i);

		// Ensure terminal pane is expanded first
		const collapseButton = screen.queryByLabelText(/Collapse terminal/i);
		if (!collapseButton) {
			const expandButton = await screen.findByLabelText(/Expand terminal/i);
			await user.click(expandButton);
			await screen.findByLabelText(/Collapse terminal/i);
		}

		// Click maximize button to maximize the terminal
		const maximizeButton = await screen.findByLabelText(/Maximize terminal/i);
		await user.click(maximizeButton);

		// Verify terminal is now maximized
		await waitFor(() => {
			expect(screen.getByLabelText(/Restore terminal/i)).toBeInTheDocument();
		});

		// Press Cmd+Control+J while already maximized - should restore
		act(() => {
			const keydownEvent = new KeyboardEvent("keydown", {
				key: "j",
				metaKey: true,
				ctrlKey: true,
				bubbles: true,
				cancelable: true,
			});
			window.dispatchEvent(keydownEvent);
		});

		// Terminal should now be restored (expanded, not maximized) - Maximize button should appear
		await waitFor(() => {
			expect(screen.getByLabelText(/Maximize terminal/i)).toBeInTheDocument();
		});

		// Should be expanded (not collapsed or maximized)
		expect(screen.queryByLabelText(/Expand terminal/i)).not.toBeInTheDocument();
		expect(
			screen.queryByLabelText(/Restore terminal/i),
		).not.toBeInTheDocument();
	});

	it("creates a new agent terminal when Cmd+] is pressed", async () => {
		const workspace = {
			id: 1,
			repo_path: "/Users/test/repo",
			workspace_name: "Workspace One",
			workspace_path: "/Users/test/repo/.treq/workspaces/one",
			branch_name: "feature/one",
			created_at: "2024-01-01T00:00:00Z",
		};
		const mockSessions: api.Session[] = [];

		vi.mocked(api.getWorkspaces).mockResolvedValue([workspace]);
		vi.mocked(api.getSessions).mockImplementation(() =>
			Promise.resolve(mockSessions.map((session) => ({ ...session }))),
		);
		vi.mocked(api.createSession).mockImplementation(
			async (_repoPath, workspaceId, name) => {
				const newId = mockSessions.length + 1;
				mockSessions.push({
					id: newId,
					workspace_id: workspaceId,
					name: name ?? `Claude Session ${newId}`,
					created_at: "2024-01-02T00:00:00Z",
					last_accessed: "2024-01-02T00:00:00Z",
					model: null,
				});
				return newId;
			},
		);

		const user = userEvent.setup();
		render(<Dashboard />);

		const workspaceRow = await screen.findByText(workspace.branch_name);
		await user.click(workspaceRow);

		await screen.findByText(/Terminals/i);

		// Count initial agent terminals
		const initialTerminals = document.querySelectorAll(
			'[data-terminal-id^="claude-"]',
		).length;
		const initialCreateCalls = vi.mocked(api.createSession).mock.calls.length;

		// Press Cmd+] to create new agent terminal
		await user.keyboard("{Meta>}]{/Meta}");

		// New agent terminal should be created
		await waitFor(() => {
			expect(api.createSession).toHaveBeenCalledTimes(initialCreateCalls + 1);
			const currentTerminals = document.querySelectorAll(
				'[data-terminal-id^="claude-"]',
			).length;
			expect(currentTerminals).toBe(initialTerminals + 1);
		});
	});

	it("creates a new shell terminal when Cmd+\\ is pressed", async () => {
		const workspace = {
			id: 1,
			repo_path: "/Users/test/repo",
			workspace_name: "Workspace One",
			workspace_path: "/Users/test/repo/.treq/workspaces/one",
			branch_name: "feature/one",
			created_at: "2024-01-01T00:00:00Z",
		};
		const mockSessions: api.Session[] = [];

		vi.mocked(api.getWorkspaces).mockResolvedValue([workspace]);
		vi.mocked(api.getSessions).mockResolvedValue(mockSessions);

		const user = userEvent.setup();
		render(<Dashboard />);

		const workspaceRow = await screen.findByText(workspace.branch_name);
		await user.click(workspaceRow);

		await screen.findByText(/Terminals/i);

		// Initial state: no shell terminals
		expect(document.querySelector('[data-terminal-id^="shell-"]')).toBeNull();

		// Press Cmd+\ to create new shell terminal
		await user.keyboard("{Meta>}\\{/Meta}");

		// New shell terminal should be created
		await waitFor(() => {
			expect(
				document.querySelector('[data-terminal-id^="shell-"]'),
			).not.toBeNull();
		});
	});
});

describe("WorkspacesSidebar", () => {
	beforeEach(() => {
		vi.mocked(api.getSetting).mockResolvedValue("/Users/test/repo");
		vi.mocked(api.getWorkspaces).mockResolvedValue([]);
		vi.mocked(api.getRepoSetting).mockResolvedValue("treq/{name}"); // branch pattern
		vi.mocked(api.listDirectory).mockResolvedValue([
			{
				name: "README.md",
				path: "/Users/test/repo/README.md",
				is_directory: false,
			},
		]);
		vi.mocked(api.readFile).mockResolvedValue("# Test README");
	});

	it("able to create a new workspace", async () => {
		const user = userEvent.setup();

		// Mock workspace creation API - createWorkspace is a single call that handles jj + db
		vi.mocked(api.createWorkspace).mockResolvedValue(1);

		// Render dashboard
		render(<Dashboard />);

		// Wait for dashboard to load
		await screen.findByText("Code");

		// Click create workspace button
		const createButton = await screen.findByLabelText(/create new workspace/i);
		await user.click(createButton);

		// Dialog should open - wait for the intent input field which is unique to the dialog
		const intentInput = await screen.findByLabelText(
			/intent.*description/i,
			{},
			{ timeout: 3000 },
		);
		expect(intentInput).toBeInTheDocument();

		// Fill intent field
		await user.type(intentInput, "Add dark mode");

		// Branch name should auto-generate
		const branchInput = await screen.findByLabelText(/branch name/i);
		await waitFor(() => {
			expect(branchInput).toHaveValue("treq/add-dark-mode");
		});

		// Submit form
		const submitButton = await screen.findByRole("button", {
			name: /create workspace/i,
		});
		await user.click(submitButton);

		// Verify workspace creation API was called with correct params
		await waitFor(() => {
			expect(api.createWorkspace).toHaveBeenCalledWith(
				"/Users/test/repo",
				"treq/add-dark-mode",
				true,
				undefined,
				expect.stringContaining("Add dark mode"),
			);
		});

		// Dialog should close after successful creation
		await waitFor(() => {
			expect(
				screen.queryByLabelText(/intent.*description/i),
			).not.toBeInTheDocument();
		});
	});

	describe("multi-select workspaces", () => {
		beforeEach(() => {
			// Setup 4 workspaces for testing
			vi.mocked(api.getWorkspaces).mockResolvedValue([
				{
					id: 1,
					repo_path: "/Users/test/repo",
					workspace_name: "ws1",
					workspace_path: "/path/ws1",
					branch_name: "feature-1",
					created_at: new Date().toISOString(),
				},
				{
					id: 2,
					repo_path: "/Users/test/repo",
					workspace_name: "ws2",
					workspace_path: "/path/ws2",
					branch_name: "feature-2",
					created_at: new Date().toISOString(),
				},
				{
					id: 3,
					repo_path: "/Users/test/repo",
					workspace_name: "ws3",
					workspace_path: "/path/ws3",
					branch_name: "feature-3",
					created_at: new Date().toISOString(),
				},
				{
					id: 4,
					repo_path: "/Users/test/repo",
					workspace_name: "ws4",
					workspace_path: "/path/ws4",
					branch_name: "feature-4",
					created_at: new Date().toISOString(),
				},
			]);
		});

		it("should delete multiple workspaces when delete button clicked", async () => {
			const user = userEvent.setup();

			// Mock the ask dialog to return true
			const { ask } = await import("@tauri-apps/plugin-dialog");
			vi.mocked(ask).mockResolvedValue(true);

			render(<Dashboard />);

			// Wait for workspaces to load
			await screen.findByText("feature-1");
			await screen.findByText("feature-2");

			// Select 2 workspaces
			const workspace1 = screen.getByText("feature-1").closest("div");
			const workspace2 = screen.getByText("feature-2").closest("div");

			await user.keyboard("{Meta>}");
			await user.click(workspace1!);
			await user.click(workspace2!);
			await user.keyboard("{/Meta}");

			// Click delete button
			const deleteButton = screen.getByText(/delete 2 workspaces/i);
			await user.click(deleteButton);

			// Confirm dialog should be shown
			await waitFor(() => {
				expect(ask).toHaveBeenCalledWith(
					"Delete 2 workspaces?",
					expect.objectContaining({
						title: "Delete Workspaces",
						kind: "warning",
					}),
				);
			});
		});

		it("should clear selection when clicking away from workspaces", async () => {
			const user = userEvent.setup();
			render(<Dashboard />);

			// Wait for workspaces to load
			await screen.findByText("feature-1");
			await screen.findByText("feature-2");

			const workspace1 = screen.getByText("feature-1").closest("div");
			const workspace2 = screen.getByText("feature-2").closest("div");

			// Select 2 workspaces with cmd+click
			await user.keyboard("{Meta>}");
			await user.click(workspace1!);
			await user.click(workspace2!);
			await user.keyboard("{/Meta}");

			// Verify both are selected by checking delete button appears
			expect(screen.getByText(/delete 2 workspaces/i)).toBeInTheDocument();

			// Click on the sidebar background (not on a workspace item)
			const sidebar = workspace1!.parentElement!.parentElement;
			await user.click(sidebar!);

			// Selection should be cleared - create buttons should reappear
			expect(
				screen.queryByText(/delete.*workspaces?/i),
			).not.toBeInTheDocument();
			expect(
				screen.getByLabelText(/create new workspace/i),
			).toBeInTheDocument();
		});
	});

	describe("context menu and tooltip", () => {
		it("should copy workspace relative path from context menu", async () => {
			// Setup a workspace
			vi.mocked(api.getWorkspaces).mockResolvedValue([
				{
					id: 1,
					repo_path: "/Users/test/repo",
					workspace_name: "ws1",
					workspace_path: "/Users/test/repo/.jj/repo/store/working_copies/ws1",
					branch_name: "feature/test",
					created_at: new Date().toISOString(),
					has_conflicts: false,
				},
			]);

			render(<Dashboard />);

			// Wait for workspace to appear
			const workspaceElement = await screen.findByText("feature/test");

			// Right-click workspace
			fireEvent.contextMenu(workspaceElement);

			// Context menu should appear
			await waitFor(() => {
				expect(screen.getByText("Copy relative path")).toBeInTheDocument();
			});

			// Click "Copy relative path"
			const copyRelativePathButton = screen.getByText("Copy relative path");
			fireEvent.click(copyRelativePathButton);

			// Verify clipboard was called with relative path
			await waitFor(() => {
				expect(navigator.clipboard.writeText).toHaveBeenLastCalledWith(
					".jj/repo/store/working_copies/ws1",
				);
			});
		});
	});
});
