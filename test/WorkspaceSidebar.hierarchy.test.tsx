import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "./test-utils";
import userEvent from "@testing-library/user-event";
import { WorkspaceSidebar } from "../src/components/WorkspaceSidebar";
import type { Workspace } from "../src/lib/api";
import { listWorkspaceStatuses } from "../src/lib/api";

// Mock additional modules needed by WorkspaceSidebar
vi.mock("@tauri-apps/plugin-opener", () => ({
	revealItemInDir: vi.fn(),
	openUrl: vi.fn(),
}));

vi.mock("../src/lib/api", async (importOriginal) => {
	const actual = await importOriginal<typeof import("../src/lib/api")>();
	return {
		...actual,
		listWorkspaceStatuses: vi.fn().mockResolvedValue([]),
	};
});

vi.mock("../src/hooks/useEditorApps", () => ({
	useEditorApps: () => ({ cursor: false, vscode: false, zed: false }),
}));

function makeWorkspace(
	overrides: Partial<Workspace> & { id: number; branch_name: string },
): Workspace {
	return {
		repo_path: "/test/repo",
		workspace_name: overrides.branch_name,
		workspace_path: overrides.branch_name,
		created_at: "2024-01-01",
		not_on_remote: false,
		target_branch: null,
		...overrides,
	};
}

describe("WorkspaceSidebar hierarchy features", () => {
	const workspaceA = makeWorkspace({
		id: 1,
		branch_name: "workspace-A",
		target_branch: "main",
	});
	const workspaceB = makeWorkspace({
		id: 2,
		branch_name: "workspace-B",
		target_branch: "workspace-A",
	});
	const workspaceC = makeWorkspace({
		id: 3,
		branch_name: "workspace-C",
		target_branch: "workspace-A",
	});

	const defaultProps = {
		repoPath: "/test/repo",
		currentBranch: "main",
		selectedWorkspaceId: null as number | null,
		selectedWorkspaceIds: new Set<number>(),
		onWorkspaceClick: vi.fn(),
		onWorkspaceMultiSelect: vi.fn(),
		onBulkDelete: vi.fn(),
		onDeleteWorkspace: vi.fn(),
		onCreateWorkspace: vi.fn(),
		openSettings: vi.fn(),
		navigateToDashboard: vi.fn(),
		onOpenCommandPalette: vi.fn(),
		onOpenBranchSwitcher: vi.fn(),
		onAddBefore: vi.fn(),
		onAddAfter: vi.fn(),
		onMoveWorkspace: vi.fn(),
		onSelectStack: vi.fn(),
	};

	beforeEach(() => {
		vi.clearAllMocks();
		// Set up mock to return our test workspaces
		vi.mocked(listWorkspaceStatuses).mockResolvedValue([
			{ current: workspaceA, has_conflicts: false, has_changes: false },
			{ current: workspaceB, has_conflicts: false, has_changes: false },
			{ current: workspaceC, has_conflicts: false, has_changes: false },
		]);
	});

	describe("action buttons", () => {
		test("renders add-before and add-after buttons for each workspace row", async () => {
			render(<WorkspaceSidebar {...defaultProps} />);

			const wsARow = await screen.findByText("workspace-A");
			expect(wsARow).toBeInTheDocument();

			const addBeforeButtons = screen.getAllByLabelText(
				"Insert workspace before",
			);
			const addAfterButtons = screen.getAllByLabelText(
				"Insert workspace after",
			);

			expect(addBeforeButtons.length).toBe(3);
			expect(addAfterButtons.length).toBe(3);
		});

		test("add-after button calls onAddAfter with the correct workspace", async () => {
			const onAddAfter = vi.fn();
			render(<WorkspaceSidebar {...defaultProps} onAddAfter={onAddAfter} />);

			await screen.findByText("workspace-A");

			const addAfterButtons = screen.getAllByLabelText(
				"Insert workspace after",
			);
			await userEvent.click(addAfterButtons[0]);

			expect(onAddAfter).toHaveBeenCalledWith(
				expect.objectContaining({ branch_name: "workspace-A" }),
			);
		});

		test("add-before button calls onAddBefore with the correct workspace", async () => {
			const onAddBefore = vi.fn();
			render(<WorkspaceSidebar {...defaultProps} onAddBefore={onAddBefore} />);

			await screen.findByText("workspace-A");

			const addBeforeButtons = screen.getAllByLabelText(
				"Insert workspace before",
			);
			await userEvent.click(addBeforeButtons[0]);

			expect(onAddBefore).toHaveBeenCalledWith(
				expect.objectContaining({ branch_name: "workspace-A" }),
			);
		});

		test("action buttons do not trigger workspace selection (stopPropagation)", async () => {
			const onWorkspaceMultiSelect = vi.fn();
			const onAddAfter = vi.fn();

			render(
				<WorkspaceSidebar
					{...defaultProps}
					onWorkspaceMultiSelect={onWorkspaceMultiSelect}
					onAddAfter={onAddAfter}
				/>,
			);

			await screen.findByText("workspace-A");

			const addAfterButtons = screen.getAllByLabelText(
				"Insert workspace after",
			);
			await userEvent.click(addAfterButtons[0]);

			expect(onAddAfter).toHaveBeenCalled();
			expect(onWorkspaceMultiSelect).not.toHaveBeenCalled();
		});
	});

	describe("double-click selection", () => {
		test("double-click on workspace calls onSelectStack with entire stack", async () => {
			const onSelectStack = vi.fn();
			render(
				<WorkspaceSidebar {...defaultProps} onSelectStack={onSelectStack} />,
			);

			const wsB = await screen.findByText("workspace-B");
			fireEvent.doubleClick(wsB);

			// Should call onSelectStack with the IDs of the entire stack (A, B, C)
			expect(onSelectStack).toHaveBeenCalledWith(new Set([1, 2, 3]));
		});

		test("shift+double-click selects workspace and descendants only", async () => {
			const onSelectStack = vi.fn();
			render(
				<WorkspaceSidebar {...defaultProps} onSelectStack={onSelectStack} />,
			);

			const wsA = await screen.findByText("workspace-A");
			fireEvent.doubleClick(wsA, { shiftKey: true });

			// Shift+double-click on A: selects A + descendants (B, C)
			expect(onSelectStack).toHaveBeenCalledWith(new Set([1, 2, 3]));
		});

		test("shift+double-click on leaf selects just the leaf", async () => {
			const onSelectStack = vi.fn();
			render(
				<WorkspaceSidebar {...defaultProps} onSelectStack={onSelectStack} />,
			);

			const wsB = await screen.findByText("workspace-B");
			fireEvent.doubleClick(wsB, { shiftKey: true });

			// Shift+double-click on B: selects B + descendants (none)
			expect(onSelectStack).toHaveBeenCalledWith(new Set([2]));
		});
	});
});
