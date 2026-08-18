/**
 * Verifies the Pull Requests list has a Draft filter to the left of Open,
 * and that selecting it shows only draft PRs.
 */

import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
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

function makePr(
	number: number,
	title: string,
	isDraft: boolean,
): GhPullRequest {
	return {
		number,
		title,
		state: "OPEN",
		url: `https://github.com/treq-dev/treq/pull/${number}`,
		body: null,
		author: { login: "octocat", avatar_url: null },
		labels: [],
		head_ref_name: isDraft ? "feat/wip" : "feat/ready",
		base_ref_name: "main",
		merge_state_status: "CLEAN",
		created_at: "2026-07-20T10:00:00Z",
		updated_at: "2026-07-20T10:00:00Z",
		comments: [],
		is_draft: isDraft,
	};
}

const READY = makePr(1, "Ready PR", false);
const DRAFT = makePr(2, "WIP PR", true);

it("filters the PR list to drafts from a Draft tab left of Open", async () => {
	const { repoPath } = createTestRepo(false);

	mockGetGitRemoteUrl.mockResolvedValue(REMOTE_INFO);
	mockGhListPrs.mockImplementation(async (_repo: string, state: string) => {
		if (state === "draft") {
			return { items: [DRAFT], hasMore: false };
		}
		return { items: [READY, DRAFT], hasMore: false };
	});
	mockGhViewPr.mockResolvedValue(DRAFT);
	mockGetPrChecksForPr.mockResolvedValue(null);

	const user = userEvent.setup();
	render(<GitHubPanel repoPath={repoPath} onOpenSettings={vi.fn()} />);

	await user.click(await screen.findByRole("tab", { name: /pull requests/i }));
	await screen.findByText("Ready PR");
	await screen.findByText("WIP PR");

	await captureDocument(document, {
		name: "github-pr-draft-filter-01-open",
		expectations: [
			'The filter bar shows Draft immediately to the left of Open, then Closed and All.',
			'Open is the selected filter, and the list shows both "Ready PR" and "WIP PR".',
		],
	});

	await user.click(screen.getByRole("button", { name: "Draft" }));
	await screen.findByText("WIP PR");
	expect(screen.queryByText("Ready PR")).not.toBeInTheDocument();

	await captureDocument(document, {
		name: "github-pr-draft-filter-02-draft",
		expectations: [
			"Draft is the selected filter in the bar, to the left of Open.",
			'The list shows only "WIP PR" with a Draft chip; "Ready PR" is gone.',
		],
	});
}, 60000);
