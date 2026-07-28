import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { SettingsPage } from "../../../src/components/SettingsPage";
import { render, screen, waitFor, within } from "../../../test/test-utils";
import { createTestRepo, openRepo } from "../../../test/utils";
import { captureDocument } from "../capture";

// The merge queue opt-in lives in Settings › Integrations and is stored in
// Postgres. Supabase and the repo's GitHub remote are stubbed (neither is
// reachable from the desktop harness); the settings page itself is real.
const { queueState, mockGetGitRemoteUrl, mockSetEnabled, auth } = vi.hoisted(
	() => ({
		queueState: { enabled: false },
		mockGetGitRemoteUrl: vi.fn(),
		mockSetEnabled: vi.fn(),
		// Stable identities: GitHubIntegrationSettings keys its repo-loading
		// effect on [user, session], so fresh objects per render would loop.
		auth: {
			user: { id: "user-1" },
			session: { access_token: "token" },
			loading: false,
			subscription: { plan: "pro", status: "active" },
			signIn: vi.fn(),
		},
	}),
);

vi.mock("../../../src/lib/features", () => ({
	FEATURES: {
		pro: true,
		stripePayments: false,
		emailSignup: false,
		mergeQueue: true,
	},
}));

vi.mock("../../../src/hooks/useAuth", () => ({ useAuth: () => auth }));

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
			return { data: [], error: null };
		}),
		from: () => ({
			select: () => Promise.resolve({ data: [], error: null }),
		}),
		functions: { invoke: vi.fn() },
	},
	SUPABASE_URL: "http://localhost:54321",
	SUPABASE_ANON_KEY: "anon",
	WEB_URL: "http://localhost:3000",
}));

vi.mock("../../../src/lib/api", async () => {
	const actual = await vi.importActual<typeof import("../../../src/lib/api")>(
		"../../../src/lib/api",
	);
	return { ...actual, getGitRemoteUrl: mockGetGitRemoteUrl };
});

const REMOTE_INFO = {
	owner: "treq-dev",
	repo: "treq",
	full_name: "treq-dev/treq",
};

it("captures turning the merge queue on from Settings › Integrations", async () => {
	const { repoPath } = createTestRepo(false);
	openRepo(repoPath);
	mockGetGitRemoteUrl.mockResolvedValue(REMOTE_INFO);
	queueState.enabled = false;
	mockSetEnabled.mockClear();

	const user = userEvent.setup();
	render(<SettingsPage repoPath={repoPath} onClose={vi.fn()} />);

	await user.click(await screen.findByRole("tab", { name: /integrations/i }));

	const section = await screen.findByTestId("merge-queue-setting");
	const toggle = within(section).getByRole("switch", {
		name: /enable merge queue/i,
	});
	await waitFor(() => {
		expect(toggle).toHaveAttribute("aria-checked", "false");
	});
	await captureDocument(document, {
		name: "merge-queue-setting-01-off",
		expectations: [
			"The Settings page is on the Integrations tab.",
			'A "Merge queue" section is shown above the GitHub repositories card, with the copy "Turn on the merge queue to start adding branches to it."',
			"Its toggle switch is in the OFF position (grey, knob to the left).",
		],
	});

	await user.click(toggle);

	await waitFor(() => {
		expect(toggle).toHaveAttribute("aria-checked", "true");
	});
	expect(mockSetEnabled).toHaveBeenCalledWith(
		expect.objectContaining({
			p_repo_full_name: REMOTE_INFO.full_name,
			p_enabled: true,
		}),
	);
	await screen.findByText("Enabled for this repository.");
	await captureDocument(document, {
		name: "merge-queue-setting-02-on",
		expectations: [
			'The "Merge queue" section now reads "Enabled for this repository."',
			"Its toggle switch is in the ON position (filled/primary, knob to the right).",
			"No error text is shown below the toggle.",
		],
	});
}, 120000);

it("surfaces the reason when the repo cannot be opted in", async () => {
	const { repoPath } = createTestRepo(false);
	openRepo(repoPath);
	mockGetGitRemoteUrl.mockResolvedValue(REMOTE_INFO);
	queueState.enabled = false;

	const user = userEvent.setup();
	render(<SettingsPage repoPath={repoPath} onClose={vi.fn()} />);

	await user.click(await screen.findByRole("tab", { name: /integrations/i }));
	const section = await screen.findByTestId("merge-queue-setting");

	// A repo with no GitHub App installation cannot have a config row written.
	mockSetEnabled.mockImplementationOnce(() => {
		throw new Error(
			"Repository treq-dev/treq is not linked to a GitHub App installation for this account",
		);
	});

	await user.click(
		within(section).getByRole("switch", { name: /enable merge queue/i }),
	);

	await screen.findByText(/not linked to a GitHub App installation/i);
	await captureDocument(document, {
		name: "merge-queue-setting-03-error",
		expectations: [
			'The "Merge queue" section shows red error text saying the repository is not linked to a GitHub App installation for this account.',
			"The toggle switch has stayed in the OFF position -- the failed opt-in did not flip it.",
		],
	});
}, 120000);
