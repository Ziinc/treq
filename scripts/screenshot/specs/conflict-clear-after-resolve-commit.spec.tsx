import * as React from "react";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { expect, it } from "vitest";
import userEvent from "@testing-library/user-event";
import {
	createTestRepo,
	findSidebarBranchElement,
	newCommitWithParents,
	openRepo,
	resolveChangeId,
	resolveWorkspacePath,
	writeWorkspaceFile,
} from "../../../test/utils";
import { render, screen, waitFor, within } from "../../../test/test-utils";
import { Dashboard } from "../../../src/components/Dashboard";
import {
	checkAndRebaseWorkspaces,
	createCommit,
	createWorkspace,
	ensureWorkspaceIndexed,
	getWorkspaceStatus,
	getWorkspaces,
	pushWorkspaceToRemote,
} from "../../../src/lib/api";
import { captureDocument } from "../capture";

type ConflictFixture = {
	slug: string;
	repoPath: string;
	tempDirPath?: string;
	branchName: string;
	workspaceId: number;
	workspacePath: string;
	conflictFiles: string[];
	resolvedContent: Record<string, string>;
};

async function createWorkspaceOnBranch(
	repoPath: string,
	branchName: string,
	targetBranch?: string,
) {
	const workspaceId = await createWorkspace(repoPath, branchName, targetBranch);
	const workspace = (await getWorkspaces(repoPath)).find(
		(candidate) => candidate.id === workspaceId,
	);
	if (!workspace) throw new Error(`Workspace ${branchName} not found`);
	return {
		workspaceId,
		workspacePath: resolveWorkspacePath(repoPath, workspace.workspace_path),
	};
}

async function assertConflicted(
	repoPath: string,
	workspaceId: number,
	files: string[],
) {
	const status = await getWorkspaceStatus(repoPath, workspaceId);
	expect(status.has_conflicts).toBe(true);
	for (const file of files) {
		expect(status.conflicted_files).toContain(file);
	}
}

async function navigateToReview(
	user: ReturnType<typeof userEvent.setup>,
	branchName: string,
) {
	await user.click(await findSidebarBranchElement(branchName));
	const reviewTab = await screen.findByRole("tab", { name: /^Review/ });
	await user.click(reviewTab);
	await screen.findByRole("tab", { name: /^Review/, selected: true });
}

async function resolveAndCommitViaUi(
	user: ReturnType<typeof userEvent.setup>,
	fixture: ConflictFixture,
	message: string,
) {
	for (const [relativePath, content] of Object.entries(
		fixture.resolvedContent,
	)) {
		writeWorkspaceFile(fixture.workspacePath, relativePath, content);
	}

	// Re-enter Review so the file list picks up the resolved WC write.
	const overviewTab = await screen.findByRole("tab", { name: /^Code|^Overview/ });
	await user.click(overviewTab);
	await navigateToReview(user, fixture.branchName);

	await user.type(await screen.findByPlaceholderText("Message"), message);
	await user.click(screen.getByRole("button", { name: "Commit" }));
	await screen.findByText("Commit created");
}

async function assertConflictsCleared(fixture: ConflictFixture) {
	await waitFor(async () => {
		const status = await getWorkspaceStatus(
			fixture.repoPath,
			fixture.workspaceId,
		);
		expect(status.has_conflicts).toBe(false);
		expect(status.conflicted_files).toEqual([]);
	});

	await waitFor(() => {
		expect(
			document.querySelector(
				`[data-testid="workspace-conflict-indicator-${fixture.workspaceId}"]`,
			),
		).toBeNull();
	});

	await waitFor(() => {
		expect(
			screen.queryByRole("button", { name: "Conflicts" }),
		).not.toBeInTheDocument();
	});
}

