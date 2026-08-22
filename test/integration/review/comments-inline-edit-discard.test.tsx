import { beforeEach, describe, expect, it } from "vitest";
import { screen, waitFor, within } from "../../test-utils";
import userEvent from "@testing-library/user-event";
import { setupEditableComment, startEditingComment } from "./comments-helpers";

describe("Inline comment editing — empty save and discard", () => {
  let user: ReturnType<typeof userEvent.setup>;

  beforeEach(() => {
    user = userEvent.setup();
  });

  it("disables saving when the edited inline comment is empty", async () => {
    await setupEditableComment(
      user,
      "feat/comment-edit-empty",
      "Original comment text",
    );

    const textarea = await startEditingComment("Original comment text");
    await user.clear(textarea);

    const editForm = textarea.parentElement;
    expect(editForm).toBeTruthy();
    expect(
      within(editForm!).getByRole("button", { name: /^save$/i }),
    ).toBeDisabled();
  });

  it("discards the inline comment from edit mode", async () => {
    await setupEditableComment(
      user,
      "feat/comment-edit-discard",
      "Original comment text",
    );

    const textarea = await startEditingComment("Original comment text");
    const editForm = textarea.parentElement;
    expect(editForm).toBeTruthy();

    await user.click(
      within(editForm!).getByRole("button", { name: /^discard$/i }),
    );

    await waitFor(() => {
      expect(screen.queryByText("Original comment text")).toBeNull();
    });
  });
});
