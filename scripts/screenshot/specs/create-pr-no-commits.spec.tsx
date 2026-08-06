import fs from "node:fs";
import path from "node:path";
import userEvent from "@testing-library/user-event";
import * as React from "react";
import { it } from "vitest";
import { Dashboard } from "../../../src/components/Dashboard";
import { render, screen, within } from "../../../test/test-utils";
import { createTestRepo, openRepo } from "../../../test/utils";
import { captureDocument } from "../capture";

function setOriginUrl(repoPath: string, remoteUrl: string) {
	const configPath = path.join(repoPath, ".git", "config");
	let config = fs.readFileSync(configPath, "utf-8");
	if (/\[remote "origin"\][\s\S]*?url\s*=/.test(config)) {
		config = config.replace(
			/(\[remote "origin"\][\s\S]*?url\s*=\s*).*/m,
			`$1${remoteUrl}`,
		);
	} else {
		config += `\n[remote "origin"]\n\turl = ${remoteUrl}\n`;
	}
	fs.writeFileSync(configPath, config);
}

// Scenario: a brand-new workspace with a GitHub remote configured but no real
// commit yet -- just the empty working-copy commit jj creates automatically.
// Create PR must stay disabled until the user explicitly commits; the
// working-copy commit alone doesn't count.
it("captures Create PR disabled for a workspace with no real commits yet", async () => {
	const { repoPath } = createTestRepo(true);
	openRepo(repoPath);
	setOriginUrl(repoPath, "https://github.com/acme/treq.git");

	const user = userEvent.setup();
	render(<Dashboard />);

	await screen.findByTestId("show-workspace-header");
	await user.click(await screen.findByRole("button", { name: "Stack" }));
	const dialog = await screen.findByTestId("modal");
	await user.type(
		within(dialog).getByLabelText("Branch Name"),
		"feat/no-commits-yet",
	);
	await user.click(
		within(dialog).getByRole("button", { name: "Create Workspace" }),
	);

	const header = await screen.findByTestId("show-workspace-header");
	await within(header).findByText("feat/no-commits-yet");
	await within(header).findByRole("button", { name: /^create pr$/i });

	await captureDocument(document, {
		name: "create-pr-no-commits-01-disabled",
		expectations: [
			"The workspace header shows a dimmed/greyed-out 'Create PR' button (and its chevron sibling), visibly disabled compared to a normal dark active button.",
		],
	});
}, 60000);
