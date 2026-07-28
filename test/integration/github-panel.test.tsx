import userEvent from "@testing-library/user-event";
import * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GitHubPanel } from "../../src/components/GitHubPanel";
import { IssueDetailPanel } from "../../src/components/github-panel/IssueDetail";
import { PrDetailPanel } from "../../src/components/github-panel/PrDetail";
import { render, screen, waitFor, within } from "../test-utils";

const auth = vi.hoisted(() => ({
	user: { id: "user-1" } as object | null,
	session: { access_token: "token" } as object | null,
	loading: false,
	subscription: null as { plan: string; status: string } | null,
	signIn: vi.fn(),
}));

const remoteInfo = vi.hoisted(() => ({
	data: { full_name: "acme/treq", owner: "acme", name: "treq" } as {
		full_name: string;
		owner: string;
		name: string;
	} | null,
	isLoading: false,
}));

const api = vi.hoisted(() => ({
	ghListIssues: vi.fn(),
	ghListPrs: vi.fn(),
	ghViewIssue: vi.fn(),
	ghCreateIssueComment: vi.fn(),
	ghViewPr: vi.fn(),
	ghSetPrDraft: vi.fn(),
}));

const supabaseRpc = vi.hoisted(() => vi.fn());

const queueEnabled = vi.hoisted(() => ({
	current: true,
	setEnabled: vi.fn(),
	dequeue: vi.fn(),
}));

vi.mock("../../src/hooks/useAuth", () => ({ useAuth: () => auth }));
vi.mock("../../src/hooks/useMergeQueueStatus", () => ({
	useGitRemoteInfo: () => remoteInfo,
	useMergeQueueEnabled: () => ({
		data: queueEnabled.current,
		isLoading: false,
	}),
	useSetMergeQueueEnabled: () => ({
		mutateAsync: queueEnabled.setEnabled,
		isPending: false,
	}),
	useDequeueBranches: () => ({
		mutate: queueEnabled.dequeue,
		isPending: false,
	}),
}));
vi.mock("../../src/lib/api", async (importOriginal) => {
	const original = await importOriginal<typeof import("../../src/lib/api")>();
	return {
		...original,
		ghListIssues: api.ghListIssues,
		ghListPrs: api.ghListPrs,
		ghViewIssue: api.ghViewIssue,
		ghCreateIssueComment: api.ghCreateIssueComment,
		ghViewPr: api.ghViewPr,
		ghSetPrDraft: api.ghSetPrDraft,
	};
});
vi.mock("../../src/lib/supabase", async (importOriginal) => {
	const original =
		await importOriginal<typeof import("../../src/lib/supabase")>();
	return {
		...original,
		supabase: { rpc: supabaseRpc },
		WEB_URL: "http://localhost:3001",
	};
});

function makeIssue(number: number, title = `Issue ${number}`) {
	return {
		number,
		title,
		state: "OPEN",
		url: `https://github.com/acme/treq/issues/${number}`,
		body: null,
		author: { login: "alice" },
		labels: [],
		created_at: "2026-01-01T00:00:00Z",
		updated_at: "2026-01-01T00:00:00Z",
		comments: null,
	};
}

function makePr(number: number, title = `PR ${number}`) {
	return {
		number,
		title,
		state: "OPEN",
		url: `https://github.com/acme/treq/pull/${number}`,
		body: null,
		author: { login: "alice" },
		labels: [],
		head_ref_name: `feat/${number}`,
		base_ref_name: "main",
		merge_state_status: null,
		created_at: "2026-01-01T00:00:00Z",
		updated_at: "2026-01-01T00:00:00Z",
		comments: null,
	};
}

