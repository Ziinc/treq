import fs from "node:fs";
import path from "node:path";
import userEvent from "@testing-library/user-event";
import * as React from "react";
import { expect, it, vi } from "vitest";
import { Dashboard } from "../../../src/components/Dashboard";
import { getWorkspaces } from "../../../src/lib/api";
import { render, screen, waitFor, within } from "../../../test/test-utils";
import {
	createTestRepo,
	openRepo,
	resolveWorkspacePath,
	writeWorkspaceFile,
} from "../../../test/utils";
import { captureDocument } from "../capture";

const BRANCH_NAME = "feat/commit-and-create-pr-dropdown";

// Deferred resolvers so the spec can hold the split-button in its loading
// state long enough to capture it, mirroring the real push-then-create-PR
// sequence the "Commit and create PR" dropdown item runs.
const deferred = vi.hoisted(() => ({
	pushResolve: null as null | (() => void),
	createResolve: null as null | ((prNumber: number) => void),
}));

vi.mock("../../../src/lib/api", async () => {
	const actual = await vi.importActual<typeof import("../../../src/lib/api")>(
		"../../../src/lib/api",
	);
	return {
		...actual,
		getCachedPrInfo: vi.fn().mockResolvedValue(null),
		startPrStatusPolling: vi.fn(async () => undefined),
		refreshPrBranchStatus: vi.fn(async () => undefined),
		stopPrStatusPolling: vi.fn(async () => undefined),
		refreshPrStatuses: vi.fn(async () => undefined),
		pushWorkspaceToRemote: vi.fn(
			() =>
				new Promise<string>((resolve) => {
					deferred.pushResolve = () => resolve("pushed");
				}),
		),
		ghCreatePr: vi.fn(
			() =>
				new Promise<number>((resolve) => {
					deferred.createResolve = (prNumber) => resolve(prNumber);
				}),
		),
	};
});

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

// Previously the "Commit and create PR" dropdown item called
// event.preventDefault() in its onSelect handler, which stops Radix from
// auto-closing the (modal) dropdown menu. That left the menu open and
// pointer-events blocked on the rest of the page for the whole async
// commit+push+create-PR sequence -- looking like the UI had frozen. This
// captures that the menu now closes immediately on click and that the
// primary Commit button clearly reflects the in-flight state instead.
it("captures the commit dropdown closing immediately and showing a Creating PR state", async () => {
	const { repoPath } = createTestRepo(true);
	openRepo(repoPath);
	setOriginUrl(repoPath, "https://github.com/acme/treq.git");

	const user = userEvent.setup();
	render(<Dashboard />);

	await screen.findByTestId("show-workspace-header");
	await user.click(await screen.findByRole("button", { name: "Stack" }));
	const dialog = await screen.findByTestId("modal");
	await user.type(within(dialog).getByLabelText("Branch Name"), BRANCH_NAME);
	await user.click(
		within(dialog).getByRole("button", { name: "Create Workspace" }),
	);
	await waitFor(() => {
		expect(screen.queryByTestId("modal")).not.toBeInTheDocument();
	});

	const header = await screen.findByTestId("show-workspace-header");
	await within(header).findByText(BRANCH_NAME);

	const workspace = (await getWorkspaces(repoPath)).find(
		(w) => w.branch_name === BRANCH_NAME,
	)!;
	writeWorkspaceFile(
		resolveWorkspacePath(repoPath, workspace.workspace_path),
		"feature.txt",
		"feature content\n",
	);

	await user.click(await screen.findByRole("tab", { name: /^Changes/ }));
	await screen.findByRole("tab", { name: /^Changes/, selected: true });
	await waitFor(() =>
		expect(screen.getAllByText("feature.txt").length).toBeGreaterThan(0),
	);

	await user.type(await screen.findByPlaceholderText("Message"), "Add feature");

	await user.click(
		await screen.findByRole("button", { name: "More commit options" }),
	);
	const dropdownItem = await screen.findByRole("menuitem", {
		name: "Commit and create PR",
	});

	await user.click(dropdownItem);

	// The dropdown must be gone immediately -- it must not linger open while
	// the commit/push/create-PR sequence is in flight.
	await waitFor(() =>
		expect(
			screen.queryByRole("menuitem", { name: "Commit and create PR" }),
		).not.toBeInTheDocument(),
	);

	await screen.findByText("Creating PR…");
	// The header's own "Create PR" split button shares a mutation key with the
	// Review tab's "Commit and create PR" action, so it must also flip into
	// its loading state ("Creating…" or "Pushing & creating…") even though
	// this workspace's push+create-PR was triggered from the dropdown, not
	// from the header button itself.
	await within(header).findByRole("button", {
		name: /pushing & creating…|creating…/i,
	});
	await captureDocument(document, {
		name: "commit-and-create-pr-dropdown-01-loading",
		expectations: [
			"No dropdown menu is visible anywhere on the page -- it has fully closed.",
			"The primary commit button (left side of the split button in the Review sidebar) shows a spinning loading icon and the text 'Creating PR…' in place of its normal 'Commit' label.",
			"The header's 'Create PR' button (top right) also shows a spinning loading icon and loading text instead of its normal 'Create PR' label, even though the header button itself was never clicked.",
		],
	});

	// While the PR creation is still pending, the rest of the UI must remain
	// interactive -- switching tabs should work immediately, proving nothing
	// is blocking pointer events on the page.
	await user.click(await screen.findByRole("tab", { name: /^Code/ }));
	await screen.findByRole("tab", { name: /^Code/, selected: true });
	await captureDocument(document, {
		name: "commit-and-create-pr-dropdown-02-still-interactive",
		expectations: [
			"The 'Code' tab is now selected/active instead of 'Review', proving the tab click was not blocked by the still-pending PR creation.",
		],
	});

	deferred.pushResolve?.();
	await waitFor(() => expect(deferred.createResolve).not.toBeNull());
	deferred.createResolve?.(88);

	await screen.findByText("Pull request created");
	await captureDocument(document, {
		name: "commit-and-create-pr-dropdown-03-created",
		expectations: [
			"A green success toast reads 'Pull request created' with '#88' beneath it.",
		],
	});
}, 60000);
