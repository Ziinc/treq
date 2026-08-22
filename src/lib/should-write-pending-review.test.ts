import { describe, expect, it } from "vitest";
import { shouldWritePendingReview } from "./should-write-pending-review";

describe("shouldWritePendingReview", () => {
  it("does not write after cancel while debounce still holds comments", () => {
    expect(
      shouldWritePendingReview({
        liveCommentCount: 0,
        liveSummary: "",
        debouncedCommentCount: 1,
        debouncedSummary: "",
      }),
    ).toBe(false);
  });

  it("does not write before the first debounce flush", () => {
    expect(
      shouldWritePendingReview({
        liveCommentCount: 1,
        liveSummary: "",
        debouncedCommentCount: 0,
        debouncedSummary: "",
      }),
    ).toBe(false);
  });

  it("writes when live and debounced comments agree", () => {
    expect(
      shouldWritePendingReview({
        liveCommentCount: 1,
        liveSummary: "",
        debouncedCommentCount: 1,
        debouncedSummary: "",
      }),
    ).toBe(true);
  });
});
