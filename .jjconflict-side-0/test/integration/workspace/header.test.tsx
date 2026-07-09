import * as React from "react";
import { beforeEach, describe, expect, it } from "vitest";
import {
	commitRepoFile,
	commitWorkspaceFile,
	createTestRepo,
	findSidebarBranchElement,
	openRepo,
	resolveWorkspacePath,
} from "../../utils";
import { fireEvent, render, screen, waitFor, within } from "../../test-utils";
import { Dashboard } from "../../../src/components/Dashboard";
import { createWorkspace, getWorkspaces } from "../../../src/lib/api";
import userEvent from "@testing-library/user-event";
import { execFileSync } from "node:child_process";

describe("ShowWorkspace - header", () => {
	let repoPath: string;
	let defaultBranch: string;
	let user: ReturnType<typeof userEvent.setup>;

	beforeEach(() => {
		({ repoPath, defaultBranch } = createTestRepo(false));
		openRepo(repoPath);
		user = userEvent.setup();
	});

	it("shows current branch name of the repo in the header", async () => {
		render(<Dashboard />);

		const header = await screen.findByTestId("show-workspace-header");
		expect(
			await within(header).findByRole("button", { name: defaultBranch }),
		).toBeTruthy();
	});

	it("shows branch list and can switch home repo to a workspace branch", async () => {
		await createWorkspace(repoPath, "feat/alpha");
		await createWorkspace(repoPath, "feat/beta");
		render(<Dashboard />);

		const header = await screen.findByTestId("show-workspace-header");
		const branchButton = await within(header).findByRole("button", {
			name: defaultBranch,
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

		await user.click(await screen.findByText("feat/alpha"));

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
			screen.queryByText(defaultBranch, { selector: "button *" }),
		).not.toBeInTheDocument();
	});

	it("falls back to default branch for null target and resyncs from persisted workspace target", async () => {
		await createWorkspace(repoPath, "feat/alpha");
		await createWorkspace(repoPath, "feat/beta");
		render(<Dashboard />);

		await user.click(await findSidebarBranchElement("feat/alpha"));

		let targetBtn: HTMLButtonElement;
		await waitFor(() => {
			targetBtn = screen.getByRole("button", {
				name: "Workspace target",
			}) as HTMLButtonElement;
			expect(targetBtn).not.toBeDisabled();
		});

		await screen.findByText(defaultBranch, { selector: "button *" });

		fireEvent.click(targetBtn!);
		const betaElement = await screen.findByText("feat/beta", {
			selector: ".branch-list-item *",
		});
		fireEvent.click(betaElement);
		await screen.findByText("feat/beta", { selector: "button *" });

		await user.click(await findSidebarBranchElement("feat/beta"));
		await screen.findByText(defaultBranch, { selector: "button *" });

		await user.click(await findSidebarBranchElement("feat/alpha"));
		await screen.findByText("feat/beta", { selector: "button *" });
	});

	it("lazily loads branch list into the target-branch dropdown on open", async () => {
		await createWorkspace(repoPath, "feat/alpha");
		await createWorkspace(repoPath, "feat/beta");
		render(<Dashboard />);

		await user.click(await screen.findByText("feat/alpha"));

		let targetBtn: HTMLButtonElement;
		await waitFor(() => {
			targetBtn = screen.getByRole("button", {
				name: "Workspace target",
			}) as HTMLButtonElement;
			expect(targetBtn).not.toBeDisabled();
		});

		expect(
			screen.queryByPlaceholderText("Search branches..."),
		).not.toBeInTheDocument();

		fireEvent.click(targetBtn!);

		const searchInput =
			await screen.findByPlaceholderText("Search branches...");
		const popover = searchInput.closest('[data-state="open"]') as HTMLElement;
		expect(within(popover).getByText(defaultBranch)).toBeTruthy();
		expect(within(popover).getByText("feat/beta")).toBeTruthy();
	});

	it("shows workspace branch name in the header when workspace is selected", async () => {
		await createWorkspace(repoPath, "feat/header-test");
		render(<Dashboard />);

		const workspaceBranchName = await screen.findByText("feat/header-test");
		fireEvent.click(workspaceBranchName);

		const header = await screen.findByTestId("show-workspace-header");
		expect(await within(header).findByText("feat/header-test")).toBeTruthy();
	});

	it("rebases workspace bookmark lineage when changing target branch from header flow", async () => {
		await createWorkspace(repoPath, "feat/alpha");
		await createWorkspace(repoPath, "feat/beta");

		const alpha = (await getWorkspaces(repoPath)).find(
			(workspace) => workspace.branch_name === "feat/alpha",
		);
		const beta = (await getWorkspaces(repoPath)).find(
			(workspace) => workspace.branch_name === "feat/beta",
		);
		expect(alpha).toBeTruthy();
		expect(beta).toBeTruthy();

		await commitRepoFile(
			repoPath,
			"beta-base.txt",
			"beta base line",
			"Beta base commit",
		);
		await commitWorkspaceFile(
			repoPath,
			{ id: alpha!.id, path: alpha!.workspace_path },
			"alpha.txt",
			"alpha line",
			"Alpha feature commit",
		);
		render(<Dashboard />);

		await user.click(await screen.findByText("feat/alpha"));

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

		await screen.findByText("Rebased successfully");
		await screen.findByText("feat/beta", { selector: "button *" });

		const betaWorkspacePath = resolveWorkspacePath(
			repoPath,
			beta!.workspace_path,
		);
		const betaTip = execFileSync("git", ["rev-parse", "feat/beta"], {
			cwd: betaWorkspacePath,
			encoding: "utf8",
		}).trim();

		const overlap = execFileSync(
			"jj",
			[
				"log",
				"-r",
				`ancestors(feat/alpha) & ${betaTip}`,
				"-n",
				"1",
				"--no-graph",
				"-T",
				"commit_id",
			],
			{ cwd: repoPath, encoding: "utf8" },
		).trim();
		expect(overlap).not.toEqual("");
	});
});
