import userEvent from "@testing-library/user-event";
import * as React from "react";
import { expect, it } from "vitest";
import { Dashboard } from "../../../src/components/Dashboard";
import { getWorkspaces } from "../../../src/lib/api";
import { render, screen, waitFor, within } from "../../../test/test-utils";
import {
	commitWorkspaceFile,
	createTestRepo,
	openRepo,
} from "../../../test/utils";
import { captureDocument } from "../capture";

const PARENT_BRANCH = "feat/stack-parent";
const CHILD_BRANCH = "feat/stack-child";
const GRANDCHILD_BRANCH = "feat/stack-grandchild";

function linesOfContent(count: number, label: string): string {
	return Array.from({ length: count }, (_, i) => `${label} line ${i + 1}`).join(
		"\n",
	);
}

async function stackBranchOnCurrentWorkspace(
	user: ReturnType<typeof userEvent.setup>,
	branchName: string,
) {
	await user.click(await screen.findByRole("button", { name: "Stack" }));
	const dialog = await screen.findByTestId("modal");
	await user.type(within(dialog).getByLabelText("Branch Name"), branchName);
	await user.click(
		within(dialog).getByRole("button", { name: "Create Workspace" }),
	);
	await waitFor(() => {
		expect(screen.queryByTestId("modal")).not.toBeInTheDocument();
	});
	const header = await screen.findByTestId("show-workspace-header");
	await within(header).findByText(branchName);
}

// Scenario: the user creates a three-level stack -- parent (on the default
// branch), child (on parent), grandchild (on child) -- each via the real
// "Stack" button/dialog (not createWorkspace()+setWorkspaceTargetBranch,
// since workspace creation and stacking are the behavior under test). Each
// workspace gets a differently-sized real commit so the stack panel's
// insertions/deletions bar chart has visibly different bar widths to check.
// Captures the grandchild's Code tab (showing the full stack) and the view
// after clicking the parent in that panel.
it("captures the stack panel ordered target-first with diff bars, and navigation to a sibling workspace", async () => {
	const { repoPath, defaultBranch } = createTestRepo(false);
	openRepo(repoPath);

	const user = userEvent.setup();
	render(<Dashboard />);

	// Create the parent workspace from the home repo header's "Stack" button.
	await screen.findByTestId("show-workspace-header");
	await stackBranchOnCurrentWorkspace(user, PARENT_BRANCH);

	// From the parent workspace's own header, stack a child workspace on top
	// of it -- the same "Stack" button, now scoped to this workspace.
	await stackBranchOnCurrentWorkspace(user, CHILD_BRANCH);

	// From the child workspace's own header, stack a grandchild on top of it.
	await stackBranchOnCurrentWorkspace(user, GRANDCHILD_BRANCH);

	// Give each workspace a real commit of a different size (2, 8, and 20
	// inserted lines) so the panel's diff bars are visibly different widths,
	// scaled relative to the largest change in the stack (the grandchild's).
	const workspaces = await getWorkspaces(repoPath);
	const parent = workspaces.find((ws) => ws.branch_name === PARENT_BRANCH);
	const child = workspaces.find((ws) => ws.branch_name === CHILD_BRANCH);
	const grandchild = workspaces.find(
		(ws) => ws.branch_name === GRANDCHILD_BRANCH,
	);
	if (!parent || !child || !grandchild) {
		throw new Error("Expected all three stacked workspaces to exist");
	}
	await commitWorkspaceFile(
		repoPath,
		{ id: parent.id, path: parent.workspace_path },
		"parent-feature.txt",
		linesOfContent(2, "parent"),
		"Add parent feature file",
	);
	await commitWorkspaceFile(
		repoPath,
		{ id: child.id, path: child.workspace_path },
		"child-feature.txt",
		linesOfContent(8, "child"),
		"Add child feature file",
	);
	await commitWorkspaceFile(
		repoPath,
		{ id: grandchild.id, path: grandchild.workspace_path },
		"grandchild-feature.txt",
		linesOfContent(20, "grandchild"),
		"Add grandchild feature file",
	);

	// The stack panel's per-workspace commit query already fired once (with
	// zero commits) when each workspace was first selected above, and nothing
	// re-fetches it just by re-selecting the same workspace. Navigate to the
	// home repo and back to fully remount the panel so it picks up the
	// commits made above.
	await user.click(await screen.findByTestId("home-repo-row"));
	await user.click(await screen.findByText(GRANDCHILD_BRANCH));

	const panel = await screen.findByTestId("workspace-stack-panel");
	await within(panel).findByText(defaultBranch);
	await within(panel).findByText(PARENT_BRANCH);
	await within(panel).findByText(CHILD_BRANCH);
	const grandchildItem = within(panel)
		.getByText(GRANDCHILD_BRANCH)
		.closest("button") as HTMLElement;
	await waitFor(() => {
		expect(grandchildItem.textContent).toMatch(/\+20/);
	});

	await captureDocument(document, {
		name: "stacked-workspace-panel-01-grandchild-view",
		expectations: [
			`In the Code tab's main column, a bordered "Stack" panel reading "1 of 3" appears below the task/prompt input box, listing the target branch "${defaultBranch}" (with an up-arrow icon) as its very first row, above the stacked workspaces.`,
			`Below the target branch, the three workspaces appear top-to-bottom in stacking order: "${PARENT_BRANCH}", then "${CHILD_BRANCH}", then "${GRANDCHILD_BRANCH}" at the bottom -- the last one visually highlighted/current with a filled dot and highlighted background.`,
			`Each of "${PARENT_BRANCH}", "${CHILD_BRANCH}", and "${GRANDCHILD_BRANCH}" shows a small green/red horizontal bar next to its "+N -N" line-change count, and the bars grow noticeably longer from "${PARENT_BRANCH}" (shortest, +2) to "${CHILD_BRANCH}" (+8) to "${GRANDCHILD_BRANCH}" (longest, +20).`,
		],
	});

	// Click the parent item in the stack panel to navigate to it.
	await user.click(within(panel).getByText(PARENT_BRANCH));
	const header = await screen.findByTestId("show-workspace-header");
	await within(header).findByText(PARENT_BRANCH);
	await waitFor(() => {
		expect(
			screen.queryByTestId("workspace-stack-panel"),
		).not.toBeInTheDocument();
	});

	await captureDocument(document, {
		name: "stacked-workspace-panel-02-after-navigate-to-parent",
		expectations: [
			`The header's branch name now reads "${PARENT_BRANCH}" (navigated away from ${GRANDCHILD_BRANCH}).`,
			"No stack panel is visible in the Code tab's main column -- this workspace targets the default branch directly, so it has no workspace ancestor to show a stack for.",
		],
	});
}, 60000);