describe("GitHubPanel", () => {
	let user: ReturnType<typeof userEvent.setup>;

	beforeEach(() => {
		auth.subscription = null;
		queueEnabled.current = true;
		queueEnabled.setEnabled.mockReset();
		queueEnabled.dequeue.mockReset();
		remoteInfo.data = {
			full_name: "acme/treq",
			owner: "acme",
			name: "treq",
		};
		remoteInfo.isLoading = false;
		api.ghListIssues.mockResolvedValue({ items: [], hasMore: false });
		api.ghListPrs.mockResolvedValue({ items: [], hasMore: false });
		api.ghCreateIssueComment.mockReset();
		supabaseRpc.mockReset();
		supabaseRpc.mockResolvedValue({ data: [], error: null });
		user = userEvent.setup();
	});

	it("does not render a panel-level close button", () => {
		render(<GitHubPanel repoPath="/tmp/repo" />);
		const header = screen
			.getByRole("heading", { name: /github/i })
			.closest("div")?.parentElement;
		expect(header).toBeTruthy();
		expect(within(header!).queryByRole("button")).not.toBeInTheDocument();
	});

	it("lets Free users open Merge Queue and shows an upgrade upsell", async () => {
		auth.subscription = { plan: "free", status: "active" };
		render(<GitHubPanel repoPath="/tmp/repo" />);

		const mergeQueueTab = screen.getByRole("tab", { name: /merge queue/i });
		expect(mergeQueueTab).not.toBeDisabled();
		expect(within(mergeQueueTab).getByText("PRO")).toBeVisible();

		await user.click(mergeQueueTab);
		expect(mergeQueueTab).toHaveAttribute("aria-selected", "true");
		expect(
			await screen.findByRole("heading", { name: /unlock merge queue/i }),
		).toBeVisible();
		expect(
			screen.getByRole("button", { name: /upgrade to pro/i }),
		).toBeVisible();
		expect(supabaseRpc).not.toHaveBeenCalled();
	});

	it("enables Merge Queue tab for active Pro users and shows queue entries", async () => {
		auth.subscription = { plan: "pro", status: "active" };
		supabaseRpc.mockResolvedValue({
			data: [
				{
					branch_name: "feat/alpha",
					pr_number: 11,
					status: "queued",
					position: 1,
					target_branch: "main",
				},
				{
					branch_name: "feat/beta",
					pr_number: 12,
					status: "testing",
					position: 2,
					target_branch: "main",
				},
			],
			error: null,
		});

		render(<GitHubPanel repoPath="/tmp/repo" />);

		const mergeQueueTab = screen.getByRole("tab", { name: /merge queue/i });
		expect(mergeQueueTab).not.toBeDisabled();
		expect(within(mergeQueueTab).queryByText("PRO")).not.toBeInTheDocument();

		await user.click(mergeQueueTab);
		expect(await screen.findByText("PR #11")).toBeVisible();
		expect(screen.getByText("PR #12")).toBeVisible();
		expect(screen.getByText("feat/alpha → main")).toBeVisible();
		expect(screen.getByText("feat/beta → main")).toBeVisible();
		expect(screen.getByText(/queued/i)).toBeVisible();
		expect(screen.getByText(/testing/i)).toBeVisible();
	});

	it("hides the queue and offers an opt-in when the repo has it disabled", async () => {
		auth.subscription = { plan: "pro", status: "active" };
		queueEnabled.current = false;

		render(<GitHubPanel repoPath="/tmp/repo" />);
		await user.click(screen.getByRole("tab", { name: /merge queue/i }));

		expect(
			await screen.findByText(/merge queue is off for this repository/i),
		).toBeVisible();
		const toggle = screen.getByRole("switch", {
			name: /enable merge queue/i,
		});
		expect(toggle).toBeVisible();
		expect(toggle).toHaveAttribute("aria-checked", "false");
		// A disabled repo must not be polled for queue contents.
		expect(supabaseRpc).not.toHaveBeenCalled();
	});

	it("turns the queue on for the repo from the Merge Queue tab", async () => {
		auth.subscription = { plan: "pro", status: "active" };
		queueEnabled.current = false;
		supabaseRpc.mockResolvedValue({ data: [], error: null });

		render(<GitHubPanel repoPath="/tmp/repo" />);
		await user.click(screen.getByRole("tab", { name: /merge queue/i }));
		await user.click(
			await screen.findByRole("switch", { name: /enable merge queue/i }),
		);

		await waitFor(() => {
			expect(queueEnabled.setEnabled).toHaveBeenCalledWith(true);
		});
	});

	it("groups stacked branches into a block and removes them together", async () => {
		auth.subscription = { plan: "pro", status: "active" };
		supabaseRpc.mockResolvedValue({
			data: [
				{
					branch_name: "feat/base",
					pr_number: 11,
					status: "queued",
					position: 1,
					target_branch: "main",
				},
				{
					branch_name: "feat/top",
					pr_number: 12,
					status: "queued",
					position: 2,
					target_branch: "feat/base",
				},
			],
			error: null,
		});

		render(<GitHubPanel repoPath="/tmp/repo" />);
		await user.click(screen.getByRole("tab", { name: /merge queue/i }));

		expect(await screen.findByText("Stack of 2")).toBeVisible();
		expect(screen.getByText(/merges bottom-up into main/i)).toBeVisible();

		await user.click(
			screen.getByRole("button", { name: "Remove stack of 2 from queue" }),
		);
		expect(queueEnabled.dequeue).toHaveBeenCalledWith([
			"feat/base",
			"feat/top",
		]);
	});

	it("removes only the branch itself when it has nothing stacked on it", async () => {
		auth.subscription = { plan: "pro", status: "active" };
		supabaseRpc.mockResolvedValue({
			data: [
				{
					branch_name: "fix/solo",
					pr_number: 11,
					status: "queued",
					position: 1,
					target_branch: "main",
				},
			],
			error: null,
		});

		render(<GitHubPanel repoPath="/tmp/repo" />);
		await user.click(screen.getByRole("tab", { name: /merge queue/i }));

		await screen.findByText("PR #11");
		expect(screen.queryByText(/^Stack of/)).not.toBeInTheDocument();

		await user.click(
			screen.getByRole("button", { name: "Remove fix/solo from queue" }),
		);
		expect(queueEnabled.dequeue).toHaveBeenCalledWith(["fix/solo"]);
	});

	it("shows Load more when more issues are available", async () => {
		api.ghListIssues.mockResolvedValue({
			items: [makeIssue(1), makeIssue(2)],
			hasMore: true,
		});

		render(<GitHubPanel repoPath="/tmp/repo" />);

		expect(await screen.findByText("Issue 1")).toBeVisible();
		expect(screen.getByRole("button", { name: /load more/i })).toBeVisible();
	});

	it("does not show Load more when all issues are loaded", async () => {
		api.ghListIssues.mockResolvedValue({
			items: [makeIssue(1)],
			hasMore: false,
		});

		render(<GitHubPanel repoPath="/tmp/repo" />);

		expect(await screen.findByText("Issue 1")).toBeVisible();
		expect(
			screen.queryByRole("button", { name: /load more/i }),
		).not.toBeInTheDocument();
	});

	it("loads the next page of issues when Load more is clicked", async () => {
		api.ghListIssues
			.mockResolvedValueOnce({
				items: [makeIssue(1, "First page issue")],
				hasMore: true,
			})
			.mockResolvedValueOnce({
				items: [makeIssue(2, "Second page issue")],
				hasMore: false,
			});

		render(<GitHubPanel repoPath="/tmp/repo" />);

		expect(await screen.findByText("First page issue")).toBeVisible();
		await user.click(screen.getByRole("button", { name: /load more/i }));

		expect(await screen.findByText("Second page issue")).toBeVisible();
		expect(screen.getByText("First page issue")).toBeVisible();
		expect(
			screen.queryByRole("button", { name: /load more/i }),
		).not.toBeInTheDocument();
		expect(api.ghListIssues).toHaveBeenCalledWith(
			"acme/treq",
			"open",
			expect.any(Number),
			2,
		);
	});

	it("shows Load more when more pull requests are available", async () => {
		api.ghListPrs.mockResolvedValue({
			items: [makePr(1), makePr(2)],
			hasMore: true,
		});

		render(<GitHubPanel repoPath="/tmp/repo" />);
		await user.click(screen.getByRole("tab", { name: /pull requests/i }));

		expect(await screen.findByText("PR 1")).toBeVisible();
		expect(screen.getByRole("button", { name: /load more/i })).toBeVisible();
	});

	it("marks draft pull requests as Draft instead of Open", async () => {
		api.ghListPrs.mockResolvedValue({
			items: [
				{ ...makePr(1, "Ready PR"), is_draft: false },
				{ ...makePr(2, "WIP PR"), is_draft: true },
			],
			hasMore: false,
		});

		render(<GitHubPanel repoPath="/tmp/repo" />);
		await user.click(screen.getByRole("tab", { name: /pull requests/i }));

		const readyRow = (await screen.findByText("Ready PR")).closest("button")!;
		const draftRow = screen.getByText("WIP PR").closest("button")!;
		expect(within(readyRow).getByText("Open")).toBeVisible();
		expect(within(draftRow).getByText("Draft")).toBeVisible();
		expect(within(draftRow).queryByText("Open")).not.toBeInTheDocument();
	});

	it("loads the next page of pull requests when Load more is clicked", async () => {
		api.ghListPrs
			.mockResolvedValueOnce({
				items: [makePr(1, "First page PR")],
				hasMore: true,
			})
			.mockResolvedValueOnce({
				items: [makePr(2, "Second page PR")],
				hasMore: false,
			});

		render(<GitHubPanel repoPath="/tmp/repo" />);
		await user.click(screen.getByRole("tab", { name: /pull requests/i }));

		expect(await screen.findByText("First page PR")).toBeVisible();
		await user.click(screen.getByRole("button", { name: /load more/i }));

		expect(await screen.findByText("Second page PR")).toBeVisible();
		expect(screen.getByText("First page PR")).toBeVisible();
		expect(
			screen.queryByRole("button", { name: /load more/i }),
		).not.toBeInTheDocument();
		expect(api.ghListPrs).toHaveBeenCalledWith(
			"acme/treq",
			"open",
			expect.any(Number),
			2,
		);
	});
});