async function captureBeforeAfter(
	user: ReturnType<typeof userEvent.setup>,
	fixture: ConflictFixture,
	message: string,
) {
	render(<Dashboard />);
	await screen.findByTestId(
		`workspace-conflict-indicator-${fixture.workspaceId}`,
	);
	await navigateToReview(user, fixture.branchName);
	await screen.findByRole("button", { name: "Conflicts" });

	await captureDocument(document, {
		name: `${fixture.slug}-01-before-resolve-commit`,
		expectations: [
			`The workspace sidebar shows a red conflict indicator for ${fixture.branchName}.`,
			'The Review tab shows a red "Conflicts" section listing the conflicted file(s).',
			"A Commit button is visible so the conflict can be resolved by committing a fix.",
		],
	});

	await resolveAndCommitViaUi(user, fixture, message);
	await assertConflictsCleared(fixture);

	await captureDocument(document, {
		name: `${fixture.slug}-02-after-resolve-commit`,
		expectations: [
			`The workspace sidebar no longer shows a conflict indicator for ${fixture.branchName}.`,
			'The Review tab no longer shows a "Conflicts" section.',
			'A "Commit created" toast confirms the resolve commit succeeded.',
		],
	});
}

/** Commit on a branch in the bare remote without touching the local repo. */
function remoteCommitOnBranch(
	tempDirPath: string,
	branchName: string,
	relativePath: string,
	content: string,
	message: string,
) {
	const remotePath = path.join(tempDirPath, "remote.git");
	const clonePath = path.join(tempDirPath, `remote_clone_${Date.now()}`);
	if (fs.existsSync(clonePath)) {
		fs.rmSync(clonePath, { recursive: true, force: true });
	}

	execFileSync("git", ["clone", remotePath, clonePath], { stdio: "pipe" });
	execFileSync("git", ["config", "user.email", "test@example.com"], {
		cwd: clonePath,
		stdio: "pipe",
	});
	execFileSync("git", ["config", "user.name", "Test User"], {
		cwd: clonePath,
		stdio: "pipe",
	});

	try {
		execFileSync("git", ["checkout", branchName], {
			cwd: clonePath,
			stdio: "pipe",
		});
	} catch {
		execFileSync(
			"git",
			["checkout", "-b", branchName, `origin/${branchName}`],
			{ cwd: clonePath, stdio: "pipe" },
		);
	}

	const filePath = path.join(clonePath, relativePath);
	fs.mkdirSync(path.dirname(filePath), { recursive: true });
	fs.writeFileSync(filePath, content);
	execFileSync("git", ["add", relativePath], { cwd: clonePath, stdio: "pipe" });
	execFileSync("git", ["commit", "-m", message], {
		cwd: clonePath,
		stdio: "pipe",
	});
	execFileSync("git", ["push", "origin", branchName], {
		cwd: clonePath,
		stdio: "pipe",
	});
	fs.rmSync(clonePath, { recursive: true, force: true });
}

// ── 1. Merge conflict via jj new (two parents) ───────────────────────────────
it("clears merge conflict after resolve commit", async () => {
	const { repoPath } = createTestRepo(false);
	openRepo(repoPath);
	const branchName = "feat/clear-merge";
	const { workspaceId, workspacePath } = await createWorkspaceOnBranch(
		repoPath,
		branchName,
	);

	writeWorkspaceFile(workspacePath, "README.md", "workspace side\n");
	await createCommit(repoPath, workspaceId, "workspace conflicting change");
	const workspaceChangeId = resolveChangeId(workspacePath, "@-");

	writeWorkspaceFile(repoPath, "README.md", "main side\n");
	await createCommit(repoPath, null, "main conflicting change");
	const mainChangeId = resolveChangeId(repoPath, "@-");

	newCommitWithParents(workspacePath, [workspaceChangeId, mainChangeId]);
	await ensureWorkspaceIndexed(repoPath, workspaceId, workspacePath);
	await assertConflicted(repoPath, workspaceId, ["README.md"]);

	const user = userEvent.setup();
	await captureBeforeAfter(
		user,
		{
			slug: "conflict-clear-merge",
			repoPath,
			branchName,
			workspaceId,
			workspacePath,
			conflictFiles: ["README.md"],
			resolvedContent: { "README.md": "resolved merge content\n" },
		},
		"resolve merge conflict",
	);
}, 90000);

