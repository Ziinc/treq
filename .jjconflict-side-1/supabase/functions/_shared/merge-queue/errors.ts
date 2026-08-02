// Error taxonomy and retry policy for merge queue command processing.
//
// PGMQ retry behaviour is visibility-based: a message that is neither
// archived nor deleted becomes visible again after its visibility timeout.
// The worker classifies each failure and either reschedules the message with
// backoff (retryable) or dead-letters it (terminal / exhausted).

export class RetryableError extends Error {
  // Optional explicit delay before the next attempt (e.g. "CI still
  // pending, check again in a minute").
  readonly delaySeconds?: number;

  constructor(message: string, options?: { delaySeconds?: number; cause?: unknown }) {
    super(message);
    this.name = "RetryableError";
    this.delaySeconds = options?.delaySeconds;
    if (options?.cause !== undefined) {
      (this as { cause?: unknown }).cause = options.cause;
    }
  }
}

export class TerminalError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = "TerminalError";
    if (options?.cause !== undefined) {
      (this as { cause?: unknown }).cause = options.cause;
    }
  }
}

// Thrown when another worker holds the queue's execution lease. The message
// is retried shortly without counting against real failures.
export class LeaseContentionError extends RetryableError {
  constructor(queueId: string) {
    super(`queue ${queueId} lease held by another worker`, { delaySeconds: 10 });
    this.name = "LeaseContentionError";
  }
}

// Bounded exponential backoff (seconds), indexed by completed attempts.
// Attempt 1 fails → retry after 15s; attempt 5 fails → dead-letter.
export const RETRY_BACKOFF_SECONDS = [15, 60, 300, 900] as const;
export const MAX_ATTEMPTS = RETRY_BACKOFF_SECONDS.length + 1;

export function backoffSeconds(attempt: number): number {
  const index = Math.min(Math.max(attempt - 1, 0), RETRY_BACKOFF_SECONDS.length - 1);
  return RETRY_BACKOFF_SECONDS[index];
}

export function isExhausted(attempt: number): boolean {
  return attempt >= MAX_ATTEMPTS;
}

export type ErrorClassification = "retryable" | "terminal";

// Classify an arbitrary thrown value. Explicit Retryable/Terminal errors win;
// everything else is inferred from GitHub/network error shapes. Unknown
// errors default to retryable so transient infrastructure problems are not
// dead-lettered prematurely — the attempt cap bounds the damage.
export function classifyError(err: unknown): ErrorClassification {
  if (err instanceof TerminalError) return "terminal";
  if (err instanceof RetryableError) return "retryable";

  const message = err instanceof Error ? err.message : String(err);

  // GitHub API errors carry the HTTP status in the message
  // (see GitHubAdapter.request: "GitHub <method> <url> → <status>: ...").
  const statusMatch = message.match(/→ (\d{3}):/);
  if (statusMatch) {
    const status = Number(statusMatch[1]);
    if (status === 429 || status >= 500) return "retryable";
    if (status === 403 && /rate limit/i.test(message)) return "retryable";
    // 4xx: the request itself is wrong or no longer applicable.
    return "terminal";
  }

  if (/(network|timeout|timed out|connection|ECONNRESET|EAI_AGAIN|fetch failed)/i.test(message)) {
    return "retryable";
  }

  return "retryable";
}
