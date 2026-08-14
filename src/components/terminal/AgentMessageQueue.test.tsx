import { describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { render, screen, within } from "@testing-library/react";
import {
  AgentMessageQueueButton,
  AgentMessageQueueComposer,
} from "./AgentMessageQueue";
import { createQueuedAgentMessage } from "../../lib/agentMessageQueue";

describe("AgentMessageQueueButton", () => {
  it("renders nothing when the queue is empty", () => {
    const { container } = render(
      <AgentMessageQueueButton
        messages={[]}
        onRemove={vi.fn()}
        onUpdate={vi.fn()}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the queued count and opens a popover of messages", async () => {
    const user = userEvent.setup();
    const messages = [
      createQueuedAgentMessage("first follow-up", "m1", 1),
      createQueuedAgentMessage("second follow-up", "m2", 2),
    ];

    render(
      <AgentMessageQueueButton
        messages={messages}
        onRemove={vi.fn()}
        onUpdate={vi.fn()}
      />,
    );

    expect(screen.getByTestId("agent-message-queue-count")).toHaveTextContent(
      "2",
    );

    await user.click(screen.getByTestId("agent-message-queue-button"));

    const popover = await screen.findByTestId("agent-message-queue-popover");
    expect(within(popover).getByText("first follow-up")).toBeInTheDocument();
    expect(within(popover).getByText("second follow-up")).toBeInTheDocument();
  });

  it("removes a queued message from the popover", async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn();
    const messages = [createQueuedAgentMessage("drop me", "m1", 1)];

    render(
      <AgentMessageQueueButton
        messages={messages}
        onRemove={onRemove}
        onUpdate={vi.fn()}
      />,
    );

    await user.click(screen.getByTestId("agent-message-queue-button"));
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
      <AgentMessageQueueButton
        messages={messages}
        onRemove={vi.fn()}
        onUpdate={onUpdate}
      />,
    );

    await user.click(screen.getByTestId("agent-message-queue-button"));
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

describe("AgentMessageQueueComposer", () => {
  it("enqueues from the composer on Enter", async () => {
    const user = userEvent.setup();
    const onEnqueue = vi.fn();

    render(<AgentMessageQueueComposer onEnqueue={onEnqueue} />);

    const composer = screen.getByTestId("agent-message-queue-composer");
    await user.type(composer, "please also add tests{Enter}");

    expect(onEnqueue).toHaveBeenCalledWith("please also add tests");
    expect(composer).toHaveValue("");
  });
});
