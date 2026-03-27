import { describe, it, beforeEach } from "vitest";
import * as React from "react";
import { render, screen } from "../../test-utils";
import { createTestRepo, openRepo } from "../../utils";
import { createWorkspace } from "../../../src/lib/api";
import { Dashboard } from "../../../src/components/Dashboard";

describe("ShowWorkspace - Code tab", () => {
	let repoPath: string;

	beforeEach(() => {
		({ repoPath } = createTestRepo(false));
		openRepo(repoPath);
	});

	it("shows Code tab", async () => {
		await createWorkspace(repoPath, "feat/code-tab-test");
		render(<Dashboard />);

		// defaults to code tab
		await screen.findByText("Code");
		await screen.findByText("README.md", { selector: "div,span,a" });
		// has linear commit history sidebar
		await screen.findByText("Initial commit");
	});
});
