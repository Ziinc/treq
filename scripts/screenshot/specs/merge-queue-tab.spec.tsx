import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { GitHubPanel } from "../../../src/components/GitHubPanel";
import type { QueueEntryStatus } from "../../../src/lib/api-types";
import { render, screen, waitFor, within } from "../../../test/test-utils";
import { createTestRepo } from "../../../test/utils";
import { captureDocument } from "../capture";

// The GitHub panel's Merge Queue tab reads entirely from Supabase (queue
// contents + the per-repo opt-in) and from `gh` for the repo's remote, none of
// which the desktop harness can reach. Those two boundaries are stubbed; the
// panel, its tabs and its rendering are the real components.
const { queueState, mockGetGitRemoteUrl, mockSetEnabled, mockInvoke } =
	vi.hoisted(() => ({
		queueState: {
			enabled: false,
			entries: [] as {
				branch_name: string;
				pr_number: number | null;
				status: QueueEntryStatus;
				position: number;
				target_branch: string;
			}[],
		},
		mockGetGitRemoteUrl: vi.fn(),
		mockSetEnabled: vi.fn(),
		mockInvoke: vi.fn(),
	}));

vi.mock("../../../src/lib/features", () => ({
	FEATURES: {
		pro: true,
		stripePayments: false,
		emailSignup: false,
		mergeQueue: true,
	},
}));

vi.mock("../../../src/hooks/useAuth", () => ({
	useAuth: () => ({
		user: { id: "user-1" },
		session: { access_token: "token" },
		loading: false,
		availability: "available",
		hasStoredSession: true,
		subscription: { plan: "pro", status: "active" },
		signIn: vi.fn(),
		retryConnection: vi.fn(async () => {}),
	}),
}));

vi.mock("../../../src/lib/supabase", () => ({
	supabase: {
		rpc: vi.fn(async (fn: string, args?: Record<string, unknown>) => {
			if (fn === "get_merge_queue_enabled") {
				return { data: queueState.enabled, error: null };
			}
			if (fn === "set_merge_queue_enabled") {
				mockSetEnabled(args);
				queueState.enabled = args?.p_enabled === true;
				return { data: queueState.enabled, error: null };
			}
			if (fn === "get_repo_branch_queue_statuses") {
				return { data: queueState.entries, error: null };
			}
			return { data: [], error: null };
		}),
		functions: { invoke: mockInvoke },
	},
	SUPABASE_URL: "http://localhost:54321",
	SUPABASE_ANON_KEY: "anon",
	WEB_URL: "http://localhost:3000",
}));

vi.mock("../../../src/lib/api", async () => {
	const actual = await vi.importActual<typeof import("../../../src/lib/api")>(
		"../../../src/lib/api",
	);
	return {
		...actual,
		getGitRemoteUrl: mockGetGitRemoteUrl,
		ghListIssues: vi.fn().mockResolvedValue({ items: [], hasMore: false }),
		ghListPrs: vi.fn().mockResolvedValue({ items: [], hasMore: false }),
	};
});

const REMOTE_INFO = {
	owner: "treq-dev",
	repo: "treq",
	full_name: "treq-dev/treq",
};

const QUEUE = [
	// A three-deep stack: base → mid → top, landing on main.
	{
		branch_name: "feat/base",
		pr_number: 101,
		status: "merging" as QueueEntryStatus,
		position: 1,
		target_branch: "main",
	},
	{
		branch_name: "feat/mid",
		pr_number: 102,
		status: "testing" as QueueEntryStatus,
		position: 2,
		target_branch: "feat/base",
	},
	{
		branch_name: "feat/top",
		pr_number: 103,
		status: "queued" as QueueEntryStatus,
		position: 3,
		target_branch: "feat/mid",
	},
	// An independent branch queued behind the stack.
	{
		branch_name: "fix/solo",
		pr_number: 104,
		status: "queued" as QueueEntryStatus,
		position: 4,
		target_branch: "main",
	},
	// A second, two-deep stack with no PR on its upper branch.
	{
		branch_name: "chore/base",
		pr_number: 105,
		status: "queued" as QueueEntryStatus,
		position: 5,
		target_branch: "main",
	},
	{
		branch_name: "chore/top",
		pr_number: null,
		status: "queued" as QueueEntryStatus,
		position: 6,
		target_branch: "chore/base",
	},
];

