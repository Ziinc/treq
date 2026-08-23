import type { DirectoryBatchResult } from "../../lib/api-extra";
import type { DirectoryEntry } from "../../lib/api-types";

type Request = (paths: string[]) => Promise<DirectoryBatchResult[]>;

export class DirectoryBatchLoader {
  private queued = new Map<
    string,
    Array<{
      resolve: (entries: DirectoryEntry[]) => void;
      reject: (error: Error) => void;
    }>
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
    const queued = this.queued;
    this.queued = new Map();
    const paths = [...queued.keys()];
    for (let index = 0; index < paths.length; index += 16) {
      const batch = paths.slice(index, index + 16);
      try {
        const results = await this.request(batch);
        const byPath = new Map(results.map((result) => [result.path, result]));
        for (const path of batch) {
          const result = byPath.get(path);
          for (const waiter of queued.get(path) ?? []) {
            if (!result || result.error)
              waiter.reject(
                new Error(result?.error ?? "Missing directory result"),
              );
            else waiter.resolve(result.entries);
          }
        }
      } catch (error) {
        for (const path of batch) {
          for (const waiter of queued.get(path) ?? []) {
            waiter.reject(
              error instanceof Error ? error : new Error(String(error)),
            );
          }
        }
      }
    }
  }
}
