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
			"A calendar toggle sits on the Workspaces heading with no count pip yet.",
		],
	});

	await user.click(await within(header).findByTestId("schedule-workspace-button"));
	const dialog = await screen.findByTestId("schedule-workspace-dialog");
	await within(dialog).findByText("Schedule workspace");
	await user.click(within(dialog).getByTestId("schedule-preset-1h"));

	await captureDocument(document, {
		name: "workspace-schedule-02-dialog",
		expectations: [
			"A Schedule workspace dialog shows interval chips (1 hour, Tomorrow 9am) and week chips (Mon 9am, Fri 5pm).",
			"An inline calendar with a time column is visible under Hide until.",
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
			"The calendar toggle on Workspaces shows a pip with 1.",
		],
	});

	await user.click(await screen.findByTestId("show-hidden-workspaces-toggle"));
	await findSidebarBranchElement("feat/scheduled");

	await captureDocument(document, {
		name: "workspace-schedule-04-show-hidden",
		expectations: [
			"The calendar show-hidden toggle is active and still shows pip 1.",
			"feat/scheduled is listed again in the sidebar, dimmed as hidden.",
			"feat/visible is still listed.",
		],
	});

	await user.click(await findSidebarBranchElement("feat/scheduled"));
	const headerAgain = await screen.findByTestId("show-workspace-header");
	await user.click(
		await within(headerAgain).findByTestId("schedule-workspace-button"),
	);
	const rescheduleDialog = await screen.findByTestId("schedule-workspace-dialog");
	await within(rescheduleDialog).findByTestId("remove-schedule-button");

	await captureDocument(document, {
		name: "workspace-schedule-05-remove-schedule",
		expectations: [
			"The Schedule workspace dialog includes a Remove schedule button next to Cancel.",
			"feat/scheduled remains listed in the sidebar while hidden workspaces are shown.",
		],
	});

	await user.click(
		within(rescheduleDialog).getByTestId("remove-schedule-button"),
	);
	await waitFor(() => {
		expect(screen.queryByTestId("hidden-workspace-count")).toBeNull();
	});
	await findSidebarBranchElement("feat/scheduled");

	await captureDocument(document, {
		name: "workspace-schedule-06-unscheduled",
		expectations: [
			"feat/scheduled is listed in the sidebar without needing the show-hidden toggle.",
			"The calendar toggle has no count pip.",
			"The schedule dialog is closed.",
		],
	});
}, 60000);
