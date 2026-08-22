import { describe, expect, it } from "vitest";
import { createInFlightCoalescer } from "./coalesce-in-flight";

describe("createInFlightCoalescer", () => {
  it("does not overlap tasks and reruns the latest queued call", async () => {
    const coalesce = createInFlightCoalescer();
    let concurrent = 0;
    let maxConcurrent = 0;
    const seen: number[] = [];
    let generation = 0;

    const start = (id: number) =>
      coalesce(async () => {
        concurrent += 1;
        maxConcurrent = Math.max(maxConcurrent, concurrent);
        await Promise.resolve();
        seen.push(id);
        concurrent -= 1;
      });

    const first = start(++generation);
    const second = start(++generation);
    const third = start(++generation);
    await Promise.all([first, second, third]);

    expect(maxConcurrent).toBe(1);
    expect(seen[0]).toBe(1);
    expect(seen.at(-1)).toBe(3);
    expect(seen.length).toBeGreaterThanOrEqual(2);
  });
});
