import * as React from "react";
import { beforeEach, describe, expect, it } from "vitest";
import userEvent from "@testing-library/user-event";
import { render, screen } from "../../test-utils";
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
		(candidate) => candidate.branch_name === branchName,
	);
	expect(workspace).toBeTruthy();
	return { id: workspace!.id, path: workspace!.workspace_path };
}

async function openWorkspaceCommitsTab(
	user: ReturnType<typeof userEvent.setup>,
	branchName: string,
) {
	render(<Dashboard />);
	await user.click(await findSidebarBranchElement(branchName));
	await user.click(await screen.findByRole("tab", { name: "Commits" }));
}

describe("ShowWorkspace - Commits tab", () => {
	let repoPath: string;

	let testWorkspace: WorkspaceRef;
	let user: ReturnType<typeof userEvent.setup>;
	beforeEach(async () => {
		({ repoPath } = createTestRepo(false));
		console.log("repoPath", repoPath);
		openRepo(repoPath);
		user = userEvent.setup();
		await Array.from({ length: 13 }, (_, index) => index).reduce(
			(chain, idx) =>
				chain.then(() =>
					commitRepoFile(
						repoPath,
						`target-pagination-${idx}.txt`,
						`target pagination content ${idx}`,
						`Target pagination commit ${idx}`,
					),
				),
			Promise.resolve(),
		);

		testWorkspace = await createWorkspaceRef(repoPath, "feat/commits-it");
		await commitWorkspaceFile(
			repoPath,
			testWorkspace,
			"README.md",
			"commits-tab-diff-line-one",
			"Commits diff one",
		);
		await commitWorkspaceFile(
			repoPath,
			testWorkspace,
			"commit-page.txt",
			"commits-tab-diff-line-two",
			"Commits diff two",
		);
	});

	it("renders commit contents and shows per-commit diff", async () => {
		await openWorkspaceCommitsTab(user, "feat/commits-it");

		await screen.findByText("Commits diff two");
		expect((await screen.findAllByText("Today")).length).toBeGreaterThan(0);
		const commit = await screen.findByText("Commits diff two");
		await user.click(commit);
		await screen.findByText("commit-page.txt");
		await screen.findByText("commits-tab-diff-line-two");
	});

	it("defers rendering file diffs larger than 500 changed lines until requested", async () => {
		const largeDiffContent = Array.from(
			{ length: 501 },
			(_, index) => `large diff line ${index + 1}`,
		).join("\n");

		await commitWorkspaceFile(
			repoPath,
			testWorkspace,
			"huge-diff.txt",
			largeDiffContent,
			"Commits huge diff",
		);

		await openWorkspaceCommitsTab(user, "feat/commits-it");

		const commit = await screen.findByText("Commits huge diff");
		await user.click(commit);

		await screen.findByText("huge-diff.txt");
		expect(screen.queryByText("large diff line 501")).toBeNull();

		const loadDiffButton = screen.getByRole("button", {
			name: "Load diff",
		});
		await user.click(loadDiffButton);

		await screen.findByText("large diff line 501");
	});

	it("shows a blocked message for commit diffs over 10k changed lines", async () => {
		const hugeDiffContent = Array.from(
			{ length: 10001 },
			(_, index) => `huge diff line ${index + 1}`,
		).join("\n");

		await commitWorkspaceFile(
			repoPath,
			testWorkspace,
			"huge-commit.txt",
			hugeDiffContent,
			"Commits huge cutoff",
		);

		await openWorkspaceCommitsTab(user, "feat/commits-it");

		const commit = await screen.findByText("Commits huge cutoff");
		await user.click(commit);

		await screen.findByText(
			"This commit changes more than 10,000 lines and is too large to render.",
		);
		expect(screen.queryByText("huge-commit.txt")).not.toBeInTheDocument();
		expect(
			screen.queryByRole("button", { name: "Load diff" }),
		).not.toBeInTheDocument();
	});
});
