export type InFlightCoalescer = ((
  task: () => Promise<void>,
) => Promise<void>) & {
  reset: () => void;
};

/**
 * Runs at most one async task at a time. Overlapping callers mark a rerun;
 * when the in-flight task finishes, the latest submitted task runs.
 * Queued callers wait for that drain so `await loadChangedFiles(true)`
 * does not resolve before the forced reload applies.
 */
export function createInFlightCoalescer(): InFlightCoalescer {
  let inflight = false;
  let queued = false;
  let latest: (() => Promise<void>) | null = null;
  let epoch = 0;
  const waiters: Array<() => void> = [];

  const releaseWaiters = () => {
    const pending = waiters.splice(0);
    for (const resolve of pending) resolve();
  };

  const run = (async (task: () => Promise<void>) => {
    latest = task;
    if (inflight) {
      queued = true;
      await new Promise<void>((resolve) => {
        waiters.push(resolve);
      });
      return;
    }
    inflight = true;
    const myEpoch = epoch;
    try {
      do {
        if (myEpoch !== epoch) return;
        queued = false;
        const next = latest;
        latest = null;
        // eslint-disable-next-line no-await-in-loop -- drain must be serial
        if (next) await next();
      } while (queued);
    } finally {
      if (myEpoch === epoch) {
        // eslint-disable-next-line require-atomic-updates -- single-threaded JS queue
        inflight = false;
      }
      releaseWaiters();
    }
  }) as InFlightCoalescer;

  run.reset = () => {
    epoch += 1;
    inflight = false;
    queued = false;
    latest = null;
    releaseWaiters();
  };

  return run;
}

/** Shared by Review file loading and integration afterEach isolation. */
export const workspaceDiffCoalesce = createInFlightCoalescer();
