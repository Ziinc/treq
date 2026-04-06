/**
 * Integration tests for CommitDiffViewer.
 *
 * Exercises functionality that flows through the extracted hooks:
 * - usePaginatedCommits (initial load, load-more)
 * - useCommitDiffCache (expand commit to see its diff)
 *
 * Note: core commit list / diff-expand / load-more scenarios are covered in
 * commits.test.tsx.  These tests complement that suite by verifying the
 * behaviour that was encapsulated during the hook extraction refactor.
 */
import { describe, it, expect, beforeEach } from "vitest";
import * as React from "react";
import userEvent from "@testing-library/user-event";
import { render, screen, waitFor } from "../../test-utils";
import {
	commitRepoFile,
	commitWorkspaceFile,
	createTestRepo,
	findSidebarBranchElement,
	openRepo,
} from "../../utils";
import * as api from "../../../src/lib/api";
import { Dashboard } from "../../../src/components/Dashboard";

type WorkspaceRef = { id: number; path: string };

async function createWorkspaceRef(
	repoPath: string,
	branchName: string,
): Promise<WorkspaceRef> {
	await api.createWorkspace(repoPath, branchName);
	const workspace = (await api.getWorkspaces(repoPath)).find(
		(c) => c.branch_name === branchName,
	);
	expect(workspace).toBeTruthy();
	return { id: workspace!.id, path: workspace!.workspace_path };
}

async function openCommitsTab(
	user: ReturnType<typeof userEvent.setup>,
	branchName: string,
) {
	render(<Dashboard />);
	await user.click(await findSidebarBranchElement(branchName));
	await user.click(await screen.findByRole("tab", { name: "Commits" }));
}

// ─── usePaginatedCommits ──────────────────────────────────────────────────────

describe("CommitDiffViewer — pagination (usePaginatedCommits)", () => {
	let repoPath: string;
	let testWorkspace: WorkspaceRef;

	beforeEach(async () => {
		({ repoPath } = createTestRepo(false));
		openRepo(repoPath);

		// Create 16 commits on the target branch to exceed the initial limit of 15
		for (let i = 0; i < 16; i++) {
			await commitRepoFile(
				repoPath,
				`paginate-${i}.txt`,
				`paginate content ${i}`,
				`Target paginate commit ${i}`,
			);
		}

		testWorkspace = await createWorkspaceRef(repoPath, "feat/cdv-paginate");
		await commitWorkspaceFile(
			repoPath,
			testWorkspace,
			"ws-file.txt",
			"ws content",
			"Workspace commit A",
		);
	});

	it("shows workspace commit initially and loads more on demand", async () => {
		const user = userEvent.setup();
		await openCommitsTab(user, "feat/cdv-paginate");

		// Workspace commit is visible immediately
		await screen.findByText("Workspace commit A");

		// The 17th target-branch commit (index 0) is beyond the initial limit of 10
		expect(
			screen.queryByText("Target paginate commit 0"),
		).not.toBeInTheDocument();

		// Click "Load more commits"
		const loadMore = await screen.findByRole("button", {
			name: "Load more commits",
		});
		await user.click(loadMore);

		// After loading more, older commits become visible
		await screen.findByText("Target paginate commit 0");
	});
});

// ─── useCommitDiffCache ───────────────────────────────────────────────────────

describe("CommitDiffViewer — diff cache (useCommitDiffCache)", () => {
	let repoPath: string;
	let testWorkspace: WorkspaceRef;

	beforeEach(async () => {
		({ repoPath } = createTestRepo(false));
		openRepo(repoPath);

		testWorkspace = await createWorkspaceRef(repoPath, "feat/cdv-diffcache");
		await commitWorkspaceFile(
			repoPath,
			testWorkspace,
			"diff-file.txt",
			"diff content line",
			"Cache diff commit",
		);
	});

	it("expands a commit row to show its diff and collapses it again", async () => {
		const user = userEvent.setup();
		await openCommitsTab(user, "feat/cdv-diffcache");

		// Commit description is in the list
		const commitRow = await screen.findByText("Cache diff commit");

		// Diff content is not shown before expanding
		expect(screen.queryByText("diff content line")).not.toBeInTheDocument();

		// Click the commit row to expand its diff
		await user.click(commitRow);

		// Diff content appears
		await screen.findByText("diff-file.txt");
		await screen.findByText("diff content line");

		// Click again to collapse
		await user.click(commitRow);

		await waitFor(() =>
			expect(
				screen.queryByText("diff content line"),
			).not.toBeInTheDocument(),
		);
	});
});
