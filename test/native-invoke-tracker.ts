const pendingNativeInvokes = new Set<Promise<unknown>>();

export function trackNativeInvoke<T>(invoke: Promise<T>): Promise<T> {
  pendingNativeInvokes.add(invoke);
  void invoke.then(
    () => pendingNativeInvokes.delete(invoke),
    () => pendingNativeInvokes.delete(invoke),
  );
  return invoke;
}

export async function drainNativeInvokes(): Promise<void> {
  while (pendingNativeInvokes.size > 0) {
    // eslint-disable-next-line no-await-in-loop -- calls may enqueue follow-up invokes
    await Promise.allSettled([...pendingNativeInvokes]);
  }
}
