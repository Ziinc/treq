import * as React from "react";
import { expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import {
	createTestRepo,
	openRepo,
	writeWorkspaceFile,
} from "../../../test/utils";
import { render, screen, waitFor, within } from "../../../test/test-utils";
import { Dashboard } from "../../../src/components/Dashboard";
import { getWorkspaceStatus } from "../../../src/lib/api";
import { captureDocument } from "../capture";

const BRANCH_NAME = "feat/home-sync";

function runGit(repoPath: string, args: string[]) {
	execFileSync("git", args, {
		cwd: repoPath,
		encoding: "utf8",
	});
}

// Home-repo sync must follow git HEAD, not bookmarks on the jj WC parent.
// Reproduces the case where the WC still sits on the default-branch tip while
// HEAD is on a different branch that is one commit ahead of origin.
it("captures the home repo header sync indicator when the checked-out branch is ahead", async () => {
	const { repoPath, defaultBranch } = createTestRepo(true);
	openRepo(repoPath);

	// Park the home WC on the default tip (healthy open-repo state).
	await getWorkspaceStatus(repoPath, null);

	runGit(repoPath, ["checkout", "-b", BRANCH_NAME]);
	runGit(repoPath, ["push", "-u", "origin", BRANCH_NAME]);
	writeWorkspaceFile(
		repoPath,
		"home-sync-ahead.txt",
		"unpushed home-repo line\n",
	);
	runGit(repoPath, ["add", "home-sync-ahead.txt"]);
	runGit(repoPath, ["commit", "-m", "Unpushed commit on home feature branch"]);

	render(<Dashboard />);

	const header = await screen.findByTestId("show-workspace-header");
	await within(header).findByRole("button", { name: BRANCH_NAME });
	expect(defaultBranch).not.toEqual(BRANCH_NAME);

	await waitFor(() => {
		expect(within(header).getByText("↑1")).toBeInTheDocument();
	});

	await captureDocument(document, {
		name: "home-repo-sync-indicator-01-ahead",
		expectations: [
			`The header branch button reads "${BRANCH_NAME}" (not the default branch).`,
			"The header shows an '↑1' sync indicator with the circular refresh-arrows icon.",
			"A small amber/yellow pip sits on the sync button, indicating unpushed commits.",
		],
	});
}, 60000);
