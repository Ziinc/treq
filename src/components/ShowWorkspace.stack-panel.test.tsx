import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "../../test/test-utils";
import type { Workspace, WorkspaceStatus } from "../lib/api";
import { ShowWorkspace } from "./ShowWorkspace";

vi.mock("./FileBrowser", () => ({
	FileBrowser: () => <div data-testid="file-browser" />,
}));

vi.mock("./LinearCommitHistory", () => ({
	LinearCommitHistory: () => <div data-testid="linear-commit-history" />,
}));

vi.mock("./ChangesDiffViewer", () => ({
	ChangesDiffViewer: () => <div data-testid="changes-viewer" />,
}));

vi.mock("./TargetBranchSelector", () => ({
	TargetBranchSelector: () => <div data-testid="target-branch-selector" />,
}));

vi.mock("../lib/api", async () => {
	const actual =
		await vi.importActual<typeof import("../lib/api")>("../lib/api");
	return {
		...actual,
		getSetting: vi.fn().mockResolvedValue(null),
		lsWorkspace: vi.fn().mockResolvedValue([]),
		getWorkspaceReadme: vi.fn().mockResolvedValue(null),
		jjGetDefaultBranch: vi.fn().mockResolvedValue("main"),
		listConflictedFiles: vi.fn().mockResolvedValue([]),
		jjGetBranches: vi.fn().mockResolvedValue([]),
		setWorkspaceTargetBranch: vi.fn().mockResolvedValue(undefined),
		jjGetChangedFiles: vi.fn().mockResolvedValue([]),
		createSession: vi.fn().mockResolvedValue(42),
		ptyCreateSession: vi.fn().mockResolvedValue(undefined),
		ptyWrite: vi.fn().mockResolvedValue(undefined),
		checkAndRebaseWorkspaces: vi.fn().mockResolvedValue({
			rebased: false,
			success: true,
			has_conflicts: false,
			conflicted_files: [],
			message: "No rebase needed",
			bookmark_conflicts: [],
		}),
		resolveBookmarkConflict: vi.fn().mockResolvedValue({
			success: true,
			message: "Resolved",
		}),
		listCommits: vi.fn().mockResolvedValue({
			commits: [],
			target_branch: "main",
			workspace_branch: "ws",
		}),
		getWorkspaces: vi.fn().mockResolvedValue([]),
		getWorkspaceStatus: vi.fn(),
	};
});

const rootWorkspace: Workspace = {
	id: 1,
	repo_path: "/Users/test/repo",
	workspace_name: "main",
	workspace_path: "/Users/test/repo",
	branch_name: "main",
	title: "main",
	created_at: new Date().toISOString(),
	not_on_remote: false,
};

const stackedWorkspace: Workspace = {
	id: 2,
	repo_path: "/Users/test/repo",
	workspace_name: "feature-one",
	workspace_path: "/Users/test/repo/.treq/workspaces/feature-one",
	branch_name: "feature-one",
	target_branch: "main",
	title: "feature-one",
	created_at: new Date().toISOString(),
	not_on_remote: false,
};

function makeStatus(overrides: Partial<WorkspaceStatus>): WorkspaceStatus {
	return {
		current: stackedWorkspace,
		has_conflicts: false,
		has_changes: false,
		conflicted_files: [],
		remote_sync: { type: "InSync" },
		target: null,
		children: [],
		dag_nodes: [],
		conflicted_workspace_ids: [],
		commits_ahead_of_target: [],
		...overrides,
	};
}

describe("ShowWorkspace stack panel gating", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("does not render the stack panel for the main repository (no workspace selected)", async () => {
		const { getWorkspaceStatus } = await import("../lib/api");
		vi.mocked(getWorkspaceStatus).mockResolvedValue(
			makeStatus({ current: rootWorkspace, target: null }),
		);

		render(
			<ShowWorkspace
				repositoryPath="/Users/test/repo"
				workspace={null}
				mainRepoBranch="main"
				initialSelectedFile={null}
			/>,
		);

		await screen.findByTestId("linear-commit-history");
		expect(
			screen.queryByTestId("workspace-stack-panel"),
		).not.toBeInTheDocument();
	});

	it("does not render the stack panel for a default-branch workspace", async () => {
		const { getWorkspaceStatus } = await import("../lib/api");
		vi.mocked(getWorkspaceStatus).mockResolvedValue(
			makeStatus({ current: rootWorkspace, target: null }),
		);

		render(
			<ShowWorkspace
				repositoryPath={rootWorkspace.repo_path}
				workspace={rootWorkspace}
				mainRepoBranch="main"
				initialSelectedFile={null}
			/>,
		);

		await screen.findByTestId("linear-commit-history");
		expect(
			screen.queryByTestId("workspace-stack-panel"),
		).not.toBeInTheDocument();
	});

	it("renders the stack panel for a workspace stacked on top of another workspace", async () => {
		const { getWorkspaceStatus, getWorkspaces } = await import("../lib/api");
		vi.mocked(getWorkspaceStatus).mockResolvedValue(
			makeStatus({ current: stackedWorkspace, target: rootWorkspace }),
		);
		vi.mocked(getWorkspaces).mockResolvedValue([
			rootWorkspace,
			stackedWorkspace,
		]);

		render(
			<ShowWorkspace
				repositoryPath={stackedWorkspace.repo_path}
				workspace={stackedWorkspace}
				mainRepoBranch="main"
				initialSelectedFile={null}
			/>,
		);

		await screen.findByTestId("workspace-stack-panel");
		expect(await screen.findByText("1 of 2")).toBeTruthy();
	});

	it("navigates to the clicked stack workspace via onNavigateToWorkspace", async () => {
		const { getWorkspaceStatus, getWorkspaces } = await import("../lib/api");
		vi.mocked(getWorkspaceStatus).mockResolvedValue(
			makeStatus({ current: stackedWorkspace, target: rootWorkspace }),
		);
		vi.mocked(getWorkspaces).mockResolvedValue([
			rootWorkspace,
			stackedWorkspace,
		]);
		const onNavigateToWorkspace = vi.fn();
		const user = userEvent.setup();

		render(
			<ShowWorkspace
				repositoryPath={stackedWorkspace.repo_path}
				workspace={stackedWorkspace}
				mainRepoBranch="main"
				initialSelectedFile={null}
				onNavigateToWorkspace={onNavigateToWorkspace}
			/>,
		);

		const rootItem = await screen.findByTestId(
			`workspace-stack-item-${rootWorkspace.id}`,
		);
		await user.click(rootItem);

		await waitFor(() => {
			expect(onNavigateToWorkspace).toHaveBeenCalledWith(rootWorkspace);
		});
	});
});
