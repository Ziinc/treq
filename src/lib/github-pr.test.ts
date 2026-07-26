import { describe, expect, it } from "vitest";
import { buildGitHubComparePrUrl } from "./github-pr";

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