describe("IssueDetailPanel markdown", () => {
	let user: ReturnType<typeof userEvent.setup>;

	beforeEach(() => {
		user = userEvent.setup();
		api.ghViewIssue.mockResolvedValue({
			number: 42,
			title: "Fix markdown",
			state: "OPEN",
			url: "https://github.com/acme/treq/issues/42",
			body: "Hello **world** and a `code` span",
			author: { login: "alice" },
			created_at: "2026-01-01T00:00:00Z",
			labels: [],
			comments: [
				{
					id: "1",
					author: { login: "bob" },
					body: "Looks *good*",
					created_at: "2026-01-02T00:00:00Z",
				},
			],
		});
	});

	it("renders issue body and comments with markdown", async () => {
		render(
			<IssueDetailPanel
				repoFullName="acme/treq"
				issueNumber={42}
				onClose={() => {}}
			/>,
		);

		await waitFor(() => {
			expect(screen.getByText("world").tagName).toBe("STRONG");
		});
		expect(screen.getByText("code").tagName).toBe("CODE");
		expect(screen.getByText("good").tagName).toBe("EM");
	});

	it("submits a comment with Ctrl+Enter", async () => {
		api.ghCreateIssueComment.mockResolvedValue(undefined);

		render(
			<IssueDetailPanel
				repoFullName="acme/treq"
				issueNumber={42}
				onClose={() => {}}
			/>,
		);

		await screen.findByText("world");
		const textarea = screen.getByPlaceholderText(/leave a comment/i);
		await user.type(textarea, "Hello from test");
		await user.keyboard("{Control>}{Enter}{/Control}");

		await waitFor(() => {
			expect(api.ghCreateIssueComment).toHaveBeenCalled();
		});
	});
});

