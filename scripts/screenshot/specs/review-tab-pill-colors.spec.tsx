/**
 * Captures the Review tab number pill in its three color states:
 * yellow (uncommitted), grey (committed only), red (conflict).
 */

import * as React from "react";
import { expect, it } from "vitest";
import userEvent from "@testing-library/user-event";
import {
	commitWorkspaceFile,
	createTestRepo,
	findSidebarBranchElement,
	openRepo,
	resolveWorkspacePath,
	writeWorkspaceFile,
} from "../../../test/utils";
import { render, screen, waitFor } from "../../../test/test-utils";
import { Dashboard } from "../../../src/components/Dashboard";
import {
	checkAndRebaseWorkspaces,
	createCommit,
	createWorkspace,
	ensureWorkspaceIndexed,
	getWorkspaces,
} from "../../../src/lib/api";
import { captureDocument } from "../capture";

function reviewPill(): HTMLElement {
	const tab = screen.getByRole("tab", { name: /^Review/ });
	const pill = tab.querySelector("span.rounded-full");
	if (!(pill instanceof HTMLElement)) {
		throw new Error("Review tab pill not found");
	}
	return pill;
}

it("captures yellow Review pill for uncommitted changes", async () => {
	const { repoPath } = createTestRepo(false);
	openRepo(repoPath);

	const workspaceId = await createWorkspace(repoPath, "feat/pill-yellow");
	const workspace = (await getWorkspaces(repoPath)).find(
		(w) => w.id === workspaceId,
	);
	if (!workspace) throw new Error("workspace not found");
	const workspacePath = resolveWorkspacePath(
		repoPath,
		workspace.workspace_path,
	);
	writeWorkspaceFile(workspacePath, "dirty.txt", "uncommitted\n");

	const user = userEvent.setup();
	render(<Dashboard />);

	await user.click(await findSidebarBranchElement("feat/pill-yellow"));
	await screen.findByTestId("show-workspace-header");
	await user.click(await screen.findByRole("tab", { name: /^Review/ }));
	await screen.findAllByText("dirty.txt");

	await waitFor(() => {
		const pill = reviewPill();
		expect(pill).toHaveTextContent("1");
		expect(pill.className).toContain("bg-yellow-500");
	});

	await captureDocument(document, {
		name: "review-tab-pill-01-yellow-uncommitted",
		expectations: [
			'The Review tab shows a yellow number pill reading "1" next to the Review label.',
			"The Review tab is selected and dirty.txt appears in the Changes sidebar.",
			"The pill is yellow (not red or grey), signalling uncommitted working-copy changes.",
		],
	});
}, 60000);

it("captures grey Review pill for committed changes only", async () => {
	const { repoPath } = createTestRepo(false);
	openRepo(repoPath);

	const workspaceId = await createWorkspace(repoPath, "feat/pill-grey");
	const workspace = (await getWorkspaces(repoPath)).find(
		(w) => w.id === workspaceId,
	);
	if (!workspace) throw new Error("workspace not found");

	await commitWorkspaceFile(
		repoPath,
		{ id: workspace.id, path: workspace.workspace_path },
		"committed.txt",
		"committed content\n",
		"add committed file",
	);

	const user = userEvent.setup();
	render(<Dashboard />);

	await user.click(await findSidebarBranchElement("feat/pill-grey"));
	await screen.findByTestId("show-workspace-header");

	await waitFor(() => {
		const pill = reviewPill();
		expect(pill).toHaveTextContent("1");
		expect(pill.className).toContain("bg-muted");
		expect(pill.className).not.toContain("bg-yellow-500");
		expect(pill.className).not.toContain("bg-destructive");
	});

	await captureDocument(document, {
		name: "review-tab-pill-02-grey-committed",
		expectations: [
			'The Review tab shows a muted grey number pill reading "1" next to the Review label.',
			"The Code tab is still the active tab; the grey pill is visible in the tab bar.",
			"The pill is grey (not yellow or red), signalling committed changes only.",
		],
	});
}, 60000);

it("captures red Review pill for conflicts", async () => {
	const { repoPath, defaultBranch } = createTestRepo(false);
	openRepo(repoPath);

	const workspaceId = await createWorkspace(repoPath, "feat/pill-red");
	const workspace = (await getWorkspaces(repoPath)).find(
		(w) => w.id === workspaceId,
	);
	if (!workspace) throw new Error("workspace not found");
	const workspacePath = resolveWorkspacePath(
		repoPath,
		workspace.workspace_path,
	);

	writeWorkspaceFile(workspacePath, "README.md", "workspace side\n");
	await createCommit(repoPath, workspaceId, "workspace conflicting change");

	writeWorkspaceFile(repoPath, "README.md", "main side\n");
	await createCommit(repoPath, null, "main conflicting change");

	await checkAndRebaseWorkspaces(repoPath, workspaceId, defaultBranch, true);
	await ensureWorkspaceIndexed(repoPath, workspaceId, workspacePath);

	const user = userEvent.setup();
	render(<Dashboard />);
	await screen.findByTestId(`workspace-conflict-indicator-${workspaceId}`);

	await user.click(await findSidebarBranchElement("feat/pill-red"));
	await screen.findByTestId("show-workspace-header");

	await waitFor(() => {
		const pill = reviewPill();
		expect(pill.className).toContain("bg-destructive/20");
		expect(pill.className).toContain("text-destructive");
		expect(pill.className).not.toContain("bg-yellow-500");
	});

	await captureDocument(document, {
		name: "review-tab-pill-03-red-conflict",
		expectations: [
			"The Review tab shows a soft destructive-red number pill next to the Review label.",
			"The workspace header / sidebar indicates a conflict for this branch.",
			"The pill uses a muted destructive tint (not solid filled red, and not yellow or grey).",
		],
	});
}, 60000);
