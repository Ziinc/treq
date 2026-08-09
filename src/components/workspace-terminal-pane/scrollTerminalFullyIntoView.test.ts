import { describe, expect, it, vi } from "vitest";
import { scrollTerminalFullyIntoView } from "./scrollTerminalFullyIntoView";

function mockRect(
  el: HTMLElement,
  rect: Pick<DOMRect, "left" | "right" | "width">,
) {
  vi.spyOn(el, "getBoundingClientRect").mockReturnValue({
    x: rect.left,
    y: 0,
    top: 0,
    bottom: 100,
    height: 100,
    left: rect.left,
    right: rect.right,
    width: rect.width,
    toJSON: () => ({}),
  });
}

describe("scrollTerminalFullyIntoView", () => {
  it("scrolls right when the terminal overhangs the right edge", () => {
    const container = document.createElement("div");
    const element = document.createElement("div");
    const scrollBy = vi.fn();
    container.scrollBy = scrollBy;

    mockRect(container, { left: 0, right: 400, width: 400 });
    mockRect(element, { left: 250, right: 650, width: 400 });

    scrollTerminalFullyIntoView(container, element);

    expect(scrollBy).toHaveBeenCalledWith({ left: 250, behavior: "smooth" });
  });

  it("scrolls left when the terminal overhangs the left edge", () => {
    const container = document.createElement("div");
    const element = document.createElement("div");
    const scrollBy = vi.fn();
    container.scrollBy = scrollBy;

    mockRect(container, { left: 0, right: 400, width: 400 });
    mockRect(element, { left: -100, right: 300, width: 400 });

    scrollTerminalFullyIntoView(container, element);

    expect(scrollBy).toHaveBeenCalledWith({ left: -100, behavior: "smooth" });
  });

  it("does nothing when the terminal is already fully visible", () => {
    const container = document.createElement("div");
    const element = document.createElement("div");
    const scrollBy = vi.fn();
    container.scrollBy = scrollBy;

    mockRect(container, { left: 0, right: 400, width: 400 });
    mockRect(element, { left: 50, right: 350, width: 300 });

    scrollTerminalFullyIntoView(container, element);

    expect(scrollBy).not.toHaveBeenCalled();
  });

  it("aligns left when the terminal is wider than the container", () => {
    const container = document.createElement("div");
    const element = document.createElement("div");
    const scrollBy = vi.fn();
    container.scrollBy = scrollBy;

    mockRect(container, { left: 0, right: 400, width: 400 });
    mockRect(element, { left: -50, right: 450, width: 500 });

    scrollTerminalFullyIntoView(container, element);

    expect(scrollBy).toHaveBeenCalledWith({ left: -50, behavior: "smooth" });
  });
});
