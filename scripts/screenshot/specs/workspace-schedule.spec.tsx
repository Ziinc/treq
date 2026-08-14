import * as React from "react";
import { expect, it } from "vitest";
import userEvent from "@testing-library/user-event";
import { createTestRepo, findSidebarBranchElement, openRepo } from "../../../test/utils";
import { render, screen, waitFor, within } from "../../../test/test-utils";
import { Dashboard } from "../../../src/components/Dashboard";
import { createWorkspace } from "../../../src/lib/api";
import { captureDocument } from "../capture";

it("captures scheduling a workspace hidden from the sidebar", async () => {
	const { repoPath } = createTestRepo(false);
	openRepo(repoPath);

	await createWorkspace(repoPath, "feat/scheduled");
	await createWorkspace(repoPath, "feat/visible");

	const user = userEvent.setup();
	render(<Dashboard />);

	await user.click(await findSidebarBranchElement("feat/scheduled"));
	const header = await screen.findByTestId("show-workspace-header");
	await within(header).findByTestId("schedule-workspace-button");

	await captureDocument(document, {
		name: "workspace-schedule-01-header-button",
		expectations: [
			"The workspace header shows a Schedule button next to Stack.",
			"The sidebar lists feat/scheduled and feat/visible under Workspaces.",
			"An eye-off toggle sits on the Workspaces heading row.",
		],
	});

	await user.click(await within(header).findByTestId("schedule-workspace-button"));
	const dialog = await screen.findByTestId("schedule-workspace-dialog");
	await within(dialog).findByText("Schedule workspace");

	await captureDocument(document, {
		name: "workspace-schedule-02-dialog",
		expectations: [
			"A Schedule workspace dialog is open with a Hide until datetime field.",
			"The dialog has Cancel and Schedule buttons.",
		],
	});

	await user.click(within(dialog).getByRole("button", { name: "Schedule" }));
	await waitFor(() => {
		const sidebarRoot = document.querySelector(
			`.${CSS.escape("group/sidebar")}`,
		) as HTMLElement;
		expect(within(sidebarRoot).queryByText("feat/scheduled")).toBeNull();
	});
	await findSidebarBranchElement("feat/visible");

	await captureDocument(document, {
		name: "workspace-schedule-03-hidden",
		expectations: [
			"feat/scheduled is gone from the sidebar.",
			"feat/visible remains listed under Workspaces.",
		],
	});

	await user.click(await screen.findByTestId("show-hidden-workspaces-toggle"));
	await findSidebarBranchElement("feat/scheduled");

	await captureDocument(document, {
		name: "workspace-schedule-04-show-hidden",
		expectations: [
			"The show-hidden toggle is active on the Workspaces heading.",
			"feat/scheduled is listed again in the sidebar, dimmed as hidden.",
			"feat/visible is still listed.",
		],
	});
}, 60000);
