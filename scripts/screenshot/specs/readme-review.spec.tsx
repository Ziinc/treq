/**
 * README marketing: Code Review → assets/screenshots/review.png
 *
 * Same harness as docs-* specs (createTestRepo + Dashboard + captureDocument),
 * with publishTo so regenerating the spec updates the committed README asset.
 */

import path from "node:path";
import userEvent from "@testing-library/user-event";
import * as React from "react";
import { it } from "vitest";
import { Dashboard } from "../../../src/components/Dashboard";
import { render, screen } from "../../../test/test-utils";
import { findSidebarBranchElement } from "../../../test/utils";
import { captureDocument } from "../capture";
import {
  MARKETING_BRANCH,
  README_SCREENSHOTS_DIR,
  seedReadmeMarketingRepo,
} from "../readme-fixture";

it("captures the Code Review tab for the README", async () => {
  await seedReadmeMarketingRepo();

  const user = userEvent.setup();
  render(<Dashboard />);

  await user.click(await findSidebarBranchElement(MARKETING_BRANCH));
  await screen.findByTestId("show-workspace-header");
  await user.click(await screen.findByRole("tab", { name: /^Changes/ }));
  await screen.findByRole("tab", { name: /^Changes/, selected: true });
  await screen.findByTitle("src/client.ts");
  await screen.findByTitle("src/client.test.ts");
  await screen.findByText(/Committed/i);
  await new Promise((resolve) => setTimeout(resolve, 500));

  document.documentElement.classList.add("dark");

  await captureDocument(document, {
    name: "readme-review",
    deviceScaleFactor: 2,
    publishTo: path.join(README_SCREENSHOTS_DIR, "review.png"),
    expectations: [
      "The Changes tab is active and a Committed section lists src/client.ts and/or src/client.test.ts.",
      "A green addition diff for the event_message handling change is visible in the main pane.",
      "The page is in dark mode.",
    ],
  });
}, 90000);
