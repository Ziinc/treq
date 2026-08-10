import { render, screen } from "../test-utils";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AccountSettings } from "../../src/components/AccountSettings";

const auth = vi.hoisted(() => ({
  user: null as null | {
    id: string;
    email?: string;
    user_metadata?: Record<string, string>;
  },
  session: null as object | null,
  loading: false,
  availability: "available" as "checking" | "available" | "unavailable",
  hasStoredSession: false,
  subscription: null as {
    plan: string;
    status: string;
    current_period_end: string | null;
  } | null,
  signIn: vi.fn(),
  signOut: vi.fn(),
  exchangeToken: vi.fn(),
  retryConnection: vi.fn(async () => {}),
}));

vi.mock("../../src/hooks/useAuth", () => ({ useAuth: () => auth }));

describe("AccountSettings cloud availability", () => {
  beforeEach(() => {
    auth.user = null;
    auth.session = null;
    auth.loading = false;
    auth.availability = "available";
    auth.hasStoredSession = false;
    auth.subscription = null;
    auth.signIn.mockReset();
    auth.signOut.mockReset();
    auth.retryConnection.mockReset();
  });

  it("shows sign-in when there is no saved account", () => {
    render(<AccountSettings />);
    expect(
      screen.getByRole("button", { name: /sign in with browser/i }),
    ).toBeVisible();
    expect(screen.queryByTestId("cloud-unavailable-banner")).toBeNull();
  });

  it("treats a stored session with an unavailable API as offline, not signed out", async () => {
    auth.availability = "unavailable";
    auth.hasStoredSession = true;
    render(<AccountSettings />);

    expect(screen.getByTestId("cloud-unavailable-banner")).toBeVisible();
    expect(
      screen.getByText(/your account is saved on this device/i),
    ).toBeVisible();
    expect(
      screen.queryByRole("button", { name: /sign in with browser/i }),
    ).toBeNull();

    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: /^retry$/i }));
    expect(auth.retryConnection).toHaveBeenCalled();
  });

  it("disables subscription management while offline for a signed-in user", () => {
    auth.user = {
      id: "user-1",
      email: "dev@treq.dev",
      user_metadata: { full_name: "Dev" },
    };
    auth.session = { access_token: "token" };
    auth.hasStoredSession = true;
    auth.availability = "unavailable";
    auth.subscription = {
      plan: "pro",
      status: "active",
      current_period_end: null,
    };

    render(<AccountSettings />);

    expect(screen.getByTestId("cloud-unavailable-banner")).toBeVisible();
    expect(screen.getByText(/unavailable while offline/i)).toBeVisible();
    expect(
      screen.queryByRole("button", { name: /manage subscription/i }),
    ).toBeNull();
  });
});
