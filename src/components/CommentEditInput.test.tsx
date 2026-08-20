import { describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { render, screen } from "../../test/test-utils";
import { CommentEditInput } from "./CommentEditInput";

describe("CommentEditInput keyboard save", () => {
  it("saves with Control+Enter", async () => {
    const onSave = vi.fn();
    const user = userEvent.setup();
    render(
      <CommentEditInput
        initialText="Original"
        onSave={onSave}
        onCancel={vi.fn()}
        onDiscard={vi.fn()}
      />,
    );

    const textarea = screen.getByDisplayValue("Original");
    await user.clear(textarea);
    await user.type(textarea, "Updated{Control>}{Enter}{/Control}");

    expect(onSave).toHaveBeenCalledWith("Updated");
  });

  it("saves with Meta+Enter", async () => {
    const onSave = vi.fn();
    const user = userEvent.setup();
    render(
      <CommentEditInput
        initialText="Original"
        onSave={onSave}
        onCancel={vi.fn()}
        onDiscard={vi.fn()}
      />,
    );

    const textarea = screen.getByDisplayValue("Original");
    await user.clear(textarea);
    await user.type(textarea, "Updated{Meta>}{Enter}{/Meta}");

    expect(onSave).toHaveBeenCalledWith("Updated");
  });
});
