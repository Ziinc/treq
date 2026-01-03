import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "./test-utils";
import { userEvent } from "@testing-library/user-event";
import { SearchOverlay } from "../src/components/SearchOverlay";

describe("SearchOverlay", () => {
  const defaultProps = {
    isVisible: true,
    query: "",
    onQueryChange: vi.fn(),
    onNext: vi.fn(),
    onPrevious: vi.fn(),
    onClose: vi.fn(),
    currentMatch: 0,
    totalMatches: 0,
  };

  it("renders when visible", () => {
    render(<SearchOverlay {...defaultProps} />);

    expect(screen.getByPlaceholderText("Find")).toBeInTheDocument();
  });

  it("hides when not visible", () => {
    render(<SearchOverlay {...defaultProps} isVisible={false} />);

    expect(screen.queryByPlaceholderText("Find")).not.toBeInTheDocument();
  });

  it("focuses input when opened", () => {
    render(<SearchOverlay {...defaultProps} />);

    const input = screen.getByPlaceholderText("Find");
    expect(document.activeElement).toBe(input);
  });

  it("calls onQueryChange when typing", async () => {
    const user = userEvent.setup();
    const onQueryChange = vi.fn();

    render(<SearchOverlay {...defaultProps} onQueryChange={onQueryChange} />);

    const input = screen.getByPlaceholderText("Find");
    await user.type(input, "t");

    // Verify onQueryChange was called with the typed character
    expect(onQueryChange).toHaveBeenCalled();
    expect(onQueryChange).toHaveBeenCalledWith("t");
  });

  it("calls onNext when clicking next button and displays match count", async () => {
    const user = userEvent.setup();
    const onNext = vi.fn();

    render(
      <SearchOverlay
        {...defaultProps}
        query="test"
        currentMatch={3}
        totalMatches={15}
        onNext={onNext}
      />
    );

    expect(screen.getByText("3 of 15")).toBeInTheDocument();

    const nextButton = screen.getByRole("button", { name: /next/i });
    await user.click(nextButton);

    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it("calls onNext when pressing Enter", async () => {
    const user = userEvent.setup();
    const onNext = vi.fn();

    render(
      <SearchOverlay
        {...defaultProps}
        query="test"
        currentMatch={1}
        totalMatches={5}
        onNext={onNext}
      />
    );

    const input = screen.getByPlaceholderText("Find");
    input.focus();
    await user.keyboard("{Enter}");

    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it("calls onPrevious when clicking previous button", async () => {
    const user = userEvent.setup();
    const onPrevious = vi.fn();

    render(
      <SearchOverlay
        {...defaultProps}
        query="test"
        currentMatch={1}
        totalMatches={5}
        onPrevious={onPrevious}
      />
    );

    const prevButton = screen.getByRole("button", { name: /previous/i });
    await user.click(prevButton);

    expect(onPrevious).toHaveBeenCalledTimes(1);
  });

  it("calls onPrevious when pressing Shift+Enter", async () => {
    const user = userEvent.setup();
    const onPrevious = vi.fn();

    render(
      <SearchOverlay
        {...defaultProps}
        query="test"
        currentMatch={1}
        totalMatches={5}
        onPrevious={onPrevious}
      />
    );

    const input = screen.getByPlaceholderText("Find");
    input.focus();
    await user.keyboard("{Shift>}{Enter}");

    expect(onPrevious).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when clicking close button", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    render(<SearchOverlay {...defaultProps} onClose={onClose} />);

    const closeButton = screen.getByRole("button", { name: /close/i });
    await user.click(closeButton);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when pressing Escape", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    render(<SearchOverlay {...defaultProps} onClose={onClose} />);

    const input = screen.getByPlaceholderText("Find");
    input.focus();
    await user.keyboard("{Escape}");

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("displays No results when no matches", () => {
    render(
      <SearchOverlay
        {...defaultProps}
        query="test"
        currentMatch={0}
        totalMatches={0}
      />
    );

    expect(screen.getByText("No results")).toBeInTheDocument();
  });

  it("enables/disables next/previous buttons based on query", () => {
    const { rerender } = render(<SearchOverlay {...defaultProps} query="" />);

    const nextButton = screen.getByRole("button", { name: /next/i });
    const prevButton = screen.getByRole("button", { name: /previous/i });

    expect(nextButton).toBeDisabled();
    expect(prevButton).toBeDisabled();

    rerender(
      <SearchOverlay
        {...defaultProps}
        query="test"
        currentMatch={1}
        totalMatches={5}
      />
    );

    expect(nextButton).not.toBeDisabled();
    expect(prevButton).not.toBeDisabled();
  });
});
