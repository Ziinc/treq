import { describe, expect, it } from "vitest";
import { render, screen } from "../../test/test-utils";
import { MarkdownContent } from "./MarkdownContent";

describe("MarkdownContent", () => {
  it("syntax highlights fenced code blocks", () => {
    const { container } = render(
      <MarkdownContent content={"```typescript\nconst answer = 42;\n```"} />,
    );

    const code = container.querySelector("code");
    expect(code).toHaveClass("language-typescript");
    expect(container.querySelector(".token.keyword")).toHaveTextContent(
      "const",
    );
  });

  it("renders unknown fenced languages without interpreting their HTML", () => {
    const { container } = render(
      <MarkdownContent
        content={"```unknown\n<script>alert(1)</script>\n```"}
      />,
    );

    expect(container.querySelector("pre script")).toBeNull();
    expect(screen.getByText("<script>alert(1)</script>")).toBeInTheDocument();
  });
});
