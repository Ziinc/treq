import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "../../test-utils";
import userEvent from "@testing-library/user-event";
import { findReviewCopyButton, setupReviewMode } from "./comments-helpers";

describe("Copy button in Finish Review popover", () => {
  let user: ReturnType<typeof userEvent.setup>;

  beforeEach(() => {
    user = userEvent.setup();
  });

  it("should NOT show copy button in header bar", async () => {
    await setupReviewMode(user, "feat/no-copy-header");

    await waitFor(() => {
      const discardButtons = screen.getAllByRole("button", {
        name: /discard/i,
      });
      const reviewDiscardButton = discardButtons.find(
        (btn) => btn.textContent === "Discard",
      );
      expect(reviewDiscardButton).toBeInTheDocument();
    });

    const copyButtons = screen.queryAllByRole("button", { name: /copy/i });
    const discardButtons = screen.getAllByRole("button", { name: /discard/i });
    const reviewDiscardButton = discardButtons.find(
      (btn) => btn.textContent === "Discard",
    )!;
    const headerContainer = reviewDiscardButton.parentElement;

    const copyButtonsInHeader = copyButtons.filter((btn) =>
      headerContainer?.contains(btn),
    );
    expect(copyButtonsInHeader.length).toBe(0);
  });

  it("should show copy button inside Finish Review popover", async () => {
    await setupReviewMode(user, "feat/copy-in-popover");

    const finishButton = await screen.findByRole("button", {
      name: /finish review/i,
    });
    await user.click(finishButton);

    await waitFor(() => {
      const copyButtons = screen.getAllByRole("button", { name: /copy/i });
      expect(copyButtons.length).toBeGreaterThan(0);
    });
  });

  it("should position copy button on the left side of popover actions", async () => {
    await setupReviewMode(user, "feat/copy-position");

    const finishButton = await screen.findByRole("button", {
      name: /finish review/i,
    });
    await user.click(finishButton);

    await waitFor(() => {
      expect(findReviewCopyButton()).toBeInTheDocument();
    });

    const copyButton = findReviewCopyButton();
    const planButton = screen.getByRole("button", { name: /^plan$/i });
    const editButton = screen.getByRole("button", { name: /^edit$/i });

    const allButtons = screen.getAllByRole("button");
    const copyIndex = allButtons.indexOf(copyButton);
    const planIndex = allButtons.indexOf(planButton);
    const editIndex = allButtons.indexOf(editButton);

    expect(copyIndex).toBeLessThan(planIndex);
    expect(copyIndex).toBeLessThan(editIndex);
  });

  it("should copy review to clipboard when clicked", async () => {
    const clipboardSpy = vi.spyOn(navigator.clipboard, "writeText");

    await setupReviewMode(user, "feat/copy-clipboard");

    const finishButton = await screen.findByRole("button", {
      name: /finish review/i,
    });
    await user.click(finishButton);

    await waitFor(() => {
      expect(findReviewCopyButton()).toBeInTheDocument();
    });
    await user.click(findReviewCopyButton());

    await waitFor(() => {
      expect(clipboardSpy).toHaveBeenCalledWith(
        expect.stringContaining("Test comment"),
      );
    });
  });

  it("should show 'Copied' state after copying", async () => {
    await setupReviewMode(user, "feat/copied-state");

    const finishButton = await screen.findByRole("button", {
      name: /finish review/i,
    });
    await user.click(finishButton);

    await waitFor(() => {
      expect(findReviewCopyButton()).toBeInTheDocument();
    });
    await user.click(findReviewCopyButton());

    await screen.findByRole("button", { name: /^copied review$/i });
  });

  it("should show close button at top-right of popover", async () => {
    await setupReviewMode(user, "feat/close-btn");

    const finishButton = await screen.findByRole("button", {
      name: /finish review/i,
    });
    await user.click(finishButton);

    await screen.findByRole("button", { name: /^close$/i });
  });

  it("should not show toast when copying review", async () => {
    vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();

    await setupReviewMode(user, "feat/no-toast");

    const finishButton = await screen.findByRole("button", {
      name: /finish review/i,
    });
    await user.click(finishButton);

    await waitFor(() => {
      expect(findReviewCopyButton()).toBeInTheDocument();
    });
    await user.click(findReviewCopyButton());

    expect(screen.queryByText("Copied to clipboard")).not.toBeInTheDocument();
  });
});
