import * as React from "react";
import userEvent from "@testing-library/user-event";
import { it } from "vitest";
import { Dashboard } from "../../../src/components/Dashboard";
import { render, screen } from "../../../test/test-utils";
import { captureDocument } from "../capture";

it("captures the SSH dialog opening from onboarding", async () => {
  window.history.replaceState({}, "", "/");
  const user = userEvent.setup();
  render(<Dashboard />);

  await screen.findByRole("button", { name: "Open via SSH" });
  await captureDocument(document, {
    name: "remote-ssh-dialog-01-onboarding",
    expectations: [
      "An onboarding card is shown with an 'Open Repository' button and an 'Open via SSH' button.",
    ],
  });

  await user.click(await screen.findByRole("button", { name: "Open via SSH" }));
  await screen.findByRole("dialog", { name: "Open via SSH" });
  await captureDocument(document, {
    name: "remote-ssh-dialog-02-open",
    expectations: [
      "A modal dialog titled 'Open via SSH' is shown, overlaying the onboarding card, with 'SSH host' and 'Remote directory' fields.",
    ],
  });
}, 60000);
