import { describe, expect, it } from "vitest";
import { formatPromptWithGitHubIssue } from "./promptAttachments";

describe("formatPromptWithGitHubIssue", () => {
  const issue = {
    number: 42,
    url: "https://github.com/acme/treq/issues/42",
    title: "Fix the login bug",
  };

  it("appends the issue number and url when the user typed a prompt", () => {
    expect(formatPromptWithGitHubIssue("fix auth redirect", issue)).toBe(
      "fix auth redirect\n\nGitHub issue #42: https://github.com/acme/treq/issues/42",
    );
  });

  it("builds a default prompt from the issue when the textarea is empty", () => {
    expect(formatPromptWithGitHubIssue("  ", issue)).toBe(
      "Address GitHub issue #42: Fix the login bug\n\nhttps://github.com/acme/treq/issues/42",
    );
  });

  it("omits the title suffix when the issue has no title", () => {
    expect(
      formatPromptWithGitHubIssue("", { ...issue, title: "" }),
    ).toBe(
      "Address GitHub issue #42\n\nhttps://github.com/acme/treq/issues/42",
    );
  });
});
