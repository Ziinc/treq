import * as React from "react";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { createTestRepo, openRepo } from "../../../test/utils";
import { render, screen } from "../../../test/test-utils";
import { Dashboard } from "../../../src/components/Dashboard";
import { captureDocument } from "../capture";

const LONG_REPO_NAME =
  "very-long-repository-name-that-must-not-overflow-the-cmdk-button";

it("truncates a long repo name inside the command-palette trigger", async () => {
  const { repoPath } = createTestRepo(false);
  const dest = path.join(os.tmpdir(), LONG_REPO_NAME);
  fs.cpSync(repoPath, dest, { recursive: true });
  openRepo(dest);

  render(<Dashboard />);

  const trigger = await screen.findByTestId("command-palette-trigger");
  expect(trigger).toHaveTextContent(LONG_REPO_NAME);

  await captureDocument(document, {
    name: "cmdk-button-repo-name-truncate-01-header",
    clipSelector: '[data-sidebar="header"]',
    expectations: [
      "The command-palette button stays within the sidebar header width.",
      "The long repo name is ellipsized and does not overflow the button.",
      "The ⌘ + K shortcut remains fully visible on the right of the button.",
    ],
  });
}, 60000);
