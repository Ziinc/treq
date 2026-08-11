import * as React from "react";
import { expect, it } from "vitest";
import userEvent from "@testing-library/user-event";
import fs from "fs";
import path from "path";
import { createTestRepo, openRepo } from "../../../test/utils";
import { render, screen, within } from "../../../test/test-utils";
import { Dashboard } from "../../../src/components/Dashboard";
import { captureDocument } from "../capture";

const ELIXIR_SOURCE = `defmodule Greeter do
  @moduledoc "Hello"
  def hello(name) when is_binary(name) do
    "Hello, #{name}"
  end
end
`;

const ERLANG_SOURCE = `-module(greeter).
-export([hello/1]).
hello(Name) when is_list(Name) ->
    {ok, Name}.
`;

it("captures FileBrowser syntax highlighting for Elixir and Erlang", async () => {
  const { repoPath } = createTestRepo(false);
  openRepo(repoPath);

  fs.writeFileSync(path.join(repoPath, "greeter.ex"), ELIXIR_SOURCE);
  fs.writeFileSync(path.join(repoPath, "greeter.erl"), ERLANG_SOURCE);

  const user = userEvent.setup();
  render(<Dashboard />);

  await screen.findByText("Code");
  await user.click(await screen.findByRole("button", { name: "greeter.ex" }));
  const elixirBrowser = within(await screen.findByTestId("file-browser"));
  await elixirBrowser.findByText("defmodule");
  expect(document.querySelector(".token.keyword")?.textContent).toBe(
    "defmodule",
  );
  await captureDocument(document, {
    name: "filebrowser-elixir-erlang-01-elixir",
    expectations: [
      "FileBrowser is open on greeter.ex with Elixir source visible.",
      "The keyword defmodule is syntax-colored distinctly from surrounding code.",
      "Line numbers are shown beside the Elixir module body.",
    ],
  });

  await user.click(await screen.findByRole("button", { name: "Back" }));
  await user.click(await screen.findByRole("button", { name: "greeter.erl" }));
  const erlangBrowser = within(await screen.findByTestId("file-browser"));
  await erlangBrowser.findByText("when");
  expect(
    Array.from(document.querySelectorAll(".token.keyword")).some(
      (el) => el.textContent === "when",
    ),
  ).toBe(true);
  await captureDocument(document, {
    name: "filebrowser-elixir-erlang-02-erlang",
    expectations: [
      "FileBrowser is open on greeter.erl with Erlang source visible.",
      "The keyword when is syntax-colored distinctly from surrounding code.",
      "The -module(greeter). header line is visible near the top of the viewer.",
    ],
  });
}, 60000);
