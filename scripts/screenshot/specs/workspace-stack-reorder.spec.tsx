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
import { render, screen, waitFor, within } from "../../../test/test-utils";
import {
	commitWorkspaceFile,
	createTestRepo,
	findSidebarBranchElement,
	openRepo,
} from "../../../test/utils";
import { captureDocument } from "../capture";

const PARENT = "feat/reorder-parent";
const CHILD = "feat/reorder-child";

it("captures sidebar stack before and after parent/child reorder", async () => {
	const { repoPath, defaultBranch } = createTestRepo(false);
	openRepo(repoPath);

	// Default-branch workspace (sidebar bookkeeping) plus a two-level stack.
	// Each of the three workspaces gets a real commit.
	await createWorkspace(repoPath, defaultBranch);
	await createWorkspace(repoPath, PARENT);
	await createWorkspace(repoPath, CHILD);

	const initial = await getWorkspaces(repoPath);
	const defaultWs = initial.find((w) => w.branch_name === defaultBranch)!;
	const parent = initial.find((w) => w.branch_name === PARENT)!;
	const child = initial.find((w) => w.branch_name === CHILD)!;
	expect(defaultWs).toBeTruthy();
	expect(parent).toBeTruthy();
	expect(child).toBeTruthy();

	await commitWorkspaceFile(
		repoPath,
		{ id: defaultWs.id, path: defaultWs.workspace_path },
		"default-branch.txt",
		"default branch commit",
		"Default branch commit",
	);
	await commitWorkspaceFile(
		repoPath,
		{ id: parent.id, path: parent.workspace_path },
		"parent.txt",
		"parent commit content",
		"Parent commit",
	);
	await commitWorkspaceFile(
		repoPath,
		{ id: child.id, path: child.workspace_path },
		"child.txt",
		"child commit content",
		"Child commit",
	);

	await setWorkspaceTargetBranch(
		repoPath,
		getFullWorkspacePath(child),
		child.id,
		PARENT,
	);

	const user = userEvent.setup();
	render(<Dashboard />);

	await screen.findByText(PARENT);
	await screen.findByText(CHILD);

	// View the child so the stack panel mounts (it ignores the default-branch
	// workspace as an ancestor) and remount after commits like the stacked
	// panel screenshot spec does.
	await user.click(await findSidebarBranchElement(CHILD));
	await user.click(await screen.findByTestId("home-repo-row"));
	await user.click(await findSidebarBranchElement(CHILD));

	const panel = await screen.findByTestId("workspace-stack-panel");
	await within(panel).findByText(PARENT);
	await within(panel).findByText(CHILD);
	await screen.findByText("Child commit");

	const sidebar = document.querySelector(
		`.${CSS.escape("group/sidebar")}`,
	) as HTMLElement;
	expect(sidebar).toBeTruthy();

	await captureDocument(document, {
		name: "workspace-stack-reorder-01-before",
		expectations: [
			"Sidebar lists the default-branch workspace plus feat/reorder-parent with feat/reorder-child nested under it.",
			"Stack panel shows child above parent with +1 change counts; commits panel lists Child commit.",
			"No error toast is visible.",
		],
	});

	await user.click(await findSidebarBranchElement(PARENT));
	await screen.findByText("Parent commit");

	const targetBtn = await screen.findByRole("button", {
		name: "Workspace target",
	});
	await waitFor(() => expect(targetBtn).not.toBeDisabled());
	await user.click(targetBtn);

	await user.click(
		await screen.findByText(CHILD, {
			selector: ".branch-list-item *",
		}),
	);

	await waitFor(async () => {
		const after = await getWorkspaces(repoPath);
		expect(after.find((w) => w.branch_name === PARENT)?.target_branch).toBe(
			CHILD,
		);
	});

	await screen.findByText(/Rebased successfully/i);
	await within(sidebar).findByText(CHILD);
	await within(sidebar).findByText(PARENT);

	await captureDocument(document, {
		name: "workspace-stack-reorder-02-after",
		expectations: [
			"Sidebar still lists the default-branch workspace; feat/reorder-child sits above indented feat/reorder-parent.",
			"Header target reads feat/reorder-child; stack panel shows parent stacked on child with +1 counts.",
			"A green success toast says the workspace rebased onto feat/reorder-child — no cycle error.",
		],
	});
}, 60000);
