import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import {
	createTestRepo,
	openRepo,
	resolveWorkspacePath,
	writeWorkspaceFile,
} from "../../utils";
import {
	createCommit,
	createWorkspace,
	getWorkspaces,
	switchRepoBranch,
} from "../../../src/lib/api";

function getCommitId(cwd: string, revset: string): string {
	return execFileSync("jj", ["log", "-r", revset, "--no-graph", "-T", "commit_id"], {
		cwd,
		encoding: "utf8",
	}).trim();
}

describe("default-branch workspace sync after home commit", () => {
	it("syncs same-branch workspace tip when committing in home repo", async () => {
		const { repoPath } = createTestRepo(false);
		openRepo(repoPath);

		const workspaceId = await createWorkspace(repoPath, "main");
		const workspace = (await getWorkspaces(repoPath)).find((w) => w.id === workspaceId);
		expect(workspace).toBeTruthy();
		const workspacePath = resolveWorkspacePath(repoPath, workspace!.workspace_path);
		await switchRepoBranch(repoPath, "main");

		const beforeMain = getCommitId(repoPath, "main");
		const beforeWorkspaceMain = getCommitId(workspacePath, "main");
		expect(beforeWorkspaceMain).toEqual(beforeMain);

		writeWorkspaceFile(repoPath, "home-sync.txt", "home sync commit\n", true);
		await createCommit(repoPath, null, "home commit updates main");

		const afterMain = getCommitId(repoPath, "main");
		expect(afterMain).not.toEqual(beforeMain);

		const afterWorkspaceMain = getCommitId(workspacePath, "main");
		expect(afterWorkspaceMain).toEqual(afterMain);
	});

	it("does not overwrite workspace working copy when it has local uncommitted changes", async () => {
		const { repoPath } = createTestRepo(false);
		openRepo(repoPath);

		const workspaceId = await createWorkspace(repoPath, "main");
		const workspace = (await getWorkspaces(repoPath)).find((w) => w.id === workspaceId);
		expect(workspace).toBeTruthy();
		const workspacePath = resolveWorkspacePath(repoPath, workspace!.workspace_path);
		await switchRepoBranch(repoPath, "main");

		writeWorkspaceFile(workspacePath, "dirty.txt", "dirty workspace content\n", true);
		const workspaceAtBefore = getCommitId(workspacePath, "@");

		writeWorkspaceFile(repoPath, "home-dirty-safe-sync.txt", "home commit\n", true);
		await createCommit(repoPath, null, "home commit with dirty workspace");

		const mainAfter = getCommitId(repoPath, "main");
		const workspaceMainAfter = getCommitId(workspacePath, "main");
		expect(workspaceMainAfter).toEqual(mainAfter);

		const workspaceAtAfter = getCommitId(workspacePath, "@");
		expect(workspaceAtAfter).toEqual(workspaceAtBefore);
	});
});
