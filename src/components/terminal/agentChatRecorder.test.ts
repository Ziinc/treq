import { afterEach, describe, expect, it, vi } from "vitest";
import { createAgentChatRecorder } from "./agentChatRecorder";

describe("createAgentChatRecorder", () => {
  afterEach(() => vi.useRealTimers());

  it("captures continuous output periodically without waiting for idle", async () => {
    vi.useFakeTimers();
    let screen = "partial one";
    const recordScreen = vi.fn().mockResolvedValue(undefined);
    const recorder = createAgentChatRecorder({
      register: vi.fn().mockResolvedValue(undefined),
      recordScreen,
      recordUserMessage: vi.fn().mockResolvedValue(undefined),
      getScreen: () => screen,
      onError: vi.fn(),
    });

    recorder.output();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(recordScreen).toHaveBeenCalledWith("partial one");
    screen = "partial two";
    recorder.output();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(recordScreen).toHaveBeenLastCalledWith("partial two");
  });

  it("throttles burst output to one screen write per second", async () => {
    vi.useFakeTimers();
    const recordScreen = vi.fn().mockResolvedValue(undefined);
    const recorder = createAgentChatRecorder({
      register: vi.fn().mockResolvedValue(undefined),
      recordScreen,
      recordUserMessage: vi.fn().mockResolvedValue(undefined),
      getScreen: () => "latest",
      onError: vi.fn(),
    });

    recorder.output();
    recorder.output();
    recorder.output();
    await vi.advanceTimersByTimeAsync(999);
    expect(recordScreen).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(recordScreen).toHaveBeenCalledTimes(1);
  });

  it("idle cancels the throttle and immediately records the latest screen", async () => {
    vi.useFakeTimers();
    let screen = "partial";
    const recordScreen = vi.fn().mockResolvedValue(undefined);
    const recorder = createAgentChatRecorder({
      register: vi.fn().mockResolvedValue(undefined),
      recordScreen,
      recordUserMessage: vi.fn().mockResolvedValue(undefined),
      getScreen: () => screen,
      onError: vi.fn(),
    });

    recorder.output();
    screen = "final";
    recorder.idle();
    await vi.advanceTimersByTimeAsync(0);
    expect(recordScreen).toHaveBeenCalledTimes(1);
    expect(recordScreen).toHaveBeenCalledWith("final");
    await vi.advanceTimersByTimeAsync(1_000);
    expect(recordScreen).toHaveBeenCalledTimes(1);
  });

  it("waits for registration before writes and forwards the initial prompt once", async () => {
    let finishRegistration!: () => void;
    const order: string[] = [];
    const register = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishRegistration = () => {
            order.push("registered");
            resolve();
          };
        }),
    );
    const recordUserMessage = vi.fn(async () => {
      order.push("user");
    });
    const recorder = createAgentChatRecorder({
      register,
      recordScreen: vi.fn().mockResolvedValue(undefined),
      recordUserMessage,
      getScreen: () => "screen",
      onError: vi.fn(),
    });

    recorder.userMessage("hello");
    expect(recordUserMessage).not.toHaveBeenCalled();
    await Promise.resolve();
    finishRegistration();
    await recorder.flush();
    expect(order).toEqual(["registered", "user"]);
    expect(register).toHaveBeenCalledTimes(1);
  });
});
