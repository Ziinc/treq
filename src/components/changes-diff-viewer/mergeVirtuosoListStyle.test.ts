import { describe, expect, it } from "vitest";
import { mergeVirtuosoListStyle } from "./mergeVirtuosoListStyle";

describe("mergeVirtuosoListStyle", () => {
  it("uses longhand padding so it does not conflict with virtuoso paddingBottom", () => {
    const style = mergeVirtuosoListStyle({ paddingBottom: 120, height: 400 });
    expect(style).not.toHaveProperty("padding");
    expect(style.paddingTop).toBe(16);
    expect(style.paddingLeft).toBe(0);
    expect(style.paddingRight).toBe(0);
    expect(style.paddingBottom).toBe(136);
    expect(style.height).toBe(400);
  });

  it("applies 16px bottom padding when virtuoso has not set paddingBottom", () => {
    const style = mergeVirtuosoListStyle({});
    expect(style.paddingBottom).toBe(16);
  });
});
