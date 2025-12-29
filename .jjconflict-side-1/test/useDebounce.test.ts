import { describe, it, expect } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useDebounce } from "../src/hooks/useDebounce";

describe("useDebounce", () => {
  it("should return initial value immediately", () => {
    const { result } = renderHook(() => useDebounce("test", 100));
    expect(result.current).toBe("test");
  });

  it("should debounce value changes by delay", async () => {
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      {
        initialProps: { value: "initial", delay: 100 },
      }
    );

    // Initial value
    expect(result.current).toBe("initial");

    // Change value
    rerender({ value: "updated", delay: 100 });

    // Value should still be initial (not yet debounced)
    expect(result.current).toBe("initial");

    // Wait for debounce
    await waitFor(
      () => {
        expect(result.current).toBe("updated");
      },
      { timeout: 200 }
    );
  });

  it("should reset timer on rapid changes", async () => {
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      {
        initialProps: { value: "initial", delay: 100 },
      }
    );

    // Change value multiple times rapidly
    rerender({ value: "change1", delay: 100 });
    await new Promise((resolve) => setTimeout(resolve, 20));

    rerender({ value: "change2", delay: 100 });
    await new Promise((resolve) => setTimeout(resolve, 20));

    rerender({ value: "final", delay: 100 });

    // Value should still be initial (timer keeps resetting)
    expect(result.current).toBe("initial");

    // Wait for debounce to complete
    await waitFor(
      () => {
        expect(result.current).toBe("final");
      },
      { timeout: 200 }
    );
  });

  it("should handle different delays", async () => {
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      {
        initialProps: { value: "test", delay: 50 },
      }
    );

    rerender({ value: "updated", delay: 50 });

    await waitFor(
      () => {
        expect(result.current).toBe("updated");
      },
      { timeout: 150 }
    );
  });
});
