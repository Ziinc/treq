import { ask } from "@tauri-apps/plugin-dialog";
import userEvent from "@testing-library/user-event";
import * as React from "react";
import { expect, it, vi } from "vitest";
import { Dashboard } from "../../../src/components/Dashboard";
import { render, screen, waitFor, within } from "../../../test/test-utils";
import { createTestRepo, openRepo } from "../../../test/utils";
import { captureDocument } from "../capture";

const BRANCH_NAME = "test-remote";

// Regression coverage for: "unable to create workspace from remote if it had
// been previously created" -- Git workspace error: Workspace named 'X'
// already exists. Repro: create a workspace, push it to remote, delete it,
// then create a workspace with the exact same branch name again. This used
// to fail because a prior local_db/jj/on-disk-directory desync could leave
// jj still tracking the workspace name even though the directory was gone
// or empty. This spec drives the real create -> push -> delete -> re-create
// flow through the actual UI and captures the outcome.
it("captures re-creating a workspace under the same branch name after deleting it", async () => {
	const { repoPath } = createTestRepo(true); // withRemote: real bare remote to push against
	openRepo(repoPath);

	vi.mocked(ask).mockResolvedValue(true);

	const user = userEvent.setup();
	render(<Dashboard />);

	// ── Create the workspace via the real "Stack" dialog ──────────────────
	await screen.findByTestId("show-workspace-header");
	await user.click(await screen.findByRole("button", { name: "Stack" }));

	let dialog = await screen.findByTestId("modal");
	await user.type(within(dialog).getByLabelText("Branch Name"), BRANCH_NAME);
	await user.click(
		within(dialog).getByRole("button", { name: "Create Workspace" }),
	);
	await waitFor(() => {
		expect(screen.queryByTestId("modal")).not.toBeInTheDocument();
	});

	let header = await screen.findByTestId("show-workspace-header");
	await within(header).findByText(BRANCH_NAME);

	await captureDocument(document, {
		name: "workspace-recreate-after-delete-01-created",
		expectations: [
			`The workspace header shows the branch name "${BRANCH_NAME}".`,
			"No error toast or dialog is visible.",
		],
	});

	// ── Push it to remote so the branch exists on origin ───────────────────
	const pushButton = await screen.findByRole("button", {
		name: /push to remote/i,
	});
	await user.click(pushButton);
	await screen.findByText("Pushed to remote");
	await waitFor(() => {
		expect(
			screen.queryByRole("button", { name: /push to remote/i }),
		).not.toBeInTheDocument();
	});

	// ── Delete the workspace through the real header overflow menu ─────────
	const overflowTrigger = header
		.querySelector(".lucide-ellipsis-vertical")
		?.closest("button");
	if (!overflowTrigger) {
		throw new Error("Could not find workspace header overflow menu trigger");
	}
	await user.click(overflowTrigger);
	await user.click(await screen.findByText("Delete Workspace"));

	await screen.findByText("Workspace Deleted");
	await screen.findByRole("button", { name: "Stack" });

	await captureDocument(document, {
		name: "workspace-recreate-after-delete-02-deleted",
		expectations: [
			"The view has returned to the home repository (a 'Stack' button is visible in the header).",
			"A toast confirms the workspace was deleted (title 'Workspace Deleted').",
			`The sidebar no longer lists a "${BRANCH_NAME}" workspace.`,
		],
	});

	// ── Re-create a workspace under the exact same branch name ─────────────
	await user.click(await screen.findByRole("button", { name: "Stack" }));
	dialog = await screen.findByTestId("modal");
	await user.type(within(dialog).getByLabelText("Branch Name"), BRANCH_NAME);

	// Let the debounced branch-existence check resolve so the dialog shows
	// its local/remote status indicator before we submit.
	await waitFor(
		() => {
			expect(
				within(dialog).queryByText(/branch already exists locally/i) ||
					within(dialog).queryByText(/branch exists on remote/i),
			).not.toBeNull();
		},
		{ timeout: 5000 },
	);

	await captureDocument(document, {
		name: "workspace-recreate-after-delete-03-recreate-dialog",
		expectations: [
			`The "Create Workspace" dialog is open with "${BRANCH_NAME}" typed into the Branch Name field.`,
			"A status indicator next to the branch name field shows the branch already exists (locally and/or on remote), not an error.",
			"No 'already exists' workspace-creation error is shown anywhere in the dialog.",
		],
	});

	await user.click(
		within(dialog).getByRole("button", { name: "Create Workspace" }),
	);

	// The bug reproduced as a "Failed to create workspace" error toast/banner
	// instead of the modal closing. Assert the happy path instead.
	await waitFor(() => {
		expect(screen.queryByTestId("modal")).not.toBeInTheDocument();
	});
	expect(screen.queryByText(/already exists/i)).not.toBeInTheDocument();
	expect(
		screen.queryByText(/failed to create workspace/i),
	).not.toBeInTheDocument();

	header = await screen.findByTestId("show-workspace-header");
	await within(header).findByText(BRANCH_NAME);

	await captureDocument(document, {
		name: "workspace-recreate-after-delete-04-recreated",
		expectations: [
			`The workspace header once again shows the branch name "${BRANCH_NAME}", proving re-creation succeeded.`,
			"No 'already exists' or 'Failed to create workspace' error is visible anywhere on screen.",
		],
	});
}, 60000);
