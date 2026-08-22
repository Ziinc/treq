import { describe, expect, it } from "vitest";
import { enqueueJjExclusive } from "./enqueue-jj-exclusive";

describe("enqueueJjExclusive", () => {
  it("does not overlap tasks", async () => {
    let concurrent = 0;
    let maxConcurrent = 0;

    const start = async () => {
      concurrent += 1;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      await Promise.resolve();
      concurrent -= 1;
    };

    await Promise.all([
      enqueueJjExclusive(start),
      enqueueJjExclusive(start),
      enqueueJjExclusive(start),
    ]);

    expect(maxConcurrent).toBe(1);
  });
});
