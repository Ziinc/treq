import * as React from "react";
import { expect, it } from "vitest";
import userEvent from "@testing-library/user-event";
import {
	createTestRepo,
	openRepo,
	resolveWorkspacePath,
	writeRepoFile,
	writeWorkspaceFile,
} from "../../../test/utils";
import { render, screen, waitFor, within } from "../../../test/test-utils";
import { Dashboard } from "../../../src/components/Dashboard";
import { getWorkspaces } from "../../../src/lib/api";
import { captureDocument } from "../capture";

const BRANCH_NAME = "feat/autosave-check";

const PASSING_WORKFLOW = `
name: Passing CI
on:
  workflow_dispatch: {}
jobs:
  greet:
    name: Greet Job
    steps:
      - name: Say hello
        run: echo hello
      - name: Say world
        run: echo world
`;

it("captures autosave after a passing check and drop after a manual commit", async () => {
	const { repoPath } = createTestRepo(false);
	openRepo(repoPath);
	await writeRepoFile(repoPath, ".treq/workflows/ci.yaml", PASSING_WORKFLOW);

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

	const workspace = (await getWorkspaces(repoPath)).find(
		(candidate) => candidate.branch_name === BRANCH_NAME,
	);
	if (!workspace) {
		throw new Error(`Expected ${BRANCH_NAME} workspace to exist`);
	}
	const workspacePath = resolveWorkspacePath(
		repoPath,
		workspace.workspace_path,
	);
	writeWorkspaceFile(workspacePath, "good.txt", "checked-in\n");

	await user.click(await screen.findByRole("tab", { name: /^Checks/ }));
	await screen.findByRole("tab", { name: /^Checks/, selected: true });
	await screen.findByText("Passing CI");

	await user.click(
		await screen.findByRole("button", { name: /Trust Repository/i }),
	);
	await waitFor(() => {
		if (screen.queryByRole("button", { name: /Trust Repository/i })) {
			throw new Error("trust banner still present");
		}
	});

	await captureDocument(document, {
		name: "autosave-on-check-pass-01-before-run",
		expectations: [
			"The Checks tab is selected on a workspace named feat/autosave-check.",
			'A workflow card titled "Passing CI" lists Greet Job with Run buttons enabled and no green pass icons yet.',
		],
	});

	await user.click(
		await screen.findByRole("button", { name: /Run Greet Job/i }),
	);
	await waitFor(
		() => {
			const passIcons = document.querySelectorAll(
				'[data-testid="step-result-pass"]',
			);
			if (passIcons.length < 2) {
				throw new Error(
					`expected passing steps, got ${passIcons.length} pass icons`,
				);
			}
		},
		{ timeout: 20000 },
	);

	await user.click(await screen.findByRole("tab", { name: /^Commits/ }));
	await screen.findByRole("tab", { name: /^Commits/, selected: true });
	await screen.findByText(/treq-autosave: good\.txt/);

	await captureDocument(document, {
		name: "autosave-on-check-pass-02-autosave-in-log",
		expectations: [
			"The Commits tab is selected.",
			'The commit list shows a row whose message starts with "treq-autosave: good.txt".',
		],
	});

	writeWorkspaceFile(workspacePath, "good.txt", "shipped\n");
	await user.click(await screen.findByRole("tab", { name: /^Changes/ }));
	await screen.findByRole("tab", { name: /^Changes/, selected: true });
	await screen.findByText("shipped");
	await user.type(
		await screen.findByPlaceholderText("Message"),
		"ship the good changes",
	);
	await user.click(screen.getByRole("button", { name: "Commit" }));
	await screen.findByText("Commit created");

	await user.click(await screen.findByRole("tab", { name: /^Commits/ }));
	await screen.findByRole("tab", { name: /^Commits/, selected: true });
	await waitFor(
		() => {
			expect(screen.getByText("ship the good changes")).toBeTruthy();
		},
		{ timeout: 15000 },
	);
	await waitFor(() => {
		expect(screen.queryByText(/treq-autosave: good\.txt/)).toBeNull();
	});

	await captureDocument(document, {
		name: "autosave-on-check-pass-03-after-manual-commit",
		expectations: [
			'The commit list shows "ship the good changes".',
			"No commit row shows treq-autosave in its message.",
		],
	});
}, 90000);
