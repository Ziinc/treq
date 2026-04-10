import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "./test-utils";
import { Workspace } from "../src/lib/api";
import { WorkspaceDeletion } from "../src/components/WorkspaceDeletion";
import { userEvent } from "@testing-library/user-event";

vi.mock("@tauri-apps/api/event", () => ({
	emit: vi.fn(),
	listen: vi.fn().mockResolvedValue(() => {}),
}));

vi.mock("@tauri-apps/api/window", () => ({
	WebviewWindow: vi.fn(),
	getCurrentWindow: vi.fn().mockReturnValue({
		onFocusChanged: vi.fn().mockResolvedValue(() => {}),
		setTitle: vi.fn(),
	}),
}));

const makeWorkspace = (id: number, name: string): Workspace => {
	const serializedWorkspace = `{"branch_name":${JSON.stringify(name)},"created_at":"","id":${id},"not_on_remote":false,"repo_path":"/repo","workspace_name":${JSON.stringify(name)},"workspace_path":${JSON.stringify(`/repo/workspaces/${name}`)}}`;
	return JSON.parse(serializedWorkspace) as Workspace;
};

let user: ReturnType<typeof userEvent.setup>;

beforeEach(() => {
	vi.clearAllMocks();
	user = userEvent.setup();
});

describe("WorkspaceDeletion - Search by Branch Name", () => {
	const mockWorkspaces: Workspace[] = [
		makeWorkspace(1, "test-branch"),
		makeWorkspace(2, "other-branch"),
		makeWorkspace(3, "test-feature"),
	];

	const defaultProps = {
		currentWorkspace: null,
		onDeleteWorkspace: vi.fn(),
		onOpenChange: vi.fn(),
		open: true,
		repoPath: "/repo",
		workspaces: mockWorkspaces,
	};

	it("should filter workspaces by branch name when searching", async () => {
		render(<WorkspaceDeletion {...defaultProps} />);

		await screen.findByText("test-branch");
		await screen.findByText("other-branch");
		await screen.findByText("test-feature");

		const input = screen.getByPlaceholderText("Search workspaces to delete...");
		await user.type(input, "test");

		await screen.findByText("test-branch");
		await screen.findByText("test-feature");
		await waitFor(() => {
			expect(screen.queryByText("other-branch")).not.toBeInTheDocument();
		});
	});

	it("should be case-insensitive when searching", async () => {
		render(<WorkspaceDeletion {...defaultProps} />);

		const input = screen.getByPlaceholderText("Search workspaces to delete...");
		await user.type(input, "TEST");

		await screen.findByText("test-branch");
		await screen.findByText("test-feature");
		await waitFor(() => {
			expect(screen.queryByText("other-branch")).not.toBeInTheDocument();
		});
	});

	it("should filter current workspace by branch name", async () => {
		const currentWorkspace = makeWorkspace(4, "test-current");

		render(
			<WorkspaceDeletion
				{...defaultProps}
				currentWorkspace={currentWorkspace}
				workspaces={[...mockWorkspaces, currentWorkspace]}
			/>,
		);

		// Appears in both the default workspace card and the workspace list.
		expect(screen.getAllByText("test-current")).toHaveLength(2);
		await screen.findByText("Current workspace (default)");

		const input = screen.getByPlaceholderText("Search workspaces to delete...");
		await user.type(input, "test");

		await screen.findByText("Current workspace (default)");
		await waitFor(() => {
			expect(screen.getAllByText("test-current").length).toBeGreaterThan(0);
			expect(screen.queryByText("other-branch")).not.toBeInTheDocument();
		});
	});

	it("should show empty state when no matches found", async () => {
		render(<WorkspaceDeletion {...defaultProps} />);

		const input = screen.getByPlaceholderText("Search workspaces to delete...");
		await user.type(input, "nonexistent");

		await screen.findByText("No deletable workspaces found");
		expect(screen.queryByText("test-branch")).not.toBeInTheDocument();
		expect(screen.queryByText("other-branch")).not.toBeInTheDocument();
	});

	it("should call onDeleteWorkspace with correct workspace when selected", async () => {
		const onDeleteWorkspace = vi.fn();

		render(
			<WorkspaceDeletion
				{...defaultProps}
				onDeleteWorkspace={onDeleteWorkspace}
			/>,
		);

		const input = screen.getByPlaceholderText("Search workspaces to delete...");
		await user.type(input, "test");

		const workspaceItem = await screen.findByText("test-branch");
		await user.click(workspaceItem);

		expect(onDeleteWorkspace).toHaveBeenCalledWith(mockWorkspaces[0]);
	});
});
