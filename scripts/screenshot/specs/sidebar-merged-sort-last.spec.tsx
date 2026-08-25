import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { Dashboard } from "../../../src/components/Dashboard";
import {
	createWorkspace,
	getWorkspaces,
} from "../../../src/lib/api";
import type { PrInfo } from "../../../src/lib/api-types";
import { render, screen, within } from "../../../test/test-utils";
import {
	commitWorkspaceFile,
	createTestRepo,
	findSidebarBranchElement,
	openRepo,
} from "../../../test/utils";
import { captureDocument } from "../capture";

// Real jj repo, real Rust dispatch, real React tree throughout. The only
// stubbed boundary is the GitHub-facing pair (`getGitRemoteUrl` /
// cached PR statuses), since the real versions shell out to a real git remote
// and the real `gh` CLI, neither of which exist in this harness.
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
		refreshPrBranchStatus: vi.fn(async () => undefined),
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

const MERGED_NEWEST = "feat/merged-newest";
const UNMERGED_OLDEST = "feat/unmerged-oldest";

function pr(overrides: Partial<PrInfo>): PrInfo {
	return {
		number: 1,
		title: "Demo PR",
		state: "OPEN",
		url: "https://github.com/treq-dev/treq/pull/1",
		head_ref_name: MERGED_NEWEST,
		base_ref_name: "main",
		merge_state_status: "CLEAN",
		is_draft: false,
		...overrides,
	};
}

const PR_BY_BRANCH: Record<string, PrInfo | null> = {
	[MERGED_NEWEST]: pr({
		number: 20,
		state: "MERGED",
		head_ref_name: MERGED_NEWEST,
	}),
	[UNMERGED_OLDEST]: null,
};

function sleep(ms: number) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function sidebarBranchOrder(): string[] {
	const sidebar = document.querySelector(
		`.${CSS.escape("group/sidebar")}`,
	) as HTMLElement;
	expect(sidebar).toBeTruthy();
	const labels = [MERGED_NEWEST, UNMERGED_OLDEST];
	const elements = labels.map((name) => within(sidebar).getAllByText(name)[0]);
	return [...elements]
		.sort((left, right) =>
			left.compareDocumentPosition(right) & Node.DOCUMENT_POSITION_FOLLOWING
				? -1
				: 1,
		)
		.map((el) => el.textContent?.trim() ?? "");
}

it("keeps a merged workspace sorted after an unmerged one even with newer activity", async () => {
	mockGetGitRemoteUrl.mockResolvedValue(REMOTE_INFO);
	mockListCachedPrStatuses.mockResolvedValue(PR_BY_BRANCH);

	const { repoPath } = createTestRepo(false);
	openRepo(repoPath);

	await createWorkspace(repoPath, UNMERGED_OLDEST);
	await createWorkspace(repoPath, MERGED_NEWEST);

	const workspaces = await getWorkspaces(repoPath);
	const byBranch = (name: string) =>
		workspaces.find((workspace) => workspace.branch_name === name)!;
	const unmergedOldest = byBranch(UNMERGED_OLDEST);
	const mergedNewest = byBranch(MERGED_NEWEST);

	// Older activity first, then bump the *merged* branch's tip so it would
	// naturally sort first by recency alone -- it must still land last.
	await commitWorkspaceFile(
		repoPath,
		{ id: unmergedOldest.id, path: unmergedOldest.workspace_path },
		"unmerged.txt",
		"unmerged\n",
		"Unmerged oldest commit",
	);
	await sleep(1100);
	await commitWorkspaceFile(
		repoPath,
		{ id: mergedNewest.id, path: mergedNewest.workspace_path },
		"merged.txt",
		"merged\n",
		"Merged newest commit",
	);

	const user = userEvent.setup();
	render(<Dashboard />);

	await findSidebarBranchElement(MERGED_NEWEST);
	await findSidebarBranchElement(UNMERGED_OLDEST);

	expect(sidebarBranchOrder()).toEqual([UNMERGED_OLDEST, MERGED_NEWEST]);

	await captureDocument(document, {
		name: "sidebar-merged-sort-last-01-ordered",
		expectations: [
			"In the sidebar's Workspaces list, feat/unmerged-oldest appears above feat/merged-newest, even though feat/merged-newest has the most recent commit.",
			"feat/merged-newest shows a purple PR-merged branch icon, distinguishing it as the merged workspace pushed to the bottom.",
		],
	});

	await user.click(await findSidebarBranchElement(UNMERGED_OLDEST));
	await screen.findByText("Unmerged oldest commit");
}, 60000);
