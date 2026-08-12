import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { SettingsPage } from "../../../src/components/SettingsPage";
import { render, screen } from "../../../test/test-utils";
import { createTestRepo, openRepo } from "../../../test/utils";
import { captureDocument } from "../capture";

const auth = vi.hoisted(() => ({
	user: {
		id: "user-1",
		email: "dev@treq.dev",
		user_metadata: { full_name: "Dev" },
	} as object | null,
	session: { access_token: "token" } as object | null,
	loading: false,
	availability: "unavailable" as "checking" | "available" | "unavailable",
	subscription: {
		plan: "pro",
		status: "active",
		current_period_end: null,
	} as { plan: string; status: string; current_period_end: string | null } | null,
	signIn: vi.fn(),
	signOut: vi.fn(),
	retryConnection: vi.fn(async () => {}),
}));

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
		from: () => ({
			select: () => Promise.resolve({ data: [], error: null }),
		}),
		rpc: vi.fn(async () => ({ data: null, error: null })),
		functions: { invoke: vi.fn() },
	},
	SUPABASE_URL: "http://localhost:54321",
	SUPABASE_ANON_KEY: "anon",
	WEB_URL: "http://localhost:3000",
}));

it("captures the cloud unavailable banner on Account settings", async () => {
	const { repoPath } = createTestRepo(false);
	openRepo(repoPath);
	auth.availability = "unavailable";

	const user = userEvent.setup();
	render(<SettingsPage repoPath={repoPath} onClose={vi.fn()} />);
	await user.click(await screen.findByRole("tab", { name: /account/i }));

	expect(await screen.findByTestId("cloud-unavailable-banner")).toBeVisible();

	await captureDocument(document, {
		name: "cloud-unavailable-01-account-banner",
		expectations: [
			'A status banner reads "Treq Cloud is unavailable. Local workspace features continue to work." with a Retry button.',
			"The normal signed-in Account content (user details / subscription) remains below the banner.",
			"There is no blocking dialog — the banner is inline in the Account tab.",
		],
	});
}, 120000);

it("captures the cloud unavailable banner on Integrations settings", async () => {
	const { repoPath } = createTestRepo(false);
	openRepo(repoPath);
	auth.availability = "unavailable";
	auth.retryConnection.mockClear();

	const user = userEvent.setup();
	render(<SettingsPage repoPath={repoPath} onClose={vi.fn()} />);
	await user.click(await screen.findByRole("tab", { name: /integrations/i }));

	expect(await screen.findByTestId("cloud-unavailable-banner")).toBeVisible();

	await captureDocument(document, {
		name: "cloud-unavailable-02-integrations-banner",
		expectations: [
			"The same Treq Cloud unavailable banner with Retry sits above the GitHub integration section.",
			"Merge queue and repository controls remain visible under the banner.",
		],
	});
}, 120000);
