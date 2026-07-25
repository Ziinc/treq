/**
 * Builds the sticky PR comment body for .github/workflows/pr-screenshots.yml.
 *
 * The workflow runs only the screenshot specs the PR's diff touches, recording
 * which captures each one produced in `.generated/_captures/<slug>.txt`. This
 * turns those files -- plus each capture's `<name>.json` manifest, written by
 * captureDocument -- into markdown: one section per flow, listing its captures
 * in capture order with the expectations the spec author claimed for them, and
 * a link to the run artifact holding the actual PNGs.
 *
 * GitHub comments can't inline an artifact's contents, so the artifact link is
 * the delivery mechanism; the expectations are what make the comment readable
 * without downloading it.
 *
 * Usage: node scripts/screenshot/build-pr-comment.mjs > comment.md
 *   env: ARTIFACT_URL, RUN_URL, HEAD_SHA
 */
import fs from "node:fs";
import path from "node:path";

/** Marker used to find and overwrite this comment on later runs. */
const MARKER = "<!-- app-qa-screenshots -->";

const GENERATED_DIR = path.join(import.meta.dirname, ".generated");
const CAPTURES_DIR = path.join(GENERATED_DIR, "_captures");

const artifactUrl = process.env.ARTIFACT_URL || "";
const runUrl = process.env.RUN_URL || "";
const headSha = process.env.HEAD_SHA || "";

/** Flows the workflow ran, in the order it ran them. */
function readFlows() {
	if (!fs.existsSync(CAPTURES_DIR)) return [];
	return fs
		.readdirSync(CAPTURES_DIR)
		.filter((f) => f.endsWith(".txt"))
		.sort()
		.map((f) => {
			const slug = f.replace(/\.txt$/, "");
			const captures = fs
				.readFileSync(path.join(CAPTURES_DIR, f), "utf8")
				.split("\n")
				.map((l) => l.trim())
				.filter(Boolean)
				.sort();
			const failed = fs.existsSync(
				path.join(CAPTURES_DIR, `${slug}.failed`),
			);
			return { slug, captures, failed };
		});
}

function readExpectations(pngName) {
	const base = pngName.replace(/\.png$/, "");
	const manifest = path.join(GENERATED_DIR, `${base}.json`);
	if (!fs.existsSync(manifest)) return [];
	try {
		return JSON.parse(fs.readFileSync(manifest, "utf8")).expectations ?? [];
	} catch {
		return [];
	}
}

const flows = readFlows();
const lines = [MARKER, "### 📸 App QA screenshots", ""];

if (flows.length === 0) {
	lines.push("No screenshot specs were touched by this PR, so no flows were captured.");
} else {
	const totalCaptures = flows.reduce((n, f) => n + f.captures.length, 0);
	lines.push(
		`Re-ran the ${flows.length === 1 ? "flow" : `${flows.length} flows`} whose spec this PR ` +
			`adds or modifies — ${totalCaptures} capture${totalCaptures === 1 ? "" : "s"}. ` +
			"Other specs in the library were not run.",
		"",
	);

	if (artifactUrl) {
		lines.push(`**[⬇️ Download the screenshots](${artifactUrl})**`, "");
	}

	for (const flow of flows) {
		const failedNote = flow.failed ? " — ⚠️ spec failed" : "";
		lines.push(
			"<details open>",
			`<summary><b>${flow.slug}</b>${failedNote}</summary>`,
			"",
		);
		if (flow.captures.length === 0) {
			lines.push(
				flow.failed
					? "The spec failed before producing any capture — see the run log."
					: "The spec produced no captures.",
				"",
			);
		}
		for (const png of flow.captures) {
			lines.push(`- \`${png}\``);
			for (const expectation of readExpectations(png)) {
				lines.push(`  - ${expectation}`);
			}
		}
		lines.push("", "</details>", "");
	}

	lines.push(
		"Each bullet under a capture is what the spec claims that image should show — " +
			"open the PNG and check it.",
		"",
	);
}

const footer = [];
if (headSha) footer.push(`commit \`${headSha.slice(0, 7)}\``);
if (runUrl) footer.push(`[workflow run](${runUrl})`);
if (footer.length > 0) {
	lines.push(
		"---",
		`<sub>${footer.join(" · ")} — this comment is updated in place ` +
			"on each run.</sub>",
	);
}

process.stdout.write(`${lines.join("\n")}\n`);
