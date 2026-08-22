/**
 * Runs at most one async task at a time. Overlapping callers mark a rerun;
 * when the in-flight task finishes, the latest submitted task runs.
 */
export function createInFlightCoalescer() {
  let inflight = false;
  let queued = false;
  let latest: (() => Promise<void>) | null = null;

  return async (task: () => Promise<void>) => {
    latest = task;
    if (inflight) {
      queued = true;
      return;
    }
    inflight = true;
    try {
      // Serial drain: overlapping callers set `queued` instead of starting
      // another getWorkspaceDiff against the same working copy.
      do {
        queued = false;
        const run = latest;
        latest = null;
        // eslint-disable-next-line no-await-in-loop -- drain must be serial
        if (run) await run();
      } while (queued);
    } finally {
      // eslint-disable-next-line require-atomic-updates -- single-threaded JS queue
      inflight = false;
    }
  };
}
