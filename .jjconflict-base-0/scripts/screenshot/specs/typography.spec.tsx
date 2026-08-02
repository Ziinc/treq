import * as React from "react";
import { it } from "vitest";
import { commitRepoFile, createTestRepo, openRepo } from "../../../test/utils";
import { render, screen } from "../../../test/test-utils";
import { Dashboard } from "../../../src/components/Dashboard";
import { createWorkspace } from "../../../src/lib/api";
import { captureDocument } from "../capture";

// Verifies the app's type: the same self-hosted webfonts the docs site uses
// (Inter for body copy, Inter Tight for headings, JetBrains Mono for code),
// applied via the --font-sans/--font-display/--font-mono tokens in
// src/index.css. The webfonts are loaded from src/public/fonts.
it("captures app typography using the docs-site fonts", async () => {
	const { repoPath } = createTestRepo(false);
	openRepo(repoPath);

	await createWorkspace(repoPath, "feat/typography");
	await commitRepoFile(
		repoPath,
		"NOTES.md",
		"# Notes\n\nBody copy renders in Inter; `inline code` renders in JetBrains Mono.",
		"Add notes",
	);

	render(<Dashboard />);

	await screen.findByTestId("show-workspace-header");
	await screen.findByRole("heading", { name: "Test Repository" });
	// Let async queries triggered by the initial render (branch list, file
	// tree, README preview) settle before snapshotting the DOM.
	await new Promise((resolve) => setTimeout(resolve, 500));

	const pngPath = await captureDocument(document, {
		name: "typography-01-app-shell",
		expectations: [
			"All UI text renders in Inter -- a geometric grotesque with a straight-legged 'R', a double-storey 'a' and 'g', and flat terminals -- not in a Times/serif fallback and not in the browser default sans.",
			"The 'Test Repository' README heading renders in Inter Tight: visibly tighter/narrower letterforms than the surrounding body text, at semibold weight.",
			"Monospace text (branch names, file paths, code) renders in JetBrains Mono -- tall x-height, upright, with distinctly wide slab-ish letterforms -- not Courier.",
			"Text is not visibly clipped or overflowing its containers: the sidebar workspace entries, header, and tab labels all fit on one line each.",
		],
	});
	console.log(`Saved screenshot -> ${pngPath}`);
}, 60000);