// ── 2. Rebase conflict via checkAndRebaseWorkspaces (modify/modify) ──────────
it("clears rebase conflict after resolve commit", async () => {
	const { repoPath, defaultBranch } = createTestRepo(false);
	openRepo(repoPath);
	const branchName = "feat/clear-rebase";
	const { workspaceId, workspacePath } = await createWorkspaceOnBranch(
		repoPath,
		branchName,
	);

	writeWorkspaceFile(workspacePath, "README.md", "workspace side\n");
	await createCommit(repoPath, workspaceId, "workspace conflicting change");
	writeWorkspaceFile(repoPath, "README.md", "main side\n");
	await createCommit(repoPath, null, "main conflicting change");
	await checkAndRebaseWorkspaces(repoPath, workspaceId, defaultBranch, true);
	await ensureWorkspaceIndexed(repoPath, workspaceId, workspacePath);
	await assertConflicted(repoPath, workspaceId, ["README.md"]);

	const user = userEvent.setup();
	await captureBeforeAfter(
		user,
		{
			slug: "conflict-clear-rebase",
			repoPath,
			branchName,
			workspaceId,
			workspacePath,
			conflictFiles: ["README.md"],
			resolvedContent: { "README.md": "resolved rebase content\n" },
		},
		"resolve rebase conflict",
	);
}, 90000);

// ── 3. Add/add rebase conflict on a new file ─────────────────────────────────
it("clears add/add rebase conflict after resolve commit", async () => {
	const { repoPath, defaultBranch } = createTestRepo(false);
	openRepo(repoPath);
	const branchName = "feat/clear-add-add";
	const { workspaceId, workspacePath } = await createWorkspaceOnBranch(
		repoPath,
		branchName,
	);

	writeWorkspaceFile(workspacePath, "conflict.txt", "workspace version\n");
	await createCommit(repoPath, workspaceId, "workspace adds conflict.txt");
	writeWorkspaceFile(repoPath, "conflict.txt", "main version\n");
	await createCommit(repoPath, null, "main adds conflict.txt");
	await checkAndRebaseWorkspaces(repoPath, workspaceId, defaultBranch, true);
	await ensureWorkspaceIndexed(repoPath, workspaceId, workspacePath);
	await assertConflicted(repoPath, workspaceId, ["conflict.txt"]);

	const user = userEvent.setup();
	await captureBeforeAfter(
		user,
		{
			slug: "conflict-clear-add-add",
			repoPath,
			branchName,
			workspaceId,
			workspacePath,
			conflictFiles: ["conflict.txt"],
			resolvedContent: { "conflict.txt": "resolved add/add\n" },
		},
		"resolve add/add conflict",
	);
}, 90000);

// ── 4. Multi-file merge conflicts ────────────────────────────────────────────
it("clears multi-file merge conflicts after resolve commit", async () => {
	const { repoPath } = createTestRepo(false);
	openRepo(repoPath);
	const branchName = "feat/clear-multi-file";
	const { workspaceId, workspacePath } = await createWorkspaceOnBranch(
		repoPath,
		branchName,
	);

	writeWorkspaceFile(workspacePath, "a.txt", "ws a\n");
	writeWorkspaceFile(workspacePath, "z.txt", "ws z\n");
	await createCommit(repoPath, workspaceId, "workspace multi");
	const workspaceChangeId = resolveChangeId(workspacePath, "@-");

	writeWorkspaceFile(repoPath, "a.txt", "main a\n");
	writeWorkspaceFile(repoPath, "z.txt", "main z\n");
	await createCommit(repoPath, null, "main multi");
	const mainChangeId = resolveChangeId(repoPath, "@-");

	newCommitWithParents(workspacePath, [workspaceChangeId, mainChangeId]);
	await ensureWorkspaceIndexed(repoPath, workspaceId, workspacePath);
	await assertConflicted(repoPath, workspaceId, ["a.txt", "z.txt"]);

	const user = userEvent.setup();
	await captureBeforeAfter(
		user,
		{
			slug: "conflict-clear-multi-file",
			repoPath,
			branchName,
			workspaceId,
			workspacePath,
			conflictFiles: ["a.txt", "z.txt"],
			resolvedContent: { "a.txt": "resolved a\n", "z.txt": "resolved z\n" },
		},
		"resolve multi-file conflicts",
	);
}, 90000);

