import * as React from "react";
import { expect, it } from "vitest";
import userEvent from "@testing-library/user-event";
import { createTestRepo, openRepo } from "../../../test/utils";
import { render, screen, within } from "../../../test/test-utils";
import { Dashboard } from "../../../src/components/Dashboard";
import { createWorkspace } from "../../../src/lib/api";
import { captureDocument } from "../capture";

it("captures always-visible home and workspace sidebar action buttons", async () => {
	const { repoPath } = createTestRepo(false);
	openRepo(repoPath);

	await createWorkspace(repoPath, "feat/sibling");

	const user = userEvent.setup();
	render(<Dashboard />);

	const homeRepoElement = await screen.findByTestId("home-repo-row");
	const siblingRow = (await screen.findByText("feat/sibling")).closest(
		"div",
	) as HTMLElement;
	expect(siblingRow).toBeTruthy();

	// Do not select either row — buttons must be visible without hover/selection.
	expect(homeRepoElement).not.toHaveClass("bg-primary/20");
	expect(
		within(homeRepoElement).getByRole("button", { name: "Start agent" }),
	).toBeTruthy();
	expect(
		within(homeRepoElement).getByRole("button", { name: "Open shell" }),
	).toBeTruthy();
	expect(
		within(homeRepoElement).getByRole("button", {
			name: "Stack a workspace",
		}),
	).toBeTruthy();
	expect(
		within(siblingRow).getByRole("button", { name: "Start agent" }),
	).toBeTruthy();
	expect(
		within(siblingRow).getByRole("button", { name: "Open shell" }),
	).toBeTruthy();
	expect(
		within(siblingRow).getByRole("button", { name: "Stack a workspace" }),
	).toBeTruthy();

	await captureDocument(document, {
		name: "home-repo-sidebar-actions-01-always-visible",
		expectations: [
			"The home-repo sidebar row shows three icon buttons on the right (agent, shell, stack) even though the row is not highlighted/selected.",
			"The feat/sibling workspace row also shows the same three icon buttons without being selected.",
			"Github sits between the home row and the Workspaces list.",
		],
	});

	await user.click(
		within(homeRepoElement).getByRole("button", {
			name: "Stack a workspace",
		}),
	);
	expect(await screen.findByText("Stack a new Workspace")).toBeVisible();
	expect(
		screen.getByText(
			"Create a new workspace from the current branch. Optionally move file changes.",
		),
	).toBeVisible();

	await captureDocument(document, {
		name: "home-repo-sidebar-actions-02-stack-dialog",
		expectations: [
			"A modal titled 'Stack a new Workspace' is open over the dashboard.",
			"The dialog description says it creates a workspace from the current branch.",
		],
	});
}, 60000);
