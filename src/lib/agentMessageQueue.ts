export interface QueuedAgentMessage {
  id: string;
  text: string;
  createdAt: number;
}

export function createQueuedAgentMessage(
  text: string,
  id: string = crypto.randomUUID(),
  createdAt: number = Date.now(),
): QueuedAgentMessage {
  return { id, text, createdAt };
}

/** Append a message to the end of the queue (FIFO). */
export function enqueueAgentMessage(
  queue: QueuedAgentMessage[],
  text: string,
  id?: string,
): QueuedAgentMessage[] {
  const trimmed = text.trim();
  if (!trimmed) return queue;
  return [...queue, createQueuedAgentMessage(trimmed, id)];
}

/** Remove a message by id. */
export function removeAgentMessage(
  queue: QueuedAgentMessage[],
  id: string,
): QueuedAgentMessage[] {
  return queue.filter((message) => message.id !== id);
}

/** Update a message's text in place. Empty/whitespace text is ignored. */
export function updateAgentMessage(
  queue: QueuedAgentMessage[],
  id: string,
  text: string,
): QueuedAgentMessage[] {
  const trimmed = text.trim();
  if (!trimmed) return queue;
  return queue.map((message) =>
    message.id === id ? { ...message, text: trimmed } : message,
  );
}

/**
 * Pop the oldest message. Returns the message and remaining queue,
 * or null if the queue is empty.
 */
export function dequeueOldestAgentMessage(
  queue: QueuedAgentMessage[],
): { message: QueuedAgentMessage; remaining: QueuedAgentMessage[] } | null {
  if (queue.length === 0) return null;
  const [message, ...remaining] = queue;
  return { message, remaining };
}

/** Bytes to write to a PTY so the agent receives typed text + Enter. */
export function formatAgentMessageForPty(text: string): string {
  return `${text}\r`;
}