// ── 5. Nested path conflict ──────────────────────────────────────────────────
it("clears nested-path merge conflict after resolve commit", async () => {
	const { repoPath } = createTestRepo(false);
	openRepo(repoPath);
	const branchName = "feat/clear-nested";
	const { workspaceId, workspacePath } = await createWorkspaceOnBranch(
		repoPath,
		branchName,
	);

	writeWorkspaceFile(workspacePath, "src/deep/file.ts", "export const ws = 1;\n");
	await createCommit(repoPath, workspaceId, "workspace nested");
	const workspaceChangeId = resolveChangeId(workspacePath, "@-");

	writeWorkspaceFile(repoPath, "src/deep/file.ts", "export const main = 2;\n");
	await createCommit(repoPath, null, "main nested");
	const mainChangeId = resolveChangeId(repoPath, "@-");

	newCommitWithParents(workspacePath, [workspaceChangeId, mainChangeId]);
	await ensureWorkspaceIndexed(repoPath, workspaceId, workspacePath);
	await assertConflicted(repoPath, workspaceId, ["src/deep/file.ts"]);

	const user = userEvent.setup();
	await captureBeforeAfter(
		user,
		{
			slug: "conflict-clear-nested",
			repoPath,
			branchName,
			workspaceId,
			workspacePath,
			conflictFiles: ["src/deep/file.ts"],
			resolvedContent: {
				"src/deep/file.ts": "export const resolved = 3;\n",
			},
		},
		"resolve nested path conflict",
	);
}, 90000);

// ── 6. Committed-tip-only conflict (clean WC child) ──────────────────────────
it("clears committed-tip conflict after resolve commit", async () => {
	const { repoPath } = createTestRepo(false);
	openRepo(repoPath);
	const branchName = "feat/clear-committed-tip";
	const { workspaceId, workspacePath } = await createWorkspaceOnBranch(
		repoPath,
		branchName,
	);

	writeWorkspaceFile(workspacePath, "shared.txt", "workspace side\n");
	await createCommit(repoPath, workspaceId, "workspace shared");
	const workspaceChangeId = resolveChangeId(workspacePath, "@-");

	writeWorkspaceFile(repoPath, "shared.txt", "main side\n");
	await createCommit(repoPath, null, "main shared");
	const mainChangeId = resolveChangeId(repoPath, "@-");

	newCommitWithParents(workspacePath, [workspaceChangeId, mainChangeId]);
	// Point bookmark at conflicted tip, then create empty WC child so the
	// conflict lives only in committed history.
	execFileSync(
		"jj",
		[
			"bookmark",
			"set",
			branchName,
			"-r",
			"@",
			"--allow-backwards",
		],
		{ cwd: workspacePath, stdio: "pipe" },
	);
	execFileSync("jj", ["new", "@"], { cwd: workspacePath, stdio: "pipe" });
	await ensureWorkspaceIndexed(repoPath, workspaceId, workspacePath);
	await assertConflicted(repoPath, workspaceId, ["shared.txt"]);

	const user = userEvent.setup();
	await captureBeforeAfter(
		user,
		{
			slug: "conflict-clear-committed-tip",
			repoPath,
			branchName,
			workspaceId,
			workspacePath,
			conflictFiles: ["shared.txt"],
			resolvedContent: { "shared.txt": "resolved committed tip\n" },
		},
		"resolve committed-tip conflict",
	);
}, 90000);

