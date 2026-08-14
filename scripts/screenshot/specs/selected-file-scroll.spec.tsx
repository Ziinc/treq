import * as React from "react";
import { expect, it } from "vitest";
import userEvent from "@testing-library/user-event";
import {
	createTestRepo,
	openRepo,
	resolveWorkspacePath,
	writeWorkspaceFile,
} from "../../../test/utils";
import { render, screen, waitFor, within } from "../../../test/test-utils";
import { Dashboard } from "../../../src/components/Dashboard";
import { getWorkspaces } from "../../../src/lib/api";
import { captureDocument } from "../capture";

const BRANCH_NAME = "feat/selected-file-scroll";

it("shows Selected and Changes files with their review collapsibles", async () => {
	const { repoPath } = createTestRepo(false);
	openRepo(repoPath);

	const user = userEvent.setup();
	render(<Dashboard />);

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

	const workspace = (await getWorkspaces(repoPath)).find(
		(candidate) => candidate.branch_name === BRANCH_NAME,
	);
	if (!workspace) {
		throw new Error(`Expected ${BRANCH_NAME} workspace to exist`);
	}

	const workspaceDir = resolveWorkspacePath(
		repoPath,
		workspace.workspace_path,
	);
	writeWorkspaceFile(workspaceDir, "alpha.txt", "alpha change\n");
	writeWorkspaceFile(workspaceDir, "beta.txt", "beta change\n");

	await user.click(await screen.findByRole("tab", { name: /Review/ }));
	await screen.findAllByText("alpha.txt");
	await screen.findAllByText("beta.txt");

	const changesSection = (
		await screen.findByRole("button", { name: /^Changes/ })
	).closest("div")?.parentElement;
	if (!changesSection) throw new Error("Changes section missing");
	await user.click(await within(changesSection).findByTitle("alpha.txt"));

	await captureDocument(document, {
		name: "selected-file-scroll-01-changes-click",
		expectations: [
			"The Review sidebar Changes list highlights alpha.txt as selected.",
			"The main pane shows an alpha.txt file collapsible with its diff.",
			"beta.txt is listed under Changes and has a file collapsible in the main pane.",
		],
	});

	const stageButton = await screen.findByTitle("Stage file(s) for commit");
	await user.click(stageButton);
	await screen.findByRole("button", { name: /^Selected/ });

	const selectedSection = (
		await screen.findByRole("button", { name: /^Selected/ })
	).closest("div")?.parentElement;
	if (!selectedSection) throw new Error("Selected section missing");
	await user.click(await within(selectedSection).findByTitle("alpha.txt"));

	await captureDocument(document, {
		name: "selected-file-scroll-02-selected-click",
		expectations: [
			"The Review sidebar has a Selected section listing alpha.txt.",
			"alpha.txt is highlighted in the Selected list.",
			"The main pane still shows the alpha.txt file collapsible.",
		],
	});
}, 60000);
