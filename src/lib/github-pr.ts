// Maps common branch-prefix and title spellings to their canonical
// conventional-commit type.
const CONVENTIONAL_TYPE_ALIASES: Record<string, string> = {
  feat: "feat",
  feature: "feat",
  fix: "fix",
  bugfix: "fix",
  hotfix: "fix",
  chore: "chore",
  docs: "docs",
  doc: "docs",
  documentation: "docs",
  refactor: "refactor",
  perf: "perf",
  performance: "perf",
  test: "test",
  tests: "test",
  style: "style",
  build: "build",
  ci: "ci",
  revert: "revert",
};

// Matches `type(scope)?!?: description`, e.g. "feat(ui)!: add dark mode".
const CONVENTIONAL_TITLE_RE = /^([a-z]+)(\([^)]+\))?(!)?:\s*(.+)$/i;

function humanize(slug: string): string {
  return slug.replace(/[-_]+/g, " ").trim();
}

/**
 * Derive the PR title to use for a workspace: if the workspace title or its
 * branch name already signals a conventional-commit type (a title like
 * "feat: add dark mode" or a branch like "fix/login-bug"), normalize the
 * result into strict `type(scope)?: description` form. Otherwise falls back
 * to the title, or the branch name if there is no title.
 */
export function deriveConventionalPrTitle(
  title: string,
  branchName: string,
): string {
  const fallback = title || branchName;

  const titleMatch = fallback.match(CONVENTIONAL_TITLE_RE);
  if (titleMatch) {
    const [, rawType, scope, breaking, description] = titleMatch;
    const type = CONVENTIONAL_TYPE_ALIASES[rawType.toLowerCase()];
    if (type) {
      return `${type}${scope ?? ""}${breaking ?? ""}: ${description}`;
    }
  }

  const segments = branchName.split("/").filter(Boolean);
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];

    // The whole path segment is a type, e.g. "fix/login-bug".
    const exactType = CONVENTIONAL_TYPE_ALIASES[segment.toLowerCase()];
    if (exactType) {
      const description =
        title && title !== branchName
          ? title
          : humanize(segments.slice(i + 1).join(" "));
      if (description) {
        return `${exactType}: ${description}`;
      }
      continue;
    }

    // The type is the first dash-separated token, e.g. "bugfix-login-crash".
    const [rawType, ...rest] = segment.split("-");
    const dashType = CONVENTIONAL_TYPE_ALIASES[rawType.toLowerCase()];
    if (dashType && rest.length > 0) {
      const description =
        title && title !== branchName ? title : humanize(rest.join("-"));
      if (description) {
        return `${dashType}: ${description}`;
      }
    }
  }

  return fallback;
}

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
