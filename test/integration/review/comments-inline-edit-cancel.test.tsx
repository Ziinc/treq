import { beforeEach, describe, expect, it } from "vitest";
import { screen, within } from "../../test-utils";
import userEvent from "@testing-library/user-event";
import {
  addSingleReviewComment,
  openReviewTab,
  setupWorkspaceWithDiff,
  startEditingComment,
  waitForFileAndLines,
} from "./comments-helpers";

describe("Inline comment editing — cancel", () => {
  let user: ReturnType<typeof userEvent.setup>;

  beforeEach(() => {
    user = userEvent.setup();
  });

  async function setupEditableComment(branchName: string, comment: string) {
    await setupWorkspaceWithDiff(branchName);
    await openReviewTab(user, branchName);
    await waitForFileAndLines();
    await addSingleReviewComment(user, comment);
  }

  it("restores the original inline comment when canceling edit", async () => {
    await setupEditableComment(
      "feat/comment-edit-cancel",
      "Original comment text",
    );

    const textarea = await startEditingComment("Original comment text");
    await user.clear(textarea);
    await user.type(textarea, "Modified but not saved");
    const editForm = textarea.parentElement;
    expect(editForm).toBeTruthy();
    await user.click(
      within(editForm!).getByRole("button", { name: /^cancel$/i }),
    );

    await screen.findByText("Original comment text");
    expect(screen.queryByText("Modified but not saved")).toBeNull();
  });

  it("cancels inline comment editing with Escape", async () => {
    await setupEditableComment(
      "feat/comment-edit-escape",
      "Original comment text",
    );

    const textarea = await startEditingComment("Original comment text");
    await user.clear(textarea);
    await user.type(textarea, "Will be discarded");
    await user.keyboard("{Escape}");

    await screen.findByText("Original comment text");
    expect(screen.queryByDisplayValue("Will be discarded")).toBeNull();
  });
});
