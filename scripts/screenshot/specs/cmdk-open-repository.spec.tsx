import * as React from "react";
import { it } from "vitest";
import userEvent from "@testing-library/user-event";
import { createTestRepo, openRepo } from "../../../test/utils";
import { render, screen } from "../../../test/test-utils";
import { Dashboard } from "../../../src/components/Dashboard";
import { captureDocument } from "../capture";

it("captures the Open Repository commands in the command palette", async () => {
  const { repoPath } = createTestRepo(false);
  openRepo(repoPath);

  const user = userEvent.setup();
  render(<Dashboard />);

  await user.keyboard("{Meta>}k{/Meta}");
  await screen.findByTestId("modal");
  await screen.findByText("Go to Home");

  await screen.findByText("Open Repository", { exact: true });
  await screen.findByText("Open a different repository");
  await screen.findByText("Open Repository in New Window");
  await screen.findByText("Open a repository in a separate window");

  await captureDocument(document, {
    name: "cmdk-open-repository-01-full-list",
    expectations: [
      'The open command palette lists an "Open Repository" item describing "Open a different repository", near the top of the results.',
      'The palette also lists a separate "Open Repository in New Window" item describing "Open a repository in a separate window", directly below "Open Repository".',
    ],
  });
}, 60000);
