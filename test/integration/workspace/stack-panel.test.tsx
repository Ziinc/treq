import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { Dashboard } from "../../../src/components/Dashboard";
import { createWorkspace, getWorkspaces } from "../../../src/lib/api";
import { fireEvent, render, screen, waitFor, within } from "../../test-utils";
import {
	commitWorkspaceFile,
	createTestRepo,
	findSidebarBranchElement,
	openRepo,
} from "../../utils";

describe("ShowWorkspace - stack panel", () => {
	let repoPath: string;
	let user: ReturnType<typeof userEvent.setup>;

	beforeEach(() => {
		({ repoPath } = createTestRepo(false));
		openRepo(repoPath);
		user = userEvent.setup();
	});

	// Sets childBranch's workspace target to parentBranch via the real header
	// UI flow. set_workspace_target_branch isn't exposed through the NAPI test
	// bindings, so this drives it the same way header.test.tsx does.
	async function stackOnto(childBranch: string, parentBranch: string) {
		await user.click(await findSidebarBranchElement(childBranch));

		let targetBtn: HTMLButtonElement;
		await waitFor(() => {
			targetBtn = screen.getByRole("button", {
				name: "Workspace target",
			}) as HTMLButtonElement;
			expect(targetBtn).not.toBeDisabled();
		});
		fireEvent.click(targetBtn!);

		const parentElement = await screen.findByText(parentBranch, {
			selector: ".branch-list-item *",
		});
		fireEvent.click(parentElement);
		await screen.findByText(parentBranch, { selector: "button *" });
	}

	it("does not render the stack panel for the main repository or a default-branch workspace", async () => {
		await createWorkspace(repoPath, "feat/alpha");
		render(<Dashboard />);

		// Main repository view (no workspace selected yet)
		await screen.findByText("Go to file");
		expect(
			screen.queryByTestId("workspace-stack-panel"),
		).not.toBeInTheDocument();

		// feat/alpha targets the default branch directly - it has no
		// workspace ancestor, so it should not show the stack panel either.
		await user.click(await findSidebarBranchElement("feat/alpha"));
		await screen.findByText("Go to file");
		await waitFor(() => {
			expect(
				screen.queryByTestId("workspace-stack-panel"),
			).not.toBeInTheDocument();
		});
	});

	it("renders the stack for a workspace stacked on top of another workspace and navigates on click", async () => {
		await createWorkspace(repoPath, "feat/alpha");
		await createWorkspace(repoPath, "feat/beta");
		render(<Dashboard />);

		await stackOnto("feat/beta", "feat/alpha");

		const panel = await screen.findByTestId("workspace-stack-panel");
		expect(within(panel).getByText("1 of 2")).toBeTruthy();
		expect(within(panel).getByText("feat/alpha")).toBeTruthy();

		await user.click(within(panel).getByText("feat/alpha"));

		const header = await screen.findByTestId("show-workspace-header");
		await within(header).findByText("feat/alpha");
	});

	it("shows real line-change counts for a stacked workspace with commits", async () => {
		await createWorkspace(repoPath, "feat/alpha");
		await createWorkspace(repoPath, "feat/beta");

		const beta = (await getWorkspaces(repoPath)).find(
			(ws) => ws.branch_name === "feat/beta",
		)!;
		await commitWorkspaceFile(
			repoPath,
			{ id: beta.id, path: beta.workspace_path },
			"feature.txt",
			"line one\nline two\nline three",
			"Add feature file",
		);

		render(<Dashboard />);
		await stackOnto("feat/beta", "feat/alpha");

		const panel = await screen.findByTestId("workspace-stack-panel");
		const betaItem = within(panel)
			.getByText("feat/beta")
			.closest("button") as HTMLElement;

		await waitFor(() => {
			expect(betaItem.textContent).toMatch(/\+\d/);
		});
	});
});
