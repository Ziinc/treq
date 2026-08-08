import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { Dashboard } from "../../../src/components/Dashboard";
import { createWorkspace } from "../../../src/lib/api";
import type { PrInfo } from "../../../src/lib/api-types";
import { render, screen } from "../../../test/test-utils";
import { createTestRepo, findSidebarBranchElement, openRepo } from "../../../test/utils";
import { captureDocument } from "../capture";

// Real jj repo, real Rust dispatch, real React tree throughout. The only
// stubbed boundary is the GitHub-facing cached PR status, since the real
// version shells out to the real `gh` CLI, which doesn't exist in this
// harness. Polling itself runs on the Rust side.
const { mockListCachedPrStatuses } = vi.hoisted(() => ({
	mockListCachedPrStatuses: vi.fn(),
}));

vi.mock("../../../src/lib/api", async () => {
	const actual = await vi.importActual<typeof import("../../../src/lib/api")>(
		"../../../src/lib/api",
	);
	return {
		...actual,
		listCachedPrStatuses: mockListCachedPrStatuses,
		getCachedPrInfo: async (_repoPath: string, branchName: string) => {
			const map = (await mockListCachedPrStatuses()) as Record<
				string,
				PrInfo | null
			>;
			return map[branchName] ?? null;
		},
		startPrStatusPolling: vi.fn(async () => undefined),
		refreshPrBranchStatus: vi.fn(async () => undefined),
		stopPrStatusPolling: vi.fn(async () => undefined),
		refreshPrStatuses: vi.fn(async () => undefined),
	};
});

const OPEN_PR_BRANCH = "feat/alpha";
const NO_PR_BRANCH = "feat/beta";

const OPEN_PR: PrInfo = {
	number: 42,
	title: "Add alpha feature",
	state: "OPEN",
	url: "https://github.com/ziinc/treq/pull/42",
	head_ref_name: OPEN_PR_BRANCH,
	base_ref_name: "main",
	merge_state_status: "CLEAN",
	is_draft: false,
};

it("captures the Copy link to GitHub PR context menu item", async () => {
	mockListCachedPrStatuses.mockResolvedValue({
		[OPEN_PR_BRANCH]: OPEN_PR,
		[NO_PR_BRANCH]: null,
	});

	const { repoPath } = createTestRepo(false);
	openRepo(repoPath);
	await createWorkspace(repoPath, OPEN_PR_BRANCH);
	await createWorkspace(repoPath, NO_PR_BRANCH);

	const user = userEvent.setup();
	// userEvent.setup() installs its own navigator.clipboard stub, so the
	// spy must be attached after setup() runs, not before.
	vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined);

	render(<Dashboard />);

	const alphaElement = await findSidebarBranchElement(OPEN_PR_BRANCH);
	await user.pointer({ keys: "[MouseRight]", target: alphaElement });

	await screen.findByText("Copy link to GitHub PR");
	await captureDocument(document, {
		name: "sidebar-copy-pr-link-01-menu-with-pr",
		expectations: [
			'The open right-click context menu for the "feat/alpha" workspace row lists "Copy branch name" directly above "Copy link to GitHub PR", which sits above "Rename Workspace".',
		],
	});

	await user.click(screen.getByText("Copy link to GitHub PR"));
	expect(navigator.clipboard.writeText).toHaveBeenLastCalledWith(OPEN_PR.url);

	// Close the menu, then confirm the item is absent for a branch with no PR.
	await user.keyboard("{Escape}");
	const betaElement = await findSidebarBranchElement(NO_PR_BRANCH);
	await user.pointer({ keys: "[MouseRight]", target: betaElement });
	await screen.findByText("Copy branch name");
	expect(screen.queryByText("Copy link to GitHub PR")).not.toBeInTheDocument();

	await captureDocument(document, {
		name: "sidebar-copy-pr-link-02-menu-without-pr",
		expectations: [
			'The right-click context menu for the "feat/beta" workspace row (no PR) shows "Copy branch name" followed directly by "Rename Workspace", with no "Copy link to GitHub PR" item between them.',
		],
	});
}, 60000);
