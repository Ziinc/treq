import * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	createTestRepo,
	findSidebarBranchElement,
	openRepo,
	resolveWorkspacePath,
	writeWorkspaceFile,
} from "../../utils";
import {
	createCommit,
	createWorkspace,
	getWorkspaceStatus,
	getWorkspaces,
} from "../../../src/lib/api";
import { render, screen, waitFor, within } from "../../test-utils";
import { Dashboard } from "../../../src/components/Dashboard";
import userEvent from "@testing-library/user-event";
import * as api from "../../../src/lib/api";
import { execFileSync } from "node:child_process";

type ReviewFixture = {
	repoPath: string;
	branchName: string;
	workspaceId: number;
	workspacePath: string;
	conflictFile: string;
};

async function navigateToReviewTab(
	user: ReturnType<typeof userEvent.setup>,
	branchName: string,
) {
	await user.click(await findSidebarBranchElement(branchName));
	const reviewTab = await screen.findByRole("tab", { name: /^Review/ });
	await user.click(reviewTab);
	await screen.findByRole("tab", { name: /^Review/, selected: true });
}

async function clickFileInSection(
	user: ReturnType<typeof userEvent.setup>,
	sectionName: "Conflicts" | "Changes",
	fileName: string,
) {
	const sectionToggle = await screen.findByRole("button", {
		name: sectionName,
	});
	const sectionHeader = sectionToggle.closest("div");
	if (!sectionHeader?.parentElement) {
		throw new Error(`Could not locate ${sectionName} section container`);
	}
	const section = sectionHeader.parentElement;
	const fileRow = await within(section).findByTitle(fileName);
	await user.click(fileRow);
}

async function assertStatus(
	repoPath: string,
	workspaceId: number,
	expected: { hasConflicts: boolean; conflictedFiles: string[] },
) {
	const status = await getWorkspaceStatus(repoPath, workspaceId);
	expect(status.has_conflicts).toBe(expected.hasConflicts);
	expect(status.conflicted_files).toEqual(expected.conflictedFiles);
}

async function createWorkspaceFixture(
	branchName: string,
): Promise<ReviewFixture> {
	const { repoPath } = createTestRepo(false);
	openRepo(repoPath);
	const workspaceId = await createWorkspace(repoPath, branchName);
	const workspace = (await getWorkspaces(repoPath)).find(
		(w) => w.id === workspaceId,
	);
	if (!workspace) throw new Error("Workspace not found");
	return {
		repoPath,
		branchName,
		workspaceId,
		workspacePath: resolveWorkspacePath(repoPath, workspace.workspace_path),
		conflictFile: "README.md",
	};
}

async function setupCleanState(): Promise<ReviewFixture> {
	return createWorkspaceFixture("feat/review-clean");
}

async function setupDivergentNonConflictState(): Promise<ReviewFixture> {
	const { repoPath } = createTestRepo(false);
	openRepo(repoPath);

	const baseId = await createWorkspace(repoPath, "feature-base");
	const baseWs = (await getWorkspaces(repoPath)).find((w) => w.id === baseId);
	if (!baseWs) throw new Error("Base workspace not found");
	const basePath = resolveWorkspacePath(repoPath, baseWs.workspace_path);

	const stackedId = await createWorkspace(
		repoPath,
		"feat/divergent",
		"feature-base",
	);
	const stackedWs = (await getWorkspaces(repoPath)).find(
		(w) => w.id === stackedId,
	);
	if (!stackedWs) throw new Error("Stacked workspace not found");
	const stackedPath = resolveWorkspacePath(repoPath, stackedWs.workspace_path);

	writeWorkspaceFile(basePath, "base-only.txt", "base change\n");
	await createCommit(repoPath, baseId, "base-only change");

	writeWorkspaceFile(stackedPath, "stacked-only.txt", "stacked change\n");
	await createCommit(repoPath, stackedId, "stacked-only change");

	return {
		repoPath,
		branchName: "feat/divergent",
		workspaceId: stackedId,
		workspacePath: stackedPath,
		conflictFile: "README.md",
	};
}

async function setupUnresolvedConflictState(
	branchName: string,
): Promise<ReviewFixture> {
	const { repoPath } = createTestRepo(false);
	openRepo(repoPath);

	const workspaceId = await createWorkspace(repoPath, branchName);
	const workspace = (await getWorkspaces(repoPath)).find(
		(w) => w.id === workspaceId,
	);
	if (!workspace) throw new Error("Workspace not found");
	const workspacePath = resolveWorkspacePath(
		repoPath,
		workspace.workspace_path,
	);

	writeWorkspaceFile(workspacePath, "README.md", "workspace side\n");
	await createCommit(repoPath, workspaceId, "workspace conflicting change");
	const workspaceChangeId = execFileSync(
		"jj",
		["log", "-r", "@-", "--no-graph", "-T", "change_id"],
		{ cwd: workspacePath, encoding: "utf8" },
	).trim();

	writeWorkspaceFile(repoPath, "README.md", "main side\n");
	await createCommit(repoPath, null, "main conflicting change");
	const mainChangeId = execFileSync(
		"jj",
		["log", "-r", "@-", "--no-graph", "-T", "change_id"],
		{ cwd: repoPath, encoding: "utf8" },
	).trim();

	execFileSync("jj", ["new", workspaceChangeId, mainChangeId], {
		cwd: workspacePath,
		encoding: "utf8",
	});

	writeWorkspaceFile(workspacePath, "notes.txt", "non-conflicted note\n");

	return {
		repoPath,
		branchName,
		workspaceId,
		workspacePath,
		conflictFile: "README.md",
	};
}

