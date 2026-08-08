import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { Dashboard } from "../../../src/components/Dashboard";
import { getWorkspaces } from "../../../src/lib/api";
import type { PrInfo } from "../../../src/lib/api-types";
import { render, screen, waitFor, within } from "../../../test/test-utils";
import { createTestRepo, openRepo } from "../../../test/utils";
import { captureDocument } from "../capture";

// Real jj repo, real Rust dispatch, real React tree throughout. The only
// stubbed boundary is the GitHub-facing pair (`getGitRemoteUrl` /
// cached PR statuses), since the real versions shell out to a real git remote
// and the real `gh` CLI, neither of which exist in this harness. PR status
// polling is owned by Rust; the UI only reads the cache.
const { mockListCachedPrStatuses, mockGetGitRemoteUrl } = vi.hoisted(() => ({
	mockListCachedPrStatuses: vi.fn(),
	mockGetGitRemoteUrl: vi.fn(),
}));

vi.mock("../../../src/lib/api", async () => {
	const actual = await vi.importActual<typeof import("../../../src/lib/api")>(
		"../../../src/lib/api",
	);
	return {
		...actual,
		listCachedPrStatuses: mockListCachedPrStatuses,
		getCachedPrInfo: async (repoPath: string, branchName: string) => {
			const map = (await mockListCachedPrStatuses(repoPath)) as Record<
				string,
				PrInfo | null
			>;
			return map[branchName] ?? null;
		},
		startPrStatusPolling: vi.fn(async () => undefined),
		stopPrStatusPolling: vi.fn(async () => undefined),
		refreshPrStatuses: vi.fn(async () => undefined),
		getGitRemoteUrl: mockGetGitRemoteUrl,
	};
});

const REMOTE_INFO = {
	owner: "treq-dev",
	repo: "treq",
	full_name: "treq-dev/treq",
};

const OPEN_BRANCH = "feat/pr-open";
const DRAFT_BRANCH = "feat/pr-draft";
const MERGED_BRANCH = "feat/pr-merged";
const CLOSED_BRANCH = "feat/pr-closed";
const NO_PR_BRANCH = "feat/pr-none";

function pr(overrides: Partial<PrInfo>): PrInfo {
	return {
		number: 1,
		title: "Demo PR",
		state: "OPEN",
		url: "https://github.com/treq-dev/treq/pull/1",
		head_ref_name: OPEN_BRANCH,
		base_ref_name: "main",
		merge_state_status: "CLEAN",
		is_draft: false,
		...overrides,
	};
}

const PR_BY_BRANCH: Record<string, PrInfo | null> = {
	[OPEN_BRANCH]: pr({ number: 10, state: "OPEN", head_ref_name: OPEN_BRANCH }),
	[DRAFT_BRANCH]: pr({
		number: 11,
		state: "OPEN",
		is_draft: true,
		head_ref_name: DRAFT_BRANCH,
	}),
	[MERGED_BRANCH]: pr({
		number: 12,
		state: "MERGED",
		head_ref_name: MERGED_BRANCH,
	}),
	[CLOSED_BRANCH]: pr({
		number: 13,
		state: "CLOSED",
		head_ref_name: CLOSED_BRANCH,
	}),
	[NO_PR_BRANCH]: null,
};

// Create a top-level sibling workspace via the home repo header's real
// "Stack" button/dialog -- workspace creation is part of the scenario, so it
// goes through the real UI rather than the createWorkspace() API helper.
async function createSiblingWorkspace(
	user: ReturnType<typeof userEvent.setup>,
	branchName: string,
) {
	await user.click(await screen.findByTestId("home-repo-row"));
	await screen.findByTestId("show-workspace-header");
	await user.click(await screen.findByRole("button", { name: "Stack" }));

	const dialog = await screen.findByTestId("modal");
	await user.type(within(dialog).getByLabelText("Branch Name"), branchName);
	await user.click(
		within(dialog).getByRole("button", { name: "Create Workspace" }),
	);
	await waitFor(() => {
		expect(screen.queryByTestId("modal")).not.toBeInTheDocument();
	});

	const header = await screen.findByTestId("show-workspace-header");
	await within(header).findByText(branchName);
}

it("captures sidebar workspace icons colored by GitHub PR state", async () => {
	mockGetGitRemoteUrl.mockResolvedValue(REMOTE_INFO);
	mockListCachedPrStatuses.mockResolvedValue(PR_BY_BRANCH);

	const { repoPath } = createTestRepo(false);
	openRepo(repoPath);

	const user = userEvent.setup();
	render(<Dashboard />);

	await createSiblingWorkspace(user, OPEN_BRANCH);
	await createSiblingWorkspace(user, DRAFT_BRANCH);
	await createSiblingWorkspace(user, MERGED_BRANCH);
	await createSiblingWorkspace(user, CLOSED_BRANCH);
	await createSiblingWorkspace(user, NO_PR_BRANCH);

	// Deselect back to the home row so every sidebar icon shows its PR-state
	// color rather than the "selected" primary-color override.
	await user.click(await screen.findByTestId("home-repo-row"));

	const workspaces = await getWorkspaces(repoPath);
	const idFor = (branchName: string) => {
		const workspace = workspaces.find((w) => w.branch_name === branchName);
		if (!workspace) throw new Error(`Expected ${branchName} workspace to exist`);
		return workspace.id;
	};

	await waitFor(() => {
		expect(
			screen.getByTestId(`workspace-pr-icon-${idFor(OPEN_BRANCH)}`),
		).toHaveAttribute("aria-label", "Open PR");
		expect(
			screen.getByTestId(`workspace-pr-icon-${idFor(DRAFT_BRANCH)}`),
		).toHaveAttribute("aria-label", "Draft PR");
		expect(
			screen.getByTestId(`workspace-pr-icon-${idFor(MERGED_BRANCH)}`),
		).toHaveAttribute("aria-label", "PR merged");
		expect(
			screen.getByTestId(`workspace-pr-icon-${idFor(CLOSED_BRANCH)}`),
		).toHaveAttribute("aria-label", "PR closed");
	});

	await captureDocument(document, {
		name: "sidebar-pr-state-colors-01-all-states",
		expectations: [
			"In the left sidebar's Workspaces list, the small branch icon left of each workspace name is colored differently per row: green for feat/pr-open, muted gray for feat/pr-draft, purple for feat/pr-merged, and red for feat/pr-closed.",
			"The feat/pr-none row's branch icon is the plain default muted-gray color, matching feat/pr-draft's gray but visually distinct from the green/purple/red rows.",
		],
	});

	// Hover the open-PR row to confirm the tooltip surfaces the PR status too.
	await user.hover(
		screen.getByTestId(`workspace-pr-icon-${idFor(OPEN_BRANCH)}`),
	);
	await waitFor(() => {
		expect(screen.getAllByText("Open PR").length).toBeGreaterThan(0);
	});
	await captureDocument(document, {
		name: "sidebar-pr-state-colors-02-hover-tooltip",
		expectations: [
			`A tooltip is visible next to the "${OPEN_BRANCH}" sidebar row showing the branch name and a green "Open PR" line below it.`,
		],
	});
}, 120000);
