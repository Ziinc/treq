import userEvent from "@testing-library/user-event";
import * as React from "react";
import { expect, it } from "vitest";
import { Dashboard } from "../../../src/components/Dashboard";
import { createCommit, getWorkspaces } from "../../../src/lib/api";
import { render, screen, waitFor, within } from "../../../test/test-utils";
import {
	commitWorkspaceFile,
	createTestRepo,
	openRepo,
	resolveWorkspacePath,
	writeWorkspaceFile,
} from "../../../test/utils";
import { captureDocument } from "../capture";

const PARENT_BRANCH = "feat/stack-parent";
const CHILD_BRANCH = "feat/stack-child";

// Scenario: the user creates a workspace from the home repo, then stacks a
// second workspace on top of it via the workspace header's own "Stack"
// button (not createWorkspace()+setWorkspaceTargetBranch -- workspace
// creation and stacking are the behavior under test, so both go through the
// real dialogs). Captures the child workspace's Code tab (showing the new
// stack panel) and the view after clicking the parent in that panel.
it("captures the stack panel and navigation to a sibling workspace", async () => {
	const { repoPath } = createTestRepo(false);
	openRepo(repoPath);

	const user = userEvent.setup();
	render(<Dashboard />);

	// Create the parent workspace from the home repo header's "Stack" button.
	await screen.findByTestId("show-workspace-header");
	await user.click(await screen.findByRole("button", { name: "Stack" }));

	let dialog = await screen.findByTestId("modal");
	await user.type(within(dialog).getByLabelText("Branch Name"), PARENT_BRANCH);
	await user.click(
		within(dialog).getByRole("button", { name: "Create Workspace" }),
	);
	await waitFor(() => {
		expect(screen.queryByTestId("modal")).not.toBeInTheDocument();
	});

	let header = await screen.findByTestId("show-workspace-header");
	await within(header).findByText(PARENT_BRANCH);

	// From the parent workspace's own header, stack a child workspace on top
	// of it -- the same "Stack" button, now scoped to this workspace.
	await user.click(await screen.findByRole("button", { name: "Stack" }));

	dialog = await screen.findByTestId("modal");
	await user.type(within(dialog).getByLabelText("Branch Name"), CHILD_BRANCH);
	await user.click(
		within(dialog).getByRole("button", { name: "Create Workspace" }),
	);
	await waitFor(() => {
		expect(screen.queryByTestId("modal")).not.toBeInTheDocument();
	});

	header = await screen.findByTestId("show-workspace-header");
	await within(header).findByText(CHILD_BRANCH);

	// Give each workspace a real commit of a different size (2 vs. 10 inserted
	// lines) so the panel's diff bars are visibly different widths, scaled
	// relative to the largest change in the stack. Uses the test-utils helper
	// (incidental background state, not itself the tested behavior) like
	// commits-tab-after-push.spec.tsx does.
	const workspaces = await getWorkspaces(repoPath);
	const parent = workspaces.find(
		(candidate) => candidate.branch_name === PARENT_BRANCH,
	);
	const child = workspaces.find(
		(candidate) => candidate.branch_name === CHILD_BRANCH,
	);
	if (!parent || !child) {
		throw new Error(`Expected ${PARENT_BRANCH} and ${CHILD_BRANCH} to exist`);
	}
	await commitWorkspaceFile(
		repoPath,
		{ id: parent.id, path: parent.workspace_path },
		"parent-feature.txt",
		"parent line one\nparent line two",
		"Add parent feature file",
	);
	await commitWorkspaceFile(
		repoPath,
		{ id: child.id, path: child.workspace_path },
		"child-feature.txt",
		Array.from({ length: 10 }, (_, i) => `child line ${i + 1}`).join("\n"),
		"Add child feature file",
	);
	// Truncate the file down to 4 lines so this commit is a pure deletion,
	// giving the child workspace both insertions (+10, from above) and
	// deletions (-6) -- enough to show both sides of the diff bar.
	const childWorkspacePath = resolveWorkspacePath(
		repoPath,
		child.workspace_path,
	);
	writeWorkspaceFile(
		childWorkspacePath,
		"child-feature.txt",
		`${Array.from({ length: 4 }, (_, i) => `child line ${i + 1}`).join("\n")}\n`,
		false,
	);
	await createCommit(repoPath, child.id, "Trim child feature file");

	// The stack panel's per-workspace commit query already fired once (with
	// zero commits) when the child workspace was first selected above, and
	// nothing re-fetches it just by re-selecting the same workspace. Navigate
	// to the home repo and back to fully remount the panel so it picks up the
	// commit made above.
	await user.click(await screen.findByTestId("home-repo-row"));
	await user.click(await screen.findByText(CHILD_BRANCH));

	const panel = await screen.findByTestId("workspace-stack-panel");
	await within(panel).findByText(PARENT_BRANCH);
	const childItem = within(panel)
		.getByText(CHILD_BRANCH)
		.closest("button") as HTMLElement;
	const parentItem = within(panel)
		.getByText(PARENT_BRANCH)
		.closest("button") as HTMLElement;
	await waitFor(() => {
		expect(childItem.textContent).toMatch(/\+10/);
		expect(childItem.textContent).toMatch(/-6/);
		expect(parentItem.textContent).toMatch(/\+2/);
	});

	await captureDocument(document, {
		name: "stacked-workspace-panel-01-child-view",
		expectations: [
			`In the Code tab's main column, a bordered "Stack" panel reading "1 of 2" appears below the task/prompt input box and above the "Go to file" search row and file list.`,
			`The stack panel lists two items, top-to-bottom: "${CHILD_BRANCH}" and "${PARENT_BRANCH}", with the target branch below them at the bottom of the list.`,
			`Each item shows a small diff bar with a green "+N" number on its left, a thin vertical axis line in the middle, and a red "-N" number on its right; "${CHILD_BRANCH}" reads "+10" / "-6" with both a green segment left of the axis and a red segment right of it, while "${PARENT_BRANCH}" reads "+2" / "-0" with only a short green segment and no red segment.`,
		],
	});

	// Click the parent item in the stack panel to navigate to it.
	await user.click(within(panel).getByText(PARENT_BRANCH));
	header = await screen.findByTestId("show-workspace-header");
	await within(header).findByText(PARENT_BRANCH);
	await waitFor(() => {
		expect(
			screen.queryByTestId("workspace-stack-panel"),
		).not.toBeInTheDocument();
	});

	await captureDocument(document, {
		name: "stacked-workspace-panel-02-after-navigate-to-parent",
		expectations: [
			`The header's branch name now reads "${PARENT_BRANCH}" (navigated away from ${CHILD_BRANCH}).`,
			"No stack panel is visible in the Code tab's main column -- this workspace targets the default branch directly, so it has no workspace ancestor to show a stack for.",
		],
	});
}, 60000);
