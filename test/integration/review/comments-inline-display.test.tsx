import { beforeEach, describe, it } from "vitest";
import { screen } from "../../test-utils";
import userEvent from "@testing-library/user-event";
import {
  addSingleReviewComment,
  clickChangedFile,
  openReviewTab,
  setupWorkspaceWithDiff,
} from "./comments-helpers";

describe("Inline comments display", () => {
  let user: ReturnType<typeof userEvent.setup>;

  beforeEach(() => {
    user = userEvent.setup();
  });

  it("should display inline comment on the correct line when line numbers are high", async () => {
    await setupWorkspaceWithDiff(
      "feat/inline-high-lines",
      "context line 1\ncontext line 2\nnew line at 102\ncontext line 3\n",
    );
    await openReviewTab(user, "feat/inline-high-lines");

    await clickChangedFile("test.txt");
    await addSingleReviewComment(user, "Review comment on line 102");

    await screen.findByText("Review comment on line 102");
  });
});
