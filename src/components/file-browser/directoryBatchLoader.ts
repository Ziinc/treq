import type { DirectoryBatchResult } from "../../lib/api-extra";
import type { DirectoryEntry } from "../../lib/api-types";

type Request = (paths: string[]) => Promise<DirectoryBatchResult[]>;
type Waiter = {
  resolve: (entries: DirectoryEntry[]) => void;
  reject: (error: Error) => void;
};

const rejectWaiters = (waiters: Waiter[], error: unknown) => {
  const reason = error instanceof Error ? error : new Error(String(error));
  for (const { reject } of waiters) reject(reason);
};

const settleWaiters = (
  waiters: Waiter[],
  result: DirectoryBatchResult | undefined,
) => {
  if (!result || result.error) {
    rejectWaiters(waiters, new Error(result?.error ?? "Missing directory result"));
    return;
  }
  for (const { resolve } of waiters) resolve(result.entries);
};

export class DirectoryBatchLoader {
  private queued = new Map<
    string,
    Waiter[]
  >();
  private scheduled = false;

  constructor(private readonly request: Request) {}

  load(path: string): Promise<DirectoryEntry[]> {
    const promise = new Promise<DirectoryEntry[]>((resolve, reject) => {
      const waiters = this.queued.get(path) ?? [];
      waiters.push({ resolve, reject });
      this.queued.set(path, waiters);
    });
    if (!this.scheduled) {
      this.scheduled = true;
      queueMicrotask(() => void this.flush());
    }
    return promise;
  }

  private async flush() {
    this.scheduled = false;
    const { queued } = this;
    this.queued = new Map();
    const paths = [...queued.keys()];
    const processBatch = async (index: number): Promise<void> => {
      if (index >= paths.length) return;
      const batch = paths.slice(index, index + 16);
      try {
        const results = await this.request(batch);
        const byPath = new Map(results.map((result) => [result.path, result]));
        for (const path of batch) {
          settleWaiters(queued.get(path) ?? [], byPath.get(path));
        }
      } catch (error) {
        for (const path of batch) {
          rejectWaiters(queued.get(path) ?? [], error);
        }
      }
      await processBatch(index + 16);
    };
    await processBatch(0);
  }
}
