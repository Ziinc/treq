import { beforeEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { CommitInput } from "./CommitInput";
import { render, screen } from "../../../test/test-utils";

const defaultProps = {
	onCommit: vi.fn(),
	onCommitAndPush: vi.fn(),
	onCommitAndCreatePR: vi.fn(),
	disabled: false,
	pending: false,
	workspacePath: "/tmp/test-workspace",
};

describe("CommitInput", () => {
	beforeEach(() => {
		sessionStorage.clear();
	});

	it("shows inline error and does not call onCommit when message is empty", async () => {
		const user = userEvent.setup();
		const onCommit = vi.fn();
		render(<CommitInput {...defaultProps} onCommit={onCommit} />);

		await user.click(screen.getByRole("button", { name: /^commit$/i }));

		expect(screen.getByText("Enter a commit message.")).toBeTruthy();
		expect(screen.getByPlaceholderText("Message")).toHaveAttribute(
			"aria-invalid",
			"true",
		);
		expect(onCommit).not.toHaveBeenCalled();
	});

	it("shows inline error when message is only whitespace", async () => {
		const user = userEvent.setup();
		const onCommit = vi.fn();
		render(<CommitInput {...defaultProps} onCommit={onCommit} />);

		await user.type(screen.getByPlaceholderText("Message"), "   ");
		await user.click(screen.getByRole("button", { name: /^commit$/i }));

		expect(screen.getByText("Enter a commit message.")).toBeTruthy();
		expect(onCommit).not.toHaveBeenCalled();
	});

	it("clears the inline error when the user types a message", async () => {
		const user = userEvent.setup();
		render(<CommitInput {...defaultProps} />);

		await user.click(screen.getByRole("button", { name: /^commit$/i }));
		expect(screen.getByText("Enter a commit message.")).toBeTruthy();

		await user.type(screen.getByPlaceholderText("Message"), "Fix bug");

		expect(screen.queryByText("Enter a commit message.")).toBeNull();
		expect(screen.getByPlaceholderText("Message")).not.toHaveAttribute(
			"aria-invalid",
			"true",
		);
	});

	it("calls onCommit with trimmed message when non-empty", async () => {
		const user = userEvent.setup();
		const onCommit = vi.fn();
		render(<CommitInput {...defaultProps} onCommit={onCommit} />);

		await user.type(screen.getByPlaceholderText("Message"), "  Ship it  ");
		await user.click(screen.getByRole("button", { name: /^commit$/i }));

		expect(onCommit).toHaveBeenCalledWith("Ship it");
		expect(screen.queryByText("Enter a commit message.")).toBeNull();
	});

	it("shows inline error for commit and push when message is empty", async () => {
		const user = userEvent.setup();
		const onCommitAndPush = vi.fn();
		render(<CommitInput {...defaultProps} onCommitAndPush={onCommitAndPush} />);

		await user.click(
			screen.getByRole("button", { name: "More commit options" }),
		);
		await user.click(
			await screen.findByRole("menuitem", { name: "Commit and push" }),
		);

		expect(screen.getByText("Enter a commit message.")).toBeTruthy();
		expect(onCommitAndPush).not.toHaveBeenCalled();
	});

	it("hides commit and create PR when a pull request already exists", async () => {
		const user = userEvent.setup();
		render(<CommitInput {...defaultProps} canCreatePr={false} hasPr />);

		await user.click(
			screen.getByRole("button", { name: "More commit options" }),
		);

		expect(
			screen.queryByRole("menuitem", { name: "Commit and create PR" }),
		).not.toBeInTheDocument();
		expect(
			await screen.findByRole("menuitem", { name: "Commit and push" }),
		).toBeInTheDocument();
	});
});
