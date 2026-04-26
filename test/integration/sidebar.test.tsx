import * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "../test-utils";
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
		expect(within(sidebarRoot as HTMLElement).getByText("main")).toBeTruthy();
	});

	describe("context menu and tooltip", () => {
		let user: ReturnType<typeof userEvent.setup>;

		beforeEach(() => {
			user = userEvent.setup();
			vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined);
		});

		it("should copy home repo relative and full paths from context menu", async () => {
			render(<Dashboard />);

			const matches = await screen.findAllByText("feat/alpha");
			expect(matches.length).toBeGreaterThan(0);

			const sidebarRoot = document.querySelector(
				`.${CSS.escape("group/sidebar")}`,
			);
			const homeRepoElement = sidebarRoot?.querySelector(
				'[data-testid="home-repo-row"]',
			) as HTMLElement;
			expect(homeRepoElement).toBeTruthy();

			fireEvent.contextMenu(homeRepoElement);
			await screen.findByText("Copy relative path");
			await user.click(screen.getByText("Copy relative path"));
			expect(navigator.clipboard.writeText).toHaveBeenLastCalledWith(".");

			fireEvent.contextMenu(homeRepoElement);
			await screen.findByText("Copy full path");
			await user.click(screen.getByText("Copy full path"));
			expect(navigator.clipboard.writeText).toHaveBeenLastCalledWith(repoPath);
		});

		it("should open home repo in Finder when selecting Open in Finder", async () => {
			render(<Dashboard />);

			const matches = await screen.findAllByText("feat/alpha");
			expect(matches.length).toBeGreaterThan(0);

			const homeRepoElement = document.querySelector(
				'[data-testid="home-repo-row"]',
			) as HTMLElement;
			expect(homeRepoElement).toBeTruthy();

			fireEvent.contextMenu(homeRepoElement!);

			await screen.findByText("Open in...");

			await user.hover(screen.getByText("Open in..."));

			await screen.findByText("Open in Finder");

			const { revealItemInDir } = await import("@tauri-apps/plugin-opener");
			fireEvent.click(screen.getByText("Open in Finder"));

			expect(revealItemInDir).toHaveBeenLastCalledWith(repoPath);
		});

		it("should copy workspace relative and full paths from context menu", async () => {
			const workspaces = await getWorkspaces(repoPath);
			const alphaWorkspace = findWorkspaceByBranchName(
				workspaces,
				"feat/alpha",
			)!;
			expect(alphaWorkspace).toBeTruthy();

			render(<Dashboard />);

			const alphaElement = await findSidebarBranchElement("feat/alpha");

			fireEvent.contextMenu(alphaElement);
			await screen.findByText("Copy relative path");
			await user.click(screen.getByText("Copy relative path"));
			expect(navigator.clipboard.writeText).toHaveBeenLastCalledWith(
				`.treq/workspaces/${alphaWorkspace.workspace_path}`,
			);

			fireEvent.contextMenu(alphaElement);
			await screen.findByText("Copy full path");
			await user.click(screen.getByText("Copy full path"));
			expect(navigator.clipboard.writeText).toHaveBeenLastCalledWith(
				`${repoPath}/.treq/workspaces/${alphaWorkspace.workspace_path}`,
			);
		});

		it("should open workspace in Finder from context menu", async () => {
			const workspaces = await getWorkspaces(repoPath);
			const alphaWorkspace = findWorkspaceByBranchName(
				workspaces,
				"feat/alpha",
			)!;
			expect(alphaWorkspace).toBeTruthy();

			render(<Dashboard />);

			const alphaElement = await findSidebarBranchElement("feat/alpha");

			fireEvent.contextMenu(alphaElement);

			await screen.findByText("Open in...");

			await user.hover(screen.getByText("Open in..."));

			await screen.findByText("Open in Finder");

			const { revealItemInDir } = await import("@tauri-apps/plugin-opener");
			fireEvent.click(screen.getByText("Open in Finder"));

			expect(revealItemInDir).toHaveBeenLastCalledWith(
				`${repoPath}/.treq/workspaces/${alphaWorkspace.workspace_path}`,
			);
		});
	});

	describe("multi-select workspaces", () => {
		let user: ReturnType<typeof userEvent.setup>;

		beforeEach(() => {
			user = userEvent.setup();
		});

		it("should support multi-select interactions while keeping the main repository unselectable", async () => {
			const getSidebarElements = async () => {
				const alpha = await findSidebarBranchElement("feat/alpha");
				const beta = await findSidebarBranchElement("feat/beta");
				const sidebarRoot = document.querySelector(
					`.${CSS.escape("group/sidebar")}`,
				);
				const mainRepoRow = sidebarRoot!.querySelector(
					'[data-testid="home-repo-row"]',
				);

				return {
					workspace1: alpha.closest("div") as HTMLElement,
					workspace2: beta.closest("div") as HTMLElement,
					mainRepoRow: mainRepoRow as HTMLElement,
				};
			};

			const cmdClick = async (element: HTMLElement) => {
				await user.keyboard("{Meta>}");
				await user.click(element);
				await user.keyboard("{/Meta}");
			};

			const { rerender } = render(<Dashboard />);
			const { workspace1: cmdWorkspace1, workspace2: cmdWorkspace2 } =
				await getSidebarElements();

			await cmdClick(cmdWorkspace1);
			await cmdClick(cmdWorkspace2);

			rerender(<Dashboard />);
			const { workspace1: shiftWorkspace1, workspace2: shiftWorkspace2 } =
				await getSidebarElements();

			await cmdClick(shiftWorkspace1);
			await user.keyboard("{Shift>}");
			await user.click(shiftWorkspace2);
			await user.keyboard("{/Shift}");

			expect(shiftWorkspace1).toHaveClass("bg-primary/20");
			expect(shiftWorkspace2).toHaveClass("bg-primary/20");

			rerender(<Dashboard />);

			const { mainRepoRow } = await getSidebarElements();

			await cmdClick(mainRepoRow);

			expect(
				screen.queryByText(/delete.*workspaces?/i),
			).not.toBeInTheDocument();
		});

		it("should show delete button when workspaces are selected", async () => {
			render(<Dashboard />);

			const alpha = await findSidebarBranchElement("feat/alpha");
			const beta = await findSidebarBranchElement("feat/beta");

			await user.keyboard("{Meta>}");
			await user.click(alpha);
			await user.click(beta);
			await user.keyboard("{/Meta}");

			await screen.findByText(/delete 2 workspaces/i);
		});
	});
});
