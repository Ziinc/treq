import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { SettingsPage } from "../../../src/components/SettingsPage";
import { render, screen } from "../../../test/test-utils";
import { createTestRepo, openRepo } from "../../../test/utils";
import { captureDocument } from "../capture";

const auth = vi.hoisted(() => ({
	user: null as object | null,
	session: null as object | null,
	loading: false,
	availability: "unavailable" as "checking" | "available" | "unavailable",
	hasStoredSession: true,
	subscription: null as { plan: string; status: string } | null,
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

it("captures Account settings when Treq Cloud is unavailable with a stored session", async () => {
	const { repoPath } = createTestRepo(false);
	openRepo(repoPath);
	auth.user = null;
	auth.session = null;
	auth.availability = "unavailable";
	auth.hasStoredSession = true;

	const user = userEvent.setup();
	render(<SettingsPage repoPath={repoPath} onClose={vi.fn()} />);
	await user.click(await screen.findByRole("tab", { name: /account/i }));

	expect(await screen.findByTestId("cloud-unavailable-banner")).toBeVisible();
	expect(
		screen.queryByRole("button", { name: /sign in with browser/i }),
	).toBeNull();

	await captureDocument(document, {
		name: "cloud-unavailable-01-account-stored-session",
		expectations: [
			'A status banner reads "Treq Cloud is unavailable. Local workspace features continue to work." with a Retry button.',
			"Copy explains the account is saved on this device — this is not the signed-out Sign in screen.",
			"A Sign Out button remains available to clear local credentials.",
		],
	});

	await user.click(screen.getByRole("button", { name: /^retry$/i }));
	expect(auth.retryConnection).toHaveBeenCalled();
}, 120000);

it("captures Integrations settings with cloud-dependent controls disabled while offline", async () => {
	const { repoPath } = createTestRepo(false);
	openRepo(repoPath);
	auth.user = { id: "user-1" };
	auth.session = { access_token: "token" };
	auth.availability = "unavailable";
	auth.hasStoredSession = true;
	auth.subscription = { plan: "pro", status: "active" };
	auth.retryConnection.mockClear();

	const user = userEvent.setup();
	render(<SettingsPage repoPath={repoPath} onClose={vi.fn()} />);
	await user.click(await screen.findByRole("tab", { name: /integrations/i }));

	expect(await screen.findByTestId("cloud-unavailable-banner")).toBeVisible();
	expect(screen.getAllByText(/unavailable while offline/i).length).toBeGreaterThan(
		0,
	);

	await captureDocument(document, {
		name: "cloud-unavailable-02-integrations-offline",
		expectations: [
			"The same Treq Cloud unavailable banner with Retry sits above the GitHub integration section.",
			'Merge queue and connected repositories rows explain "Unavailable while offline" instead of offering live controls.',
			"Manage GitHub is present but not offered as an active cloud action while offline.",
		],
	});
}, 120000);
