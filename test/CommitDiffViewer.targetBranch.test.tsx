import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, waitFor, screen } from "./test-utils";
import { CommitDiffViewer } from "../src/components/CommitDiffViewer";
import * as api from "../src/lib/api";
import { createMockCommit } from "./factories/commit.factory";

vi.mock("../src/lib/api", async () => {
	const actual = await vi.importActual("../src/lib/api");
	return {
		...actual,
		jjGetLog: vi.fn(),
		jjGetCommitDiff: vi.fn(),
		abandonCommit: vi.fn(),
		listCommits: vi.fn(),
	};
});

const activeCommits = [
	createMockCommit({
		commit_id: "wc001",
		short_id: "wc001",
		is_working_copy: true,
		description: "(no description)",
		timestamp: "2024-01-15 10:00:00",
	}),
	createMockCommit({
		commit_id: "active001",
		short_id: "active001",
		change_id: "chg_active1",
		description: "Active workspace commit",
		timestamp: "2024-01-15 09:00:00",
		is_immutable: false,
	}),
];

const targetBranchCommits = [
	createMockCommit({
		commit_id: "target001",
		short_id: "target001",
		change_id: "chg_target1",
		description: "Target branch commit 1",
		timestamp: "2024-01-14 10:00:00",
		is_immutable: true,
	}),
	createMockCommit({
		commit_id: "target002",
		short_id: "target002",
		change_id: "chg_target2",
		description: "Target branch commit 2",
		timestamp: "2024-01-13 10:00:00",
		is_immutable: true,
	}),
];

beforeEach(() => {
	vi.clearAllMocks();
});

describe("CommitDiffViewer - Target Branch History", () => {
	it("renders 'Recent on main' section when target branch commits are present", async () => {
		vi.mocked(api.jjGetLog).mockResolvedValue({
			commits: activeCommits,
			target_branch: "main",
			workspace_branch: "feat/test",
		});
		vi.mocked(api.listCommits).mockResolvedValue({
			commits: activeCommits,
			target_branch: "main",
			workspace_branch: "feat/test",
			target_branch_commits: targetBranchCommits,
		});

		render(
			<CommitDiffViewer
				workspacePath="/test/workspace"
				repoPath="/test/repo"
				workspaceId={1}
				targetBranch="main"
				isHomeRepo={false}
			/>,
		);

		await waitFor(() => {
			expect(screen.getByText("Recent on main")).toBeInTheDocument();
		});
	});

	it("renders divider between active and target branch sections", async () => {
		vi.mocked(api.jjGetLog).mockResolvedValue({
			commits: activeCommits,
			target_branch: "main",
			workspace_branch: "feat/test",
		});
		vi.mocked(api.listCommits).mockResolvedValue({
			commits: activeCommits,
			target_branch: "main",
			workspace_branch: "feat/test",
			target_branch_commits: targetBranchCommits,
		});

		const { container } = render(
			<CommitDiffViewer
				workspacePath="/test/workspace"
				repoPath="/test/repo"
				workspaceId={1}
				targetBranch="main"
				isHomeRepo={false}
			/>,
		);

		await waitFor(() => {
			expect(screen.getByText("Recent on main")).toBeInTheDocument();
		});

		// Check for the divider element
		const divider = container.querySelector(".border-t.border-border");
		expect(divider).toBeInTheDocument();
	});

	it("target branch commits have no action buttons", async () => {
		vi.mocked(api.jjGetLog).mockResolvedValue({
			commits: activeCommits,
			target_branch: "main",
			workspace_branch: "feat/test",
		});
		vi.mocked(api.listCommits).mockResolvedValue({
			commits: activeCommits,
			target_branch: "main",
			workspace_branch: "feat/test",
			target_branch_commits: targetBranchCommits,
		});
		vi.mocked(api.jjGetCommitDiff).mockResolvedValue({
			files: [],
			hunks_by_file: [],
		});

		render(
			<CommitDiffViewer
				workspacePath="/test/workspace"
				repoPath="/test/repo"
				workspaceId={1}
				targetBranch="main"
				isHomeRepo={false}
			/>,
		);

		await waitFor(() => {
			expect(screen.getByText("Target branch commit 1")).toBeInTheDocument();
		});

		// Click a target branch commit to expand it
		const targetCommitButton = screen.getByText("Target branch commit 1");
		targetCommitButton.click();

		await waitFor(() => {
			// The expanded section should not have "Move commit" or "Delete commit" buttons
			const expandedSection = document.querySelector(
				`[data-commit-id="target001"]`,
			);
			expect(expandedSection).toBeInTheDocument();

			// These action buttons should NOT be present for target branch commits
			const moveButtons = expandedSection!.querySelectorAll("button");
			const moveCommitButton = Array.from(moveButtons).find((b) =>
				b.textContent?.includes("Move commit"),
			);
			const deleteCommitButton = Array.from(moveButtons).find((b) =>
				b.textContent?.includes("Delete commit"),
			);
			expect(moveCommitButton).toBeUndefined();
			expect(deleteCommitButton).toBeUndefined();
		});
	});

	it("section not rendered when isHomeRepo=true", async () => {
		vi.mocked(api.jjGetLog).mockResolvedValue({
			commits: activeCommits,
			target_branch: "main",
			workspace_branch: "main",
		});

		render(
			<CommitDiffViewer
				workspacePath="/test/repo"
				repoPath="/test/repo"
				workspaceId={null}
				targetBranch="main"
				isHomeRepo={true}
			/>,
		);

		await waitFor(() => {
			expect(screen.getByText("Active workspace commit")).toBeInTheDocument();
		});

		expect(screen.queryByText("Recent on main")).not.toBeInTheDocument();
	});

	it("section not rendered when target_branch_commits is empty", async () => {
		vi.mocked(api.jjGetLog).mockResolvedValue({
			commits: activeCommits,
			target_branch: "main",
			workspace_branch: "feat/test",
		});
		vi.mocked(api.listCommits).mockResolvedValue({
			commits: activeCommits,
			target_branch: "main",
			workspace_branch: "feat/test",
			target_branch_commits: [],
		});

		render(
			<CommitDiffViewer
				workspacePath="/test/workspace"
				repoPath="/test/repo"
				workspaceId={1}
				targetBranch="main"
				isHomeRepo={false}
			/>,
		);

		await waitFor(() => {
			expect(screen.getByText("Active workspace commit")).toBeInTheDocument();
		});

		expect(screen.queryByText("Recent on main")).not.toBeInTheDocument();
	});
});
