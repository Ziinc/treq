import * as React from "react";
import { beforeEach, describe, expect, it } from "vitest";
import { commitRepoFile, createTestRepo, openRepo } from "../utils";
import { ensureWorkspaceIndexed } from "../../src/lib/api";
import { render, screen } from "../test-utils";
import { Dashboard } from "../../src/components/Dashboard";
import userEvent from "@testing-library/user-event";

describe("FilePicker integration", () => {
	let user: ReturnType<typeof userEvent.setup>;

	beforeEach(async () => {
		const { repoPath } = createTestRepo(false);
		await commitRepoFile(
			repoPath,
			"src/components/Button.tsx",
			"export const Button = () => {};",
			"add Button",
		);
		await ensureWorkspaceIndexed(repoPath, null, repoPath);
		openRepo(repoPath);
		user = userEvent.setup();
	});

	it("opens via Ctrl+P, shows initial state, searches files, and selects a result", async () => {
		render(<Dashboard />);
		await new Promise((resolve) => setTimeout(resolve, 500));

		await user.keyboard("{Control>}p{/Control}");

		await screen.findByPlaceholderText("Search files...");
		await screen.findByText("Type to search files...");

		const input = screen.getByPlaceholderText("Search files...");
		await user.type(input, "Button");

		await screen.findByText(/Button\.tsx/);

		await screen.clickByText(/Button\.tsx/);
		expect(
			screen.queryByPlaceholderText("Search files..."),
		).not.toBeInTheDocument();
	});

	it("shows 'No files found' for a nonexistent query", async () => {
		render(<Dashboard />);
		await new Promise((resolve) => setTimeout(resolve, 500));

		await user.keyboard("{Control>}p{/Control}");
		const input = await screen.findByPlaceholderText("Search files...");
		await user.type(input, "zzz_nonexistent_file");

		await screen.findByText("No files found");
	});
});
