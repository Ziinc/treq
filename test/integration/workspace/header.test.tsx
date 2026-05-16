import * as React from "react";
import { beforeEach, describe, expect, it } from "vitest";
import {
	createTestRepo,
	findSidebarBranchElement,
	openRepo,
} from "../../utils";
import { fireEvent, render, screen, waitFor, within } from "../../test-utils";
import { Dashboard } from "../../../src/components/Dashboard";
import { createWorkspace } from "../../../src/lib/api";
import userEvent from "@testing-library/user-event";

describe("ShowWorkspace - header", () => {
	let repoPath: string;
	let user: ReturnType<typeof userEvent.setup>;

	beforeEach(() => {
		({ repoPath } = createTestRepo(false));
		openRepo(repoPath);
		user = userEvent.setup();
	});

	it("shows current branch name of the repo in the header", async () => {
		render(<Dashboard />);

		const header = await screen.findByTestId("show-workspace-header");
		expect(
			await within(header).findByRole("button", { name: "main" }),
		).toBeTruthy();
	});

	it("shows branch list and can switch home repo to a workspace branch", async () => {
		await createWorkspace(repoPath, "feat/alpha");
		await createWorkspace(repoPath, "feat/beta");
		render(<Dashboard />);

		const header = await screen.findByTestId("show-workspace-header");
		const branchButton = await within(header).findByRole("button", {
			name: "main",
		});
		await user.click(branchButton);

		const modal = await screen.findByTestId("modal");
		expect(within(modal).getByText("feat/alpha")).toBeTruthy();
		expect(within(modal).getByText("feat/beta")).toBeTruthy();

		await user.click(within(modal).getByText("feat/alpha"));

		await within(header).findByRole("button", {
			name: "feat/alpha",
		});
	});

	it("can change workspace A target branch to workspace B (stacked)", async () => {
		await createWorkspace(repoPath, "feat/alpha");
		await createWorkspace(repoPath, "feat/beta");
		render(<Dashboard />);

		const alphaElement = await findSidebarBranchElement("feat/alpha");
		fireEvent.click(alphaElement);

		let targetBtn: HTMLButtonElement;
		await waitFor(() => {
			targetBtn = screen.getByRole("button", {
				name: "Workspace target",
			}) as HTMLButtonElement;
			expect(targetBtn).not.toBeDisabled();
		});
		fireEvent.click(targetBtn!);

		const betaElement = await screen.findByText("feat/beta", {
			selector: ".branch-list-item *",
		});
		fireEvent.click(betaElement);

		await screen.findByText("feat/beta", { selector: "button *" });
		expect(
			screen.queryByText("main", { selector: "button *" }),
		).not.toBeInTheDocument();
	});

	it("lazily loads branch list into the target-branch dropdown on open", async () => {
		await createWorkspace(repoPath, "feat/alpha");
		await createWorkspace(repoPath, "feat/beta");
		render(<Dashboard />);

		const alphaElement = await findSidebarBranchElement("feat/alpha");
		fireEvent.click(alphaElement);

		let targetBtn: HTMLButtonElement;
		await waitFor(() => {
			targetBtn = screen.getByRole("button", {
				name: "Workspace target",
			}) as HTMLButtonElement;
			expect(targetBtn).not.toBeDisabled();
		});

		// Before the dropdown opens, no branch items should be rendered
		// (the popover content is not mounted, proving lazy behavior).
		expect(document.querySelectorAll(".branch-list-item")).toHaveLength(0);

		fireEvent.click(targetBtn!);

		// After opening, the real backend (via napi) populates the list.
		await waitFor(() => {
			expect(
				document.querySelectorAll(".branch-list-item").length,
			).toBeGreaterThan(0);
		});

		expect(
			await screen.findByText("main", { selector: ".branch-list-item *" }),
		).toBeTruthy();
		expect(
			await screen.findByText("feat/beta", {
				selector: ".branch-list-item *",
			}),
		).toBeTruthy();
	});

	it("shows workspace branch name in the header when workspace is selected", async () => {
		await createWorkspace(repoPath, "feat/header-test");
		render(<Dashboard />);

		const workspaceBranchName = await screen.findByText("feat/header-test");
		fireEvent.click(workspaceBranchName);

		const header = await screen.findByTestId("show-workspace-header");
		expect(await within(header).findByText("feat/header-test")).toBeTruthy();
	});
});
