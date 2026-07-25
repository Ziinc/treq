import * as React from "react";
import { expect, it } from "vitest";
import userEvent from "@testing-library/user-event";
import {
	commitRepoFile,
	commitWorkspaceFile,
	createTestRepo,
	openRepo,
} from "../../../test/utils";
import { render, screen, waitFor, within } from "../../../test/test-utils";
import { Dashboard } from "../../../src/components/Dashboard";
import { getWorkspaces } from "../../../src/lib/api";
import { captureDocument } from "../capture";

const BRANCH_NAME = "feat/committed-after-force-rebase";

// Regression scenario (bug: "Reversal of other commits are getting rendered
// in the Committed section"): a workspace is stacked on the default branch,
// the workspace makes its own commit, then several unrelated commits land on
// the default branch. Force-rebasing the workspace onto the moved default
// branch used to resolve the wrong base revision for the workspace_diff
// comparison, which pulled the target branch's own commits into the
// workspace's "Committed" section -- appearing as reversed changes (e.g. a
// file created upstream showing as deleted). Fixed in PR #19
// (resolve_workspace_diff_base_revision_from_last_rebased).
it("captures the Committed section staying scoped to the workspace's own commit after a force rebase", async () => {
	const { repoPath, defaultBranch } = createTestRepo(false);
	openRepo(repoPath);

	const user = userEvent.setup();
	render(<Dashboard />);

	// Stack a workspace on the default branch through the real "Stack" dialog.
	await screen.findByTestId("show-workspace-header");
	await user.click(await screen.findByRole("button", { name: "Stack" }));

	const dialog = await screen.findByTestId("modal");
	await user.type(within(dialog).getByLabelText("Branch Name"), BRANCH_NAME);
	await user.click(
		within(dialog).getByRole("button", { name: "Create Workspace" }),
	);
	await waitFor(() => {
		expect(screen.queryByTestId("modal")).not.toBeInTheDocument();
	});

	const header = await screen.findByTestId("show-workspace-header");
	await within(header).findByText(BRANCH_NAME);

	const workspace = (await getWorkspaces(repoPath)).find(
		(candidate) => candidate.branch_name === BRANCH_NAME,
	);
	if (!workspace) {
		throw new Error(`Expected ${BRANCH_NAME} workspace to exist`);
	}

	// The workspace's own committed change -- this is what the Committed
	// section should keep showing, and ONLY this, after the force rebase below.
	await commitWorkspaceFile(
		repoPath,
		{ id: workspace.id, path: workspace.workspace_path },
		"workspace-owned.txt",
		"workspace owned content",
		"Workspace commit",
	);

	// Several unrelated commits land on the default branch after workspace
	// creation -- simulating other people pushing to the target branch.
	await commitRepoFile(
		repoPath,
		"upstream-one.txt",
		"upstream content one",
		"Upstream commit 1",
	);
	await commitRepoFile(
		repoPath,
		"upstream-two.txt",
		"upstream content two",
		"Upstream commit 2",
	);

	await user.click(await screen.findByRole("tab", { name: /^Review/ }));
	await screen.findByRole("tab", { name: /^Review/, selected: true });
	await waitFor(() => {
		expect(screen.getAllByText("workspace-owned.txt").length).toBeGreaterThan(
			0,
		);
	});
	await captureDocument(document, {
		name: "committed-changes-after-force-rebase-01-before",
		expectations: [
			"The Review tab is active and shows a Committed section.",
			"workspace-owned.txt is listed as a committed file.",
			"upstream-one.txt and upstream-two.txt are not shown anywhere in the file list.",
		],
	});

	// Force-rebase the workspace through the real header dropdown, exactly as
	// described in the bug repro ("perform a force rebase").
	await user.click(
		await screen.findByTestId("workspace-more-actions-trigger"),
	);
	await user.click(
		await screen.findByRole("menuitem", { name: "Force Rebase Workspace" }),
	);
	await screen.findByText("Force rebase complete");

	await waitFor(() => {
		expect(
			screen.queryByText("Force rebase complete"),
		).not.toBeInTheDocument();
	});

	// The dropdown item's onSelect calls preventDefault() (to keep control over
	// the async action), which also keeps the Radix menu open -- close it so the
	// capture below shows the resulting file list, not the menu overlay.
	await user.keyboard("{Escape}");
	await waitFor(() => {
		expect(screen.queryByRole("menu")).not.toBeInTheDocument();
	});

	await waitFor(() => {
		expect(screen.getAllByText("workspace-owned.txt").length).toBeGreaterThan(
			0,
		);
	});

	await captureDocument(document, {
		name: "committed-changes-after-force-rebase-02-after",
		expectations: [
			"The Committed section still lists workspace-owned.txt.",
			"Neither upstream-one.txt nor upstream-two.txt appears in the Committed section or anywhere else in the file list -- the upstream commits must not leak into the workspace's committed changes.",
			"There is no indication that workspace-owned.txt (or any file) is now shown as deleted/reversed -- the committed change is still an addition, not a reversal.",
		],
	});

	expect(screen.queryByText("upstream-one.txt")).not.toBeInTheDocument();
	expect(screen.queryByText("upstream-two.txt")).not.toBeInTheDocument();
}, 60000);