describe("PrDetailPanel draft toggle", () => {
	function makeDetailPr(overrides: {
		is_draft?: boolean;
		state?: string;
		title?: string;
	}) {
		return {
			number: 42,
			title: overrides.title ?? "Feature PR",
			state: overrides.state ?? "OPEN",
			url: "https://github.com/acme/treq/pull/42",
			body: "Body",
			author: { login: "alice" },
			labels: [],
			head_ref_name: "feat",
			base_ref_name: "main",
			merge_state_status: "CLEAN",
			created_at: "2026-01-01T00:00:00Z",
			updated_at: "2026-01-01T00:00:00Z",
			comments: null,
			is_draft: overrides.is_draft ?? false,
		};
	}

	let user: ReturnType<typeof userEvent.setup>;

	beforeEach(() => {
		user = userEvent.setup();
		api.ghSetPrDraft.mockReset().mockResolvedValue(undefined);
	});

	it("marks a draft PR ready for review", async () => {
		api.ghViewPr
			.mockResolvedValueOnce(makeDetailPr({ is_draft: true }))
			.mockResolvedValueOnce(makeDetailPr({ is_draft: false }));

		render(
			<PrDetailPanel
				repoFullName="acme/treq"
				prNumber={42}
				onClose={() => {}}
			/>,
		);

		expect(await screen.findByText("Draft")).toBeVisible();
		await user.click(screen.getByRole("button", { name: /ready for review/i }));

		await waitFor(() => {
			expect(api.ghSetPrDraft).toHaveBeenCalledWith("acme/treq", 42, false);
		});
		expect(await screen.findByText("Open")).toBeVisible();
		expect(
			screen.getByRole("button", { name: /convert to draft/i }),
		).toBeVisible();
	});

	it("converts an open PR to draft", async () => {
		api.ghViewPr
			.mockResolvedValueOnce(makeDetailPr({ is_draft: false }))
			.mockResolvedValueOnce(makeDetailPr({ is_draft: true }));

		render(
			<PrDetailPanel
				repoFullName="acme/treq"
				prNumber={42}
				onClose={() => {}}
			/>,
		);

		expect(await screen.findByText("Open")).toBeVisible();
		await user.click(screen.getByRole("button", { name: /convert to draft/i }));

		await waitFor(() => {
			expect(api.ghSetPrDraft).toHaveBeenCalledWith("acme/treq", 42, true);
		});
		expect(await screen.findByText("Draft")).toBeVisible();
		expect(
			screen.getByRole("button", { name: /ready for review/i }),
		).toBeVisible();
	});
});
