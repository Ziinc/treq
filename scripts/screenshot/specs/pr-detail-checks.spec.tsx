import { expect, it, vi } from "vitest";
import { PrDetailPanel } from "../../../src/components/github-panel/PrDetail";
import type { GhPullRequest } from "../../../src/lib/api-types";
import { render, screen } from "../../../test/test-utils";
import { captureDocument } from "../capture";

// PrDetailPanel resolves PR data entirely through `gh` (ghViewPr), which the
// desktop harness can't reach in this environment. That single boundary is
// stubbed; the panel and its "Checks" section are the real components.
const api = vi.hoisted(() => ({
	ghViewPr: vi.fn(),
}));

vi.mock("../../../src/lib/api", async (importOriginal) => {
	const original = await importOriginal<typeof import("../../../src/lib/api")>();
	return {
		...original,
		ghViewPr: api.ghViewPr,
	};
});

function basePr(overrides: Partial<GhPullRequest> = {}): GhPullRequest {
	return {
		number: 42,
		title: "Add CI status indicator to PR view",
		state: "OPEN",
		url: "https://github.com/acme/treq/pull/42",
		body: "This adds a Checks section to the PR detail view.",
		author: { login: "alice" },
		labels: [],
		head_ref_name: "feat/ci-status",
		base_ref_name: "main",
		merge_state_status: "CLEAN",
		created_at: "2026-01-01T00:00:00Z",
		updated_at: "2026-01-01T00:00:00Z",
		comments: null,
		is_draft: false,
		...overrides,
	};
}

it("captures the Checks section with a mix of CI job statuses", async () => {
	api.ghViewPr.mockReset().mockResolvedValue(
		basePr({
			status_check_rollup: [
				{
					__typename: "CheckRun",
					name: "build",
					context: null,
					status: "COMPLETED",
					conclusion: "SUCCESS",
					state: null,
					description: null,
					workflow_name: "CI",
					details_url: "https://github.com/acme/treq/actions/runs/1",
					target_url: null,
				},
				{
					__typename: "CheckRun",
					name: "test",
					context: null,
					status: "COMPLETED",
					conclusion: "FAILURE",
					state: null,
					description: null,
					workflow_name: "CI",
					details_url: "https://github.com/acme/treq/actions/runs/2",
					target_url: null,
				},
				{
					__typename: "CheckRun",
					name: "lint",
					context: null,
					status: "IN_PROGRESS",
					conclusion: null,
					state: null,
					description: null,
					workflow_name: "CI",
					details_url: "https://github.com/acme/treq/actions/runs/3",
					target_url: null,
				},
				{
					__typename: "StatusContext",
					name: null,
					context: "ci/circleci: verify",
					status: null,
					conclusion: null,
					state: "SUCCESS",
					description: "Your tests passed",
					workflow_name: null,
					details_url: null,
					target_url: "https://circleci.com/gh/acme/treq/123",
				},
			],
		}),
	);

	render(
		<PrDetailPanel repoFullName="acme/treq" prNumber={42} onClose={() => {}} />,
	);

	expect(await screen.findByText(/checks \(2\/4\)/i)).toBeVisible();
	expect(screen.getByText("build")).toBeVisible();
	expect(screen.getByText("test")).toBeVisible();
	expect(screen.getByText("lint")).toBeVisible();
	expect(screen.getByText("ci/circleci: verify")).toBeVisible();

	await captureDocument(document, {
		name: "pr-detail-checks-01-mixed-statuses",
		expectations: [
			'A "Checks (2/4)" section header appears below the PR title/branch row, above the PR description.',
			'Four check rows are listed: "build" with a green success icon, "test" with a red failure icon, "lint" with an amber in-progress spinner icon, and "ci/circleci: verify" with a green success icon.',
			"Each row shows a short status word (Success/Failed/In progress) aligned to the right of the job name.",
		],
	});
}, 60000);

it("does not render a Checks section when statusCheckRollup is empty", async () => {
	api.ghViewPr.mockReset().mockResolvedValue(basePr({ status_check_rollup: [] }));

	render(
		<PrDetailPanel repoFullName="acme/treq" prNumber={42} onClose={() => {}} />,
	);

	expect(await screen.findByText("Add CI status indicator to PR view")).toBeVisible();
	expect(screen.queryByText(/checks \(/i)).not.toBeInTheDocument();

	await captureDocument(document, {
		name: "pr-detail-checks-02-no-checks",
		expectations: [
			"No 'Checks' section heading or check rows are visible anywhere in the PR detail panel.",
			"The PR title, branch refs, and description render normally, immediately followed by the description box with no gap for an empty checks section.",
		],
	});
}, 60000);
