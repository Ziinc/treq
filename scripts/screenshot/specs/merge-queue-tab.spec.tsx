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
		subscription: { plan: "pro", status: "active" },
		signIn: vi.fn(),
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
			'Node colours follow status: PR #101 (Merging) is green, PR #102 ("Running checks") is amber, the Queued ones are grey.',
		],
	});
	await captureDocument(document, {
		name: "merge-queue-tab-02b-stacks-and-terminator",
		expectations: [
			'Two "Stack of N" headers appear inline in the list: "Stack of 3 · merges bottom-up into main" above entries 1-3, and "Stack of 2" above entries 5-6. Entry #4 has no stack header.',
			'Each stack header has a neutral outline "Remove" button; stacked PR rows have no per-entry X. The stack accent border aligns under the Layers icon.',
			'At the very bottom of the line is a down-arrow and the target branch "main"; the entry with no PR number reads "No PR". The standalone fix/solo row still has its own X remove control.',
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
			'The "Stack of 3" block\'s outline Remove button has been clicked; the three branches were dequeued top-down.',
			"The view is otherwise unchanged since the stubbed backend keeps returning the same queue contents.",
		],
	});
}, 120000);

it("does not offer per-entry remove inside a stack", async () => {
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

	expect(
		screen.queryByRole("button", { name: "Remove feat/mid from queue" }),
	).not.toBeInTheDocument();
	expect(
		screen.queryByRole("button", { name: "Remove feat/top from queue" }),
	).not.toBeInTheDocument();
	expect(
		screen.getByRole("button", { name: "Remove stack of 3 from queue" }),
	).toBeVisible();
	// Standalone entries still get a per-row remove.
	expect(
		screen.getByRole("button", { name: "Remove fix/solo from queue" }),
	).toBeVisible();
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
			'The body shows the "Merge queue is empty." empty state with a merge icon -- distinct from the "off for this repository" state.',
			"No Show merged toggle is present when there is no merge history.",
			"The target branch terminator is still shown below the empty state.",
		],
	});
}, 120000);

it("hides fully merged stacks by default and shows them below main when toggled", async () => {
	const { repoPath } = createTestRepo(false);
	mockGetGitRemoteUrl.mockResolvedValue(REMOTE_INFO);
	queueState.enabled = true;
	queueState.entries = [
		{
			branch_name: "feat/live",
			pr_number: 201,
			status: "queued",
			position: 1,
			target_branch: "main",
		},
		// Fully merged stack — highest positions so it sits just under main tip.
		{
			branch_name: "feat/done-base",
			pr_number: 101,
			status: "merged",
			position: 20,
			target_branch: "main",
		},
		{
			branch_name: "feat/done-top",
			pr_number: 102,
			status: "merged",
			position: 21,
			target_branch: "feat/done-base",
		},
		// Older merged singles for Load more pagination (page size 5).
		...[10, 11, 12, 13, 14, 15].map((n) => ({
			branch_name: `chore/old-${n}`,
			pr_number: 100 + n,
			status: "merged" as QueueEntryStatus,
			position: n,
			target_branch: "main",
		})),
	];

	const user = userEvent.setup();
	render(<GitHubPanel repoPath={repoPath} />);
	await user.click(await screen.findByRole("tab", { name: /merge queue/i }));

	await screen.findByText("PR #201");
	expect(screen.queryByText("PR #101")).not.toBeInTheDocument();
	expect(screen.getByTestId("merge-queue-target")).toHaveTextContent("main");

	await captureDocument(document, {
		name: "merge-queue-tab-06-history-hidden",
		expectations: [
			"Only the live queued PR #201 appears above the main terminator.",
			"Fully merged stacks are not listed in the default view.",
			'A "Show merged" switch is visible and off.',
		],
	});

	await user.click(screen.getByRole("switch", { name: /show merged/i }));
	await screen.findByTestId("merge-queue-history");
	expect(screen.getByText("PR #101")).toBeVisible();
	expect(screen.getByText("Stack of 2")).toBeVisible();

	// History sits below the target terminator in the DOM.
	const list = screen.getByTestId("merge-queue-list");
	const target = screen.getByTestId("merge-queue-target");
	const history = screen.getByTestId("merge-queue-history");
	expect(
		Boolean(
			target.compareDocumentPosition(history) &
				Node.DOCUMENT_POSITION_FOLLOWING,
		),
	).toBe(true);
	expect(list).toContainElement(history);

	await captureDocument(document, {
		name: "merge-queue-tab-07-history-shown",
		viewport: { width: 480, height: 900 },
		expectations: [
			"With Show merged on, completed stacks appear below the main terminator.",
			"The merged Stack of 2 (PR #101 / #102) is visible under main.",
			'A "Load more" button is present when history exceeds the first page.',
		],
	});

	expect(screen.getByRole("button", { name: /load more/i })).toBeVisible();
	await user.click(screen.getByRole("button", { name: /load more/i }));
}, 120000);

it("keeps a partially merged stack visible with the bottom PR labelled Merged", async () => {
	const { repoPath } = createTestRepo(false);
	mockGetGitRemoteUrl.mockResolvedValue(REMOTE_INFO);
	queueState.enabled = true;
	queueState.entries = [
		{
			branch_name: "feat/base",
			pr_number: 11,
			status: "merged",
			position: 1,
			target_branch: "main",
		},
		{
			branch_name: "feat/top",
			pr_number: 12,
			status: "testing",
			position: 2,
			target_branch: "feat/base",
		},
	];

	const user = userEvent.setup();
	render(<GitHubPanel repoPath={repoPath} />);
	await user.click(await screen.findByRole("tab", { name: /merge queue/i }));

	const stack = await screen.findByTestId("merge-queue-stack-feat/base");
	expect(within(stack).getByText("Merged")).toBeVisible();
	expect(within(stack).getByText("Running checks")).toBeVisible();
	expect(screen.queryByTestId("merge-queue-history")).not.toBeInTheDocument();

	await captureDocument(document, {
		name: "merge-queue-tab-08-partial-stack-merged",
		expectations: [
			"A Stack of 2 remains above main while the upper PR is still Running checks.",
			"The bottom PR shows a Merged chip and is still listed in the active stack.",
			"No merge history section is shown yet because the stack is not fully merged.",
		],
	});
}, 120000);
