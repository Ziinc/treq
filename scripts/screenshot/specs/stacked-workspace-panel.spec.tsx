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

	// Give the child workspace a real commit so the panel has line-change
	// stats to show, not just a zeroed-out entry. Uses the test-utils helper
	// (incidental background state, not itself the tested behavior) like
	// commits-tab-after-push.spec.tsx does.
	const child = (await getWorkspaces(repoPath)).find(
		(candidate) => candidate.branch_name === CHILD_BRANCH,
	);
	if (!child) {
		throw new Error(`Expected ${CHILD_BRANCH} workspace to exist`);
	}
	await commitWorkspaceFile(
		repoPath,
		{ id: child.id, path: child.workspace_path },
		"child-feature.txt",
		"line one\nline two\nline three\nline four",
		"Add child feature file",
	);

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
	await waitFor(() => {
		expect(childItem.textContent).toMatch(/\+\d/);
	});

	await captureDocument(document, {
		name: "stacked-workspace-panel-01-child-view",
		expectations: [
			`The Code tab's right sidebar shows a "Stack" panel above the Commits list, reading "1 of 2".`,
			`The stack panel lists two items, top-to-bottom: "${CHILD_BRANCH}" and "${PARENT_BRANCH}".`,
			`The "${CHILD_BRANCH}" item is visually highlighted/current (filled dot, highlighted background) and shows a green "+4" line-change count; the "${PARENT_BRANCH}" item is not highlighted and shows no line-change count.`,
			`The header's branch name reads "${CHILD_BRANCH}".`,
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
			"No stack panel is visible in the Code tab's right sidebar -- this workspace targets the default branch directly, so it has no workspace ancestor to show a stack for.",
		],
	});
}, 60000);
