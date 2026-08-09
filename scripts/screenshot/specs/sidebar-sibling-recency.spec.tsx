import userEvent from "@testing-library/user-event";
import * as React from "react";
import { expect, it } from "vitest";
import { Dashboard } from "../../../src/components/Dashboard";
import {
	createWorkspace,
	getWorkspaces,
	setWorkspaceTargetBranch,
} from "../../../src/lib/api";
import { getFullWorkspacePath } from "../../../src/lib/utils";
import { render, screen, within } from "../../../test/test-utils";
import {
	commitWorkspaceFile,
	createTestRepo,
	findSidebarBranchElement,
	openRepo,
} from "../../../test/utils";
import { captureDocument } from "../capture";

const ROOT_A = "feat/root-a";
const ROOT_B = "feat/root-b";
const CHILD_OLD = "feat/child-old";
const CHILD_NEW = "feat/child-new";

function sleep(ms: number) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function sidebarBranchOrder(): string[] {
	const sidebar = document.querySelector(
		`.${CSS.escape("group/sidebar")}`,
	) as HTMLElement;
	expect(sidebar).toBeTruthy();
	const labels = [ROOT_B, ROOT_A, CHILD_NEW, CHILD_OLD];
	const elements = labels.map((name) => within(sidebar).getAllByText(name)[0]);
	return [...elements]
		.sort((left, right) =>
			left.compareDocumentPosition(right) & Node.DOCUMENT_POSITION_FOLLOWING
				? -1
				: 1,
		)
		.map((el) => el.textContent?.trim() ?? "");
}

it("captures sidebar siblings ordered by tip activity within stacks", async () => {
	const { repoPath } = createTestRepo(false);
	openRepo(repoPath);

	await createWorkspace(repoPath, ROOT_A);
	await createWorkspace(repoPath, ROOT_B);
	await createWorkspace(repoPath, CHILD_OLD);
	await createWorkspace(repoPath, CHILD_NEW);

	const initial = await getWorkspaces(repoPath);
	const byBranch = (name: string) =>
		initial.find((workspace) => workspace.branch_name === name)!;

	const rootA = byBranch(ROOT_A);
	const rootB = byBranch(ROOT_B);
	const childOld = byBranch(CHILD_OLD);
	const childNew = byBranch(CHILD_NEW);

	await setWorkspaceTargetBranch(
		repoPath,
		getFullWorkspacePath(childOld),
		childOld.id,
		ROOT_A,
	);
	await setWorkspaceTargetBranch(
		repoPath,
		getFullWorkspacePath(childNew),
		childNew.id,
		ROOT_A,
	);

	// Older activity first, then a pause so tip timestamps diverge.
	await commitWorkspaceFile(
		repoPath,
		{ id: rootA.id, path: rootA.workspace_path },
		"root-a.txt",
		"root a\n",
		"Root A commit",
	);
	await commitWorkspaceFile(
		repoPath,
		{ id: childOld.id, path: childOld.workspace_path },
		"child-old.txt",
		"old\n",
		"Child old commit",
	);
	await sleep(1100);
	await commitWorkspaceFile(
		repoPath,
		{ id: childNew.id, path: childNew.workspace_path },
		"child-new.txt",
		"new\n",
		"Child new commit",
	);
	await commitWorkspaceFile(
		repoPath,
		{ id: rootB.id, path: rootB.workspace_path },
		"root-b.txt",
		"root b\n",
		"Root B commit",
	);

	const user = userEvent.setup();
	render(<Dashboard />);

	await findSidebarBranchElement(ROOT_B);
	await findSidebarBranchElement(ROOT_A);
	await findSidebarBranchElement(CHILD_NEW);
	await findSidebarBranchElement(CHILD_OLD);

	expect(sidebarBranchOrder()).toEqual([ROOT_B, ROOT_A, CHILD_NEW, CHILD_OLD]);

	await captureDocument(document, {
		name: "sidebar-sibling-recency-01-ordered",
		expectations: [
			"Sidebar lists feat/root-b above feat/root-a (newer root tip first).",
			"Under feat/root-a, feat/child-new appears above feat/child-old while staying nested.",
			"Stack nesting remains: children are indented under feat/root-a, not flattened to roots.",
		],
	});

	await user.click(await findSidebarBranchElement(ROOT_A));
	await screen.findByText("Root A commit");
}, 60000);
