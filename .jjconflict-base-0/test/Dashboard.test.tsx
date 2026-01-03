import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within, act, fireEvent } from "./test-utils";
import userEvent from "@testing-library/user-event";
import { Dashboard } from "../src/components/Dashboard";
import * as api from "../src/lib/api";

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
    rebuildWorkspaces: vi.fn().mockResolvedValue([]),
    createSession: vi.fn().mockResolvedValue(1),
    updateSessionAccess: vi.fn().mockResolvedValue(undefined),
    getSessionModel: vi.fn().mockResolvedValue(null),
    setSessionModel: vi.fn().mockResolvedValue(undefined),
    ptyClose: vi.fn().mockResolvedValue(undefined),
    listDirectory: vi.fn().mockResolvedValue([]),
    readFile: vi.fn().mockRejectedValue(new Error("README.md not found")),
    preloadWorkspaceGitData: vi.fn().mockResolvedValue(undefined),
    invalidateGitCache: vi.fn().mockResolvedValue(undefined),
    jjGetDefaultBranch: vi.fn().mockResolvedValue("main"),
    jjGetChangedFiles: vi.fn().mockResolvedValue([]),
    jjGetConflictedFiles: vi.fn().mockResolvedValue([]),
    jjCreateWorkspace: vi.fn().mockResolvedValue("/Users/test/repo/.treq/workspaces/test"),
    createWorkspace: vi.fn().mockResolvedValue(1),
    addWorkspaceToDb: vi.fn().mockResolvedValue(1),
    setSetting: vi.fn().mockResolvedValue(undefined),
    jjRemoveWorkspace: vi.fn().mockResolvedValue(undefined),
    deleteWorkspaceFromDb: vi.fn().mockResolvedValue(undefined),
  };
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Dashboard", () => {
  describe("Initial State (No Repository)", () => {
    beforeEach(() => {
      vi.mocked(api.getSetting).mockResolvedValue(null);
    });
    it("renders dashboard when no repository is configured", async () => {
      render(<Dashboard />);

      // Should render the sidebar with "Repository" text in search button
      await waitFor(() => {
        expect(screen.getByText("Repository")).toBeInTheDocument();
      });

      // Settings button should be visible
      expect(screen.getByLabelText("Settings")).toBeInTheDocument();
    });
  });

  describe("ShowWorkspace Display", () => {
    beforeEach(() => {
      vi.mocked(api.getSetting).mockResolvedValue("/Users/test/repo");
      vi.mocked(api.listDirectory).mockResolvedValue([
        { name: "src", path: "/Users/test/repo/src", is_directory: true },
        {
          name: "package.json",
          path: "/Users/test/repo/package.json",
          is_directory: false,
        },
        {
          name: "README.md",
          path: "/Users/test/repo/README.md",
          is_directory: false,
        },
        {
          name: "nested-file.json",
          path: "/Users/test/repo/my-directory/nested-file.json",
          is_directory: false,
        },
        {
          name: "my-directory",
          path: "/Users/test/repo/my-directory",
          is_directory: true,
        },
      ]);
      vi.mocked(api.readFile).mockResolvedValue(
        "# Test Repository\n\nThis is a test README."
      );
    });

    it("shows the mainrepo ShowWorkspace by default on app window load ", async () => {
      const { listen } = await import("@tauri-apps/api/event");

      render(<Dashboard />);

      
      await screen.findByText("Code")
      await screen.findByText(/Terminals/i)
      expect(listen).not.toHaveBeenCalledWith(
        "navigate-to-dashboard",
        expect.any(Function)
      );
      expect(api.createSession).not.toHaveBeenCalled();
      const readmeFiles = await screen.findAllByText(/README.md/i);
      expect(readmeFiles).toHaveLength(2);
      // readme
      expect(screen.queryByText(/This is a test README/i)).toBeInTheDocument();
      expect(screen.queryAllByText(/README.md/i)).toHaveLength(2);
      // root directory
      expect(screen.queryByText(/package.json/i)).toBeInTheDocument();
      expect(screen.queryByText(/my-directory/i)).toBeInTheDocument();
      expect(screen.queryByText(/nested-file.json/i)).not.toBeInTheDocument();
    });
  });
});