describe("Review - conflict rendering contract", () => {
	let user: ReturnType<typeof userEvent.setup>;

	beforeEach(() => {
		user = userEvent.setup();
	});

	it("clean state: status shows no conflicts and no Conflicts section", async () => {
		const fixture = await setupCleanState();
		await assertStatus(fixture.repoPath, fixture.workspaceId, {
			hasConflicts: false,
			conflictedFiles: [],
		});

		render(<Dashboard />);
		await navigateToReviewTab(user, fixture.branchName);
		expect(screen.queryByText("Conflicts")).not.toBeInTheDocument();
	});

	it("divergent non-conflict state: no Conflicts section", async () => {
		const fixture = await setupDivergentNonConflictState();
		await assertStatus(fixture.repoPath, fixture.workspaceId, {
			hasConflicts: false,
			conflictedFiles: [],
		});

		render(<Dashboard />);
		await navigateToReviewTab(user, fixture.branchName);
		expect(screen.queryByText("Conflicts")).not.toBeInTheDocument();
	});

	it("divergent non-conflict state: sidebar should not show conflict tooltip", async () => {
		const fixture = await setupDivergentNonConflictState();
		await assertStatus(fixture.repoPath, fixture.workspaceId, {
			hasConflicts: false,
			conflictedFiles: [],
		});

		render(<Dashboard />);
		const branchNode = await findSidebarBranchElement(fixture.branchName);
		await user.hover(branchNode);
		expect(screen.queryByText("Conflicts detected")).not.toBeInTheDocument();
		expect(
			document.querySelector(
				`[data-testid="workspace-conflict-indicator-${fixture.workspaceId}"]`,
			),
		).toBeNull();
	});

	it("unresolved conflict state: Conflicts section is rendered from backend metadata", async () => {
		const fixture = await setupUnresolvedConflictState(
			"feat/unresolved-conflict",
		);
		await assertStatus(fixture.repoPath, fixture.workspaceId, {
			hasConflicts: true,
			conflictedFiles: [fixture.conflictFile],
		});

		render(<Dashboard />);
		await screen.findByTestId(
			`workspace-conflict-indicator-${fixture.workspaceId}`,
		);
		await navigateToReviewTab(user, fixture.branchName);
		await screen.findByText("Conflicts");
		await screen.findByText("Changes");
		await waitFor(() => {
			expect(screen.getAllByText("README.md").length).toBeGreaterThan(0);
		});
	});

	it("conflict identity without regions: keeps conflicted file identity with no invented conflict cards", async () => {
		const fixture = await setupUnresolvedConflictState("feat/zero-regions");
		await assertStatus(fixture.repoPath, fixture.workspaceId, {
			hasConflicts: true,
			conflictedFiles: [fixture.conflictFile],
		});

		const originalGetWorkspaceFileHunks = api.getWorkspaceFileHunks;
		const getHunksSpy = vi.spyOn(api, "getWorkspaceFileHunks");
		getHunksSpy.mockImplementation(async (...args) => {
			const hunks = await originalGetWorkspaceFileHunks(...args);
			return hunks.map((h) => ({ ...h, conflict_regions: [] }));
		});

		render(<Dashboard />);
		await navigateToReviewTab(user, fixture.branchName);
		await screen.findByText("Conflicts");
		await waitFor(() => {
			expect(screen.getAllByText("README.md").length).toBeGreaterThan(0);
		});
		expect(screen.queryByText("Conflict 1 of")).not.toBeInTheDocument();
		getHunksSpy.mockRestore();
	});

	it("conflicted files suppress line-comment controls while non-conflicted files keep them", async () => {
		const fixture = await setupUnresolvedConflictState("feat/comment-controls");
		await assertStatus(fixture.repoPath, fixture.workspaceId, {
			hasConflicts: true,
			conflictedFiles: [fixture.conflictFile],
		});

		render(<Dashboard />);
		await navigateToReviewTab(user, fixture.branchName);

		await clickFileInSection(user, "Conflicts", "README.md");
		await waitFor(() => {
			const readmeDiff = document.querySelector('[data-file-path="README.md"]');
			expect(readmeDiff).not.toBeNull();
			expect(readmeDiff?.querySelectorAll("[data-comment-button]").length).toBe(
				0,
			);
		});

		await clickFileInSection(user, "Changes", "notes.txt");
		await waitFor(() => {
			const notesDiff = document.querySelector('[data-file-path="notes.txt"]');
			expect(notesDiff).not.toBeNull();
			expect(
				notesDiff?.querySelectorAll("[data-comment-button]").length,
			).toBeGreaterThan(0);
		});
	});

	it("conflicted file with no diff hunks shows an explicit placeholder", async () => {
		const fixture = await setupUnresolvedConflictState(
			"feat/deleted-conflict-placeholder",
		);
		await assertStatus(fixture.repoPath, fixture.workspaceId, {
			hasConflicts: true,
			conflictedFiles: [fixture.conflictFile],
		});

		const originalGetWorkspaceFileHunks = api.getWorkspaceFileHunks;
		const getHunksSpy = vi.spyOn(api, "getWorkspaceFileHunks");
		getHunksSpy.mockImplementation(async (...args) => {
			const [repoPath, workspaceId, filePath] = args;
			if (filePath === fixture.conflictFile) {
				return [];
			}
			return originalGetWorkspaceFileHunks(repoPath, workspaceId, filePath);
		});

		render(<Dashboard />);
		await navigateToReviewTab(user, fixture.branchName);
		await clickFileInSection(user, "Conflicts", "README.md");
		await screen.findByText(
			"No diff available for this conflicted file (possibly deleted)",
		);
		getHunksSpy.mockRestore();
	});
});
