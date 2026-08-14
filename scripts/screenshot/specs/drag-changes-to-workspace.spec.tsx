import { expect, it } from "vitest";
import userEvent from "@testing-library/user-event";
import { fireEvent } from "@testing-library/react";
import {
	createTestRepo,
	findSidebarBranchElement,
	openRepo,
	resolveWorkspacePath,
	writeWorkspaceFile,
} from "../../../test/utils";
import { createWorkspace, getWorkspaces } from "../../../src/lib/api";
import { render, screen, waitFor } from "../../../test/test-utils";
import { Dashboard } from "../../../src/components/Dashboard";
import { captureDocument } from "../capture";

function createDataTransfer(): DataTransfer {
	const store = new Map<string, string>();
	const types: string[] = [];
	return {
		dropEffect: "move",
		effectAllowed: "all",
		files: [] as unknown as FileList,
		items: [] as unknown as DataTransferItemList,
		types,
		clearData: (format?: string) => {
			if (format) {
				store.delete(format);
				const idx = types.indexOf(format);
				if (idx >= 0) types.splice(idx, 1);
			} else {
				store.clear();
				types.length = 0;
			}
		},
		getData: (format: string) => store.get(format) ?? "",
		setData: (format: string, data: string) => {
			store.set(format, data);
			if (!types.includes(format)) types.push(format);
		},
		setDragImage: () => {},
	} as DataTransfer;
}

function dragAndDrop(sourceEl: HTMLElement, dropTarget: HTMLElement) {
	const dataTransfer = createDataTransfer();
	fireEvent.dragStart(sourceEl, { dataTransfer });
	fireEvent.dragEnter(dropTarget, { dataTransfer });
	fireEvent.dragOver(dropTarget, { dataTransfer });
	fireEvent.drop(dropTarget, { dataTransfer });
	fireEvent.dragEnd(sourceEl, { dataTransfer });
}

it("captures drag-to-workspace confirmation and completed move", async () => {
	const sourceBranch = "feat/drag-src";
	const destBranch = "feat/drag-dest";
	const { repoPath } = createTestRepo(false);
	openRepo(repoPath);

	const sourceId = await createWorkspace(repoPath, sourceBranch);
	const destId = await createWorkspace(repoPath, destBranch);
	const workspaces = await getWorkspaces(repoPath);
	const source = workspaces.find((w) => w.id === sourceId);
	const dest = workspaces.find((w) => w.id === destId);
	if (!source || !dest) throw new Error("workspaces missing");

	writeWorkspaceFile(
		resolveWorkspacePath(repoPath, source.workspace_path),
		"drag-me.txt",
		"line one\n",
	);

	const user = userEvent.setup();
	render(<Dashboard />);

	await user.click(await findSidebarBranchElement(sourceBranch));
	const reviewTab = await screen.findByRole("tab", { name: /^Changes/ });
	await user.click(reviewTab);
	await screen.findByRole("tab", { name: /^Changes/, selected: true });

	await waitFor(() =>
		expect(screen.getAllByText("drag-me.txt").length).toBeGreaterThan(0),
	);

	await captureDocument(document, {
		name: "drag-changes-to-workspace-01-before",
		expectations: [
			'The Review Changes section lists "drag-me.txt".',
			"The sidebar shows both feat/drag-src and feat/drag-dest workspaces.",
			"No confirmation dialog is open.",
		],
	});

	const [sidebarFile] = screen.getAllByText("drag-me.txt");
	const dragRow = sidebarFile.closest("[draggable='true']") as HTMLElement;
	if (!dragRow) throw new Error("draggable file row not found");
	const destRow = await findSidebarBranchElement(destBranch);
	dragAndDrop(dragRow, destRow);

	await screen.findByText(/Move 1 file to feat\/drag-dest\?/);
	await captureDocument(document, {
		name: "drag-changes-to-workspace-02-confirm",
		expectations: [
			'A confirmation dialog titled "Move 1 file to feat/drag-dest?" is open.',
			"The dialog has Cancel and Move actions.",
			"The description mentions moving uncommitted changes into the target workspace.",
		],
	});

	await user.click(await screen.findByRole("button", { name: /^Move$/ }));

	await waitFor(() => {
		expect(screen.queryByText(/Move 1 file to feat\/drag-dest\?/)).toBeNull();
		expect(screen.queryAllByText("drag-me.txt")).toHaveLength(0);
	});

	await captureDocument(document, {
		name: "drag-changes-to-workspace-03-moved",
		expectations: [
			"The confirmation dialog has closed.",
			'The Changes list no longer shows "drag-me.txt" (empty or no-changes state).',
			"The Changes tab badge no longer shows a pending change count of 1.",
		],
	});
}, 60000);