// ── 7. Delete/modify conflict ────────────────────────────────────────────────
it("clears delete/modify conflict after resolve commit", async () => {
	const { repoPath } = createTestRepo(false);
	openRepo(repoPath);

	writeWorkspaceFile(repoPath, "victim.txt", "line1\nline2\n");
	await createCommit(repoPath, null, "base victim");

	const branchName = "feat/clear-delete-modify";
	const { workspaceId, workspacePath } = await createWorkspaceOnBranch(
		repoPath,
		branchName,
	);

	writeWorkspaceFile(workspacePath, "victim.txt", "line1\n");
	await createCommit(repoPath, workspaceId, "workspace shortens");
	const workspaceChangeId = resolveChangeId(workspacePath, "@-");

	fs.unlinkSync(path.join(repoPath, "victim.txt"));
	execFileSync("jj", ["commit", "-m", "main deletes"], {
		cwd: repoPath,
		stdio: "pipe",
	});
	const mainChangeId = resolveChangeId(repoPath, "@-");

	newCommitWithParents(workspacePath, [workspaceChangeId, mainChangeId]);
	await ensureWorkspaceIndexed(repoPath, workspaceId, workspacePath);
	await assertConflicted(repoPath, workspaceId, ["victim.txt"]);

	const user = userEvent.setup();
	await captureBeforeAfter(
		user,
		{
			slug: "conflict-clear-delete-modify",
			repoPath,
			branchName,
			workspaceId,
			workspacePath,
			conflictFiles: ["victim.txt"],
			resolvedContent: { "victim.txt": "kept after delete/modify\n" },
		},
		"resolve delete/modify conflict",
	);
}, 90000);

// ── 8. Remote sync / pull conflict ───────────────────────────────────────────
it("clears remote-sync conflict after resolve commit", async () => {
	const { repoPath, tempDirPath } = createTestRepo(true);
	openRepo(repoPath);
	const branchName = "feat/clear-remote-sync";
	const { workspaceId, workspacePath } = await createWorkspaceOnBranch(
		repoPath,
		branchName,
	);

	writeWorkspaceFile(workspacePath, "shared.txt", "base\n");
	await createCommit(repoPath, workspaceId, "shared base");
	await pushWorkspaceToRemote(repoPath, workspaceId);

	writeWorkspaceFile(workspacePath, "shared.txt", "local edit\n");
	await createCommit(repoPath, workspaceId, "local edit");

	remoteCommitOnBranch(
		tempDirPath,
		branchName,
		"shared.txt",
		"remote edit\n",
		"remote edit",
	);

	// Opening the workspace auto-rebases divergent remote tips into conflicts.
	const user = userEvent.setup();
	render(<Dashboard />);
	await user.click(await findSidebarBranchElement(branchName));
	await screen.findByTestId("show-workspace-header");
	await waitFor(
		async () => {
			const status = await getWorkspaceStatus(repoPath, workspaceId);
			expect(status.has_conflicts).toBe(true);
		},
		{ timeout: 15000 },
	);
	await screen.findByTestId(`workspace-conflict-indicator-${workspaceId}`);

	await navigateToReview(user, branchName);
	await screen.findByRole("button", { name: "Conflicts" });
	await captureDocument(document, {
		name: "conflict-clear-remote-sync-01-before-resolve-commit",
		expectations: [
			"The workspace sidebar shows a red conflict indicator for the remote-diverged branch.",
			'The Review tab shows a "Conflicts" section for the divergent same-file edit.',
			"A Commit button is available to land a local resolution.",
		],
	});

	await resolveAndCommitViaUi(
		user,
		{
			slug: "conflict-clear-remote-sync",
			repoPath,
			tempDirPath,
			branchName,
			workspaceId,
			workspacePath,
			conflictFiles: ["shared.txt"],
			resolvedContent: { "shared.txt": "resolved remote sync\n" },
		},
		"resolve remote sync conflict",
	);
	await assertConflictsCleared({
		slug: "conflict-clear-remote-sync",
		repoPath,
		branchName,
		workspaceId,
		workspacePath,
		conflictFiles: ["shared.txt"],
		resolvedContent: { "shared.txt": "resolved remote sync\n" },
	});
	await captureDocument(document, {
		name: "conflict-clear-remote-sync-02-after-resolve-commit",
		expectations: [
			"The workspace sidebar conflict indicator is gone after resolving the remote sync conflict.",
			'The Review tab no longer shows a "Conflicts" section.',
			'A "Commit created" toast confirms the resolve commit succeeded.',
		],
	});
}, 120000);

