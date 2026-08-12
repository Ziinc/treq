/** Context chips attached to an agent prompt (rendered separately from the textarea). */
export interface GitHubIssueAttachment {
  number: number;
  url: string;
  title: string;
}

export function formatPromptWithGitHubIssue(
  text: string,
  issue: GitHubIssueAttachment,
): string {
  const trimmed = text.trim();
  const issueLine = `GitHub issue #${issue.number}: ${issue.url}`;
  if (!trimmed) {
    const titlePart = issue.title.trim() ? `: ${issue.title.trim()}` : "";
    return `Address GitHub issue #${issue.number}${titlePart}\n\n${issue.url}`;
  }
  return `${trimmed}\n\n${issueLine}`;
}
