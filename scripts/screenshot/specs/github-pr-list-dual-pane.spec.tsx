/**
 * Verifies that the GitHub panel's PR list hides the base/target branch
 * (the "→ base" half of "head → base") once a PR is selected and the list
 * narrows into dual-pane mode alongside the detail panel. With nothing
 * selected the list is full width and still shows both branches.
 */

import userEvent from "@testing-library/user-event";
import { it, vi } from "vitest";
import { GitHubPanel } from "../../../src/components/GitHubPanel";
import type { GhPullRequest } from "../../../src/lib/api-types";
import { render, screen } from "../../../test/test-utils";
import { createTestRepo } from "../../../test/utils";
import { captureDocument } from "../capture";

const {
	mockGetGitRemoteUrl,
	mockGhListPrs,
	mockGhViewPr,
	mockGetPrChecksForPr,
} = vi.hoisted(() => ({
	mockGetGitRemoteUrl: vi.fn(),
	mockGhListPrs: vi.fn(),
	mockGhViewPr: vi.fn(),
	mockGetPrChecksForPr: vi.fn(),
}));

vi.mock("../../../src/lib/api", async () => {
	const actual = await vi.importActual<typeof import("../../../src/lib/api")>(
		"../../../src/lib/api",
	);
	return {
		...actual,
		getGitRemoteUrl: mockGetGitRemoteUrl,
		ghListIssues: vi.fn().mockResolvedValue({ items: [], hasMore: false }),
		ghListPrs: mockGhListPrs,
		ghViewPr: mockGhViewPr,
		getPrChecksForPr: mockGetPrChecksForPr,
	};
});

const REMOTE_INFO = {
	owner: "treq-dev",
	repo: "treq",
	full_name: "treq-dev/treq",
};

const PR: GhPullRequest = {
	number: 42,
	title: "Add example module",
	state: "OPEN",
	url: "https://github.com/treq-dev/treq/pull/42",
	body: null,
	author: { login: "octocat", avatar_url: null },
	labels: [],
	head_ref_name: "feat/example-module",
	base_ref_name: "main",
	merge_state_status: "CLEAN",
	created_at: "2026-07-20T10:00:00Z",
	updated_at: "2026-07-20T10:00:00Z",
	comments: [],
	is_draft: false,
};

it("hides the base branch in the PR list once dual-pane detail opens", async () => {
	const { repoPath } = createTestRepo(false);

	mockGetGitRemoteUrl.mockResolvedValue(REMOTE_INFO);
	mockGhListPrs.mockResolvedValue({ items: [PR], hasMore: false });
	mockGhViewPr.mockResolvedValue(PR);
	mockGetPrChecksForPr.mockResolvedValue(null);

	const user = userEvent.setup();
	render(<GitHubPanel repoPath={repoPath} onOpenSettings={vi.fn()} />);

	await user.click(await screen.findByRole("tab", { name: /pull requests/i }));
	await screen.findByText("Add example module");

	await captureDocument(document, {
		name: "github-pr-list-dual-pane-01-list-only",
		expectations: [
			'The full-width PR list shows row "Add example module #42" with a monospace branch path reading "feat/example-module → main" (both head and base branch, joined by an arrow).',
			"No detail panel is open -- the list occupies the whole panel width.",
		],
	});

	await user.click(await screen.findByText("Add example module"));
	await screen.findByText("Pull Request #42");

	await captureDocument(document, {
		name: "github-pr-list-dual-pane-02-detail-open",
		expectations: [
			'The PR list has narrowed to a sidebar with a PR detail panel now open beside it, and the list row\'s branch text shows only "feat/example-module" with no arrow and no "main" base branch.',
			'The detail panel on the right shows the full PR "Add example module #42".',
		],
	});
}, 60000);
