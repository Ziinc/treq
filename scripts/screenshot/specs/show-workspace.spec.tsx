import * as React from "react";
import { it } from "vitest";
import {
	commitRepoFile,
	createTestRepo,
	openRepo,
} from "../../../test/utils";
import { render, screen } from "../../../test/test-utils";
import { Dashboard } from "../../../src/components/Dashboard";
import { createWorkspace } from "../../../src/lib/api";
import { captureDocument } from "../capture";

// Same setup as test/integration/workspace/*.test.tsx: a real jj repo via
// NAPI, a real Dashboard render, real Rust dispatch under the hood. The only
// difference from an integration test is that instead of asserting on the
// DOM, we hand the resulting DOM to a real browser to screenshot it.
it("captures the ShowWorkspace component", async () => {
	const { repoPath } = createTestRepo(false);
	openRepo(repoPath);

	await createWorkspace(repoPath, "feat/screenshot-demo");
	await commitRepoFile(
		repoPath,
		"NOTES.md",
		"# Notes\n\nSome extra content so the workspace view has more to show.",
		"Add notes",
	);

	render(<Dashboard />);

	await screen.findByTestId("show-workspace-header");
	await screen.findByText("feat/screenshot-demo");
	await screen.findByRole("heading", { name: "Test Repository" });
	// Let async queries triggered by the initial render (branch list, file
	// tree, README preview, etc.) settle before snapshotting the DOM.
	await new Promise((resolve) => setTimeout(resolve, 500));

	const pngPath = await captureDocument(document, {
		name: "show-workspace",
		expectations: [
			"The header shows the home repo's default branch, with a 'Stack' button next to it.",
			"The sidebar lists one workspace: feat/screenshot-demo.",
			"The Code tab is active and shows the file tree (README.md at least) plus a rendered README preview with the heading 'Test Repository'.",
		],
	});
	console.log(`Saved screenshot -> ${pngPath}`);
}, 60000);
