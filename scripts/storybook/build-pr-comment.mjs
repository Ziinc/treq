#!/usr/bin/env node
// Builds the sticky PR comment for the Storybook preview workflow: one deep
// link per story exported by each *.stories.tsx file the PR touched, plus a
// link to the full Storybook index. Reads storybook-static/index.json (built
// by `npm run build-storybook`) rather than re-deriving story ids, so the
// links always match what Storybook itself generated.
//
// Env:
//   PREVIEW_URL     base URL of the deployed Storybook preview (no trailing slash)
//   CHANGED_STORIES newline-separated repo-relative paths of changed *.stories.tsx files
import { readFileSync } from "node:fs";

const previewUrl = (process.env.PREVIEW_URL || "").replace(/\/+$/, "");
const changedStories = (process.env.CHANGED_STORIES || "")
	.split("\n")
	.map((line) => line.trim())
	.filter(Boolean);

const marker = "<!-- storybook-preview-link -->";

if (!previewUrl) {
	throw new Error("PREVIEW_URL is required");
}

if (changedStories.length === 0) {
	console.log(`${marker}\nNo \`*.stories.tsx\` files changed in this PR.`);
	process.exit(0);
}

const index = JSON.parse(readFileSync("storybook-static/index.json", "utf8"));

// importPath in index.json is "./src/..." relative to the repo root.
const byImportPath = new Map();
for (const entry of Object.values(index.entries)) {
	if (entry.type !== "story") continue;
	const path = entry.importPath.replace(/^\.\//, "");
	if (!byImportPath.has(path)) byImportPath.set(path, []);
	byImportPath.get(path).push(entry);
}

const lines = [
	marker,
	`🚀 Storybook preview: ${previewUrl}`,
	"",
	"Changed stories:",
];

for (const storyFile of changedStories) {
	const stories = byImportPath.get(storyFile);
	if (!stories || stories.length === 0) {
		lines.push(
			`- \`${storyFile}\` (no stories found — file may have been deleted)`,
		);
		continue;
	}
	lines.push(`- \`${storyFile}\``);
	for (const story of stories) {
		const url = `${previewUrl}/?path=/story/${story.id}`;
		lines.push(`  - [${story.title} — ${story.name}](${url})`);
	}
}

console.log(lines.join("\n"));
