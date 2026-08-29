import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "../../../test/test-utils";
import {
  connectionStateFromInstanceState,
  RemoteStatusBanner,
} from "./RemoteStatusBanner";

describe("connectionStateFromInstanceState", () => {
  it("maps suspended/waking instance states to the waking connection state", () => {
    expect(connectionStateFromInstanceState("suspended", true)).toBe("waking");
    expect(connectionStateFromInstanceState("waking", true)).toBe("waking");
  });

  it("maps degraded/failed instance states to degraded", () => {
    expect(connectionStateFromInstanceState("degraded", true)).toBe("degraded");
    expect(connectionStateFromInstanceState("failed", true)).toBe("degraded");
  });

  it("reports offline when the transport is not connected", () => {
    expect(connectionStateFromInstanceState("ready", false)).toBe("offline");
  });

  it("reports online when ready and connected", () => {
    expect(connectionStateFromInstanceState("ready", true)).toBe("online");
  });
});

describe("RemoteStatusBanner", () => {
  it("renders nothing when online", () => {
    render(<RemoteStatusBanner state="online" />);
    expect(
      screen.queryByTestId("remote-status-banner"),
    ).not.toBeInTheDocument();
  });

  it("shows a waking banner with a wake action", async () => {
    const user = userEvent.setup();
    const onWake = vi.fn();
    render(<RemoteStatusBanner state="waking" onWake={onWake} />);

    const banner = await screen.findByTestId("remote-status-banner");
    expect(banner).toHaveTextContent("Waking managed VM");

    await user.click(screen.getByRole("button", { name: "Wake now" }));
    expect(onWake).toHaveBeenCalled();
  });

  it("shows a degraded banner without a wake action", async () => {
    render(<RemoteStatusBanner state="degraded" detail="readiness failed" />);
    const banner = await screen.findByTestId("remote-status-banner");
    expect(banner).toHaveTextContent("Degraded");
    expect(banner).toHaveTextContent("readiness failed");
    expect(
      screen.queryByRole("button", { name: "Wake now" }),
    ).not.toBeInTheDocument();
  });
});
