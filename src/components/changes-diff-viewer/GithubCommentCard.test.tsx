import { openUrl } from "@tauri-apps/plugin-opener";
import { describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { render, screen, within } from "../../../test/test-utils";
import type { GhReviewThread } from "../../lib/api-types";
import {
  formatGithubCommentDate,
  GithubCommentCard,
} from "./GithubCommentCard";

function thread(overrides: Partial<GhReviewThread> = {}): GhReviewThread {
  return {
    id: "PRRT_1",
    is_resolved: false,
    is_outdated: false,
    path: "example.ts",
    line: 2,
    diff_side: "RIGHT",
    comments: [
      {
        id: "PRRC_1",
        body: "Please rename this.",
        author: {
          login: "octocat",
          avatar_url: "https://avatars.githubusercontent.com/u/1?v=4",
        },
        created_at: "2026-08-09T10:00:00Z",
        diff_hunk: "@@ -0,0 +1 @@\n+ const x = 1;",
        url: "https://github.com/treq-dev/treq/pull/1#discussion_r1",
      },
    ],
    ...overrides,
  };
}

describe("formatGithubCommentDate", () => {
  it("omits the year when the date is in the current year", () => {
    const now = new Date();
    const iso = new Date(
      Date.UTC(now.getFullYear(), 7, 9, 12, 0, 0),
    ).toISOString();
    const formatted = formatGithubCommentDate(iso);
    expect(formatted).not.toMatch(String(now.getFullYear()));
    expect(formatted).toMatch(/9/);
    expect(formatted).toMatch(/Aug/i);
  });

  it("includes the year when the date is not in the current year", () => {
    const formatted = formatGithubCommentDate("2024-08-09T12:00:00Z");
    expect(formatted).toMatch(/2024/);
    expect(formatted).toMatch(/9/);
    expect(formatted).toMatch(/Aug/i);
  });
});

describe("GithubCommentCard", () => {
  it("shows a larger avatar and a GitHub profile link for the username", async () => {
    const user = userEvent.setup();
    vi.mocked(openUrl).mockClear();

    render(
      <GithubCommentCard
        thread={thread()}
        collapsed={false}
        onToggleCollapse={() => {}}
        onQuote={() => {}}
      />,
    );

    const avatar = screen.getByRole("img", { name: "octocat" });
    expect(avatar.className).toMatch(/w-8/);
    expect(avatar.className).toMatch(/h-8/);

    const profileLink = screen.getByRole("link", { name: "@octocat" });
    expect(profileLink).toHaveAttribute("href", "https://github.com/octocat");
    await user.click(profileLink);
    expect(openUrl).toHaveBeenCalledWith("https://github.com/octocat");
  });

  it("renders username, comment body, and quote control in sans-serif", () => {
    render(
      <GithubCommentCard
        thread={thread()}
        collapsed={false}
        onToggleCollapse={() => {}}
        onQuote={() => {}}
      />,
    );

    expect(screen.getByRole("link", { name: "@octocat" }).className).toMatch(
      /font-sans/,
    );
    expect(screen.getByTestId("github-comment-body").className).toMatch(
      /font-sans/,
    );
    expect(screen.getByTitle("Quote this comment").className).toMatch(
      /font-sans/,
    );
  });

  it("shows the GitHub icon on each comment, not on the collapsed thread header", () => {
    const { rerender } = render(
      <GithubCommentCard
        thread={thread()}
        collapsed={true}
        onToggleCollapse={() => {}}
        onQuote={() => {}}
      />,
    );

    const toggle = screen.getByTestId("github-thread-toggle");
    expect(within(toggle).queryByLabelText("GitHub")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("GitHub")).not.toBeInTheDocument();

    rerender(
      <GithubCommentCard
        thread={thread()}
        collapsed={false}
        onToggleCollapse={() => {}}
        onQuote={() => {}}
      />,
    );

    expect(within(toggle).queryByLabelText("GitHub")).not.toBeInTheDocument();
    expect(
      within(screen.getByTestId("github-comment-card")).getByLabelText(
        "GitHub",
      ),
    ).toBeInTheDocument();
  });
});
