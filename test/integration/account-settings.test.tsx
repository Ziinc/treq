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

describe("AccountSettings cloud unavailable banner", () => {
  beforeEach(() => {
    auth.user = null;
    auth.session = null;
    auth.loading = false;
    auth.availability = "available";
    auth.subscription = null;
    auth.signIn.mockReset();
    auth.signOut.mockReset();
    auth.retryConnection.mockReset();
  });

  it("does not show the banner when cloud auth is available", () => {
    render(<AccountSettings />);
    expect(screen.queryByTestId("cloud-unavailable-banner")).toBeNull();
  });

  it("shows the banner with Retry when cloud auth is unavailable", async () => {
    auth.availability = "unavailable";
    render(<AccountSettings />);

    expect(screen.getByTestId("cloud-unavailable-banner")).toBeVisible();
    expect(
      screen.getByText(
        /treq cloud is unavailable\. local workspace features continue to work/i,
      ),
    ).toBeVisible();

    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: /^retry$/i }));
    expect(auth.retryConnection).toHaveBeenCalled();
  });

  it("keeps the signed-in account UI and only adds the banner while offline", () => {
    auth.user = {
      id: "user-1",
      email: "dev@treq.dev",
      user_metadata: { full_name: "Dev" },
    };
    auth.session = { access_token: "token" };
    auth.availability = "unavailable";
    auth.subscription = {
      plan: "pro",
      status: "active",
      current_period_end: null,
    };

    render(<AccountSettings />);

    expect(screen.getByTestId("cloud-unavailable-banner")).toBeVisible();
    expect(
      screen.getByRole("button", { name: /manage subscription/i }),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: /sign out/i })).toBeVisible();
  });
});
