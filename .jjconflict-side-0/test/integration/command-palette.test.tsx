import * as React from "react";
import { beforeEach, describe, expect, it } from "vitest";
import userEvent from "@testing-library/user-event";
import { createTestRepo, openRepo } from "../utils";
import { render, screen, waitFor } from "../test-utils";
import { Dashboard } from "../../src/components/Dashboard";

describe("CommandPalette integration", () => {
	let user: ReturnType<typeof userEvent.setup>;

	beforeEach(() => {
		const { repoPath } = createTestRepo(false);
		openRepo(repoPath);
		user = userEvent.setup();
	});

	it("opens on Ctrl+K and shows Search Files command", async () => {
		render(<Dashboard />);

		await user.keyboard("{Control>}k{/Control}");

		await screen.findByText("Search Files");
	});

	it("shows description for Search Files command", async () => {
		render(<Dashboard />);

		await user.keyboard("{Control>}k{/Control}");

		await screen.findByText("Jump to a file in the repository");
	});

	it("always shows Go to Home and Go to Settings commands", async () => {
		render(<Dashboard />);

		await user.keyboard("{Control>}k{/Control}");

		await screen.findByText("Go to Home");
		await screen.findByText("Go to Settings");
	});

	it("clicking Search Files opens the file picker and closes the palette", async () => {
		render(<Dashboard />);

		await user.keyboard("{Control>}k{/Control}");
		await user.click(await screen.findByText("Search Files"));

		await screen.findByPlaceholderText("Search files...");

		await waitFor(() => {
			expect(
				screen.queryByPlaceholderText("Type a command or search..."),
			).not.toBeInTheDocument();
		});
	});
});
