import { describe, expect, it } from "vitest";
import { render, screen } from "../../../test/test-utils";
import { Button } from "./button";

describe("Button", () => {
  it("does not shrink when its label changes inside a flex action row", () => {
    render(<Button>Creating...</Button>);

    expect(screen.getByRole("button", { name: "Creating..." })).toHaveClass(
      "shrink-0",
    );
  });
});
