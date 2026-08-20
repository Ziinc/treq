import { beforeEach, describe, expect, it } from "vitest";
import { screen, within } from "../../test-utils";
import userEvent from "@testing-library/user-event";
import {
  addSingleReviewComment,
  clickChangedFile,
  openReviewTab,
  setupWorkspaceWithDiff,
  startEditingComment,
} from "./comments-helpers";

describe("Inline comment editing — save", () => {
  let user: ReturnType<typeof userEvent.setup>;

  beforeEach(() => {
    user = userEvent.setup();
  });

  async function setupEditableComment(branchName: string, comment: string) {
    await setupWorkspaceWithDiff(branchName);
    await openReviewTab(user, branchName);
    await clickChangedFile("test.txt");
    await addSingleReviewComment(user, comment);
  }

  it("enters edit mode when clicking an inline comment", async () => {
    await setupEditableComment(
      "feat/comment-edit-open",
      "Original comment text",
    );

    const textarea = await startEditingComment("Original comment text");
    const editForm = textarea.parentElement;
    expect(editForm).toBeTruthy();

    expect(
      within(editForm!).getByRole("button", { name: /^save$/i }),
    ).toBeTruthy();
    expect(
      within(editForm!).getByRole("button", { name: /^cancel$/i }),
    ).toBeTruthy();
    expect(
      within(editForm!).getByRole("button", { name: /^discard$/i }),
    ).toBeTruthy();
  });

  it("updates inline comment text when saving", async () => {
    await setupEditableComment(
      "feat/comment-edit-save",
      "Original comment text",
    );

    const textarea = await startEditingComment("Original comment text");
    await user.clear(textarea);
    await user.type(textarea, "Updated comment text");
    const editForm = textarea.parentElement;
    expect(editForm).toBeTruthy();
    await user.click(
      within(editForm!).getByRole("button", { name: /^save$/i }),
    );

    await screen.findByText("Updated comment text");
    expect(screen.queryByDisplayValue("Updated comment text")).toBeNull();
    expect(screen.queryByText("Original comment text")).toBeNull();
  });

  it("saves an inline comment with Cmd+Enter", async () => {
    await setupEditableComment(
      "feat/comment-edit-shortcut",
      "Original comment text",
    );

    const textarea = await startEditingComment("Original comment text");
    await user.clear(textarea);
    // Send the shortcut to the textarea. `{Meta>}` on document-level
    // `user.keyboard` can hang under CI (Linux jsdom) until the 120s timeout.
    await user.type(textarea, "Keyboard saved text{Control>}{Enter}{/Control}");

    await screen.findByText("Keyboard saved text");
  });
});
