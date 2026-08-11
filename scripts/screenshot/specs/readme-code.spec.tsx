/**
 * README marketing: Code Overview → assets/screenshots/code.png
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

it("captures the Code Overview for the README", async () => {
  await seedReadmeMarketingRepo();

  const user = userEvent.setup();
  render(<Dashboard />);

  await user.click(await findSidebarBranchElement(MARKETING_BRANCH));
  await screen.findByTestId("show-workspace-header");
  await screen.findByRole("tab", { name: /^Code/, selected: true });
  await screen.findByText("src");
  // Let file-tree / README async queries settle before rasterizing.
  await new Promise((resolve) => setTimeout(resolve, 500));

  document.documentElement.classList.add("dark");

  await captureDocument(document, {
    name: "readme-code",
    deviceScaleFactor: 2,
    publishTo: path.join(README_SCREENSHOTS_DIR, "code.png"),
    expectations: [
      "The Code tab is active on the feat/empty-event-message workspace, with the file tree visible in the main pane.",
      "The sidebar lists multiple workspaces including feat/empty-event-message (selected) and the incidental feat/* branches.",
      "The page is in dark mode.",
    ],
  });
}, 90000);
