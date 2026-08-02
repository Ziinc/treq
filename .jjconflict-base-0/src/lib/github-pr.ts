/** Build a GitHub compare URL that opens the "Open a pull request" form prefilled. */
export function buildGitHubComparePrUrl(params: {
	owner: string;
	repo: string;
	baseBranch: string;
	headBranch: string;
	title: string;
	body: string;
}): string {
	const { owner, repo, baseBranch, headBranch, title, body } = params;
	const compare = `${encodeURIComponent(baseBranch)}...${encodeURIComponent(headBranch)}`;
	const query = new URLSearchParams({
		expand: "1",
		title,
		body,
	});
	return `https://github.com/${owner}/${repo}/compare/${compare}?${query.toString()}`;
}
