import * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "../test-utils";
import userEvent from "@testing-library/user-event";
import { createTestRepo, findSidebarBranchElement, openRepo } from "../utils";
import { createWorkspace, getWorkspaces } from "../../src/lib/api";
import { Dashboard } from "../../src/components/Dashboard";

const findWorkspaceByBranchName = (
	workspaces: Awaited<ReturnType<typeof getWorkspaces>>,
	branchName: string,
) => workspaces.find((workspace) => workspace.branch_name === branchName);

describe("Dashboard - workspace list", () => {
	let repoPath: string;
	let repoName: string;

	beforeEach(async () => {
		({ repoPath } = createTestRepo(false));
		repoName = repoPath.split("/").filter(Boolean).pop()!;

		openRepo(repoPath);

		await createWorkspace(repoPath, "feat/alpha");
		await createWorkspace(repoPath, "feat/beta");
	});

	it("renders workspace sidebar elements correctly branch names in the sidebar", async () => {
		render(<Dashboard />);

		await screen.findByText("feat/alpha");
		await screen.findByText("feat/beta");
		expect(screen.getByText(repoName)).toBeTruthy();
		const sidebarRoot = document.querySelector(
			`.${CSS.escape("group/sidebar")}`,
		);
		expect(sidebarRoot).toBeTruthy();
		// branch name on home repo row in sidebar
		expect(within(sidebarRoot as HTMLElement).getByText("main")).toBeTruthy();
	});

	describe("context menu and tooltip", () => {
		let user: ReturnType<typeof userEvent.setup>;

		beforeEach(() => {
			user = userEvent.setup();
			// Ensure clipboard spy is active for each test (spy can be cleared between tests)
			vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined);
		});

		it("should copy relative path when right-clicking home repo and selecting Copy relative path", async () => {
			render(<Dashboard />);

			// Wait for dashboard to load
			const matches = await screen.findAllByText("feat/alpha");
			expect(matches.length).toBeGreaterThan(0);

			// Find home repo element - has Home icon (lucide-house class in newer lucide-react)
			const sidebarRoot = document.querySelector(
				`.${CSS.escape("group/sidebar")}`,
			);
			const homeIcon = sidebarRoot?.querySelector(".lucide-house");
			const homeRepoElement = homeIcon?.closest(
				'[class*="cursor-pointer"]',
			) as HTMLElement;
			expect(homeRepoElement).toBeTruthy();

			// Right-click home repo
			fireEvent.contextMenu(homeRepoElement!);

			// Context menu should appear
			await screen.findByText("Copy relative path");

			// Click "Copy relative path"
			await user.click(screen.getByText("Copy relative path"));

			// Verify clipboard was called with "."
			expect(navigator.clipboard.writeText).toHaveBeenLastCalledWith(".");
		});

		it("should copy full path when right-clicking home repo and selecting Copy full path", async () => {
			render(<Dashboard />);

			// Wait for dashboard to load
			const matches = await screen.findAllByText("feat/alpha");
			expect(matches.length).toBeGreaterThan(0);

			// Find home repo element - has bg-primary/20 class when selected
			const homeRepoElement = document.querySelector(
				".bg-primary\\/20",
			) as HTMLElement;
			expect(homeRepoElement).toBeTruthy();

			// Right-click home repo
			fireEvent.contextMenu(homeRepoElement!);

			// Context menu should appear
			await screen.findByText("Copy full path");

			// Click "Copy full path"
			await user.click(screen.getByText("Copy full path"));

			// Verify clipboard was called with the repo path
			expect(navigator.clipboard.writeText).toHaveBeenLastCalledWith(repoPath);
		});

		it("should open home repo in Finder when selecting Open in Finder", async () => {
			render(<Dashboard />);

			// Wait for dashboard to load
			const matches = await screen.findAllByText("feat/alpha");
			expect(matches.length).toBeGreaterThan(0);

			// Find home repo element
			const homeRepoElement = document.querySelector(
				".bg-primary\\/20",
			) as HTMLElement;
			expect(homeRepoElement).toBeTruthy();

			// Right-click home repo
			fireEvent.contextMenu(homeRepoElement!);

			// Context menu should appear with "Open in..."
			await screen.findByText("Open in...");

			// Hover over "Open in..." to show submenu
			await user.hover(screen.getByText("Open in..."));

			// Submenu should appear with "Open in Finder"
			await screen.findByText("Open in Finder");

			// Click "Open in Finder"
			fireEvent.click(screen.getByText("Open in Finder"));

			// Verify revealItemInDir was called with repo path
			const { revealItemInDir } = await import("@tauri-apps/plugin-opener");
			await waitFor(() => {
				expect(revealItemInDir).toHaveBeenLastCalledWith(repoPath);
			});
		});

		it("should copy workspace relative path using .treq/workspaces/ prefix when workspace_path is a short name", async () => {
			// Get the actual workspace objects to know the workspace_path
			const workspaces = await getWorkspaces(repoPath);
			const alphaWorkspace = findWorkspaceByBranchName(workspaces, "feat/alpha")!;
			expect(alphaWorkspace).toBeTruthy();

			render(<Dashboard />);

			// Wait for workspace to appear and find it in the sidebar
			const alphaElement = await findSidebarBranchElement("feat/alpha");

			// Right-click workspace branch name
			fireEvent.contextMenu(alphaElement);

			// Context menu should appear
			await screen.findByText("Copy relative path");

			// Click "Copy relative path"
			await user.click(screen.getByText("Copy relative path"));

			// Verify clipboard was called with relative path (.treq/workspaces/ prefix for short names)
			expect(navigator.clipboard.writeText).toHaveBeenLastCalledWith(
				`.treq/workspaces/${alphaWorkspace.workspace_path}`,
			);
		});

		it("should copy workspace full path from context menu", async () => {
			// Get the actual workspace objects to know the workspace_path
			const workspaces = await getWorkspaces(repoPath);
			const alphaWorkspace = findWorkspaceByBranchName(workspaces, "feat/alpha")!;
			expect(alphaWorkspace).toBeTruthy();

			render(<Dashboard />);

			// Wait for workspace to appear and find it in the sidebar
			const alphaElement = await findSidebarBranchElement("feat/alpha");

			// Right-click workspace
			fireEvent.contextMenu(alphaElement);

			// Context menu should appear
			await screen.findByText("Copy full path");

			// Click "Copy full path"
			await user.click(screen.getByText("Copy full path"));

			// Verify clipboard was called with full path
			expect(navigator.clipboard.writeText).toHaveBeenLastCalledWith(
				`${repoPath}/.treq/workspaces/${alphaWorkspace.workspace_path}`,
			);
		});

		it("should open workspace in Finder from context menu", async () => {
			// Get the actual workspace objects to know the workspace_path
			const workspaces = await getWorkspaces(repoPath);
			const alphaWorkspace = findWorkspaceByBranchName(workspaces, "feat/alpha")!;
			expect(alphaWorkspace).toBeTruthy();

			render(<Dashboard />);

			// Wait for workspace to appear and find it in the sidebar
			const alphaElement = await findSidebarBranchElement("feat/alpha");

			// Right-click workspace
			fireEvent.contextMenu(alphaElement);

			// Context menu should appear with "Open in..."
			await screen.findByText("Open in...");

			// Hover over "Open in..." to show submenu
			await user.hover(screen.getByText("Open in..."));

			// Submenu should appear with "Open in Finder"
			await screen.findByText("Open in Finder");

			// Click "Open in Finder"
			fireEvent.click(screen.getByText("Open in Finder"));

			// Verify revealItemInDir was called with workspace path
			const { revealItemInDir } = await import("@tauri-apps/plugin-opener");
			await waitFor(() => {
				expect(revealItemInDir).toHaveBeenLastCalledWith(
					`${repoPath}/.treq/workspaces/${alphaWorkspace.workspace_path}`,
				);
			});
		});
	});

	describe("multi-select workspaces", () => {
		let user: ReturnType<typeof userEvent.setup>;

		beforeEach(() => {
			user = userEvent.setup();
		});

		it("should select multiple workspaces with cmd+click", async () => {
			render(<Dashboard />);

			// Wait for workspaces to load
			const alpha = await findSidebarBranchElement("feat/alpha");
			const beta = await findSidebarBranchElement("feat/beta");

			const workspace1 = alpha.closest("div");
			const workspace2 = beta.closest("div");

			// Cmd+click on workspace 1 - should toggle selection
			await user.keyboard("{Meta>}");
			await user.click(workspace1!);
			await user.keyboard("{/Meta}");

			// Workspace 1 should have selected styling
			expect(workspace1).toHaveClass("bg-primary/20");

			// Cmd+click on workspace 2 - should add to selection
			await user.keyboard("{Meta>}");
			await user.click(workspace2!);
			await user.keyboard("{/Meta}");

			// Both should be selected
			expect(workspace1).toHaveClass("bg-primary/20");
			expect(workspace2).toHaveClass("bg-primary/20");
		});

		it("should select range of workspaces with shift+click", async () => {
			render(<Dashboard />);

			// Wait for workspaces to load
			const alpha = await findSidebarBranchElement("feat/alpha");
			const beta = await findSidebarBranchElement("feat/beta");

			const workspace1 = alpha.closest("div");
			const workspace2 = beta.closest("div");

			// Cmd+click workspace 1 to anchor selection
			await user.keyboard("{Meta>}");
			await user.click(workspace1!);
			await user.keyboard("{/Meta}");

			// Shift+click workspace 2 to select range
			await user.keyboard("{Shift>}");
			await user.click(workspace2!);
			await user.keyboard("{/Shift}");

			// Both workspaces should be selected
			expect(workspace1).toHaveClass("bg-primary/20");
			expect(workspace2).toHaveClass("bg-primary/20");
		});

		it("should show delete button when workspaces are selected", async () => {
			render(<Dashboard />);

			// Wait for workspaces to load
			const alpha = await findSidebarBranchElement("feat/alpha");
			const beta = await findSidebarBranchElement("feat/beta");

			await user.keyboard("{Meta>}");
			await user.click(alpha);
			await user.click(beta);
			await user.keyboard("{/Meta}");

			// Delete button should show count
			await screen.findByText(/delete 2 workspaces/i);
		});

		it("should not allow selecting the main repository with cmd+click", async () => {
			render(<Dashboard />);

			// Wait for workspaces to load
			await findSidebarBranchElement("feat/alpha");

			// The main repo row is before the workspace rows in the sidebar
			const sidebarRoot = document.querySelector(
				`.${CSS.escape("group/sidebar")}`,
			);
			const mainRepoRow = sidebarRoot!.querySelector(
				"div:has(svg.lucide-house)",
			);

			// Try to cmd+click the main repository
			await user.keyboard("{Meta>}");
			await user.click(mainRepoRow!);
			await user.keyboard("{/Meta}");

			// Delete button should not appear (main repo should not be selectable)
			expect(
				screen.queryByText(/delete.*workspaces?/i),
			).not.toBeInTheDocument();
		});
	});
});
