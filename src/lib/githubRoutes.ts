/** URL routes for the GitHub integration pages, built on top of wouter. */

export type GitHubTab = "issues" | "prs" | "merge-queue";
export type GitHubStateFilter = "open" | "closed" | "all";

export const GITHUB_BASE_PATH = "/github";

export function githubTabPath(tab: GitHubTab): string {
	if (tab === "merge-queue") return `${GITHUB_BASE_PATH}/merge-queue`;
	return `${GITHUB_BASE_PATH}/${tab}`;
}

export function githubListPath(
	tab: "issues" | "prs",
	filter?: GitHubStateFilter,
): string {
	const base = githubTabPath(tab);
	return filter && filter !== "open" ? `${base}?filter=${filter}` : base;
}

export function githubNewItemPath(tab: "issues" | "prs"): string {
	return `${githubTabPath(tab)}/new`;
}

export function githubDetailPath(
	tab: "issues" | "prs",
	number: number,
): string {
	return `${githubTabPath(tab)}/${number}`;
}

/** Maps a PR's gh state to the filter tab that will surface it in the list. */
export function stateFilterForPrState(
	prState: string | null | undefined,
): GitHubStateFilter {
	switch (prState?.toUpperCase()) {
		case "OPEN":
			return "open";
		case "CLOSED":
			return "closed";
		default:
			// MERGED PRs aren't returned by gh's "closed" filter, so fall back to "all".
			return "all";
	}
}
