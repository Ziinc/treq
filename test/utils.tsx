import { createCommit } from "../src/lib/api";
import path from "node:path";
import { expect } from "vitest";
import { waitFor, within } from "./test-utils";

export function openRepo(repoPath: string) {
	// Point the app at a repo via the URL search param it reads
	window.history.pushState({}, "", `?repo=${encodeURIComponent(repoPath)}`);
}

type NapiTestBindings = {
	createTestRepo: (withRemote: boolean) => {
		repoPath: string;
		tempDirPath: string;
	};
	writeWorkspaceFile: (
		workspacePath: string,
		relativePath: string,
		content: string,
		append?: boolean,
	) => string;
	writeRepoFile: (
		repoPath: string,
		relativePath: string,
		content: string,
		append?: boolean,
	) => string;
};

function getNapiBindings(): NapiTestBindings {
	// eslint-disable-next-line @typescript-eslint/no-require-imports
	return require("../crates/treq-napi") as NapiTestBindings;
}

export function createTestRepo(withRemote = false): {
	repoPath: string;
	tempDirPath: string;
} {
	return getNapiBindings().createTestRepo(withRemote);
}

export function writeWorkspaceFile(
	workspacePath: string,
	relativePath: string,
	content: string,
	append = false,
): string {
	return getNapiBindings().writeWorkspaceFile(
		workspacePath,
		relativePath,
		content,
		append,
	);
}

export function resolveWorkspacePath(
	repoPath: string,
	workspacePath: string,
): string {
	if (path.isAbsolute(workspacePath)) {
		return workspacePath;
	}
	return path.join(repoPath, ".treq", "workspaces", workspacePath);
}

export function writeRepoFile(
	repoPath: string,
	relativePath: string,
	content: string,
	append = false,
): string {
	return getNapiBindings().writeRepoFile(
		repoPath,
		relativePath,
		content,
		append,
	);
}

export async function commitRepoFile(
	repoPath: string,
	relativePath: string,
	content: string,
	message: string,
): Promise<void> {
	writeRepoFile(repoPath, relativePath, `${content}\n`, true);
	await createCommit(repoPath, null, message);
}

export async function commitWorkspaceFile(
	repoPath: string,
	workspace: { id: number; path: string },
	relativePath: string,
	content: string,
	message: string,
): Promise<void> {
	const workspacePath = resolveWorkspacePath(repoPath, workspace.path);
	writeWorkspaceFile(workspacePath, relativePath, `${content}\n`, true);
	await createCommit(repoPath, workspace.id, message);
}

// Helper: wait for sidebar to show branch name, then return the first matching element
export async function findSidebarBranchElement(
	branchName: string,
): Promise<HTMLElement> {
	const sidebarRoot = document.querySelector(
		`.${CSS.escape("group/sidebar")}`,
	) as HTMLElement;
	await waitFor(() => {
		expect(within(sidebarRoot).getAllByText(branchName).length).toBeGreaterThan(
			0,
		);
	});
	return within(sidebarRoot).getAllByText(branchName)[0];
}