it("captures the Merge Queue tab when the repo has not opted in", async () => {
	const { repoPath } = createTestRepo(false);
	mockGetGitRemoteUrl.mockResolvedValue(REMOTE_INFO);
	queueState.enabled = false;
	queueState.entries = QUEUE;

	const user = userEvent.setup();
	render(<GitHubPanel repoPath={repoPath} onOpenSettings={vi.fn()} />);

	await user.click(await screen.findByRole("tab", { name: /merge queue/i }));

	// Opt-in defaults to off: no config row in Postgres means no queue.
	await screen.findByText(/merge queue is off for this repository/i);
	expect(
		screen.queryByRole("switch", { name: /enable merge queue/i }),
	).not.toBeInTheDocument();
	await captureDocument(document, {
		name: "merge-queue-tab-01-disabled",
		expectations: [
			'The Merge Queue tab is selected and shows a centred empty state: a merge icon over "The merge queue is off for this repository," with an outlined "Enable it in Settings › Integrations" button below.',
			"There is no toggle switch anywhere on this tab -- the opt-in lives in Settings.",
			"No queue entries are listed.",
		],
	});
}, 120000);

it("captures the stacked PR queue for an opted-in repo", async () => {
	const { repoPath } = createTestRepo(false);
	mockGetGitRemoteUrl.mockResolvedValue(REMOTE_INFO);
	queueState.enabled = true;
	queueState.entries = QUEUE;
	mockInvoke.mockReset();
	mockInvoke.mockResolvedValue({ data: { ok: true }, error: null });

	const user = userEvent.setup();
	render(<GitHubPanel repoPath={repoPath} />);

	await user.click(await screen.findByRole("tab", { name: /merge queue/i }));
	await screen.findByText("PR #101");
	await captureDocument(document, {
		name: "merge-queue-tab-02-enabled-with-queue",
		expectations: [
			"The tab lists the queue directly, with no toggle row above it.",
			"A single vertical line runs down the left of the whole list, with a round node on it for every entry -- the line is continuous across the stack groupings, not restarted per stack, showing one merge sequence.",
			"Node colours follow status: PR #101 (Merging) is green, PR #102 (Testing) is amber, the Queued ones are grey.",
		],
	});
	await captureDocument(document, {
		name: "merge-queue-tab-02b-stacks-and-terminator",
		expectations: [
			'Two "Stack of N" headers appear inline in the list: "Stack of 3 · merges bottom-up into main" above entries 1-3, and "Stack of 2" above entries 5-6. Entry #4 has no stack header.',
			'Each stack header has a "Remove stack" button, entries in a stack have a short vertical accent line to their left, and every entry row has its own small X remove button.',
			'At the very bottom of the line is a down-arrow and the target branch "main"; the entry with no PR number reads "No PR".',
		],
	});

	// Entries render in merge order across the stacks.
	const entries = await screen.findAllByTestId(/^merge-queue-entry-/);
	expect(entries.map((el) => el.getAttribute("data-testid"))).toEqual([
		"merge-queue-entry-1",
		"merge-queue-entry-2",
		"merge-queue-entry-3",
		"merge-queue-entry-4",
		"merge-queue-entry-5",
		"merge-queue-entry-6",
	]);
	expect(screen.getByTestId("merge-queue-stack-feat/base")).toBeInTheDocument();
	expect(screen.getByTestId("merge-queue-single-fix/solo")).toBeInTheDocument();
	expect(
		screen.getByTestId("merge-queue-stack-chore/base"),
	).toBeInTheDocument();
}, 120000);

