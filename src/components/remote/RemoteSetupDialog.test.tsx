import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "../../../test/test-utils";
import { RemoteSetupDialog } from "./RemoteSetupDialog";

function baseProps() {
  return {
    open: true,
    onOpenChange: vi.fn(),
    regions: ["us_east", "us_west"] as ("us_east" | "us_west")[],
    sizePresets: ["small", "medium"] as ("small" | "medium")[],
    localKeyIdentities: [
      { reference: "/home/me/.ssh/id_ed25519.pub", label: "id_ed25519", fingerprint: "SHA256:abc123" },
    ],
    sshConfigAliasSuggestions: ["prod-box"],
    instanceStatus: null,
    onProvisionManaged: vi.fn().mockResolvedValue(undefined),
    onWake: vi.fn().mockResolvedValue(undefined),
    onReprovision: vi.fn().mockResolvedValue(undefined),
    onDeleteInstance: vi.fn().mockResolvedValue(undefined),
    onRevokeKey: vi.fn().mockResolvedValue(undefined),
    onRegisterUserManaged: vi.fn().mockResolvedValue(undefined),
  };
}

describe("RemoteSetupDialog", () => {
  it("presents the two-choice entry point", async () => {
    render(<RemoteSetupDialog {...baseProps()} />);
    expect(
      await screen.findByRole("button", { name: /Treq-managed VM/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Your own VM/ }),
    ).toBeInTheDocument();
  });

  it("shows region and size pickers and the key fingerprint for managed setup", async () => {
    const user = userEvent.setup();
    const props = baseProps();
    render(<RemoteSetupDialog {...props} />);

    await user.click(
      await screen.findByRole("button", { name: /Treq-managed VM/ }),
    );

    const regionSelect = await screen.findByLabelText("Region");
    await user.selectOptions(regionSelect, "us_east");
    const sizeSelect = await screen.findByLabelText("Size");
    await user.selectOptions(sizeSelect, "small");

    const keySelect = await screen.findByLabelText("SSH identity");
    await user.selectOptions(
      keySelect,
      "/home/me/.ssh/id_ed25519.pub",
    );

    expect(
      await screen.findByTestId("selected-key-fingerprint"),
    ).toHaveTextContent("SHA256:abc123");

    await user.click(screen.getByRole("button", { name: "Provision VM" }));
    expect(props.onProvisionManaged).toHaveBeenCalledWith(
      "us_east",
      "small",
      "/home/me/.ssh/id_ed25519.pub",
    );
  });

  it("requires host-trust confirmation before registering a user-managed endpoint", async () => {
    const user = userEvent.setup();
    const props = baseProps();
    render(<RemoteSetupDialog {...props} />);

    await user.click(
      await screen.findByRole("button", { name: /Your own VM/ }),
    );

    await user.type(
      await screen.findByLabelText("Display name"),
      "My box",
    );
    await user.type(screen.getByLabelText("Hostname or IP address"), "203.0.113.4");
    await user.type(screen.getByLabelText("Username"), "dev");
    await user.type(
      screen.getByLabelText("Expected host-key fingerprint"),
      "SHA256:deadbeef",
    );
    await user.type(
      screen.getByLabelText("Auth identity reference"),
      "/home/me/.ssh/id_ed25519",
    );

    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(props.onRegisterUserManaged).not.toHaveBeenCalled();
    const confirmation = await screen.findByTestId(
      "host-trust-confirmation",
    );
    expect(confirmation).toHaveTextContent("203.0.113.4");
    expect(confirmation).toHaveTextContent("SHA256:deadbeef");

    await user.click(
      screen.getByRole("button", { name: "Trust and connect" }),
    );
    expect(props.onRegisterUserManaged).toHaveBeenCalledWith(
      expect.objectContaining({
        display_name: "My box",
        hostname: "203.0.113.4",
        host_key_fingerprint: "SHA256:deadbeef",
        alias: null,
      }),
    );
  });
});
