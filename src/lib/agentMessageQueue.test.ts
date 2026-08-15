import { describe, expect, it } from "vitest";
import {
  createQueuedAgentMessage,
  dequeueOldestAgentMessage,
  enqueueAgentMessage,
  formatAgentMessageForPty,
  removeAgentMessage,
  updateAgentMessage,
} from "./agentMessageQueue";

describe("agentMessageQueue", () => {
  it("enqueues trimmed messages in FIFO order", () => {
    let queue = enqueueAgentMessage([], "  first  ", "a");
    queue = enqueueAgentMessage(queue, "second", "b");
    expect(queue).toEqual([
      createQueuedAgentMessage("first", "a", queue[0].createdAt),
      createQueuedAgentMessage("second", "b", queue[1].createdAt),
    ]);
  });

  it("ignores empty enqueue text", () => {
    expect(enqueueAgentMessage([], "   ")).toEqual([]);
  });

  it("removes a message by id", () => {
    const queue = enqueueAgentMessage(
      enqueueAgentMessage([], "keep", "keep"),
      "drop",
      "drop",
    );
    expect(removeAgentMessage(queue, "drop").map((m) => m.id)).toEqual([
      "keep",
    ]);
  });

  it("updates message text while queued", () => {
    const queue = enqueueAgentMessage([], "old", "m1");
    expect(updateAgentMessage(queue, "m1", "  new text  ")[0].text).toBe(
      "new text",
    );
  });

  it("ignores empty update text", () => {
    const queue = enqueueAgentMessage([], "keep", "m1");
    expect(updateAgentMessage(queue, "m1", "   ")[0].text).toBe("keep");
  });

  it("dequeues the oldest message first", () => {
    const queue = enqueueAgentMessage(
      enqueueAgentMessage([], "oldest", "1"),
      "newest",
      "2",
    );
    const result = dequeueOldestAgentMessage(queue);
    expect(result?.message.id).toBe("1");
    expect(result?.remaining.map((m) => m.id)).toEqual(["2"]);
  });

  it("returns null when dequeuing an empty queue", () => {
    expect(dequeueOldestAgentMessage([])).toBeNull();
  });

  it("formats message for pty as text plus carriage return", () => {
    expect(formatAgentMessageForPty("hello")).toBe("hello\r");
  });
});