describe("Settings", () => {
  beforeEach(() => {
    vi.mocked(api.getSetting).mockResolvedValue("/Users/test/repo");
    vi.mocked(api.setSetting).mockResolvedValue(undefined);
    vi.mocked(api.listDirectory).mockResolvedValue([
      { name: "README.md", path: "/Users/test/repo/README.md", is_directory: false },
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
    const repositoryTab = await screen.findByRole("tab", { name: /repository/i });
    expect(repositoryTab).toHaveAttribute("data-state", "active");

    // Should hide terminal pane from view (don't unmount the component, just hide it)
    const terminalPane = await screen.findByText(/Terminals/i);
    expect(terminalPane).not.toBeVisible();
  });

  it("should be able to switch between application-level and repository-level settings", async () => {
    const user = userEvent.setup();
    render(<Dashboard initialViewMode="settings" />);

    // Repository settings should be active by default
    const repositoryTab = await screen.findByRole("tab", { name: /repository/i });
    
    await screen.findByLabelText(/branch name pattern/i);
    const modelInput = await screen.findByLabelText(/claude code model/i);


    // Should show application-level settings when the application-level settings tab is clicked
    const applicationTab = await screen.findByRole("tab", { name: /application/i });
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
    const applicationTab = await screen.findByRole("tab", { name: /application/i });
    await user.click(applicationTab);

    // Wait for application settings to be visible
    await screen.findByLabelText(/theme/i);
    const fontSizeInput = await screen.findByLabelText(/font size/i);

    // Change font size to 17pt
    await user.clear(fontSizeInput);
    await user.type(fontSizeInput, "17");

    // Should show save settings button
    const saveButton = await screen.findByRole("button", { name: /save settings/i });

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
      Promise.resolve([workspace])
    );
    vi.mocked(api.getSessions).mockImplementation(() =>
      Promise.resolve(mockSessions.map((session) => ({ ...session })))
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
      }
    );

    const user = userEvent.setup();
    render(<Dashboard />);

    const workspaceRow = await screen.findByText(workspace.branch_name);
    await user.click(workspaceRow);

    await screen.findByText("Claude Session 1");

    expect(
      document.querySelectorAll('[data-terminal-id^="claude-"]').length
    ).toBe(1);

    const newAgentButton = await screen.findByRole("button", {
      name: /new agent/i,
    });
    await user.click(newAgentButton);

    await waitFor(() => {
      expect(
        document.querySelectorAll('[data-terminal-id^="claude-"]').length
      ).toBe(2);
    });

    const claudePanels = Array.from(
      document.querySelectorAll('[data-terminal-id^="claude-"]')
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
      mockSessions.map((session) => ({ ...session }))
    );

    const user = userEvent.setup();
    render(<Dashboard />);

    const workspaceRow = await screen.findByText(workspace.branch_name);
    await user.click(workspaceRow);

    const terminalPanel = await waitFor(() =>
      document.querySelector('[data-terminal-id="claude-1"]')
    );
    expect(terminalPanel).not.toBeNull();

    const closeButton = within(terminalPanel as Element).getByLabelText(
      /close session/i
    );
    await user.click(closeButton);

    await waitFor(() => {
      expect(
        document.querySelector('[data-terminal-id="claude-1"]')
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
      Promise.resolve(mockSessions.map((session) => ({ ...session })))
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
      }
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
    expect(
      document.querySelector('[data-terminal-id^="claude-"]')
    ).toBeNull();

    await user.keyboard("{Meta>}j{/Meta}");

    await waitFor(() => {
      expect(api.createSession).toHaveBeenCalledTimes(1);
    });

    await waitFor(() => {
      expect(
        document.querySelector('[data-terminal-id^="claude-"]')
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
    expect(screen.queryByLabelText(/Maximize terminal/i)).not.toBeInTheDocument();
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
    expect(screen.queryByLabelText(/Restore terminal/i)).not.toBeInTheDocument();
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
      Promise.resolve(mockSessions.map((session) => ({ ...session })))
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
      }
    );

    const user = userEvent.setup();
    render(<Dashboard />);

    const workspaceRow = await screen.findByText(workspace.branch_name);
    await user.click(workspaceRow);

    await screen.findByText(/Terminals/i);

    // Count initial agent terminals
    const initialTerminals = document.querySelectorAll('[data-terminal-id^="claude-"]').length;
    const initialCreateCalls = vi.mocked(api.createSession).mock.calls.length;

    // Press Cmd+] to create new agent terminal
    await user.keyboard("{Meta>}]{/Meta}");

    // New agent terminal should be created
    await waitFor(() => {
      expect(api.createSession).toHaveBeenCalledTimes(initialCreateCalls + 1);
      const currentTerminals = document.querySelectorAll('[data-terminal-id^="claude-"]').length;
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
    expect(
      document.querySelector('[data-terminal-id^="shell-"]')
    ).toBeNull();

    // Press Cmd+\ to create new shell terminal
    await user.keyboard("{Meta>}\\{/Meta}");

    // New shell terminal should be created
    await waitFor(() => {
      expect(
        document.querySelector('[data-terminal-id^="shell-"]')
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
      { name: "README.md", path: "/Users/test/repo/README.md", is_directory: false },
    ]);
    vi.mocked(api.readFile).mockResolvedValue("# Test README");
  });

  it("should always display workspaces by branch_name, not by intent or metadata", async () => {
    // Setup workspaces with metadata containing intent (which should be ignored for display)
    vi.mocked(api.getWorkspaces).mockResolvedValue([
      {
        id: 1,
        repo_path: "/Users/test/repo",
        workspace_name: "ws1",
        workspace_path: "/path/ws1",
        branch_name: "feature/add-login",
        created_at: new Date().toISOString(),
        metadata: JSON.stringify({ intent: "Add user login functionality" }),
      },
      {
        id: 2,
        repo_path: "/Users/test/repo",
        workspace_name: "ws2",
        workspace_path: "/path/ws2",
        branch_name: "bugfix/fix-crash",
        created_at: new Date().toISOString(),
        // No metadata - should still show branch_name
      },
    ]);

    render(<Dashboard />);

    // Should display branch_name, NOT the intent from metadata
    await screen.findByText("feature/add-login");
    await screen.findByText("bugfix/fix-crash");

    // Intent should NOT be displayed as workspace title
    expect(screen.queryByText("Add user login functionality")).not.toBeInTheDocument();
    expect(screen.queryByText("Fix app crash on startup")).not.toBeInTheDocument();
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
    const intentInput = await screen.findByLabelText(/intent.*description/i, {}, { timeout: 3000 });
    expect(intentInput).toBeInTheDocument();

    // Fill intent field
    await user.type(intentInput, "Add dark mode");

    // Branch name should auto-generate
    const branchInput = await screen.findByLabelText(/branch name/i);
    await waitFor(() => {
      expect(branchInput).toHaveValue("treq/add-dark-mode");
    });

    // Submit form
    const submitButton = await screen.findByRole("button", { name: /create workspace/i });
    await user.click(submitButton);

    // Verify workspace creation API was called with correct params
    await waitFor(() => {
      expect(api.createWorkspace).toHaveBeenCalledWith(
        "/Users/test/repo",
        "treq/add-dark-mode",
        true,
        undefined,
        expect.stringContaining("Add dark mode")
      );
    });

    // Dialog should close after successful creation
    await waitFor(() => {
      expect(screen.queryByLabelText(/intent.*description/i)).not.toBeInTheDocument();
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

    it("should select single workspace with cmd+click", async () => {
      const user = userEvent.setup();
      render(<Dashboard />);

      // Wait for workspaces to load
      await screen.findByText("feature-1");
      await screen.findByText("feature-2");
      await screen.findByText("feature-4");

      const workspace2 = screen.getByText("feature-2").closest("div");
      const workspace4 = screen.getByText("feature-4").closest("div");

      // Cmd+click on workspace 2 - should toggle selection
      await user.keyboard("{Meta>}");
      await user.click(workspace2!);
      await user.keyboard("{/Meta}");

      // Workspace 2 should have selected styling
      expect(workspace2).toHaveClass("bg-primary/20");

      // Cmd+click on workspace 4 - should add to selection
      await user.keyboard("{Meta>}");
      await user.click(workspace4!);
      await user.keyboard("{/Meta}");

      // Both should be selected
      expect(workspace2).toHaveClass("bg-primary/20");
      expect(workspace4).toHaveClass("bg-primary/20");
    });

    it("should select range of workspaces with shift+click", async () => {
      const user = userEvent.setup();
      render(<Dashboard />);

      // Wait for workspaces to load
      await screen.findByText("feature-1");

      const workspace1 = screen.getByText("feature-1").closest("div");
      const workspace3 = screen.getByText("feature-3").closest("div");

      // Cmd+click workspace 1 to anchor selection
      await user.keyboard("{Meta>}");
      await user.click(workspace1!);
      await user.keyboard("{/Meta}");

      // Shift+click workspace 3 to select range
      await user.keyboard("{Shift>}");
      await user.click(workspace3!);
      await user.keyboard("{/Shift}");

      // All three workspaces (1, 2, 3) should be selected
      expect(workspace1).toHaveClass("bg-primary/20");
      expect(screen.getByText("feature-2").closest("div")).toHaveClass("bg-primary/20");
      expect(workspace3).toHaveClass("bg-primary/20");
    });

    it("should show delete button when workspaces are selected", async () => {
      const user = userEvent.setup();
      render(<Dashboard />);

      // Wait for workspaces to load
      await screen.findByText("feature-1");

      // Initially should show create workspace buttons
      expect(screen.getByLabelText(/create new workspace/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/create from remote branch/i)).toBeInTheDocument();

      // Cmd+click to select 2 workspaces
      const workspace1 = screen.getByText("feature-1").closest("div");
      const workspace2 = screen.getByText("feature-2").closest("div");

      await user.keyboard("{Meta>}");
      await user.click(workspace1!);
      await user.click(workspace2!);
      await user.keyboard("{/Meta}");

      // Create workspace buttons should be replaced with Delete button
      expect(screen.queryByLabelText(/create new workspace/i)).not.toBeInTheDocument();
      expect(screen.queryByLabelText(/create from remote branch/i)).not.toBeInTheDocument();

      // Delete button should show count
      expect(screen.getByText(/delete 2 workspaces/i)).toBeInTheDocument();
    });

    it("should clear selection when clicking without modifier", async () => {
      const user = userEvent.setup();
      render(<Dashboard />);

      // Wait for workspaces to load
      await screen.findByText("feature-2");
      await screen.findByText("feature-3");

      const workspace2 = screen.getByText("feature-2").closest("div");
      const workspace3 = screen.getByText("feature-3").closest("div");

      // Cmd+click to select workspace 2
      await user.keyboard("{Meta>}");
      await user.click(workspace2!);
      await user.keyboard("{/Meta}");

      // Verify workspace 2 is selected
      expect(workspace2).toHaveClass("bg-primary/20");

      // Regular click on workspace 3 (without modifier)
      await user.click(workspace3!);

      // Workspace 2 should no longer be selected in multi-select mode
      // Workspace 3 should become the active workspace (opened)
      // We can verify this by checking that the delete button is gone
      expect(screen.queryByText(/delete.*workspaces?/i)).not.toBeInTheDocument();
      expect(screen.getByLabelText(/create new workspace/i)).toBeInTheDocument();
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
          })
        );
      });

      // Both workspaces should be deleted
      await waitFor(() => {
        expect(api.jjRemoveWorkspace).toHaveBeenCalledWith(
          "/Users/test/repo",
          "/path/ws1"
        );
        expect(api.jjRemoveWorkspace).toHaveBeenCalledWith(
          "/Users/test/repo",
          "/path/ws2"
        );
      });

      expect(api.deleteWorkspaceFromDb).toHaveBeenCalledWith("/Users/test/repo", 1);
      expect(api.deleteWorkspaceFromDb).toHaveBeenCalledWith("/Users/test/repo", 2);
    });

    it("should show only one toast when deleting multiple workspaces", async () => {
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

      // Wait for deletions to complete
      await waitFor(() => {
        expect(api.deleteWorkspaceFromDb).toHaveBeenCalledTimes(2);
      });

      // Should show only ONE toast, not multiple
      const toasts = screen.getAllByText(/workspace.*deleted/i);
      expect(toasts).toHaveLength(1);
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
      expect(screen.queryByText(/delete.*workspaces?/i)).not.toBeInTheDocument();
      expect(screen.getByLabelText(/create new workspace/i)).toBeInTheDocument();
    });

    it("should not allow selecting the main repository with cmd+click", async () => {
      const user = userEvent.setup();
      render(<Dashboard />);

      // Wait for workspaces to load
      const workspace1Element = await screen.findByText("feature-1");

      // The main repo row is before the workspace rows in the sidebar
      // Find it by looking at the parent container
      const workspaceList = workspace1Element.closest("div.space-y-1");
      const mainRepoRow = workspaceList!.querySelector('div:has(svg.lucide-home)');

      // Try to cmd+click the main repository
      await user.keyboard("{Meta>}");
      await user.click(mainRepoRow!);
      await user.keyboard("{/Meta}");

      // Delete button should not appear (main repo should not be selectable)
      expect(screen.queryByText(/delete.*workspaces?/i)).not.toBeInTheDocument();

      // Create buttons should still be visible
      expect(screen.getByLabelText(/create new workspace/i)).toBeInTheDocument();
    });

    it("should not allow selecting main repo in range with shift+click", async () => {
      const user = userEvent.setup();
      render(<Dashboard />);

      // Wait for workspaces to load
      const workspace1Element = await screen.findByText("feature-1");

      // The main repo row is before the workspace rows in the sidebar
      const workspaceList = workspace1Element.closest("div.space-y-1");
      const mainRepoRow = workspaceList!.querySelector('div:has(svg.lucide-home)');

      // Try to select from main repo with cmd+click (anchor)
      await user.keyboard("{Meta>}");
      await user.click(mainRepoRow!);
      await user.keyboard("{/Meta}");

      // Shift+click on a workspace shouldn't work since main repo is not a valid anchor
      const workspace2 = screen.getByText("feature-2").closest("div");
      await user.keyboard("{Shift>}");
      await user.click(workspace2!);
      await user.keyboard("{/Shift}");

      // Delete button should not appear
      expect(screen.queryByText(/delete.*workspaces?/i)).not.toBeInTheDocument();
    });
  });


  describe("context menu and tooltip", () => {
    it("should show tooltip when hovering over home repo", async () => {
      const user = userEvent.setup();

      render(<Dashboard />);

      // Wait for dashboard to load
      await screen.findByText("Code");

      // Find home repo element in sidebar (by finding the element with both Home icon and "main" text)
      // The sidebar has class w-[240px]
      const sidebar = document.querySelector('.w-\\[240px\\]');
      const homeRepoElements = within(sidebar as HTMLElement).getAllByText("main");
      // The home repo element should be the one in the sidebar
      const homeRepoElement = homeRepoElements[0].closest("div");
      expect(homeRepoElement).toBeInTheDocument();

      // Hover over home repo
      await user.hover(homeRepoElement!);

      // Tooltip should appear with repo path
      await waitFor(() => {
        const tooltips = screen.queryAllByText("/Users/test/repo");
        expect(tooltips.length).toBeGreaterThan(0);
      });
    });

    it("should copy relative path when right-clicking home repo and selecting Copy relative path", async () => {
      render(<Dashboard />);

      // Wait for dashboard to load
      await screen.findByText("Code");

      // Wait a bit for the UI to stabilize
      await waitFor(() => {
        expect(screen.getByText("main")).toBeInTheDocument();
      });

      // Find home repo element - has Home icon (lucide-home class)
      const sidebar = document.querySelector('.w-\\[240px\\]');
      const homeIcon = sidebar?.querySelector('.lucide-home');
      const homeRepoElement = homeIcon?.closest('[class*="cursor-pointer"]') as HTMLElement;
      expect(homeRepoElement).toBeInTheDocument();

      // Right-click home repo
      fireEvent.contextMenu(homeRepoElement!);

      // Context menu should appear
      await waitFor(() => {
        expect(screen.getByText("Copy relative path")).toBeInTheDocument();
      });

      // Click "Copy relative path"
      const copyRelativePathButton = screen.getByText("Copy relative path");
      fireEvent.click(copyRelativePathButton);

      // Verify clipboard was called with "."
      await waitFor(() => {
        expect(navigator.clipboard.writeText).toHaveBeenLastCalledWith(".");
      });
    });

    it("should copy full path when right-clicking home repo and selecting Copy full path", async () => {
      render(<Dashboard />);

      // Wait for dashboard to load
      await screen.findByText("Code");

      // Find home repo element
      const homeRepoElement = document.querySelector('.bg-primary\\/20') as HTMLElement;
      expect(homeRepoElement).toBeInTheDocument();

      // Right-click home repo
      fireEvent.contextMenu(homeRepoElement!);

      // Context menu should appear
      await waitFor(() => {
        expect(screen.getByText("Copy full path")).toBeInTheDocument();
      });

      // Click "Copy full path"
      const copyFullPathButton = screen.getByText("Copy full path");
      fireEvent.click(copyFullPathButton);

      // Verify clipboard was called with the repo path
      await waitFor(() => {
        expect(navigator.clipboard.writeText).toHaveBeenLastCalledWith("/Users/test/repo");
      });
    });

    it("should open home repo in Finder when selecting Open in Finder", async () => {
      const user = userEvent.setup();

      render(<Dashboard />);

      // Wait for dashboard to load
      await screen.findByText("Code");

      // Find home repo element
      const homeRepoElement = document.querySelector('.bg-primary\\/20') as HTMLElement;
      expect(homeRepoElement).toBeInTheDocument();

      // Right-click home repo
      fireEvent.contextMenu(homeRepoElement!);

      // Context menu should appear with "Open in..."
      await waitFor(() => {
        expect(screen.getByText("Open in...")).toBeInTheDocument();
      });

      // Hover over "Open in..." to show submenu
      const openInButton = screen.getByText("Open in...");
      await user.hover(openInButton);

      // Submenu should appear with "Open in Finder"
      await waitFor(() => {
        expect(screen.getByText("Open in Finder")).toBeInTheDocument();
      });

      // Click "Open in Finder"
      const openInFinderButton = screen.getByText("Open in Finder");
      fireEvent.click(openInFinderButton);

      // Verify openPath was called with repo path
      const { openPath } = await import("@tauri-apps/plugin-opener");
      await waitFor(() => {
        expect(openPath).toHaveBeenLastCalledWith("/Users/test/repo");
      });
    });

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
        expect(navigator.clipboard.writeText).toHaveBeenLastCalledWith(".jj/repo/store/working_copies/ws1");
      });
    });

    it("should copy workspace full path from context menu", async () => {
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
        expect(screen.getByText("Copy full path")).toBeInTheDocument();
      });

      // Click "Copy full path"
      const copyFullPathButton = screen.getByText("Copy full path");
      fireEvent.click(copyFullPathButton);

      // Verify clipboard was called with full path
      await waitFor(() => {
        expect(navigator.clipboard.writeText).toHaveBeenLastCalledWith("/Users/test/repo/.jj/repo/store/working_copies/ws1");
      });
    });

    it("should open workspace in Finder from context menu", async () => {
      const user = userEvent.setup();

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

      // Context menu should appear with "Open in..."
      await waitFor(() => {
        expect(screen.getByText("Open in...")).toBeInTheDocument();
      });

      // Hover over "Open in..." to show submenu
      const openInButton = screen.getByText("Open in...");
      await user.hover(openInButton);

      // Submenu should appear with "Open in Finder"
      await waitFor(() => {
        expect(screen.getByText("Open in Finder")).toBeInTheDocument();
      });

      // Click "Open in Finder"
      const openInFinderButton = screen.getByText("Open in Finder");
      fireEvent.click(openInFinderButton);

      // Verify openPath was called with workspace path
      const { openPath } = await import("@tauri-apps/plugin-opener");
      await waitFor(() => {
        expect(openPath).toHaveBeenLastCalledWith("/Users/test/repo/.jj/repo/store/working_copies/ws1");
      });
    });
  });
});
