export type InFlightCoalescer = ((
  task: () => Promise<void>,
) => Promise<void>) & {
  reset: () => void;
};

/**
 * Runs at most one async task at a time. Overlapping callers mark a rerun;
 * when the in-flight task finishes, the latest submitted task runs.
 */
export function createInFlightCoalescer(): InFlightCoalescer {
  let inflight = false;
  let queued = false;
  let latest: (() => Promise<void>) | null = null;
  let epoch = 0;

  const run = (async (task: () => Promise<void>) => {
    latest = task;
    if (inflight) {
      queued = true;
      return;
    }
    inflight = true;
    const myEpoch = epoch;
    try {
      // Serial drain: overlapping callers set `queued` instead of starting
      // another getWorkspaceDiff against the same working copy.
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
    }
  }) as InFlightCoalescer;

  run.reset = () => {
    epoch += 1;
    inflight = false;
    queued = false;
    latest = null;
  };

  return run;
}

/** Shared by Review file loading and integration afterEach isolation. */
export const workspaceDiffCoalesce = createInFlightCoalescer();
