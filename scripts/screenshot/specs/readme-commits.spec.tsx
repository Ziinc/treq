/**
 * README marketing: Commit History → assets/screenshots/commits.png
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

it("captures the Commits tab for the README", async () => {
  await seedReadmeMarketingRepo();

  const user = userEvent.setup();
  render(<Dashboard />);

  await user.click(await findSidebarBranchElement(MARKETING_BRANCH));
  await screen.findByTestId("show-workspace-header");
  await user.click(await screen.findByRole("tab", { name: "Commits" }));
  await screen.findByRole("tab", { name: "Commits", selected: true });

  const commitTitle = await screen.findByText(
    "feat: handle empty event messages",
  );
  await user.click(commitTitle);
  await screen.findAllByText(/event_message/);
  await new Promise((resolve) => setTimeout(resolve, 500));

  document.documentElement.classList.add("dark");

  await captureDocument(document, {
    name: "readme-commits",
    deviceScaleFactor: 2,
    publishTo: path.join(README_SCREENSHOTS_DIR, "commits.png"),
    expectations: [
      "The Commits tab is active with the 'feat: handle empty event messages' commit expanded.",
      "The expanded commit shows a file diff for src/client.ts with green addition lines.",
      "The page is in dark mode.",
    ],
  });
}, 90000);
