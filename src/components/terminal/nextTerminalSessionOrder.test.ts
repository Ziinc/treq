import { describe, expect, it } from "vitest";
import {
  createSessionOrderState,
  nextTerminalSessionOrder,
} from "./nextTerminalSessionOrder";
import {
  TERMINAL_IDLE_THRESHOLD_MS,
  type TerminalSessionSummary,
} from "./types";

const session = (
  id: string,
  overrides: Partial<TerminalSessionSummary> = {},
): TerminalSessionSummary => ({
  id,
  kind: "shell",
  name: id,
  branchName: "main",
  isMainRepo: true,
  lastActivityAt: 1_000,
  lastUserInputAt: 0,
  isStreaming: false,
  previewOutput: "",
  ...overrides,
});

describe("nextTerminalSessionOrder", () => {
  it("promotes a session only when lastUserInputAt increases", () => {
    const now = 1_000;
    const initial = nextTerminalSessionOrder(
      createSessionOrderState(),
      [
        session("a", { lastUserInputAt: 10 }),
        session("b", { lastUserInputAt: 20 }),
      ],
      now,
    );
    expect(initial.order).toEqual(["b", "a"]);

    const afterOutput = nextTerminalSessionOrder(
      initial,
      [
        session("a", { lastUserInputAt: 10, lastActivityAt: now }),
        session("b", { lastUserInputAt: 20, lastActivityAt: now }),
      ],
      now,
    );
    expect(afterOutput.order).toEqual(["b", "a"]);

    const afterInput = nextTerminalSessionOrder(
      afterOutput,
      [
        session("a", { lastUserInputAt: 30, lastActivityAt: now }),
        session("b", { lastUserInputAt: 20, lastActivityAt: now }),
      ],
      now,
    );
    expect(afterInput.order).toEqual(["a", "b"]);
  });

  it("moves a session below active terminals when it becomes idle", () => {
    const now = 100_000;
    const started = nextTerminalSessionOrder(
      createSessionOrderState(),
      [
        session("active", {
          lastUserInputAt: 10,
          lastActivityAt: now,
        }),
        session("going-idle", {
          lastUserInputAt: 20,
          lastActivityAt: now,
        }),
      ],
      now,
    );
    expect(started.order).toEqual(["going-idle", "active"]);

    const afterIdle = nextTerminalSessionOrder(
      started,
      [
        session("active", {
          lastUserInputAt: 10,
          lastActivityAt: now,
        }),
        session("going-idle", {
          lastUserInputAt: 20,
          lastActivityAt: now - TERMINAL_IDLE_THRESHOLD_MS,
        }),
      ],
      now,
    );
    expect(afterIdle.order).toEqual(["active", "going-idle"]);
  });

  it("does not reshuffle an already-idle session when process output is absent", () => {
    const now = 100_000;
    const idleSessions = [
      session("active", { lastUserInputAt: 10, lastActivityAt: now }),
      session("idle", {
        lastUserInputAt: 20,
        lastActivityAt: now - TERMINAL_IDLE_THRESHOLD_MS,
      }),
    ];
    const started = nextTerminalSessionOrder(
      createSessionOrderState(),
      idleSessions,
      now,
    );
    const again = nextTerminalSessionOrder(started, idleSessions, now + 5_000);
    expect(again.order).toEqual(started.order);
  });
});
