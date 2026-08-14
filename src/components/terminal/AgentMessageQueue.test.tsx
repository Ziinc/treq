import { describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { render, screen, within } from "@testing-library/react";
import { AgentMessageQueue } from "./AgentMessageQueue";
import { createQueuedAgentMessage } from "../../lib/agentMessageQueue";

describe("AgentMessageQueue", () => {
  it("shows a toolbar queue button when empty and hides the composer until opened", () => {
    render(
      <AgentMessageQueue
        messages={[]}
        onEnqueue={vi.fn()}
        onRemove={vi.fn()}
        onUpdate={vi.fn()}
      />,
    );

    expect(
      screen.getByTestId("agent-message-queue-button"),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("agent-message-queue-composer"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("agent-message-queue-count"),
    ).not.toBeInTheDocument();
  });

  it("shows the follow-up input only after clicking the queue button", async () => {
    const user = userEvent.setup();
    render(
      <AgentMessageQueue
        messages={[]}
        onEnqueue={vi.fn()}
        onRemove={vi.fn()}
        onUpdate={vi.fn()}
      />,
    );

    expect(
      screen.queryByTestId("agent-message-queue-composer"),
    ).not.toBeInTheDocument();

    await user.click(screen.getByTestId("agent-message-queue-button"));

    expect(
      await screen.findByTestId("agent-message-queue-composer"),
    ).toBeInTheDocument();
  });

  it("enqueues from the popover composer on Enter", async () => {
    const user = userEvent.setup();
    const onEnqueue = vi.fn();

    render(
      <AgentMessageQueue
        messages={[]}
        onEnqueue={onEnqueue}
        onRemove={vi.fn()}
        onUpdate={vi.fn()}
        open
      />,
    );

    const composer = await screen.findByTestId("agent-message-queue-composer");
    await user.type(composer, "please also add tests{Enter}");

    expect(onEnqueue).toHaveBeenCalledWith("please also add tests");
    expect(composer).toHaveValue("");
  });

  it("shows a count badge on the toolbar button and lists messages in the popover", async () => {
    const user = userEvent.setup();
    const messages = [
      createQueuedAgentMessage("first follow-up", "m1", 1),
      createQueuedAgentMessage("second follow-up", "m2", 2),
    ];

    render(
      <AgentMessageQueue
        messages={messages}
        onEnqueue={vi.fn()}
        onRemove={vi.fn()}
        onUpdate={vi.fn()}
      />,
    );

    expect(screen.getByTestId("agent-message-queue-count")).toHaveTextContent(
      "2",
    );
    expect(
      screen.queryByTestId("agent-message-queue-composer"),
    ).not.toBeInTheDocument();

    await user.click(screen.getByTestId("agent-message-queue-button"));

    const popover = await screen.findByTestId("agent-message-queue-popover");
    expect(popover).toHaveAttribute("data-side", "top");
    expect(within(popover).getByText("first follow-up")).toBeInTheDocument();
    expect(within(popover).getByText("second follow-up")).toBeInTheDocument();
    expect(
      within(popover).getByTestId("agent-message-queue-composer"),
    ).toBeInTheDocument();
  });

  it("removes a queued message from the popover", async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn();
    const messages = [createQueuedAgentMessage("drop me", "m1", 1)];

    render(
      <AgentMessageQueue
        messages={messages}
        onEnqueue={vi.fn()}
        onRemove={onRemove}
        onUpdate={vi.fn()}
        open
      />,
    );

    await user.click(
      await screen.findByTestId("agent-message-queue-remove-m1"),
    );

    expect(onRemove).toHaveBeenCalledWith("m1");
  });

  it("edits a queued message from the popover", async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    const messages = [createQueuedAgentMessage("old text", "m1", 1)];

    render(
      <AgentMessageQueue
        messages={messages}
        onEnqueue={vi.fn()}
        onRemove={vi.fn()}
        onUpdate={onUpdate}
        open
      />,
    );

    await user.click(await screen.findByTestId("agent-message-queue-edit-m1"));

    const input = await screen.findByTestId(
      "agent-message-queue-edit-input-m1",
    );
    await user.clear(input);
    await user.type(input, "new text");
    await user.click(screen.getByTestId("agent-message-queue-save-m1"));

    expect(onUpdate).toHaveBeenCalledWith("m1", "new text");
  });
});
