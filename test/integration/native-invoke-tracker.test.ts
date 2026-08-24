import { describe, expect, it } from "vitest";
import {
  drainNativeInvokes,
  trackNativeInvoke,
} from "../native-invoke-tracker";

describe("native invoke tracker", () => {
  it("waits for tracked native calls before resolving", async () => {
    let resolveInvoke!: () => void;
    const invoke = new Promise<void>((resolve) => {
      resolveInvoke = resolve;
    });

    trackNativeInvoke(invoke);
    let drained = false;
    const drain = drainNativeInvokes().then(() => {
      drained = true;
    });

    await Promise.resolve();
    expect(drained).toBe(false);

    resolveInvoke();
    await drain;
    expect(drained).toBe(true);
  });
});
