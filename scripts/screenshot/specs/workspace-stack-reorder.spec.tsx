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
	createTestRepo,
	findSidebarBranchElement,
	openRepo,
} from "../../../test/utils";
import { captureDocument } from "../capture";

const PARENT = "feat/reorder-parent";
const CHILD = "feat/reorder-child";

it("captures sidebar stack before and after parent/child reorder", async () => {
	const { repoPath } = createTestRepo(false);
	openRepo(repoPath);

	await createWorkspace(repoPath, PARENT);
	await createWorkspace(repoPath, CHILD);

	const initial = await getWorkspaces(repoPath);
	const child = initial.find((w) => w.branch_name === CHILD)!;
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

	const sidebar = document.querySelector(
		`.${CSS.escape("group/sidebar")}`,
	) as HTMLElement;
	expect(sidebar).toBeTruthy();

	await captureDocument(document, {
		name: "workspace-stack-reorder-01-before",
		expectations: [
			"Sidebar lists feat/reorder-parent at the root of a stack.",
			"feat/reorder-child appears indented under feat/reorder-parent.",
			"No error toast is visible.",
		],
	});

	await user.click(await findSidebarBranchElement(PARENT));

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
			"Sidebar shows feat/reorder-child above feat/reorder-parent (child is now the stack root).",
			"Header target reads feat/reorder-child (parent now stacks onto child).",
			"A green success toast says the workspace rebased onto feat/reorder-child — no cycle error.",
		],
	});
}, 60000);
