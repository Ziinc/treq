import * as React from "react";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { expect, it } from "vitest";
import userEvent from "@testing-library/user-event";
import {
	createTestRepo,
	findSidebarBranchElement,
	openRepo,
	resolveWorkspacePath,
	writeWorkspaceFile,
} from "../../../test/utils";
import { render, screen, waitFor } from "../../../test/test-utils";
import { Dashboard } from "../../../src/components/Dashboard";
import {
	createCommit,
	createWorkspace,
	getWorkspaces,
	pushWorkspaceToRemote,
} from "../../../src/lib/api";
import { captureDocument } from "../capture";

const BRANCH_NAME = "feat/sync-remote-conflict";

/** Commit on a branch in the bare remote without touching the local repo. */
function remoteCommitOnBranch(
	tempDirPath: string,
	branchName: string,
	relativePath: string,
	content: string,
	message: string,
) {
	const remotePath = path.join(tempDirPath, "remote.git");
	const clonePath = path.join(tempDirPath, "remote_clone_branch");
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

// After Sync against a diverged remote that edits the same file, ShowWorkspace
// must materialize conflicts on the bookmark tip and show the conflict alert
// so the user can resolve locally and push — instead of Sync looking InSync.
it("captures Sync surfacing remote same-file conflicts for local resolve", async () => {
	const { repoPath, tempDirPath } = createTestRepo(true);
	openRepo(repoPath);

	const workspaceId = await createWorkspace(repoPath, BRANCH_NAME);
	const workspace = (await getWorkspaces(repoPath)).find(
		(candidate) => candidate.id === workspaceId,
	);
	if (!workspace) {
		throw new Error(`Expected ${BRANCH_NAME} workspace to exist`);
	}
	const workspacePath = resolveWorkspacePath(
		repoPath,
		workspace.workspace_path,
	);

	writeWorkspaceFile(workspacePath, "shared.txt", "base\n");
	await createCommit(repoPath, workspaceId, "shared base");
	await pushWorkspaceToRemote(repoPath, workspaceId);

	writeWorkspaceFile(workspacePath, "shared.txt", "local edit\n");
	await createCommit(repoPath, workspaceId, "local edit");

	remoteCommitOnBranch(
		tempDirPath,
		BRANCH_NAME,
		"shared.txt",
		"remote edit\n",
		"remote edit",
	);

	const user = userEvent.setup();
	render(<Dashboard />);

	await user.click(await findSidebarBranchElement(BRANCH_NAME));
	await screen.findByTestId("show-workspace-header");

	// Opening the workspace fetches/auto-rebases divergent remote tips, which
	// materializes same-file conflicts onto the bookmark for local resolve.
	await waitFor(
		() => {
			expect(screen.getByRole("alert")).toHaveTextContent(/1 conflict detected/i);
			expect(
				screen.getByTestId(`workspace-conflict-indicator-${workspaceId}`),
			).toBeInTheDocument();
		},
		{ timeout: 20000 },
	);

	await captureDocument(document, {
		name: "sync-remote-conflict-01-conflicts-visible",
		expectations: [
			'A red "1 conflict detected" alert is visible in the Code tab.',
			"The sidebar shows a conflict indicator on the workspace.",
		],
	});

	await user.click(await screen.findByRole("tab", { name: /^Review/ }));
	await screen.findByRole("tab", { name: /^Review/, selected: true });

	await screen.findByRole("button", { name: "Conflicts" });

	await captureDocument(document, {
		name: "sync-remote-conflict-02-review-conflicts",
		expectations: [
			'The Review tab shows a "Conflicts" section listing shared.txt.',
			"The conflicted file is available for local resolution before push.",
		],
	});
}, 90000);
