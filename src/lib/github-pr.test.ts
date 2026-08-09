import { describe, expect, it } from "vitest";
import {
  buildGitHubComparePrUrl,
  deriveConventionalPrTitle,
} from "./github-pr";

describe("buildGitHubComparePrUrl", () => {
  it("builds a compare URL with prefilled title and body", () => {
    expect(
      buildGitHubComparePrUrl({
        owner: "acme",
        repo: "treq",
        baseBranch: "main",
        headBranch: "feat/thing",
        title: "Add thing",
        body: "Does the thing",
      }),
    ).toBe(
      "https://github.com/acme/treq/compare/main...feat%2Fthing?expand=1&title=Add+thing&body=Does+the+thing",
    );
  });
});

describe("deriveConventionalPrTitle", () => {
  it("leaves an already-conventional title untouched", () => {
    expect(
      deriveConventionalPrTitle("feat: add dark mode", "treq/add-dark-mode"),
    ).toBe("feat: add dark mode");
  });

  it("normalizes a title alias and preserves scope/breaking marker", () => {
    expect(
      deriveConventionalPrTitle("feature(ui)!: add dark mode", "treq/thing"),
    ).toBe("feat(ui)!: add dark mode");
  });

  it("derives type from a `type/description` branch when title has no signal", () => {
    expect(
      deriveConventionalPrTitle("Add dark mode toggle", "fix/login-bug"),
    ).toBe("fix: Add dark mode toggle");
  });

  it("humanizes the branch slug when there is no separate title", () => {
    expect(deriveConventionalPrTitle("", "feat/add-dark-mode")).toBe(
      "feat: add dark mode",
    );
  });

  it("detects a type prefix nested after a literal branch pattern segment", () => {
    expect(deriveConventionalPrTitle("", "treq/bugfix-login-crash")).toBe(
      "fix: login crash",
    );
  });

  it("falls back to title or branch name when neither has a conventional signal", () => {
    expect(
      deriveConventionalPrTitle("Add dark mode", "treq/add-dark-mode"),
    ).toBe("Add dark mode");
    expect(deriveConventionalPrTitle("", "treq/add-dark-mode")).toBe(
      "treq/add-dark-mode",
    );
  });
});