it("captures removing a single branch and a whole stack from the queue", async () => {
	const { repoPath } = createTestRepo(false);
	mockGetGitRemoteUrl.mockResolvedValue(REMOTE_INFO);
	queueState.enabled = true;
	queueState.entries = QUEUE;
	mockInvoke.mockReset();
	mockInvoke.mockResolvedValue({ data: { ok: true }, error: null });

	const user = userEvent.setup();
	render(<GitHubPanel repoPath={repoPath} />);

	await user.click(await screen.findByRole("tab", { name: /merge queue/i }));
	await screen.findByText("PR #104");

	// Remove the standalone branch: exactly one dequeue, for that branch only.
	await user.click(
		screen.getByRole("button", { name: "Remove fix/solo from queue" }),
	);
	await waitFor(() => {
		expect(mockInvoke).toHaveBeenCalledWith(
			"enqueue-workspace",
			expect.objectContaining({
				body: expect.objectContaining({
					branch_name: "fix/solo",
					action: "dequeue",
				}),
			}),
		);
	});
	expect(mockInvoke).toHaveBeenCalledTimes(1);
	await captureDocument(document, {
		name: "merge-queue-tab-04-removed-single",
		expectations: [
			"The queue still lists both stack blocks and the standalone PR #104 row (the list refetches from the server, which this harness holds fixed).",
			"No error is shown -- the remove click was accepted.",
		],
	});

	// Removing the whole stack dequeues every branch in it, top-down so no
	// branch is ever left stacked on a parent that has already gone.
	mockInvoke.mockClear();
	await user.click(
		screen.getByRole("button", { name: "Remove stack of 3 from queue" }),
	);
	await waitFor(() => {
		expect(mockInvoke).toHaveBeenCalledTimes(3);
	});
	expect(mockInvoke.mock.calls.map((call) => call[1].body.branch_name)).toEqual(
		["feat/top", "feat/mid", "feat/base"],
	);
	await captureDocument(document, {
		name: "merge-queue-tab-05-removed-stack",
		expectations: [
			'The "Stack of 3" block\'s Remove stack button has been clicked; the three branches were dequeued top-down.',
			"The view is otherwise unchanged since the stubbed backend keeps returning the same queue contents.",
		],
	});
}, 120000);

it("removes the upper part of a stack when a middle branch is removed", async () => {
	const { repoPath } = createTestRepo(false);
	mockGetGitRemoteUrl.mockResolvedValue(REMOTE_INFO);
	queueState.enabled = true;
	queueState.entries = QUEUE;
	mockInvoke.mockReset();
	mockInvoke.mockResolvedValue({ data: { ok: true }, error: null });

	const user = userEvent.setup();
	render(<GitHubPanel repoPath={repoPath} />);

	await user.click(await screen.findByRole("tab", { name: /merge queue/i }));
	await screen.findByText("PR #102");

	// feat/top is stacked on feat/mid, so removing feat/mid alone would strand
	// it. Both go, and nothing below feat/mid is touched.
	await user.click(
		screen.getByRole("button", { name: "Remove feat/mid from queue" }),
	);
	await waitFor(() => {
		expect(mockInvoke).toHaveBeenCalledTimes(2);
	});
	expect(mockInvoke.mock.calls.map((call) => call[1].body.branch_name)).toEqual(
		["feat/top", "feat/mid"],
	);
}, 120000);

it("captures the empty queue for a repo that has the queue switched on", async () => {
	const { repoPath } = createTestRepo(false);
	mockGetGitRemoteUrl.mockResolvedValue(REMOTE_INFO);
	queueState.enabled = true;
	queueState.entries = [];

	const user = userEvent.setup();
	render(<GitHubPanel repoPath={repoPath} />);

	await user.click(await screen.findByRole("tab", { name: /merge queue/i }));
	await waitFor(async () => {
		expect(await screen.findByText("Merge queue is empty.")).toBeVisible();
	});
	await captureDocument(document, {
		name: "merge-queue-tab-03-enabled-empty",
		expectations: [
			'The toggle row reads "Enabled for this repository." with the switch in the ON position.',
			'The body shows the "Merge queue is empty." empty state with a merge icon -- distinct from the "off for this repository" state.',
		],
	});
}, 120000);
