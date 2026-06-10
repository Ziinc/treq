import * as React from "react";
import { execSync } from "node:child_process";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "../test-utils";
import userEvent from "@testing-library/user-event";
import { createTestRepo, findSidebarBranchElement, openRepo } from "../utils";
import {
	createWorkspace,
	getWorkspaces,
	updateWorkspace,
} from "../../src/lib/api";
import { Dashboard } from "../../src/components/Dashboard";
import { waitFor, within } from "@testing-library/react";

const findWorkspaceByBranchName = (
	workspaces: Awaited<ReturnType<typeof getWorkspaces>>,
	branchName: string,
) => workspaces.find((workspace) => workspace.branch_name === branchName);

describe("Dashboard - workspace list", () => {
	let repoPath: string;

	beforeEach(async () => {
		({ repoPath } = createTestRepo(false));

		openRepo(repoPath);

		await createWorkspace(repoPath, "feat/alpha");
		await createWorkspace(repoPath, "feat/beta");
	});

	it("renders workspace sidebar elements correctly branch names in the sidebar", async () => {
		render(<Dashboard />);
		await screen.findByText("main");
		await screen.findByText("feat/alpha");
		await screen.findByText("feat/beta");
		expect(screen.queryByText("unknown")).toBeFalsy();
	});

	it("shows detached HEAD short hash in home repo row instead of unknown", async () => {
		execSync('git commit --allow-empty -m "temp commit for detached test"', {
			cwd: repoPath,
		});
		const detachedCommit = execSync("git rev-parse HEAD~1", {
			cwd: repoPath,
			encoding: "utf8",
		}).trim();
		execSync(`git checkout ${detachedCommit}`, { cwd: repoPath });

		render(<Dashboard />);

		const sidebarRoot = document.querySelector(
			`.${CSS.escape("group/sidebar")}`,
		) as HTMLElement;
		const homeRepoElement = sidebarRoot.querySelector(
			'[data-testid="home-repo-row"]',
		) as HTMLElement;
		expect(homeRepoElement).toBeTruthy();
		await waitFor(() => {
			const homeText = homeRepoElement.textContent || "";
			expect(homeText).toMatch(/\b[0-9a-f]{12}\b/i);
			expect(homeText.toLowerCase()).not.toContain("unknown");
		});
	});

	it("keeps sidebar populated when a workspace self-targets", async () => {
		const workspaces = await getWorkspaces(repoPath);
		const alphaWorkspace = findWorkspaceByBranchName(workspaces, "feat/alpha");
		expect(alphaWorkspace).toBeTruthy();

		await updateWorkspace(repoPath, alphaWorkspace!.id, "feat/alpha");

		render(<Dashboard />);

		await screen.findByText("main");
		await screen.findByText("feat/alpha");
		await screen.findByText("feat/beta");
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

		it("keeps shift-click selection contiguous across the visible sidebar order", async () => {
			await createWorkspace(repoPath, "gumbo-notes");
			await createWorkspace(repoPath, "rubber-test-123");
			await createWorkspace(repoPath, "dduck-joke-readme");
			await createWorkspace(repoPath, "zebra-notes");

			const workspaces = await getWorkspaces(repoPath);
			const dduckWorkspace = findWorkspaceByBranchName(
				workspaces,
				"dduck-joke-readme",
			);
			const rubberWorkspace = findWorkspaceByBranchName(
				workspaces,
				"rubber-test-123",
			);
			const gumboWorkspace = findWorkspaceByBranchName(
				workspaces,
				"gumbo-notes",
			);
			const zebraWorkspace = findWorkspaceByBranchName(
				workspaces,
				"zebra-notes",
			);
			expect(dduckWorkspace).toBeTruthy();
			expect(rubberWorkspace).toBeTruthy();
			expect(gumboWorkspace).toBeTruthy();
			expect(zebraWorkspace).toBeTruthy();

			await updateWorkspace(
				repoPath,
				rubberWorkspace!.id,
				dduckWorkspace!.branch_name,
			);
			await updateWorkspace(
				repoPath,
				zebraWorkspace!.id,
				rubberWorkspace!.branch_name,
			);

			render(<Dashboard />);

			const sidebarRoot = document.querySelector(
				`.${CSS.escape("group/sidebar")}`,
			) as HTMLElement;
			const visibleOrder = [
				"dduck-joke-readme",
				"rubber-test-123",
				"zebra-notes",
				"feat/alpha",
				"feat/beta",
				"gumbo-notes",
			];

			const getWorkspaceRow = async (branchName: string) => {
				const branchElement = await findSidebarBranchElement(branchName);
				return branchElement.closest("div") as HTMLElement;
			};

			const anchorRow = await getWorkspaceRow("dduck-joke-readme");
			const targetRow = await getWorkspaceRow("gumbo-notes");

			fireEvent.click(anchorRow, { metaKey: true });
			fireEvent.click(targetRow, { shiftKey: true });

			await waitFor(async () => {
				await Promise.all(
					visibleOrder.map(async (branchName) => {
						const row = await getWorkspaceRow(branchName);
						expect(row).toHaveClass("bg-primary/20");
					}),
				);
			});

			await waitFor(() => {
				expect(
					within(sidebarRoot).getByRole("button", {
						name: /delete 6 workspaces/i,
					}),
				).toBeTruthy();
			});
		});
	});
});
