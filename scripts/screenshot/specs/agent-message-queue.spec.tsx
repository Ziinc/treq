/**
 * Captures agent-terminal message queue: toolbar button when empty,
 * pinned count chip when queued, and popover with follow-up input.
 */

import * as React from "react";
import { expect, it, vi } from "vitest";
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

/** jsdom has no layout; give the queue trigger a real box so the popover mock can portal above it. */
function stubQueueTriggerRect(
  button: HTMLElement,
  rect: { top: number; left: number; width: number; height: number },
) {
  vi.spyOn(button, "getBoundingClientRect").mockReturnValue({
    x: rect.left,
    y: rect.top,
    top: rect.top,
    left: rect.left,
    bottom: rect.top + rect.height,
    right: rect.left + rect.width,
    width: rect.width,
    height: rect.height,
    toJSON() {
      return {};
    },
  });
}

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

  const queueButton = await within(terminalPanel).findByTestId(
    "agent-message-queue-button",
  );
  expect(
    within(terminalPanel).getByTestId("agent-message-queue"),
  ).toHaveAttribute("data-variant", "toolbar");
  expect(
    screen.queryByTestId("agent-message-queue-composer"),
  ).not.toBeInTheDocument();

  await captureDocument(document, {
    name: "agent-message-queue-01-toolbar",
    expectations: [
      "Agent terminal toolbar shows a Queue icon button next to Search.",
      "No follow-up input is visible until the Queue button is clicked.",
    ],
  });

  // Toolbar trigger near the agent header controls (right side).
  stubQueueTriggerRect(queueButton, {
    top: 470,
    left: 900,
    width: 28,
    height: 28,
  });
  await user.click(queueButton);
  const composer = await screen.findByTestId("agent-message-queue-composer");
  expect(screen.getByTestId("agent-message-queue-popover")).toHaveAttribute(
    "data-side",
    "top",
  );

  await captureDocument(document, {
    name: "agent-message-queue-02-empty-popover",
    expectations: [
      "A themed popover opens above the Queue toolbar button with a follow-up input.",
      "No queued message rows are listed while the queue is empty.",
    ],
  });

  await user.type(composer, "Add unit tests for the queue{Enter}");
  await user.type(
    await screen.findByTestId("agent-message-queue-composer"),
    "Then update the docs{Enter}",
  );

  expect(
    await within(terminalPanel).findByTestId("agent-message-queue-count"),
  ).toHaveTextContent("2");
  expect(
    within(terminalPanel).getByTestId("agent-message-queue"),
  ).toHaveAttribute("data-variant", "pinned");

  // Close then reopen so the pinned chip is visible without the popover overlay.
  await user.click(
    within(terminalPanel).getByTestId("agent-message-queue-button"),
  );
  await waitFor(() => {
    expect(
      screen.queryByTestId("agent-message-queue-popover"),
    ).not.toBeInTheDocument();
  });

  await captureDocument(document, {
    name: "agent-message-queue-03-pinned",
    expectations: [
      "A pinned 2 queued chip sits at the top of the terminal body.",
      "The Queue icon is no longer in the agent toolbar while messages are queued.",
    ],
  });

  const pinnedButton = within(terminalPanel).getByTestId(
    "agent-message-queue-button",
  );
  // Pinned chip is centered near the top of the terminal body.
  stubQueueTriggerRect(pinnedButton, {
    top: 510,
    left: 620,
    width: 96,
    height: 24,
  });
  await user.click(pinnedButton);
  const popover = await screen.findByTestId("agent-message-queue-popover");
  expect(popover).toHaveAttribute("data-side", "top");
  expect(
    within(popover).getByText("Add unit tests for the queue"),
  ).toBeInTheDocument();

  await captureDocument(document, {
    name: "agent-message-queue-04-popover",
    expectations: [
      "The popover opens above the pinned 2 queued chip.",
      "Queued messages and the follow-up input are listed inside the popover.",
    ],
  });
}, 60000);
