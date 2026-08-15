import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useTwoFingerSwipe } from "./useTwoFingerSwipe";

function makeTouch(id: number, clientX: number, clientY: number): Touch {
  return {
    identifier: id,
    clientX,
    clientY,
    screenX: clientX,
    screenY: clientY,
    pageX: clientX,
    pageY: clientY,
    radiusX: 0,
    radiusY: 0,
    rotationAngle: 0,
    force: 1,
    target: document.body,
  } as Touch;
}

function dispatchTouch(
  type: "touchstart" | "touchmove" | "touchend" | "touchcancel",
  touches: Touch[],
  changedTouches: Touch[] = touches,
) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, "touches", { value: touches });
  Object.defineProperty(event, "changedTouches", { value: changedTouches });
  Object.defineProperty(event, "targetTouches", { value: touches });
  window.dispatchEvent(event);
}

describe("useTwoFingerSwipe", () => {
  it("calls onSwipeUp for a two-finger upward swipe", () => {
    const onSwipeUp = vi.fn();
    const onSwipeDown = vi.fn();
    renderHook(() => useTwoFingerSwipe({ onSwipeUp, onSwipeDown }));

    const start = [makeTouch(0, 100, 300), makeTouch(1, 140, 310)];
    dispatchTouch("touchstart", start);
    dispatchTouch(
      "touchmove",
      start.map((t, i) => makeTouch(i, t.clientX, t.clientY - 120)),
    );
    dispatchTouch(
      "touchend",
      [],
      start.map((t, i) => makeTouch(i, t.clientX, t.clientY - 120)),
    );

    expect(onSwipeUp).toHaveBeenCalledTimes(1);
    expect(onSwipeDown).not.toHaveBeenCalled();
  });

  it("calls onSwipeDown for a two-finger downward swipe", () => {
    const onSwipeUp = vi.fn();
    const onSwipeDown = vi.fn();
    renderHook(() => useTwoFingerSwipe({ onSwipeUp, onSwipeDown }));

    const start = [makeTouch(0, 100, 200), makeTouch(1, 140, 210)];
    dispatchTouch("touchstart", start);
    dispatchTouch(
      "touchmove",
      start.map((t, i) => makeTouch(i, t.clientX, t.clientY + 120)),
    );
    dispatchTouch(
      "touchend",
      [],
      start.map((t, i) => makeTouch(i, t.clientX, t.clientY + 120)),
    );

    expect(onSwipeDown).toHaveBeenCalledTimes(1);
    expect(onSwipeUp).not.toHaveBeenCalled();
  });

  it("ignores swipes that do not use exactly two fingers", () => {
    const onSwipeUp = vi.fn();
    renderHook(() => useTwoFingerSwipe({ onSwipeUp, onSwipeDown: vi.fn() }));

    const oneFinger = [makeTouch(0, 100, 300)];
    dispatchTouch("touchstart", oneFinger);
    dispatchTouch("touchmove", [makeTouch(0, 100, 150)]);
    dispatchTouch("touchend", [], [makeTouch(0, 100, 150)]);

    const threeFingers = [
      makeTouch(0, 100, 300),
      makeTouch(1, 140, 310),
      makeTouch(2, 180, 305),
    ];
    dispatchTouch("touchstart", threeFingers);
    dispatchTouch(
      "touchmove",
      threeFingers.map((t, i) => makeTouch(i, t.clientX, t.clientY - 150)),
    );
    dispatchTouch(
      "touchend",
      [],
      threeFingers.map((t, i) => makeTouch(i, t.clientX, t.clientY - 150)),
    );

    expect(onSwipeUp).not.toHaveBeenCalled();
  });

  it("does not fire when the gesture is shorter than the threshold", () => {
    const onSwipeUp = vi.fn();
    renderHook(() => useTwoFingerSwipe({ onSwipeUp, onSwipeDown: vi.fn() }));

    const start = [makeTouch(0, 100, 300), makeTouch(1, 140, 310)];
    dispatchTouch("touchstart", start);
    dispatchTouch(
      "touchmove",
      start.map((t, i) => makeTouch(i, t.clientX, t.clientY - 20)),
    );
    dispatchTouch(
      "touchend",
      [],
      start.map((t, i) => makeTouch(i, t.clientX, t.clientY - 20)),
    );

    expect(onSwipeUp).not.toHaveBeenCalled();
  });

  it("can be disabled", () => {
    const onSwipeUp = vi.fn();
    renderHook(() =>
      useTwoFingerSwipe({ onSwipeUp, onSwipeDown: vi.fn(), enabled: false }),
    );

    const start = [makeTouch(0, 100, 300), makeTouch(1, 140, 310)];
    dispatchTouch("touchstart", start);
    dispatchTouch(
      "touchmove",
      start.map((t, i) => makeTouch(i, t.clientX, t.clientY - 120)),
    );
    dispatchTouch(
      "touchend",
      [],
      start.map((t, i) => makeTouch(i, t.clientX, t.clientY - 120)),
    );

    expect(onSwipeUp).not.toHaveBeenCalled();
  });
});