// ── 9. Stacked workspace conflict (child rebased onto conflicted parent edit) ─
it("clears stacked-workspace conflict after resolve commit", async () => {
	const { repoPath, defaultBranch } = createTestRepo(false);
	openRepo(repoPath);

	const parent = await createWorkspaceOnBranch(repoPath, "feat/clear-stack-parent");
	const child = await createWorkspaceOnBranch(
		repoPath,
		"feat/clear-stack-child",
		"feat/clear-stack-parent",
	);

	writeWorkspaceFile(child.workspacePath, "stack.txt", "child side\n");
	await createCommit(repoPath, child.workspaceId, "child edit");

	writeWorkspaceFile(repoPath, "stack.txt", "main side\n");
	await createCommit(repoPath, null, "main edit");
	await checkAndRebaseWorkspaces(
		repoPath,
		child.workspaceId,
		defaultBranch,
		true,
	);
	await ensureWorkspaceIndexed(
		repoPath,
		child.workspaceId,
		child.workspacePath,
	);
	await assertConflicted(repoPath, child.workspaceId, ["stack.txt"]);

	const user = userEvent.setup();
	await captureBeforeAfter(
		user,
		{
			slug: "conflict-clear-stacked",
			repoPath,
			branchName: "feat/clear-stack-child",
			workspaceId: child.workspaceId,
			workspacePath: child.workspacePath,
			conflictFiles: ["stack.txt"],
			resolvedContent: { "stack.txt": "resolved stacked\n" },
		},
		"resolve stacked conflict",
	);
	void parent;
}, 90000);

// ── 10. Resolve keeping workspace-side content (content permutation) ─────────
it("clears rebase conflict when resolving to workspace-side content", async () => {
	const { repoPath, defaultBranch } = createTestRepo(false);
	openRepo(repoPath);
	const branchName = "feat/clear-keep-ws";
	const { workspaceId, workspacePath } = await createWorkspaceOnBranch(
		repoPath,
		branchName,
	);

	writeWorkspaceFile(workspacePath, "README.md", "workspace side\n");
	await createCommit(repoPath, workspaceId, "workspace conflicting change");
	writeWorkspaceFile(repoPath, "README.md", "main side\n");
	await createCommit(repoPath, null, "main conflicting change");
	await checkAndRebaseWorkspaces(repoPath, workspaceId, defaultBranch, true);
	await ensureWorkspaceIndexed(repoPath, workspaceId, workspacePath);
	await assertConflicted(repoPath, workspaceId, ["README.md"]);

	const user = userEvent.setup();
	await captureBeforeAfter(
		user,
		{
			slug: "conflict-clear-keep-workspace-side",
			repoPath,
			branchName,
			workspaceId,
			workspacePath,
			conflictFiles: ["README.md"],
			resolvedContent: { "README.md": "workspace side\n" },
		},
		"keep workspace side",
	);
}, 90000);

// ── 11. Resolve keeping main-side content (content permutation) ──────────────
it("clears rebase conflict when resolving to main-side content", async () => {
	const { repoPath, defaultBranch } = createTestRepo(false);
	openRepo(repoPath);
	const branchName = "feat/clear-keep-main";
	const { workspaceId, workspacePath } = await createWorkspaceOnBranch(
		repoPath,
		branchName,
	);

	writeWorkspaceFile(workspacePath, "README.md", "workspace side\n");
	await createCommit(repoPath, workspaceId, "workspace conflicting change");
	writeWorkspaceFile(repoPath, "README.md", "main side\n");
	await createCommit(repoPath, null, "main conflicting change");
	await checkAndRebaseWorkspaces(repoPath, workspaceId, defaultBranch, true);
	await ensureWorkspaceIndexed(repoPath, workspaceId, workspacePath);
	await assertConflicted(repoPath, workspaceId, ["README.md"]);

	const user = userEvent.setup();
	await captureBeforeAfter(
		user,
		{
			slug: "conflict-clear-keep-main-side",
			repoPath,
			branchName,
			workspaceId,
			workspacePath,
			conflictFiles: ["README.md"],
			resolvedContent: { "README.md": "main side\n" },
		},
		"keep main side",
	);
}, 90000);

