/**
 * When a terminal goes idle, Treq re-scans the working copy. Agents often
 * write files without a reliable watcher event, so the Changes tab must
 * pick up those files after the idle pulse (the same window event the
 * terminal summaries hook dispatches).
 */

import * as React from "react";
import { expect, it } from "vitest";
import userEvent from "@testing-library/user-event";
import {
	createTestRepo,
	openRepo,
	resolveWorkspacePath,
	writeWorkspaceFile,
} from "../../../test/utils";
import { render, screen } from "../../../test/test-utils";
import { Dashboard } from "../../../src/components/Dashboard";
import { createWorkspace, getWorkspaces } from "../../../src/lib/api";
import { dispatchRefreshWorkspaceChanges } from "../../../src/lib/change-file-drag";
import { captureDocument } from "../capture";

const BRANCH_NAME = "feat/idle-fs-refresh";

it("refreshes the Changes tab after a terminal-idle filesystem scan", async () => {
	const { repoPath } = createTestRepo(false);
	openRepo(repoPath);

	const workspaceId = await createWorkspace(repoPath, BRANCH_NAME);
	const workspace = (await getWorkspaces(repoPath)).find(
		(w) => w.id === workspaceId,
	);
	if (!workspace) throw new Error(`workspace ${BRANCH_NAME} not found`);
	const workspacePath = resolveWorkspacePath(repoPath, workspace.workspace_path);

	const user = userEvent.setup();
	render(<Dashboard />);

	await user.click(await screen.findByText(BRANCH_NAME));
	await screen.findByTestId("show-workspace-header");
	await user.click(await screen.findByRole("tab", { name: /^Changes/i }));

	await captureDocument(document, {
		name: "terminal-idle-fs-refresh-01-before-agent-write",
		expectations: [
			"The Changes tab is open on feat/idle-fs-refresh and does not list agent-output.txt.",
		],
	});

	writeWorkspaceFile(workspacePath, "agent-output.txt", "written by agent\n");
	dispatchRefreshWorkspaceChanges();

	expect(await screen.findByText("agent-output.txt")).toBeTruthy();
	await screen.findByText(/written by agent/);

	await captureDocument(document, {
		name: "terminal-idle-fs-refresh-02-after-idle-refresh",
		expectations: [
			"The Changes tab lists agent-output.txt after the idle filesystem refresh.",
			"The diff shows the added line 'written by agent'.",
		],
	});
}, 60_000);
