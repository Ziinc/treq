import { describe, expect, it } from "vitest";
import { getLanguageFromPath, highlightCode } from "./syntax-highlight";

describe("getLanguageFromPath", () => {
  it("maps elixir source and script extensions", () => {
    expect(getLanguageFromPath("lib/foo.ex")).toBe("elixir");
    expect(getLanguageFromPath("mix.exs")).toBe("elixir");
  });

  it("maps erlang source and header extensions", () => {
    expect(getLanguageFromPath("src/foo.erl")).toBe("erlang");
    expect(getLanguageFromPath("include/foo.hrl")).toBe("erlang");
  });
});

describe("highlightCode", () => {
  it("highlights elixir keywords and numbers", () => {
    const html = highlightCode(
      "defmodule Foo do\n  def bar, do: 42\nend",
      "elixir",
    );
    expect(html).toContain('class="token keyword"');
    expect(html).toContain("defmodule");
    expect(html).toContain('class="token number"');
    expect(html).toContain("42");
  });

  it("highlights erlang keywords and functions", () => {
    const html = highlightCode(
      "-module(foo).\nbar() -> case X of ok -> ok end.",
      "erlang",
    );
    expect(html).toContain('class="token keyword"');
    expect(html).toContain("case");
    expect(html).toContain('class="token function"');
    expect(html).toContain("bar");
  });
});