// ── 12. Two sequential conflicts resolved by successive commits ──────────────
it("clears a second conflict that appears after the first was resolved", async () => {
	const { repoPath, defaultBranch } = createTestRepo(false);
	openRepo(repoPath);
	const branchName = "feat/clear-sequential";
	const { workspaceId, workspacePath } = await createWorkspaceOnBranch(
		repoPath,
		branchName,
	);

	writeWorkspaceFile(workspacePath, "first.txt", "ws first\n");
	await createCommit(repoPath, workspaceId, "workspace first");
	writeWorkspaceFile(repoPath, "first.txt", "main first\n");
	await createCommit(repoPath, null, "main first");
	await checkAndRebaseWorkspaces(repoPath, workspaceId, defaultBranch, true);
	await ensureWorkspaceIndexed(repoPath, workspaceId, workspacePath);
	await assertConflicted(repoPath, workspaceId, ["first.txt"]);

	const user = userEvent.setup();
	render(<Dashboard />);
	await screen.findByTestId(`workspace-conflict-indicator-${workspaceId}`);
	await navigateToReview(user, branchName);
	await screen.findByRole("button", { name: "Conflicts" });
	await captureDocument(document, {
		name: "conflict-clear-sequential-01-first-conflict",
		expectations: [
			'The Review tab shows a "Conflicts" section for first.txt.',
			"The workspace sidebar shows a conflict indicator before the first resolve.",
		],
	});

	await resolveAndCommitViaUi(
		user,
		{
			slug: "conflict-clear-sequential",
			repoPath,
			branchName,
			workspaceId,
			workspacePath,
			conflictFiles: ["first.txt"],
			resolvedContent: { "first.txt": "resolved first\n" },
		},
		"resolve first conflict",
	);
	await assertConflictsCleared({
		slug: "conflict-clear-sequential",
		repoPath,
		branchName,
		workspaceId,
		workspacePath,
		conflictFiles: ["first.txt"],
		resolvedContent: { "first.txt": "resolved first\n" },
	});

	// Introduce a second conflict on a different file.
	writeWorkspaceFile(workspacePath, "second.txt", "ws second\n");
	await createCommit(repoPath, workspaceId, "workspace second");
	writeWorkspaceFile(repoPath, "second.txt", "main second\n");
	await createCommit(repoPath, null, "main second");
	await checkAndRebaseWorkspaces(repoPath, workspaceId, defaultBranch, true);
	await ensureWorkspaceIndexed(repoPath, workspaceId, workspacePath);
	await assertConflicted(repoPath, workspaceId, ["second.txt"]);

	await waitFor(() => {
		expect(
			document.querySelector(
				`[data-testid="workspace-conflict-indicator-${workspaceId}"]`,
			),
		).not.toBeNull();
	});
	await navigateToReview(user, branchName);
	await screen.findByRole("button", { name: "Conflicts" });
	await captureDocument(document, {
		name: "conflict-clear-sequential-02-second-conflict",
		expectations: [
			'After a new divergence, the Review "Conflicts" section is back for second.txt.',
			"The sidebar conflict indicator has reappeared for the second conflict.",
		],
	});

	await resolveAndCommitViaUi(
		user,
		{
			slug: "conflict-clear-sequential",
			repoPath,
			branchName,
			workspaceId,
			workspacePath,
			conflictFiles: ["second.txt"],
			resolvedContent: { "second.txt": "resolved second\n" },
		},
		"resolve second conflict",
	);
	await assertConflictsCleared({
		slug: "conflict-clear-sequential",
		repoPath,
		branchName,
		workspaceId,
		workspacePath,
		conflictFiles: ["second.txt"],
		resolvedContent: { "second.txt": "resolved second\n" },
	});
	await captureDocument(document, {
		name: "conflict-clear-sequential-03-after-second-resolve",
		expectations: [
			"After resolving the second conflict, the sidebar conflict indicator is gone again.",
			'The Review tab no longer shows a "Conflicts" section.',
			'A "Commit created" toast is visible for the second resolve commit.',
		],
	});
}, 120000);
