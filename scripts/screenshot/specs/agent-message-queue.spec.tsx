/**
 * Captures the agent-terminal message queue: composer, pinned count button,
 * and popover for viewing / editing / removing queued follow-ups.
 */

import * as React from "react";
import { expect, it } from "vitest";
import userEvent from "@testing-library/user-event";
import {
  createTestRepo,
  findSidebarBranchElement,
  openRepo,
} from "../../../test/utils";
import { createWorkspace, getWorkspaces } from "../../../src/lib/api";
import { render, screen, waitFor, within } from "../../../test/test-utils";
import { Dashboard } from "../../../src/components/Dashboard";
import { captureDocument } from "../capture";

const BRANCH_NAME = "feat/agent-message-queue";

it("captures agent terminal message queue button and popover", async () => {
  const { repoPath } = createTestRepo(false);
  openRepo(repoPath);

  await createWorkspace(repoPath, BRANCH_NAME);
  const workspaces = await getWorkspaces(repoPath);
  const workspace = workspaces.find((w) => w.branch_name === BRANCH_NAME);
  if (!workspace) throw new Error(`workspace ${BRANCH_NAME} not found`);

  const user = userEvent.setup();
  render(<Dashboard />);

  await user.click(await findSidebarBranchElement(workspace.branch_name));
  await screen.findByText(/Terminals/i);

  await user.keyboard("{Meta>}]{/Meta}");

  const terminalPanel = await waitFor(() => {
    const el = document.querySelector('[data-terminal-id^="claude-"]');
    expect(el).not.toBeNull();
    return el as HTMLElement;
  });

  const composer = await within(terminalPanel).findByTestId(
    "agent-message-queue-composer",
  );

  await captureDocument(document, {
    name: "agent-message-queue-01-composer",
    expectations: [
      "Agent terminal shows a dark rounded follow-up composer with a circular send arrow.",
      "No queued-count chip is visible while the queue is empty.",
    ],
  });

  await user.type(composer, "Add unit tests for the queue{Enter}");
  await user.type(composer, "Then update the docs{Enter}");

  expect(
    await within(terminalPanel).findByTestId("agent-message-queue-count"),
  ).toHaveTextContent("2");

  await captureDocument(document, {
    name: "agent-message-queue-02-count-button",
    expectations: [
      "A dark 2 queued chip sits above the composer, not floating mid-terminal.",
      "Helper text says the queue sends when the agent is idle.",
    ],
  });

  await user.click(
    within(terminalPanel).getByTestId("agent-message-queue-button"),
  );
  const popover = await screen.findByTestId("agent-message-queue-popover");
  expect(
    within(popover).getByText("Add unit tests for the queue"),
  ).toBeInTheDocument();

  await captureDocument(document, {
    name: "agent-message-queue-03-popover",
    expectations: [
      "A dark elevated popover lists queued messages above the composer.",
      "Each row shows pencil and trash actions beside the message text.",
    ],
  });
}, 60000);
